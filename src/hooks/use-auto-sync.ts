'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/client'

// ── Generic hybrid auto-sync (client side) ──────────────────────────────────
// One policy for every auto-syncable feed (news, papers, jobs, scholarships):
//   • empty dataset                → sync immediately (first visit)
//   • data older than STALE_AFTER  → silent background sync on visit
//   • page left open               → recheck every RECHECK_INTERVAL
//   • manual button                → force sync (server skips its cooldown)
// The server enforces its own 5-min auto cooldown + per-account lock, so even
// aggressive client behaviour can't hammer upstream feeds.
const STALE_AFTER_MS = 3 * 60 * 60_000 // 3 hours
const RECHECK_INTERVAL_MS = 15 * 60_000 // recheck stale state every 15 min
const MIN_ATTEMPT_GAP_MS = 2 * 60_000 // remount guard: don't re-attempt within 2 min

export interface SyncFetchResult {
  totalNew?: number
  added?: number
  skipped?: string
  perSource?: { name: string; ok: boolean; count: number; error?: string | null }[]
  [k: string]: unknown
}

interface SyncStatus {
  lastFetchedAt: string | null
  total: number
}

interface ResourceState {
  lastAttemptAt: number
  inflight: Promise<SyncFetchResult | null> | null
}

// Module-scoped state survives view switches within the SPA session, so two
// surfaces using the same resource share one decision + one in-flight request.
const states = new Map<string, ResourceState>()

function stateFor(key: string): ResourceState {
  let s = states.get(key)
  if (!s) {
    s = { lastAttemptAt: 0, inflight: null }
    states.set(key, s)
  }
  return s
}

async function runAutoSync(key: string, fetchEndpoint: string): Promise<SyncFetchResult | null> {
  const s = stateFor(key)
  if (s.inflight) return s.inflight
  s.lastAttemptAt = Date.now()
  s.inflight = api
    .post<SyncFetchResult>(fetchEndpoint)
    .catch(() => null) // silent — auto sync must never surface errors as toasts
    .finally(() => {
      s.inflight = null
    })
  return s.inflight
}

export interface UseAutoSyncOptions {
  /** Module-state key shared by every surface that shows this resource. */
  key: string
  statusEndpoint: string
  fetchEndpoint: string
  /** Override the 3h staleness window if a feed moves faster/slower. */
  staleAfterMs?: number
  /** Fired only when an auto sync actually ran to completion (not skipped). */
  onAutoFetched?: (result: SyncFetchResult) => void
}

export interface UseAutoSyncResult {
  /** True while a background auto-sync is running (show a quiet spinner). */
  autoFetching: boolean
  /** Server timestamp of the last completed sync, once known. */
  lastFetchedAt: string | null
  /** Force a manual sync (bypasses cooldown); returns result or null on error. */
  manualSync: () => Promise<SyncFetchResult | null>
  /** Re-run the staleness check right away. */
  recheck: () => Promise<void>
}

export function useAutoSync(opts: UseAutoSyncOptions): UseAutoSyncResult {
  const { key, statusEndpoint, fetchEndpoint } = opts
  const staleAfter = opts.staleAfterMs ?? STALE_AFTER_MS
  const [autoFetching, setAutoFetching] = useState(false)
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null)
  const mounted = useRef(true)
  const cbRef = useRef(opts.onAutoFetched)
  cbRef.current = opts.onAutoFetched

  const check = useCallback(async () => {
    try {
      const status = await api.get<SyncStatus>(statusEndpoint)
      if (!mounted.current) return
      setLastFetchedAt(status.lastFetchedAt)

      const empty = status.total === 0
      const stale = status.lastFetchedAt ? Date.now() - new Date(status.lastFetchedAt).getTime() > staleAfter : empty
      if (!empty && !stale) return
      const s = stateFor(key)
      if (Date.now() - s.lastAttemptAt < MIN_ATTEMPT_GAP_MS) return // just tried — trust the server cooldown

      setAutoFetching(true)
      const result = await runAutoSync(key, fetchEndpoint)
      if (!mounted.current) return
      setAutoFetching(false)
      if (result) {
        setLastFetchedAt(new Date().toISOString())
        if (!result.skipped) cbRef.current?.(result)
      }
    } catch {
      // status endpoint unreachable — stay quiet, the manual button still works
    }
  }, [key, statusEndpoint, fetchEndpoint, staleAfter])

  useEffect(() => {
    mounted.current = true
    check()
    const id = setInterval(check, RECHECK_INTERVAL_MS)
    return () => {
      mounted.current = false
      clearInterval(id)
    }
  }, [check])

  const manualSync = useCallback(async () => {
    setAutoFetching(true)
    try {
      const result = await api.post<SyncFetchResult>(fetchEndpoint, { force: true })
      if (mounted.current) setLastFetchedAt(new Date().toISOString())
      return result
    } catch {
      return null // caller surfaces the error toast
    } finally {
      if (mounted.current) setAutoFetching(false)
    }
  }, [fetchEndpoint])

  const recheck = useCallback(async () => {
    await check()
  }, [check])

  return { autoFetching, lastFetchedAt, manualSync, recheck }
}
