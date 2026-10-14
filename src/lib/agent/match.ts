// Apply Agent — two-stage matching.
// Stage 1: deterministic hard filters (type / role family / location /
// freshness / already in pipeline) — free, instant, honest.
// Stage 2: batch LLM scoring of survivors (~20 listings per call) against the
// parsed profile. Every score is persisted on the listing so the Discover
// cards show a badge + "why" without another LLM call.

import { db } from '@/lib/db'
import { aiChatCompletion } from '@/lib/ai'
import { extractJson } from '@/lib/agent/json'
import { hydrateDescriptions } from '@/lib/agent/jd'
import { writeAgentMessage } from '@/lib/agent/threads'
import type { ShortlistCard } from '@/lib/agent/types'
import type { CandidateProfile, JobListing } from '@prisma/client'

const BATCH_SIZE = 20
const MAX_BATCHES_PER_RUN = 4 // 80 scored listings per run — bounded time/cost
const JD_HYDRATE_BUDGET = 8
const FRESH_DAYS = 45
const TOP_N = 5
export const MATCH_BADGE_MIN = 60 // UI shows badges from this score up
const NOT_INTERESTED = -1 // sentinel score — persisted user dismissal
const OUTCOME_WINDOW_DAYS = 60
const OUTCOME_ADJUST = { rejected: -10, interview: 8, offer: 15 } as const

export interface HardFilterVerdict {
  pass: boolean
  reason: string
}

/** Stage 1 — cheap, deterministic, no LLM. */
export function hardFilter(
  listing: Pick<JobListing, 'type' | 'roleFamily' | 'location' | 'saved' | 'publishedAt' | 'matchScore'>,
  profile: Pick<CandidateProfile, 'prefs'>
): HardFilterVerdict {
  const prefs = (profile.prefs ?? {}) as {
    types?: string[]
    roleFamilies?: string[]
    locations?: string[]
    remote?: string
  }

  if (listing.saved) return { pass: false, reason: 'already saved to pipeline' }

  if (listing.matchScore === NOT_INTERESTED) return { pass: false, reason: 'marked not interested' }

  if (prefs.types?.length && !prefs.types.includes(listing.type)) {
    return { pass: false, reason: `type mismatch (${listing.type})` }
  }

  if (prefs.roleFamilies?.length && listing.roleFamily && !prefs.roleFamilies.includes(listing.roleFamily)) {
    return { pass: false, reason: `role family mismatch (${listing.roleFamily})` }
  }

  if (prefs.remote === 'remote' && listing.location) {
    const loc = listing.location.toLowerCase()
    const remoteish = /remote|anywhere|work from home|distributed/.test(loc)
    const prefLoc = prefs.locations?.some((l) => l && loc.includes(l.toLowerCase()))
    if (!remoteish && !prefLoc) return { pass: false, reason: 'wants remote, listing is onsite' }
  }

  if (listing.publishedAt) {
    const ageDays = (Date.now() - listing.publishedAt.getTime()) / 86_400_000
    if (ageDays > FRESH_DAYS) return { pass: false, reason: `stale (${Math.round(ageDays)}d old)` }
  }

  return { pass: true, reason: 'ok' }
}

interface ScoreResult {
  id: string
  score: number
  why: string
  gaps?: string[]
}

