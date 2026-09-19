'use client'

// Auto-logout after 30 idle minutes in the workspace. "Working" = any
// pointer / key / wheel / touch / scroll interaction — each one resets the
// clock. A running focus timer also counts as working: deep work (or a
// heads-down reading session with the pomodoro on) should never end in a
// surprise logout. Cross-tab safe: tabs heartbeat their freshest activity
// into localStorage and the check takes the maximum, so being active in one
// Cortex tab keeps every other tab signed in too.
//
// The actual sign-out hits /api/auth/logout so the httpOnly session cookie
// is cleared by the server's Set-Cookie response (client JS can't touch it),
// then the workspace's local leftovers are wiped exactly like the manual
// sign-out button does.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/client'
import { useUI } from '@/lib/nav-config'
import { usePomodoro } from '@/lib/pomodoro'
import { toast } from '@/hooks/use-toast'

const IDLE_LIMIT_MS = 30 * 60 * 1000 // signed out after 30 idle minutes
const WARN_BEFORE_MS = 3 * 60 * 1000 // heads-up toast 3 minutes ahead
const HEARTBEAT_MS = 30 * 1000 // throttle for cross-tab localStorage writes
const CHECK_EVERY_MS = 15 * 1000 // idle check cadence
const ACTIVITY_KEY = 'cortex:last-activity'

const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
] as const

export function useIdleLogout(enabled = true) {
  const router = useRouter()

  useEffect(() => {
    if (!enabled) return

    let mine = Date.now() // freshest activity seen in THIS tab
    let lastWrite = 0
    let warned = false
    let loggingOut = false

    const onActivity = () => {
      mine = Date.now()
      warned = false
      // cross-tab heartbeat, throttled — pointermove fires too often to
      // hit localStorage on every event
      if (mine - lastWrite > HEARTBEAT_MS) {
        lastWrite = mine
        try {
          localStorage.setItem(ACTIVITY_KEY, String(mine))
        } catch {
          /* storage unavailable — single-tab fallback still works */
        }
      }
    }

    const listeners = ACTIVITY_EVENTS.map((ev) => {
      const fn = () => onActivity()
      window.addEventListener(ev, fn, { passive: true })
      return [ev, fn] as const
    })

    async function logoutIdle() {
      if (loggingOut) return
      loggingOut = true
      try {
        await api.post('/api/auth/logout', {})
      } catch {
        /* the session may already be gone — proceed with the local cleanup */
      }
      try {
        localStorage.removeItem(ACTIVITY_KEY)
        useUI.persist.clearStorage()
        for (const store of [sessionStorage, localStorage]) {
          Object.keys(store)
            .filter((k) => k.startsWith('cortex-scroll:') || k.startsWith('cortex-reader-page:'))
            .forEach((k) => store.removeItem(k))
        }
      } catch {
        /* storage unavailable */
      }
      router.replace('/login?reason=idle')
      router.refresh()
    }

    const tick = () => {
      if (loggingOut) return
      // active focus session = the user is working (even if away from keys)
      if (usePomodoro.getState().running) {
        warned = false
        return
      }
      let other = 0
      try {
        other = Number(localStorage.getItem(ACTIVITY_KEY) || 0)
      } catch {
        /* storage unavailable */
      }
      const idleFor = Date.now() - Math.max(mine, other || 0)
      if (idleFor < IDLE_LIMIT_MS - WARN_BEFORE_MS) return
      if (idleFor < IDLE_LIMIT_MS) {
        if (!warned) {
          warned = true
          toast({
            title: 'Still there?',
            description: `You have been idle for a while — you will be signed out in ${Math.max(1, Math.ceil((IDLE_LIMIT_MS - idleFor) / 60_000))} minutes. Move the mouse or press any key to stay signed in.`,
          })
        }
        return
      }
      void logoutIdle()
    }

    const timer = window.setInterval(tick, CHECK_EVERY_MS)

    return () => {
      window.clearInterval(timer)
      listeners.forEach(([ev, fn]) => window.removeEventListener(ev, fn))
    }
  }, [enabled, router])
}
