// Apply Agent — Tier B ATS direct submission (opt-in, experimental).
//
// Greenhouse: public boards API exposes the application form questions
// (?questions=true) and accepts a standard multipart POST per job — resume
// file + question_<id> fields. Verified against public docs; probe outputs
// live in scripts/t_greenhouse_*.out.
//
// Lever: the public posting JSON has no stable form-question schema, so v1
// submits the standard multipart field set (name/email/phone/resume/cover
// letter); boards that require custom questions will reject → we fail the
// draft honestly and fall back to Tier A.
//
// Hard rules enforced by the CALLER (approve route): per-application approval,
// daily caps, full audit snapshot. ATS_API_BASE_GREENHOUSE/_LEVER env overrides
// exist ONLY for deterministic tests against a mock server.

import { safeFetch } from '@/lib/safe-fetch'
import { boardTokenFromUrl } from '@/lib/agent/jd'
import type { JobListing } from '@prisma/client'
import type { DraftAnswer } from '@/lib/agent/types'

export type AtsKind = 'greenhouse' | 'lever'

export interface AtsQuestion {
  id: string
  label: string
  type: string
  required: boolean
  values?: Array<{ value: string; label: string }>
}

export interface AtsSubmissionPayload {
  userName: string
  email: string
  phone?: string | null
  location?: string | null
  answers: DraftAnswer[]
  resumeBuffer: Buffer
  resumeFileName: string
  resumeContentType: string
  coverLetterText?: string | null
}

export interface AtsSubmissionResult {
  ok: boolean
  status: number
  /** what we actually sent — the audit snapshot body */
  sent: Record<string, string>
  files: string[]
  responseExcerpt: string
  missingRequired?: string[]
}

function greenhouseApiBase(): string {
  return (process.env.ATS_API_BASE_GREENHOUSE || 'https://boards-api.greenhouse.io').replace(/\/+$/, '')
}

function greenhouseSubmitBase(): string {
  return (process.env.ATS_SUBMIT_BASE_GREENHOUSE || greenhouseApiBase()).replace(/\/+$/, '')
}

function greenhouseApiBaseForTest(): string {
  // questions fetch honors the same override so mock servers can serve both
  return greenhouseApiBase()
}

export function detectAts(listing: Pick<JobListing, 'url' | 'source'>): AtsKind | null {
  if (listing.url.includes('greenhouse.io') || /greenhouse/i.test(listing.source)) return 'greenhouse'
  if (listing.url.includes('lever.co') || /lever/i.test(listing.source)) return 'lever'
  return null
}

/** Greenhouse form schema (Lever returns [] — standard fields only in v1). */
export async function fetchAtsQuestions(kind: AtsKind, listing: Pick<JobListing, 'url' | 'externalId'>): Promise<AtsQuestion[]> {
  if (kind !== 'greenhouse') return []
  const board = boardTokenFromUrl(listing.url, 'greenhouse')
  if (!board || !listing.externalId) return []
  try {
    const base = greenhouseApiBaseForTest()
    const url = `${base}/v1/boards/${encodeURIComponent(board)}/jobs/${encodeURIComponent(listing.externalId)}?questions=true`
    // When the API base is overridden (deterministic tests against a local
    // mock), plain fetch — safeFetch would rightly refuse loopback targets.
    const res = process.env.ATS_API_BASE_GREENHOUSE
      ? await fetch(url, { signal: AbortSignal.timeout(10_000) })
      : await safeFetch(url, { timeoutMs: 10_000 })
    if (!res.ok) return []
    const data = (await res.json()) as {
      questions?: Array<{ id?: number | string; label?: string; type?: string; required?: boolean; values?: Array<{ value: string; label: string }> }>
    }
    return (data.questions ?? [])
      .filter((q) => q.label)
      .map((q, i) => ({
        id: String(q.id ?? i),
        label: String(q.label).slice(0, 300),
        type: q.type ?? 'text',
        required: Boolean(q.required),
        values: Array.isArray(q.values) ? q.values.slice(0, 20) : undefined,
      }))
  } catch {
    return []
  }
}

function splitName(userName: string): { first: string; last: string } {
  const parts = userName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: 'Candidate', last: '' }
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

/** Find the draft answer that best matches a form question label. */
export function answerForQuestion(question: string, answers: DraftAnswer[]): DraftAnswer | null {
  const q = question.toLowerCase()
  let best: DraftAnswer | null = null
  let bestScore = 0
  for (const a of answers) {
    const label = a.question.toLowerCase()
    let score = 0
    if (label === q) score = 100
    else if (q.includes(label) || label.includes(q)) score = 70
    else {
      // token overlap heuristic ("years of experience" vs "experience")
      const qTokens = new Set(q.split(/\W+/).filter((t) => t.length > 3))
      const lTokens = new Set(label.split(/\W+/).filter((t) => t.length > 3))
      if (qTokens.size && lTokens.size) {
        let hits = 0
        for (const t of qTokens) if (lTokens.has(t)) hits++
        score = Math.round((hits / Math.min(qTokens.size, lTokens.size)) * 55)
      }
    }
    if (score > bestScore) {
      bestScore = score
      best = a
    }
  }
  return bestScore >= 55 ? best : null
}

