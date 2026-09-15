import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { beginSync, stampSync, abortSync } from '@/lib/sync-guard'
import { fetchAllScholarshipRows } from '@/lib/scholarship-sync'

export const maxDuration = 60

// POST /api/scholarships/fetch — pull masters/PhD scholarships & fully-funded
// opportunities (incl. exchange programmes) from curated feeds into the
// account's own list. Per-user dedupe by URL, same hybrid auto-sync contract
// as news/papers/jobs. Feed parsing/classification lives in the shared
// scholarship-sync lib so the daily cron (/api/cron/feeds) uses identical
// logic for every account.
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

    const guard = await beginSync(user.id, 'scholarships', force)
    if (guard.skip) {
      return NextResponse.json({ ok: true, skipped: guard.reason, added: 0, total: 0, perSource: [], lastFetchedAt: guard.lastFetchedAt })
    }

    const { rows: collected, perSource } = await fetchAllScholarshipRows()

    let added = 0
    if (collected.length > 0) {
      const existing = await db.scholarship.findMany({
        where: { userId: user.id, url: { in: collected.map((c) => c.url) } },
        select: { url: true },
      })
      const seen = new Set(existing.map((e) => e.url))
      const fresh = collected.filter((c) => !seen.has(c.url))
      if (fresh.length > 0) {
        const res = await db.scholarship.createMany({
          data: fresh.map((r) => ({
            userId: user.id,
            title: r.title,
            provider: r.provider,
            url: r.url,
            level: r.level,
            kind: r.kind,
            funding: r.funding,
            country: r.country,
            summary: r.summary,
            source: r.source,
          })),
        })
        added = res.count
      }
    }

    const total = await db.scholarship.count({ where: { userId: user.id } })
    const lastFetchedAt = await stampSync(user.id, 'scholarships')
    return NextResponse.json({ ok: true, added, total, perSource, lastFetchedAt })
  } catch (e) {
    console.error('POST /api/scholarships/fetch error', e)
    return NextResponse.json({ error: 'Failed to fetch scholarships. Try again.' }, { status: 500 })
  } finally {
    // Error path never stamps — always release the lock (no-op if stamped).
    if (userId) abortSync(userId, 'scholarships')
  }
}