/** Stage 2 — one LLM call per batch. Returns results keyed by listing id. */
export async function scoreBatch(
  listings: JobListing[],
  profile: Pick<CandidateProfile, 'headline' | 'skills' | 'experience' | 'education' | 'location' | 'workAuth' | 'salaryTarget'>
): Promise<ScoreResult[]> {
  const lines = listings.map((l) => {
    const jd = (l.descriptionText ?? '').slice(0, 1_400).replace(/\s+/g, ' ')
    return `[id:${l.id}] ${l.role} @ ${l.company} — ${l.location ?? 'location n/a'} (${l.type})\nJD: ${jd || 'not available — judge on title and location only'}`
  })

  const profileJson = JSON.stringify({
    headline: profile.headline,
    skills: profile.skills,
    experience: profile.experience,
    education: profile.education,
    location: profile.location,
    workAuth: profile.workAuth,
    salaryTarget: profile.salaryTarget,
  })

  const completion = await aiChatCompletion({
    messages: [
      {
        role: 'system',
        content: `You are a strict, honest job-match scorer. Given a candidate profile and job listings, score each listing 0-100 for genuine fit and say why in ≤2 short lines. Rules: judge ONLY on what is present — do not assume requirements; be conservative (a plausible-but-generic fit lands 50-65; strong skill overlap 70-85; near-perfect 86+). "gaps" lists at most 2 concrete missing requirements. Output STRICT JSON: {"results":[{"id":"<listing id>","score":<0-100>,"why":"≤2 lines","gaps":["…"]}]}`,
      },
      { role: 'user', content: `Candidate profile:\n${profileJson}\n\nListings:\n${lines.join('\n\n')}` },
    ],
    temperature: 0.2,
    max_tokens: 2_000,
  })

  const raw = completion.choices[0]?.message?.content ?? ''
  const parsed = extractJson<{ results?: ScoreResult[] }>(raw)
  const results = Array.isArray(parsed?.results) ? parsed!.results! : []
  // keep only sane values for listings we actually sent
  const sentIds = new Set(listings.map((l) => l.id))
  return results
    .filter((r) => sentIds.has(r.id) && typeof r.score === 'number')
    .map((r) => ({
      id: r.id,
      score: Math.max(0, Math.min(100, Math.round(r.score))),
      why: String(r.why ?? '').slice(0, 300),
      gaps: Array.isArray(r.gaps) ? r.gaps.map(String).slice(0, 2) : [],
    }))
}

/**
 * Outcome learning (Phase 4, deliberately simple): companies the user
 * interviewed with get a small boost; companies that rejected them get
 * demoted — within a 60-day window, only for applications the AGENT
 * submitted (the signal is about the user's actual experience with that
 * company's process, not their browsing).
 */
async function outcomeAdjustments(userId: string): Promise<Map<string, number>> {
  const since = new Date(Date.now() - OUTCOME_WINDOW_DAYS * 86_400_000)
  const rows = await db.applicationDraft.findMany({
    where: {
      userId,
      method: { not: null },
      status: { in: ['submitted', 'submitted_manually'] },
      submittedAt: { gte: since },
    },
    select: {
      listing: { select: { company: true } },
      opportunity: { select: { company: true, status: true } },
    },
  })
  const adjust = new Map<string, number>()
  for (const r of rows) {
    const status = r.opportunity?.status
    if (!status) continue
    const delta = status === 'offer' ? OUTCOME_ADJUST.offer : status === 'interview' ? OUTCOME_ADJUST.interview : status === 'rejected' ? OUTCOME_ADJUST.rejected : 0
    if (!delta) continue
    const company = (r.listing?.company ?? r.opportunity?.company ?? '').toLowerCase()
    if (!company) continue
    // strongest signal wins (by magnitude — a -10 rejection must not be
    // flattened to 0 by a naive max)
    const prev = adjust.get(company) ?? 0
    if (Math.abs(delta) > Math.abs(prev)) adjust.set(company, delta)
  }
  return adjust
}

/**
 * Daily cron helper: run shortlists for users whose results are stale
 * (>20h old or never run). Strictly bounded — MAX_DAILY_USERS accounts per
 * hit, each with runShortlist's own caps, every failure isolated.
 */
export async function runDailyShortlists(now: Date, maxUsers = 10): Promise<{ ran: string[]; failed: string[]; skippedStale: boolean }> {
  const staleBefore = new Date(now.getTime() - 20 * 3_600_000)
  const profiles = await db.candidateProfile.findMany({
    where: {
      user: { emailVerified: true },
      OR: [{ resumeId: { not: null } }],
    },
    select: { userId: true },
    take: 200,
  })
  if (profiles.length === 0) return { ran: [], failed: [], skippedStale: false }

  // order by staleness: users with the oldest (or missing) matchRunAt first
  const latest = await db.jobListing.groupBy({
    by: ['userId'],
    where: { userId: { in: profiles.map((p) => p.userId) } },
    _max: { matchRunAt: true },
  })
  const lastRun = new Map(latest.map((r) => [r.userId, r._max.matchRunAt]))
  const due = profiles
    .map((p) => ({ userId: p.userId, at: lastRun.get(p.userId) ?? null }))
    .filter((p) => !p.at || p.at < staleBefore)
    .slice(0, maxUsers)

  const ran: string[] = []
  const failed: string[] = []
  for (const p of due) {
    try {
      await runShortlist(p.userId)
      ran.push(p.userId)
    } catch (e) {
      console.error(`daily shortlist failed for ${p.userId}`, e)
      failed.push(p.userId)
    }
  }
  return { ran, failed, skippedStale: profiles.length > maxUsers }
}

