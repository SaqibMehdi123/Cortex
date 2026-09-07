'use client'

import { useEffect, useRef } from 'react'

const keyFor = (k: string) => `cortex-scroll:${k}`

/**
 * Keeps each workspace view's scroll position so a reload (or switching tabs
 * and coming back) lands the user exactly where they were.
 *
 * - saves window.scrollY (rAF-throttled) into sessionStorage under the key
 * - right after the key changes it suppresses saves for 400ms — the browser
 *   fires clamped scroll events while the outgoing view's height collapses,
 *   and those must not overwrite the position we are about to restore
 * - restores immediately, then retries for up to ~1.5s while the view's data
 *   streams in and the page grows; any real user scroll intent cancels it
 */
export function useViewScroll(key: string) {
  const keyChangedAt = useRef(0)

  // ── save ──
  useEffect(() => {
    keyChangedAt.current = Date.now()
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (Date.now() - keyChangedAt.current < 400) return
        try {
          sessionStorage.setItem(keyFor(key), String(Math.round(window.scrollY)))
        } catch { /* private mode etc. */ }
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [key])

  // ── restore ──
  useEffect(() => {
    let saved = 0
    try { saved = Number(sessionStorage.getItem(keyFor(key)) ?? 0) || 0 } catch { /* ignore */ }
    const target = Math.max(0, saved)

    let cancelled = false
    let raf = 0
    const startedAt = performance.now()
    const stop = () => {
      cancelled = true
      cancelAnimationFrame(raf)
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchstart', stop)
      window.removeEventListener('keydown', stop)
    }
    // a real user interaction takes over from the auto-restore
    window.addEventListener('wheel', stop, { passive: true })
    window.addEventListener('touchstart', stop, { passive: true })
    window.addEventListener('keydown', stop)

    // Views fetch their data after mount, so the page grows for a while.
    // Keep pinning to min(target, height) until the height settles and we
    // actually reached the target — or until it's clear we never can.
    let lastMax = -1
    let stableFrames = 0
    const tick = () => {
      if (cancelled) return
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      window.scrollTo(0, Math.min(target, max))
      stableFrames = max === lastMax ? stableFrames + 1 : 0
      lastMax = max
      const reached = max >= target - 2 && window.scrollY >= Math.min(target, max) - 2 && stableFrames >= 2
      const hopeless = stableFrames >= 25 // content stopped growing below the target
      if (target <= 4 || reached || hopeless || performance.now() - startedAt > 1500) { stop(); return }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return stop
  }, [key])
}
