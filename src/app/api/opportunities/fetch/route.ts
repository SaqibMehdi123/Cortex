import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { beginSync, stampSync, abortSync } from '@/lib/sync-guard'
import { classifyRoleFamily } from '@/lib/job-families'

// POST /api/opportunities/fetch — pull jobs, internships and research positions
// from authentic, keyless public sources:
//   - Greenhouse boards (official ATS API): Anthropic, Together AI, Scale AI,
//     Databricks, Figure AI, Imbue
//   - Lever boards (official ATS API): Mistral AI
//   - RemoteOK public job API (AI/ML-relevant only)
//   - Remotive public job API (data category)
// Listings are de-duplicated per account by URL, so re-fetching is safe and
// every user keeps their own discover feed + saved state.

const UA = 'Mozilla/5.0 (X11; Linux x86_64) Cortex/1.0'

const TIMEOUT_MS = 15000
const PER_SOURCE_CAP = 150

type Listing = {
  company: string
  role: string
  roleFamily: string
  type: 'job' | 'internship' | 'research'
  location: string | null
  source: string
  url: string
  externalId: string | null
  publishedAt: Date | null
}

const GREENHOUSE_BOARDS: Array<{ board: string; company: string }> = [
  { board: 'anthropic', company: 'Anthropic' },
  { board: 'togetherai', company: 'Together AI' },
  { board: 'scaleai', company: 'Scale AI' },
  { board: 'databricks', company: 'Databricks' },
  { board: 'figureai', company: 'Figure AI' },
  { board: 'imbue', company: 'Imbue' },
]

const LEVER_BOARDS: Array<{ board: string; company: string }> = [
  { board: 'mistral', company: 'Mistral AI' },
]

const RELEVANT =
  /(machine learning|deep learning|artificial intelligence|[^a-z]ai[^a-z]|[^a-z]ml[^a-z]|llm|nlp|natural language|data scien|computer vision|research|residency|mlops|robotics|data engineer|data analyst|generative)/i

async function fetchJSON(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': UA, Accept: 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function classify(title: string): Listing['type'] {
  const t = title.toLowerCase()
  if (/\bintern(ship)?s?\b|\bco-?op\b|\bworking student\b/.test(t)) return 'internship'
  if (/\b(research|residency|scientist|phd|post-?doc|fellow(ship)?)\b/.test(t)) return 'research'
  return 'job'
}

function asDate(value: unknown): Date | null {
  if (!value) return null
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d
}

