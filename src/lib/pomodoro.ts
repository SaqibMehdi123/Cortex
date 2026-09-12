'use client'

// ─── Pomodoro engine (global store) ─────────────────────────────────
//
// The timer lives OUTSIDE the React tree on purpose: it keeps running while
// the user navigates between sections, closes the dialog, or opens other
// panels — a compact floating pill (rendered by focus-timer.tsx) keeps the
// countdown visible everywhere. One component (PomodoroHost) owns the single
// 1-second interval that drives tick().
//
// Cycle: work → short break → work → … → after `roundsBeforeLong` work
// blocks a long break. Every completed (or partially elapsed ≥1min) work
// block is logged to POST /api/focus, which also rolls minutes into the
// linked task's focusMinutes and shows up in Analytics.

import { create } from 'zustand'

export type PomodoroPhase = 'work' | 'short' | 'long'

export type PomodoroTaskLink = { id: string; title: string; goalId?: string | null }

export const WORK_PRESETS = [15, 25, 50] as const
export const SHORT_BREAK_MIN = 5
export const LONG_BREAK_MIN = 15
export const ROUNDS_BEFORE_LONG = 4

type PomodoroState = {
  phase: PomodoroPhase
  secondsLeft: number
  running: boolean
  dialogOpen: boolean
  /** completed work blocks since Start (drives long-break cadence + dots) */
  completed: number
  /** seconds elapsed in the CURRENT phase (partial logging on End) */
  phaseElapsed: number
  /** minutes of focus accumulated since Start (work phases only) */
  focusSeconds: number
  taskLink: PomodoroTaskLink | null
  workMin: number
  // actions
  open: () => void
  close: () => void
  start: (link?: PomodoroTaskLink | null) => void
  pause: () => void
  resume: () => void
  toggle: () => void
  skip: () => void
  stop: () => void
  setWorkMin: (m: number) => void
  tick: () => void
}

export const usePomodoro = create<PomodoroState>()((set, get) => {
  const workLen = () => get().workMin * 60
  const breakLen = (p: PomodoroPhase) => (p === 'short' ? SHORT_BREAK_MIN : LONG_BREAK_MIN) * 60

  const phaseLabel = (p: PomodoroPhase) => (p === 'work' ? 'Focus' : p === 'short' ? 'Short break' : 'Long break')

  // phase completed → advance the cycle (auto-runs the next phase)
  const advance = () => {
    const s = get()
    if (s.phase === 'work') {
      const nextCompleted = s.completed + 1
      const nextPhase: PomodoroPhase = nextCompleted % ROUNDS_BEFORE_LONG === 0 ? 'long' : 'short'
      set({
        completed: nextCompleted,
        phase: nextPhase,
        secondsLeft: breakLen(nextPhase),
        phaseElapsed: 0,
        running: true,
      })
      notify(`${phaseLabel(nextPhase)} — ${nextPhase === 'long' ? LONG_BREAK_MIN : SHORT_BREAK_MIN} min`)
    } else {
      set({ phase: 'work', secondsLeft: workLen(), phaseElapsed: 0, running: true })
      notify('Back to focus')
    }
  }

  return {
    phase: 'work',
    secondsLeft: 25 * 60,
    running: false,
    dialogOpen: false,
    completed: 0,
    phaseElapsed: 0,
    focusSeconds: 0,
    taskLink: null,
    workMin: 25,

    open: () => set({ dialogOpen: true }),
    close: () => set({ dialogOpen: false }),

    start: (link) => {
      if (link) set({ taskLink: link })
      set({
        phase: 'work',
        secondsLeft: workLen(),
        running: true,
        dialogOpen: true,
        completed: 0,
        phaseElapsed: 0,
        focusSeconds: 0,
      })
    },

    pause: () => set({ running: false }),
    resume: () => set({ running: true }),
    toggle: () => set((s) => ({ running: !s.running })),

    // Skip = move to the next phase WITHOUT logging (abandoned work block)
    skip: () => {
      const s = get()
      if (s.phase === 'work') {
        const nextCompleted = s.completed + 1
        const nextPhase: PomodoroPhase = nextCompleted % ROUNDS_BEFORE_LONG === 0 ? 'long' : 'short'
        set({ completed: nextCompleted, phase: nextPhase, secondsLeft: breakLen(nextPhase), phaseElapsed: 0 })
      } else {
        set({ phase: 'work', secondsLeft: workLen(), phaseElapsed: 0 })
      }
    },

    // End = stop everything; a partially-elapsed work block (≥1 min) still logs
    stop: () => {
      const s = get()
      if (s.phase === 'work' && s.phaseElapsed >= 60) {
        void logFocus(Math.round(s.phaseElapsed / 60), s.taskLink)
      }
      set({
        running: false,
        dialogOpen: false,
        phase: 'work',
        secondsLeft: s.workMin * 60,
        completed: 0,
        phaseElapsed: 0,
        focusSeconds: 0,
        taskLink: null,
      })
    },

    setWorkMin: (m) => {
      const s = get()
      // only while idle at the start of a work phase — never mid-countdown
      if (!s.running && s.phase === 'work' && s.phaseElapsed === 0) {
        set({ workMin: m, secondsLeft: m * 60 })
      }
    },

    tick: () => {
      const s = get()
      if (!s.running) return
      if (s.secondsLeft <= 1) {
        if (s.phase === 'work') {
          // work block finished — log the full configured length
          void logFocus(s.workMin, s.taskLink)
        }
        advance()
        return
      }
      set({ secondsLeft: s.secondsLeft - 1, phaseElapsed: s.phaseElapsed + 1, ...(s.phase === 'work' ? { focusSeconds: s.focusSeconds + 1 } : {}) })
    },
  }
})

async function logFocus(minutes: number, link: PomodoroTaskLink | null) {
  if (minutes <= 0) return
  try {
    await fetch('/api/focus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        minutes,
        taskId: link?.id ?? null,
        goalId: link?.goalId ?? null,
        startedAt: new Date(Date.now() - minutes * 60_000).toISOString(),
      }),
    })
  } catch {
    // offline / logged-out — the pomodoro itself keeps running; the session
    // simply isn't recorded. No toast from the engine: UI layers decide.
  }
}

// ── completion chime + notification (best-effort, never throws) ──────
let audioCtx: AudioContext | null = null
function chime() {
  try {
    audioCtx = audioCtx ?? new AudioContext()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    const t0 = audioCtx.currentTime
    for (const [offset, freq] of [[0, 880], [0.18, 1174.7]] as const) {
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.0001, t0 + offset)
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.4)
      osc.connect(gain).connect(audioCtx.destination)
      osc.start(t0 + offset)
      osc.stop(t0 + offset + 0.45)
    }
  } catch {
    // autoplay policies / unsupported — silence is fine
  }
}

function notify(title: string) {
  chime()
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Pomodoro', { body: title })
    }
  } catch {
    // ignore
  }
}

// ── display helpers ──────────────────────────────────────────────────
export function mmss(seconds: number): string {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0')
  const s = String(seconds % 60).padStart(2, '0')
  return `${m}:${s}`
}

export const POMODORO_PHASE_META: Record<PomodoroPhase, { label: string; dot: string }> = {
  work: { label: 'Focus', dot: 'bg-primary' },
  short: { label: 'Short break', dot: 'bg-success' },
  long: { label: 'Long break', dot: 'bg-success' },
}
