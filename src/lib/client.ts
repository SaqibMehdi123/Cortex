'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Tiny fetch helpers ─────────────────────────────────────────────

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
  return data as T
}

export const api = {
  get: <T,>(url: string) => request<T>(url),
  post: <T,>(url: string, body?: unknown) => request<T>(url, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T,>(url: string, body?: unknown) => request<T>(url, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T,>(url: string) => request<T>(url, { method: 'DELETE' }),
}

// ─── Minimal data-fetching hook (avoid pulling a state lib) ─────────

export function useApi<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  const reload = useCallback(async () => {
    if (!url) return
    setLoading(true)
    try {
      const result = await api.get<T>(url)
      if (mounted.current) {
        setData(result)
        setError(null)
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [url])

  useEffect(() => {
    mounted.current = true
    reload()
    return () => {
      mounted.current = false
    }
  }, [url, ...deps])

  return { data, loading, error, reload, setData }
}

// ─── Date helpers ───────────────────────────────────────────────────

export function todayISO(d = new Date()) {
  return d.toISOString().slice(0, 10)
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
