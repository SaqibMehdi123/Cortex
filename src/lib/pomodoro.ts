'use client'

// ─── Pomodoro engine (global, persisted, timestamp-based) ───────────
//
// Architecture modelled on TickTick's Pomo timer:
//   • Countdown is anchored to a wall-clock deadline (`endAt`), NOT to a
//     1-second decrement — so the timer stays accurate when the tab is
//     throttled or the user reloads the page. State survives refresh via
//     zustand persist (localStorage).
//   • A single 1s interval only RE-DERIVES the display from `endAt`; it is
//     never the source of truth.
//   • Configurable durations: focus, short break, long break, rounds before
//     the long break, and auto-start of the next break / next focus block.
//     Custom values are first-class (plus quick presets 15/25/50).
//   • Completed work blocks are logged to POST /api/focus (rolls into the
//     linked task's focusMinutes and Analytics). Skipped blocks advance the
//     cycle WITHOUT logging; ending a work block ≥1min early logs the
//     partial time.
//   • Starting focus on a task while a session is already running switches
//     the linked task and keeps the running timer (TickTick parity).

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type PomodoroPhase = 'work' | 'short' | 'long'

export type PomodoroTaskLink = { id: string; title: string; goalId?: string | null }

export const WORK_PRESETS = [15, 25, 50] as const

export type PomodoroSettings = {
  /** focus block length in minutes */
  workMin: number
  /** short break length in minutes */
  shortMin: number
  /** long break length in minutes */
  longMin: number
  /** completed focus blocks before a long break */
  roundsBeforeLong: number
  /** automatically run the break after a focus block ends */
  autoStartBreaks: boolean
  /** automatically run the next focus block after a break ends */
  autoStartWork: boolean
}

const DEFAULT_SETTINGS: PomodoroSettings = {
  workMin: 25,
  shortMin: 5,
  longMin: 15,
  roundsBeforeLong: 4,
  autoStartBreaks: true,
  autoStartWork: true,
}

const clampMin = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v || 0)))

export function sanitizeSettings(raw: Partial<PomodoroSettings> | undefined | null): PomodoroSettings {
  const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}) }
  return {
    workMin: clampMin(s.workMin, 1, 180),
    shortMin: clampMin(s.shortMin, 1, 60),
    longMin: clampMin(s.longMin, 1, 90),
    roundsBeforeLong: clampMin(s.roundsBeforeLong, 2, 8),
    autoStartBreaks: Boolean(s.autoStartBreaks),
    autoStartWork: Boolean(s.autoStartWork),
  }
}

type PomodoroState = {
  phase: PomodoroPhase
  /** display countdown, seconds — re-derived from endAt, never accumulated */
  secondsLeft: number
  running: boolean
  /** wall-clock deadline (epoch ms) of the current phase; null when paused */
  endAt: number | null
  /** seconds left in the current phase while paused */
  pausedRemaining: number
  dialogOpen: boolean
  /** completed work blocks since Start (drives long-break cadence + dots) */
  completed: number
  /** seconds elapsed in the CURRENT phase (partial logging on End) */
  phaseElapsed: number
  /** minutes of focus accumulated since Start (work phases only) */
  focusSeconds: number
  taskLink: PomodoroTaskLink | null
  settings: PomodoroSettings
  /** endAt of the last work boundary already logged — cross-tab/cross-tick dedup */
  handledEndAt: number | null
  // actions
  open: () => void
  close: () => void
  start: (link?: PomodoroTaskLink | null, now?: number) => void
  pause: (now?: number) => void
  resume: (now?: number) => void
  toggle: () => void
  skip: () => void
  stop: () => void
  /** legacy alias for updateSettings({ workMin }) — pre-settings callers */
  setWorkMin: (m: number) => void
  updateSettings: (patch: Partial<PomodoroSettings>) => void
  /** re-derive display state from the wall clock; `now` injectable for tests */
  tick: (now?: number) => void
}

function phaseSeconds(phase: PomodoroPhase, s: PomodoroSettings): number {
  if (phase === 'work') return s.workMin * 60
  if (phase === 'short') return s.shortMin * 60
  return s.longMin * 60
}

export const phaseLabel = (p: PomodoroPhase) => (p === 'work' ? 'Focus' : p === 'short' ? 'Short break' : 'Long break')

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