/**
 * Full shortlist run for one user. Deterministic filters → JD hydration →
 * batch scoring → outcome adjustments → persist → Top-5 card in the agent thread.
 */
export interface ShortlistRunSummary {
  candidates: number
  hydrated: number
  scored: number
  top: ShortlistCard['items']
}

export async function runShortlist(userId: string): Promise<ShortlistRunSummary> {
  const profile = await db.candidateProfile.findUnique({ where: { userId } })
  if (!profile) throw new Error('NO_PROFILE')

  const all = await db.jobListing.findMany({
    where: { userId },
    orderBy: [{ publishedAt: 'desc' }, { fetchedAt: 'desc' }],
    take: 400,
  })

  const survivors = all.filter((l) => hardFilter(l, profile).pass)
  const stale = survivors.filter((l) => !l.descriptionText).slice(0, JD_HYDRATE_BUDGET + 12)
  const hydrated = await hydrateDescriptions(stale, JD_HYDRATE_BUDGET)

  // hydrate() mutates only the stale slice — refresh from survivors
  const pool = survivors
    .map((l) => stale.find((s) => s.id === l.id) ?? l)
    .sort((a, b) => (b.descriptionText ? 1 : 0) - (a.descriptionText ? 1 : 0))
    .slice(0, MAX_BATCHES_PER_RUN * BATCH_SIZE)

  const results: ScoreResult[] = []
  for (let i = 0; i < pool.length; i += BATCH_SIZE) {
    const batch = pool.slice(i, i + BATCH_SIZE)
    const scored = await scoreBatch(batch, profile)
    results.push(...scored)
  }

  // outcome learning — small, honest adjustments from the user's real history
  const adjustments = await outcomeAdjustments(userId)
  if (adjustments.size > 0) {
    for (const r of results) {
      const l = pool.find((x) => x.id === r.id)
      const delta = adjustments.get((l?.company ?? '').toLowerCase())
      if (delta) {
        r.score = Math.max(0, Math.min(100, r.score + delta))
        r.why = `${r.why} (adjusted ${delta > 0 ? '+' : ''}${delta} from your history with this company)`
      }
    }
  }

  const now = new Date()
  // persist scores (one update per scored listing — bounded by MAX_BATCHES)
  await Promise.all(
    results.map((r) =>
      db.jobListing.update({
        where: { id: r.id },
        data: {
          matchScore: r.score,
          matchWhy: r.why,
          matchGaps: r.gaps && r.gaps.length ? JSON.stringify(r.gaps) : null,
          matchRunAt: now,
        },
      })
    )
  )
  // listings that fell out of the pool keep their last score; stale ones the
  // user has moved past are simply not re-scored — nothing to reset.

  const byId = new Map(pool.map((l) => [l.id, l]))
  const top: ShortlistCard['items'] = results
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_N)
    .map((r) => {
      const l = byId.get(r.id)!
      return {
        listingId: l.id,
        company: l.company,
        role: l.role,
        url: l.url,
        score: r.score,
        why: r.why,
        source: l.source,
      }
    })

  if (top.length > 0) {
    await writeAgentMessage(
      userId,
      `Shortlist done — I scored ${results.length} listings against your profile${hydrated ? ` (pulled ${hydrated} full job descriptions first)` : ''}. Here are your top ${top.length}:`,
      { kind: 'shortlist', items: top, scoredCount: results.length }
    )
  }

  return { candidates: all.length, hydrated, scored: results.length, top }
}
