'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Tiny fetch helpers ─────────────────────────────────────────────

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // Server 500s carry `detail` (the real reason) alongside the generic
    // `error` — surface both so failures are debuggable from the toast.
    const d = data as { error?: string; detail?: string }
    const msg = [d.error, d.detail].filter(Boolean).join(' — ') || `Request failed (${res.status})`
    const err = new Error(msg) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return data as T
}

export const api = {
  get: <T,>(url: string) => request<T>(url),
  post: <T,>(url: string, body?: unknown) => request<T>(url, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T,>(url: string, body?: unknown) => request<T>(url, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  put: <T,>(url: string, body?: unknown) => request<T>(url, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  del: <T,>(url: string) => request<T>(url, { method: 'DELETE' }),
}

// ─── Minimal data-fetching hook (avoid pulling a state lib) ─────────
//
// Stale-while-revalidate with a module-level cache:
//   • Remounting a view (tab switch) renders the CACHED payload instantly —
//     no skeleton flash, no "the page reloaded" feeling — then quietly
//     revalidates in the background.
//   • reload() NEVER blanks the screen: existing data stays mounted while
//     the fresh payload is fetched; loading=true only when there is no data
//     at all (first ever load of that URL).

const apiCache = new Map<string, unknown>()
const API_CACHE_MAX = 60

function cacheGet<T>(url: string): T | undefined {
  return apiCache.get(url) as T | undefined
}

function cacheSet(url: string, value: unknown) {
  // bounded cache — evict the oldest entry (Map preserves insertion order)
  if (!apiCache.has(url) && apiCache.size >= API_CACHE_MAX) {
    const oldest = apiCache.keys().next().value
    if (oldest !== undefined) apiCache.delete(oldest)
  }
  // re-insert to mark it most-recently-used
  apiCache.delete(url)
  apiCache.set(url, value)
}

export function useApi<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(() => (url ? cacheGet<T>(url) ?? null : null))
  const [loading, setLoading] = useState(() => !!url && !apiCache.has(url))
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  const reload = useCallback(async () => {
    if (!url) return
    try {
      const result = await api.get<T>(url)
      cacheSet(url, result)
      if (mounted.current) {
        setData(result)
        setError(null)
      }
    } catch (e) {
      // with stale data already on screen a failed revalidation is quiet —
      // the user keeps their content; only a cold load surfaces the error
      if (mounted.current && !apiCache.has(url)) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
      }
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [url])

  useEffect(() => {
    mounted.current = true
    if (url) {
      const cached = cacheGet<T>(url)
      if (cached !== undefined) {
        // warm start — paint cached data, refresh behind it
        setData(cached)
        setLoading(false)
      } else {
        setLoading(true)
      }
    }
    reload()
    return () => {
      mounted.current = false
    }
  }, [url, ...deps])

  return { data, loading, error, reload, setData }
}

// ─── Date helpers ───────────────────────────────────────────────────

export function todayISO(d = new Date()) {
  // Local calendar date — toISOString() would slice the UTC date, which is a
  // different day than the user's for most hours west of UTC and 00:00–05:00
  // in PKT. "Today" must always mean the day the user sees on their clock.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function weekStartISO(d = new Date()) {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7 // Monday = 0
  x.setDate(x.getDate() - day)
  return todayISO(x)
}

export function monthStartISO(d = new Date()) {
  return todayISO(new Date(d.getFullYear(), d.getMonth(), 1))
}

export function fmtDate(iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('en-US', opts ?? { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return null
  }
}

export function daysUntil(iso: string | null | undefined) {
  if (!iso) return null
  const target = new Date(iso)
  const now = new Date()
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}