export const usePomodoro = create<PomodoroState>()(
  persist(
    (set, get) => {
      const settings = () => get().settings

      // a work block (or break) ran to its endAt. Log the work block once
      // (deduped by its endAt) and move to the next phase. When the next
      // phase would ALREADY be over at `now` (long absence), park at its
      // start instead of silently auto-running/logging time nobody worked.
      const completeBoundary = (now: number) => {
        const s = get()
        const boundary = s.endAt
        if (boundary === null) return
        const shouldLog = s.phase === 'work' && s.handledEndAt !== boundary
        if (shouldLog) void logFocus(settings().workMin, s.taskLink)

        if (s.phase === 'work') {
          const nextCompleted = s.completed + 1
          const cfg = settings()
          const nextPhase: PomodoroPhase = nextCompleted % cfg.roundsBeforeLong === 0 ? 'long' : 'short'
          const nextLen = phaseSeconds(nextPhase, cfg)
          const autoRun = cfg.autoStartBreaks && now < boundary + nextLen * 1000
          set({
            completed: nextCompleted,
            phase: nextPhase,
            handledEndAt: boundary,
            phaseElapsed: 0,
            // deltas already counted the partial phase — replace it with the
            // full block so focusSeconds ends up at exactly N × workMin
            focusSeconds: s.focusSeconds - s.phaseElapsed + cfg.workMin * 60,
            secondsLeft: nextLen,
            pausedRemaining: nextLen,
            running: autoRun,
            endAt: autoRun ? now + nextLen * 1000 : null,
          })
          notify(`${phaseLabel(nextPhase)} — ${Math.round(nextLen / 60)} min`)
        } else {
          const cfg = settings()
          const nextLen = phaseSeconds('work', cfg)
          const autoRun = cfg.autoStartWork && now < boundary + nextLen * 1000
          set({
            phase: 'work',
            handledEndAt: boundary,
            phaseElapsed: 0,
            focusSeconds: s.focusSeconds, // breaks don't add focus time
            secondsLeft: nextLen,
            pausedRemaining: nextLen,
            running: autoRun,
            endAt: autoRun ? now + nextLen * 1000 : null,
          })
          notify('Back to focus')
        }
      }

      // move to the next phase WITHOUT logging (user skipped it).
      // Next phase follows the auto-start settings.
      const advanceWithoutLog = () => {
        const s = get()
        const cfg = settings()
        const now = Date.now()
        if (s.phase === 'work') {
          const nextCompleted = s.completed + 1
          const nextPhase: PomodoroPhase = nextCompleted % cfg.roundsBeforeLong === 0 ? 'long' : 'short'
          const nextLen = phaseSeconds(nextPhase, cfg)
          const autoRun = cfg.autoStartBreaks
          set({
            completed: nextCompleted,
            phase: nextPhase,
            phaseElapsed: 0,
            secondsLeft: nextLen,
            pausedRemaining: nextLen,
            running: autoRun,
            endAt: autoRun ? now + nextLen * 1000 : null,
          })
        } else {
          const nextLen = phaseSeconds('work', cfg)
          const autoRun = cfg.autoStartWork
          set({
            phase: 'work',
            phaseElapsed: 0,
            secondsLeft: nextLen,
            pausedRemaining: nextLen,
            running: autoRun,
            endAt: autoRun ? now + nextLen * 1000 : null,
          })
        }
      }

      return {
        phase: 'work',
        secondsLeft: DEFAULT_SETTINGS.workMin * 60,
        running: false,
        endAt: null,
        pausedRemaining: DEFAULT_SETTINGS.workMin * 60,
        dialogOpen: false,
        completed: 0,
        phaseElapsed: 0,
        focusSeconds: 0,
        taskLink: null,
        settings: DEFAULT_SETTINGS,
        handledEndAt: null,

        open: () => set({ dialogOpen: true }),
        close: () => set({ dialogOpen: false }),

        start: (link, now) => {
          const s = get()
          const midSession = s.running || s.endAt !== null || s.phaseElapsed > 0 || s.completed > 0
          if (midSession) {
            // session in progress — only switch the linked task (TickTick parity)
            set(link ? { taskLink: link, dialogOpen: true } : { dialogOpen: true })
            return
          }
          if (link) set({ taskLink: link })
          const len = phaseSeconds('work', settings())
          set({
            phase: 'work',
            secondsLeft: len,
            pausedRemaining: len,
            running: true,
            endAt: (now ?? Date.now()) + len * 1000,
            dialogOpen: true,
            completed: 0,
            phaseElapsed: 0,
            focusSeconds: 0,
            handledEndAt: null,
          })
        },

        pause: (now) => {
          const s = get()
          if (!s.running || s.endAt === null) return
          const t = now ?? Date.now()
          const remaining = Math.max(0, Math.ceil((s.endAt - t) / 1000))
          set({ running: false, endAt: null, pausedRemaining: remaining, secondsLeft: remaining })
        },

        resume: (now) => {
          const s = get()
          if (s.running || s.endAt !== null) return
          const t = now ?? Date.now()
          const len = phaseSeconds(s.phase, settings())
          const remaining = s.pausedRemaining > 0 ? s.pausedRemaining : len
          set({ running: true, endAt: t + remaining * 1000, pausedRemaining: 0 })
        },

        toggle: () => {
          const s = get()
          if (s.running) get().pause()
          else get().resume()
        },

        skip: advanceWithoutLog,

        // End = stop everything; a partially-elapsed work block (≥1 min) logs
        stop: () => {
          const s = get()
          if (s.phase === 'work' && s.phaseElapsed >= 60) {
            void logFocus(Math.round(s.phaseElapsed / 60), s.taskLink)
          }
          const len = phaseSeconds('work', settings())
          set({
            running: false,
            endAt: null,
            dialogOpen: false,
            phase: 'work',
            secondsLeft: len,
            pausedRemaining: len,
            completed: 0,
            phaseElapsed: 0,
            focusSeconds: 0,
            taskLink: null,
            handledEndAt: null,
          })
        },

        setWorkMin: (m) => get().updateSettings({ workMin: m }),

        updateSettings: (patch) => {
          const s = get()
          const next = sanitizeSettings({ ...s.settings, ...patch })
          // only while idle at the start of a work phase — never mid-countdown
          const idle = s.phase === 'work' && s.phaseElapsed === 0 && s.completed === 0 && !s.running && s.endAt === null
          if (idle) {
            set({ settings: next, secondsLeft: next.workMin * 60, pausedRemaining: next.workMin * 60 })
          } else {
            // applies to the NEXT phases — the running countdown is anchored
            // to its endAt and is never modified
            set({ settings: next })
          }
        },

        tick: (now) => {
          const t = now ?? Date.now()
          const s = get()
          if (s.running && s.endAt !== null) {
            if (t >= s.endAt) {
              // the phase ended (tab throttled/closed) — complete exactly ONE
              // boundary; if the next phase would already be over too,
              // completeBoundary parks it instead of chaining logs
              completeBoundary(t)
              return
            }
            const newLeft = Math.max(0, Math.ceil((s.endAt - t) / 1000))
            const delta = Math.max(0, s.secondsLeft - newLeft)
            set({
              secondsLeft: newLeft,
              phaseElapsed: Math.max(0, s.phaseElapsed + delta),
              ...(s.phase === 'work' && delta > 0 ? { focusSeconds: s.focusSeconds + delta } : {}),
            })
          } else if (s.secondsLeft !== s.pausedRemaining) {
            // paused — keep the display in sync with the parked remainder
            set({ secondsLeft: s.pausedRemaining })
          }
        },
      }
    },
    {
      name: 'cortex-pomodoro',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // dialogOpen is per-mount UI state; everything else survives reload
      partialize: (s) => {
        const { dialogOpen, ...rest } = s
        void dialogOpen
        return rest
      },
      migrate: (persisted: unknown, version: number) => {
        const old = (persisted ?? {}) as Partial<PomodoroState> & { workMin?: number }
        const settings = sanitizeSettings(version < 1 ? { workMin: old.workMin } : old.settings)
        const len = phaseSeconds('work', settings)
        // old v0 sessions counted seconds in-memory only — they can't survive,
        // so any carried-over running state is parked at the start of work
        return {
          ...old,
          settings,
          phase: 'work',
          running: false,
          endAt: null,
          secondsLeft: len,
          pausedRemaining: len,
          phaseElapsed: 0,
          handledEndAt: null,
        } as PomodoroState
      },
      onRehydrateStorage: () => (state) => {
        // a running timer restored from storage may have finished while the
        // page was closed — catch it up on the first frame
        if (state?.running && state.endAt) {
          queueMicrotask(() => usePomodoro.getState().tick())
        }
      },
    }
  )
)

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
