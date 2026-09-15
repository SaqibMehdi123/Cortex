import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authorizeCron } from '@/lib/morning-briefing'
import { fetchAllScholarshipRows } from '@/lib/scholarship-sync'

// GET /api/cron/feeds — the DAILY feed sync for scholarships & exchange
// programmes, run for every verified account.
//
// Called by the Vercel cron defined in vercel.json ("30 3 * * *" = 08:30
// Asia/Karachi, 30 minutes BEFORE the 09:00 morning briefing) so the Career
// tab — including the Exchanges filter — is freshly stocked even for users
// who have not opened Cortex in days. Safe to curl by hand:
//
//   curl "https://cortex.scrutinies.dev/api/cron/feeds?key=$CRON_SECRET"
//   curl "…&dryRun=1"   ← pull + classify only, write nothing
//
// Auth: identical contract to /api/cron/morning — CRON_SECRET (Vercel injects
// "Authorization: Bearer $CRON_SECRET" when the env var is set); without it,
// the scheduler's x-vercel-cron header is accepted as a fallback. SET
// CRON_SECRET to harden.
//
// Architecture: the four RSS feeds are parsed ONCE (not per user — one pull,
// N accounts), classified (level / kind / funding / country) and globally
// deduped by URL. Each verified account then receives the rows it does not
// already have (per-user dedupe by (userId, url) via skipDuplicates), and
// lastScholarshipsFetchAt is stamped so client auto-syncs stay quiet.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Fan-out safety cap — raise as the user base grows (each user costs one
// cheap createMany; rows themselves are parsed once regardless).
const MAX_USERS_PER_RUN = 500
// Parallelism for the per-user insert waves.
const CHUNK = 25
// Only stamp users whose auto-sync cooldown window we are not already inside
// of — avoids racing a manual sync that started seconds ago.
const STAMP_GUARD_MS = 60 * 60_000

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const secret = (process.env.CRON_SECRET || '').trim()
  const auth = authorizeCron({
    authHeader: req.headers.get('authorization'),
    vercelCronHeader: req.headers.get('x-vercel-cron'),
    keyParam: searchParams.get('key'),
    secret: secret || null,
    isProd: process.env.NODE_ENV === 'production',
  })
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized', reason: auth.reason }, { status: auth.status })
  }
  if (auth.reason === 'vercel_header_fallback') {
    console.warn('cron/feeds: CRON_SECRET is not set — falling back to the spoofable x-vercel-cron header. Set CRON_SECRET in Vercel → Settings → Environment Variables.')
  }

  const dryRun = searchParams.get('dryRun') === '1'
  const now = new Date()

  try {
    // 1) ONE feed pull for everyone.
    const { rows, perSource } = await fetchAllScholarshipRows()

    if (dryRun) {
      return NextResponse.json({
        mode: 'dryRun',
        ranAt: now.toISOString(),
        sources: perSource,
        rows: rows.length,
        exchanges: rows.filter((r) => r.kind === 'exchange').length,
        scholarships: rows.filter((r) => r.kind === 'scholarship').length,
      })
    }

    // 2) Everyone who would see the data (verified accounts only).
    const users = await db.user.findMany({
      where: { emailVerified: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: MAX_USERS_PER_RUN,
    })

    // 3) Fan out — per-user createMany with skipDuplicates honours the
    //    (userId, url) unique constraint, so each account keeps its own
    //    saved/dedupe state untouched.
    let inserted = 0
    for (let i = 0; i < users.length; i += CHUNK) {
      const chunk = users.slice(i, i + CHUNK)
      const res = await Promise.all(
        chunk.map((u) =>
          db.scholarship
            .createMany({
              data: rows.map((r) => ({
                userId: u.id,
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
              skipDuplicates: true,
            })
            .then((r) => r.count)
            .catch((e) => {
              console.error(`cron/feeds: fan-out failed for user ${u.id}`, e)
              return 0
            })
        )
      )
      inserted += res.reduce((a, b) => a + b, 0)
    }

    // 4) Stamp the hybrid auto-sync clock for quiet accounts so the client
    //    does not immediately re-pull feeds the cron just delivered.
    const stampGuard = new Date(now.getTime() - STAMP_GUARD_MS)
    const stamped = await db.user.updateMany({
      where: {
        emailVerified: true,
        OR: [{ lastScholarshipsFetchAt: null }, { lastScholarshipsFetchAt: { lt: stampGuard } }],
      },
      data: { lastScholarshipsFetchAt: now },
    })

    console.log(`cron/feeds: ${rows.length} rows (${rows.filter((r) => r.kind === 'exchange').length} exchanges) → ${users.length} accounts, ${inserted} new rows, ${stamped.count} stamps`)
    return NextResponse.json({
      ok: true,
      mode: 'send',
      ranAt: now.toISOString(),
      sources: perSource,
      rows: rows.length,
      exchanges: rows.filter((r) => r.kind === 'exchange').length,
      scholarships: rows.filter((r) => r.kind === 'scholarship').length,
      accounts: users.length,
      inserted,
      stamped: stamped.count,
    })
  } catch (e) {
    console.error('GET /api/cron/feeds error', e)
    return NextResponse.json({ error: 'Feed sync failed' }, { status: 500 })
  }
}
