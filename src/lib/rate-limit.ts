// ─── Tiny in-memory rate limiter for auth endpoints ─────────────────────────
//
// Sliding-window counters keyed by `bucket` (usually ip + email). Aims to be
// just strong enough to stop password spraying and code-spamming without
// pulling in an external store:
//   • On a single long-lived server instance it is a true limiter.
//   • On serverless (Vercel) each warm instance counts independently, so the
//     effective ceiling is per-instance — still a large improvement over no
//     limit at all, and honest about what it is.
//
// Intentionally dependency-free and fail-open: if limiter bookkeeping ever
// throws, the request proceeds (rate limiting must never break login for a
// real user).

type Window = { hits: number[]; }

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

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number } = { limit: 10, windowMs: 5 * 60_000 }
): RateLimitVerdict {
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
