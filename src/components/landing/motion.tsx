'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Landing motion toolkit — cursor spotlight, 3D tilt, count-up and a
 * typewriter loop. All of them drive the DOM / rAF directly (no setState in
 * effect bodies) so they stay lint-clean and cheap.
 */

/** Sets --mx/--my CSS vars on the hovered card for the .spot spotlight. */
export function spotlightHandlers() {
  return {
    onMouseMove: (e: React.MouseEvent<HTMLElement>) => {
      const el = e.currentTarget
      const r = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${e.clientX - r.left}px`)
      el.style.setProperty('--my', `${e.clientY - r.top}px`)
    },
  }
}

/** Subtle 3D tilt that follows the cursor (desktop pointers only). */
export function useTilt<T extends HTMLElement>(max = 3) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (window.matchMedia('(pointer: coarse)').matches) return

    let raf = 0
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width - 0.5
      const py = (e.clientY - r.top) / r.height - 0.5
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        el.style.transform = `perspective(1400px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg)`
      })
    }
    const onLeave = () => {
      cancelAnimationFrame(raf)
      el.style.transform = 'perspective(1400px) rotateX(0deg) rotateY(0deg)'
    }
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
      cancelAnimationFrame(raf)
    }
  }, [max])

  return ref
}

/** Eased count-up that starts when `started` flips true. */
export function useCountUp(target: number, started: boolean, duration = 1300) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!started) return
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [started, target, duration])

  return value
}

/**
 * Typewriter loop over a list of prompts.
 * Returns { text, phase } where phase flips to "answered" when a prompt is
 * fully typed — used to fade in the canned reply — and back to "typing".
 */
export function useTypewriterLoop(
  lines: string[],
  opts: { typeMs?: number; holdMs?: number; deleteMs?: number } = {}
) {
  const { typeMs = 42, holdMs = 1700, deleteMs = 20 } = opts
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<'typing' | 'answered'>('typing')

  useEffect(() => {
    let line = 0
    let char = 0
    let deleting = false
    let timer: ReturnType<typeof setTimeout>

    const tick = () => {
      const current = lines[line]
      if (!deleting) {
        char += 1
        setText(current.slice(0, char))
        if (char >= current.length) {
          setPhase('answered')
          deleting = true
          timer = setTimeout(tick, holdMs)
          return
        }
        timer = setTimeout(tick, typeMs + Math.random() * 46)
      } else {
        if (char === current.length) setPhase('typing')
        char -= 1
        setText(current.slice(0, char))
        if (char <= 0) {
          deleting = false
          line = (line + 1) % lines.length
          timer = setTimeout(tick, 420)
          return
        }
        timer = setTimeout(tick, deleteMs)
      }
    }

    timer = setTimeout(tick, 500)
    return () => clearTimeout(timer)
  }, [lines, typeMs, holdMs, deleteMs])

  return { text, phase }
}