async function fetchGreenhouse(board: string, company: string): Promise<Listing[]> {
  const data = (await fetchJSON(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs`)) as {
    jobs?: Array<{
      id: number | string
      title: string
      absolute_url: string
      updated_at?: string
      location?: { name?: string }
    }>
  }
  const jobs = data.jobs ?? []
  return jobs.slice(0, PER_SOURCE_CAP).map((j) => ({
    company,
    role: j.title.trim(),
    roleFamily: classifyRoleFamily(j.title),
    type: classify(j.title),
    location: j.location?.name?.trim() || null,
    source: `${company} (Greenhouse)`,
    url: j.absolute_url,
    externalId: String(j.id),
    publishedAt: asDate(j.updated_at),
  }))
}

async function fetchLever(board: string, company: string): Promise<Listing[]> {
  const data = (await fetchJSON(`https://api.lever.co/v0/postings/${board}?mode=json`)) as Array<{
    id: string
    text: string
    hostedUrl: string
    createdAt?: number
    categories?: { location?: string; commitment?: string }
  }>
  return (data ?? []).slice(0, PER_SOURCE_CAP).map((j) => ({
    company,
    role: j.text.trim(),
    roleFamily: classifyRoleFamily(j.text),
    type: classify(j.text),
    location: j.categories?.location?.trim() || null,
    source: `${company} (Lever)`,
    url: j.hostedUrl,
    externalId: j.id,
    publishedAt: j.createdAt ? new Date(j.createdAt) : null,
  }))
}

async function fetchRemoteOK(): Promise<Listing[]> {
  const data = (await fetchJSON('https://remoteok.com/api')) as Array<Record<string, unknown>>
  const rows = data.filter((r) => r && r.position && r.url) // first element is a legal notice
  const out: Listing[] = []
  for (const r of rows) {
    const role = String(r.position).trim()
    const tags = Array.isArray(r.tags) ? r.tags.join(' ') : ''
    if (!RELEVANT.test(role) && !RELEVANT.test(tags)) continue
    out.push({
      company: String(r.company ?? 'Unknown').trim(),
      role,
      roleFamily: classifyRoleFamily(role),
      type: classify(role),
      location: (String(r.location ?? '').trim() || 'Remote') || null,
      source: 'RemoteOK',
      url: String(r.url),
      externalId: r.id ? String(r.id) : null,
      publishedAt: asDate(r.date),
    })
    if (out.length >= PER_SOURCE_CAP) break
  }
  return out
}

async function fetchRemotive(): Promise<Listing[]> {
  const data = (await fetchJSON('https://remotive.com/api/remote-jobs?category=data&limit=100')) as {
    jobs?: Array<{
      id: number
      url: string
      title: string
      company_name: string
      candidate_required_location?: string
      publication_date?: string
    }>
  }
  const out: Listing[] = []
  for (const j of data.jobs ?? []) {
    const role = j.title.trim()
    if (!RELEVANT.test(role)) continue
    out.push({
      company: j.company_name.trim(),
      role,
      roleFamily: classifyRoleFamily(role),
      type: classify(role),
      location: j.candidate_required_location?.trim() || 'Remote',
      source: 'Remotive',
      url: j.url,
      externalId: String(j.id),
      publishedAt: asDate(j.publication_date),
    })
    if (out.length >= PER_SOURCE_CAP) break
  }
  return out
}

export async function POST(req: NextRequest) {
  let userId: string | null = null
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()
    userId = user.id

    let force = false
    try {
      const body = (await req.json()) as { force?: boolean }
      force = body?.force === true
    } catch {} // empty body = auto sync

    // Auto-sync guardrails: 5-min cooldown for automatic calls, one run at a
    // time per account. Manual clicks send force:true and skip the cooldown.
    const guard = await beginSync(user.id, 'jobs', force)
    if (guard.skip) {
      return NextResponse.json({ added: 0, skipped: guard.reason, total: 0, sources: [], lastFetchedAt: guard.lastFetchedAt })
    }

    const tasks: Array<{ name: string; run: () => Promise<Listing[]> }> = [
      ...GREENHOUSE_BOARDS.map((b) => ({ name: b.company, run: () => fetchGreenhouse(b.board, b.company) })),
      ...LEVER_BOARDS.map((b) => ({ name: b.company, run: () => fetchLever(b.board, b.company) })),
      { name: 'RemoteOK', run: fetchRemoteOK },
      { name: 'Remotive', run: fetchRemotive },
    ]

    const settled = await Promise.allSettled(tasks.map((t) => t.run()))
    const sources: Array<{ name: string; ok: boolean; count: number }> = []
    const all: Listing[] = []

    settled.forEach((r, i) => {
      const name = tasks[i].name
      if (r.status === 'fulfilled') {
        sources.push({ name, ok: true, count: r.value.length })
        all.push(...r.value)
      } else {
        sources.push({ name, ok: false, count: 0 })
        console.error(`opportunities/fetch ${name} failed:`, r.reason instanceof Error ? r.reason.message : r.reason)
      }
    })

    let added = 0
    if (all.length > 0) {
      // SQLite createMany has no skipDuplicates — dedupe here instead:
      // first within the batch, then against this user's stored listings.
      const batch = new Map<string, Listing>()
      for (const l of all) {
        if (l.url && !batch.has(l.url)) batch.set(l.url, l)
      }
      const existing = await db.jobListing.findMany({
        where: { userId: user.id, url: { in: [...batch.keys()] } },
        select: { url: true },
      })
      const seen = new Set(existing.map((r) => r.url))
      const fresh = [...batch.values()].filter((l) => !seen.has(l.url))
      if (fresh.length > 0) {
        const res = await db.jobListing.createMany({
          data: fresh.map((l) => ({
            userId: user.id,
            company: l.company,
            role: l.role,
            roleFamily: l.roleFamily,
            type: l.type,
            location: l.location,
            source: l.source,
            url: l.url,
            externalId: l.externalId,
            publishedAt: l.publishedAt,
          })),
        })
        added = res.count
      }
    }

    const total = await db.jobListing.count({ where: { userId: user.id } })
    const lastFetchedAt = await stampSync(user.id, 'jobs')
    return NextResponse.json({ added, total, sources, lastFetchedAt })
  } catch (e) {
    console.error('POST /api/opportunities/fetch error', e)
    return NextResponse.json({ error: 'Failed to fetch opportunities' }, { status: 500 })
  } finally {
    // Error path never stamps — always make sure the lock is released.
    // (No-op if stampSync already released it.)
    if (userId) abortSync(userId, 'jobs')
  }
}
