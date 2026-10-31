// ─── Rate limiting for auth & abuse-sensitive endpoints ─────────────────────
//
// TWO layers, both fed by every counted request:
//
// 1. Instance-local sliding window (Map below) — instant, free, and a real
//    limiter on a single long-lived server. On serverless (Vercel) each warm
//    function counts independently, so on its own it is NOT a security
//    boundary: traffic spread over N instances multiplies every ceiling by N
//    (the 2026-10 security audit measured 12 rapid login attempts landing on
//    12 different instances with the 429 never firing — the classic
//    distributed password-spray bypass).
//
// 2. Durable Postgres counter (RateHit table) — the authoritative ceiling
//    shared by every instance. One indexed read + one insert per call;
//    acceptable because every rate-limited route is already DB-backed and
//    infrequent by nature (login, codes, probes).
//
// Deliberately dependency-free and FAIL-OPEN: if the DB layer ever throws,
// the memory verdict stands (rate limiting must never break login for a real
// user). Fail-open on layer 2 degrades to layer 1's per-instance ceiling,
// never to "no limit".

import { db } from '@/lib/db'

type Window = { hits: number[] }

const buckets = new Map<string, Window>()

// Periodic sweep so long-running processes don't accumulate dead buckets.
let lastSweep = Date.now()
const SWEEP_INTERVAL_MS = 10 * 60_000
const BUCKET_TTL_MS = 30 * 60_000

export interface RateLimitVerdict {
  allowed: boolean
  /** Seconds until the next attempt is allowed (only when !allowed). */
  retryAfter: number
}

export interface RateLimitOpts {
  limit: number
  windowMs: number
}

const DEFAULT_OPTS: RateLimitOpts = { limit: 10, windowMs: 5 * 60_000 }

function memoryLimit(key: string, opts: RateLimitOpts): RateLimitVerdict {
  try {
    const now = Date.now()
    sweep(now)

    const win = buckets.get(key) ?? { hits: [] }
    win.hits = win.hits.filter((t) => now - t < opts.windowMs)

    if (win.hits.length >= opts.limit) {
      const oldest = win.hits[0] ?? now
      buckets.set(key, win)
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((opts.windowMs - (now - oldest)) / 1000)) }
    }

    win.hits.push(now)
    buckets.set(key, win)
    return { allowed: true, retryAfter: 0 }
  } catch {
    return { allowed: true, retryAfter: 0 }
  }
}

/**
 * Count one attempt against `key`. Memory layer first (blocks same-instance
 * bursts instantly), then the durable Postgres layer that every serverless
 * instance shares. Blocked attempts are counted by the layer that blocks
 * them but do not extend any window.
 */
export async function rateLimit(
  key: string,
  opts: RateLimitOpts = DEFAULT_OPTS
): Promise<RateLimitVerdict> {
  const mem = memoryLimit(key, opts)
  if (!mem.allowed) return mem

  try {
    const now = Date.now()
    const since = new Date(now - opts.windowMs)
    const hits = await db.rateHit.findMany({
      where: { bucket: key, hitAt: { gte: since } },
      orderBy: { hitAt: 'asc' },
      take: opts.limit + 1,
      select: { hitAt: true },
    })

    if (hits.length > opts.limit) {
      const oldest = hits[0].hitAt.getTime()
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((opts.windowMs - (now - oldest)) / 1000)) }
    }

    await db.rateHit.create({ data: { bucket: key } })

    // Opportunistic sweep of dead rows (~2% of calls, fire-and-forget) so the
    // table stays small without a cron. Rows older than BUCKET_TTL_MS can no
    // longer affect any window (all limiters use windows ≤ 10 min).
    if (Math.random() < 0.02) {
      db.rateHit
        .deleteMany({ where: { hitAt: { lt: new Date(now - BUCKET_TTL_MS) } } })
        .catch(() => {})
    }

    return { allowed: true, retryAfter: 0 }
  } catch {
    return mem // DB unavailable — fail open to the memory layer's verdict
  }
}

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now
  for (const [key, win] of buckets) {
    const newest = win.hits[win.hits.length - 1] ?? 0
    if (now - newest > BUCKET_TTL_MS) buckets.delete(key)
  }
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return headers.get('x-real-ip') ?? 'unknown'
}