/** Greenhouse multipart submission. */
async function submitGreenhouse(board: string, jobId: string, payload: AtsSubmissionPayload, questions: AtsQuestion[]): Promise<AtsSubmissionResult> {
  const { first, last } = splitName(payload.userName)
  const form = new FormData()
  const sent: Record<string, string> = { first_name: first, last_name: last, email: payload.email }
  if (payload.phone) sent.phone = payload.phone
  if (payload.location) sent.location = payload.location
  form.append('first_name', first)
  form.append('last_name', last)
  form.append('email', payload.email)
  if (payload.phone) form.append('phone', payload.phone)
  if (payload.location) form.append('location', payload.location)

  const missingRequired: string[] = []
  for (const q of questions) {
    const answer = answerForQuestion(q.label, payload.answers)
    if (answer) {
      const field = `question_${q.id}`
      form.append(field, answer.answer)
      sent[field] = `${q.label} = ${answer.answer}`
    } else if (q.required) {
      missingRequired.push(q.label)
    }
  }

  form.append('resume', new Blob([new Uint8Array(payload.resumeBuffer)], { type: payload.resumeContentType }), payload.resumeFileName)
  const files = [payload.resumeFileName]
  if (payload.coverLetterText) {
    const clBuffer = Buffer.from(payload.coverLetterText, 'utf8')
    form.append('cover_letter', new Blob([new Uint8Array(clBuffer)], { type: 'text/plain' }), 'cover-letter.txt')
    files.push('cover-letter.txt')
    sent.cover_letter = `${payload.coverLetterText.length} chars`
  }

  const res = await fetch(`${greenhouseSubmitBase()}/v1/boards/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30_000),
  })
  const text = (await res.text().catch(() => '')).slice(0, 500)
  return { ok: res.ok, status: res.status, sent, files, responseExcerpt: text, missingRequired: missingRequired.length ? missingRequired : undefined }
}

/** Lever multipart submission — standard fields only (v1). */
async function submitLever(company: string, jobId: string, payload: AtsSubmissionPayload): Promise<AtsSubmissionResult> {
  const base = (process.env.ATS_SUBMIT_BASE_LEVER || `https://jobs.lever.co`).replace(/\/+$/, '')
  const { first, last } = splitName(payload.userName)
  const name = `${first} ${last}`.trim()

  const form = new FormData()
  const sent: Record<string, string> = { name, email: payload.email }
  form.append('name', name)
  form.append('email', payload.email)
  if (payload.phone) {
    form.append('phone', payload.phone)
    sent.phone = payload.phone
  }
  if (payload.location) {
    form.append('location', payload.location)
    sent.location = payload.location
  }
  form.append('resume', new Blob([new Uint8Array(payload.resumeBuffer)], { type: payload.resumeContentType }), payload.resumeFileName)
  const files = [payload.resumeFileName]
  if (payload.coverLetterText) {
    form.append('coverLetter', payload.coverLetterText)
    sent.coverLetter = `${payload.coverLetterText.length} chars`
  }
  // links profile answers (portfolio/github) into the urls field
  const linkAnswers = payload.answers.filter((a) => /^https?:\/\//.test(a.answer)).slice(0, 3)
  if (linkAnswers.length) {
    const urls = linkAnswers.map((a) => a.answer)
    form.append('urls', JSON.stringify(urls))
    sent.urls = urls.join(', ')
  }

  const res = await fetch(`${base}/${encodeURIComponent(company)}/${encodeURIComponent(jobId)}/apply`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30_000),
    headers: { Accept: 'application/json' },
  })
  const text = (await res.text().catch(() => '')).slice(0, 500)
  return { ok: res.ok, status: res.status, sent, files, responseExcerpt: text }
}

/**
 * Submit an application through the board's public apply endpoint.
 * `questions` may be pre-fetched; Greenhouse fetches when omitted.
 */
export async function submitAtsApplication(
  kind: AtsKind,
  listing: Pick<JobListing, 'url' | 'externalId' | 'company'>,
  payload: AtsSubmissionPayload,
  questions?: AtsQuestion[]
): Promise<AtsSubmissionResult> {
  if (kind === 'greenhouse') {
    const board = boardTokenFromUrl(listing.url, 'greenhouse')
    if (!board || !listing.externalId) {
      return { ok: false, status: 0, sent: {}, files: [], responseExcerpt: 'Could not parse the Greenhouse board/job from the posting URL' }
    }
    const qs = questions ?? (await fetchAtsQuestions('greenhouse', listing))
    return submitGreenhouse(board, listing.externalId, payload, qs)
  }
  const board = boardTokenFromUrl(listing.url, 'lever')
  if (!board || !listing.externalId) {
    return { ok: false, status: 0, sent: {}, files: [], responseExcerpt: 'Could not parse the Lever company/job from the posting URL' }
  }
  return submitLever(board, listing.externalId, payload)
}

/** Daily Tier-B cap — submissions (successful or attempted) count. Env override for tests. */
export const ATS_DAILY_CAP = Number(process.env.ATS_DAILY_CAP || 5)

export async function atsSubmissionsToday(userId: string, now = new Date()): Promise<number> {
  const { db } = await import('@/lib/db')
  const dayStart = new Date(now)
  dayStart.setUTCHours(0, 0, 0, 0)
  return db.applicationDraft.count({
    where: {
      userId,
      method: { in: ['ats_greenhouse', 'ats_lever'] },
      submittedAt: { gte: dayStart },
    },
  })
}
