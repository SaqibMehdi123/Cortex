'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/client'

// ── News auto-refresh policy ────────────────────────────────────────────────
// A user should never land on an empty "fetch it yourself" screen, and a
// returning user shouldn't have to remember to refresh. So:
//   • empty feed                    → fetch immediately (first visit)
//   • data older than STALE_AFTER   → refresh in the background on visit
//   • page left open                → recheck every RECHECK_INTERVAL
//   • manual button                 → always available, force (skips cooldown)
// The server enforces its own 5-min auto cooldown + one-fetch-per-user lock,
// so even aggressive client behaviour can't hammer the RSS feeds.
const STALE_AFTER_MS = 3 * 60 * 60_000 // 3 hours
const RECHECK_INTERVAL_MS = 15 * 60_000 // recheck stale state every 15 min
const MIN_ATTEMPT_GAP_MS = 2 * 60_000 // remount guard: don't re-attempt within 2 min

interface NewsStatus {
  lastFetchedAt: string | null
  total: number
}

export interface NewsFetchResult {
  totalNew: number
  skipped?: string
  perSource?: { name: string; ok: boolean; count: number; error: string | null }[]
}

// Module-scoped state survives view switches (dashboard ⇄ news radar) within
// the SPA session, so both surfaces share one decision + one in-flight request.
let lastAttemptAt = 0
let inflight: Promise<NewsFetchResult | null> | null = null

async function runAutoFetch(): Promise<NewsFetchResult | null> {
  if (inflight) return inflight
  lastAttemptAt = Date.now()
  inflight = api
    .post<{ totalNew: number; skipped?: string }>('/api/news/fetch')
    .catch(() => null) // silent — auto refresh must never surface errors as toasts
    .finally(() => {
      inflight = null
    })
  return inflight
}

export interface UseNewsAutoFetchResult {
  /** True while a background auto-fetch is running (show a quiet spinner). */
  autoFetching: boolean
  /** Server timestamp of the last completed fetch, once known. */
  lastFetchedAt: string | null
  /** Force a manual fetch (bypasses cooldown); returns result or null on error. */
  manualFetch: () => Promise<NewsFetchResult | null>
  /** Re-run the staleness check right away (e.g. after a manual fetch). */
  recheck: () => Promise<void>
}

/**
 * Keeps the per-user news feed fresh without user action.
 * @param onAutoFetched optional callback fired only when an auto fetch actually
 *                      ran to completion (not when skipped/cooldown).
 */
export function useNewsAutoFetch(onAutoFetched?: (result: { totalNew: number }) => void): UseNewsAutoFetchResult {
  const [autoFetching, setAutoFetching] = useState(false)
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null)
  const mounted = useRef(true)
  const cbRef = useRef(onAutoFetched)
  cbRef.current = onAutoFetched

  const check = useCallback(async () => {
    try {
      const status = await api.get<NewsStatus>('/api/news/status')
      if (!mounted.current) return
      setLastFetchedAt(status.lastFetchedAt)

      const empty = status.total === 0
      const stale = status.lastFetchedAt ? Date.now() - new Date(status.lastFetchedAt).getTime() > STALE_AFTER_MS : empty
      if (!empty && !stale) return
      if (Date.now() - lastAttemptAt < MIN_ATTEMPT_GAP_MS) return // just tried — trust the server cooldown

      setAutoFetching(true)
      const result = await runAutoFetch()
      if (!mounted.current) return
      setAutoFetching(false)
      if (result) {
        setLastFetchedAt(new Date().toISOString())
        if (!result.skipped) cbRef.current?.({ totalNew: result.totalNew })
      }
    } catch {
      // status endpoint unreachable — stay quiet, the manual button still works
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    check()
    const id = setInterval(check, RECHECK_INTERVAL_MS)
    return () => {
      mounted.current = false
      clearInterval(id)
    }
  }, [check])

  const manualFetch = useCallback(async () => {
    setAutoFetching(true)
    try {
      const result = await api.post<NewsFetchResult>('/api/news/fetch', { force: true })
      if (mounted.current) setLastFetchedAt(new Date().toISOString())
      return result
    } catch {
      return null // caller surfaces the error toast
    } finally {
      if (mounted.current) setAutoFetching(false)
    }
  }, [])

  const recheck = useCallback(async () => {
    await check()
  }, [check])

  return { autoFetching, lastFetchedAt, manualFetch, recheck }
}
