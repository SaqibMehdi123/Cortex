'use client'

// ─── Pomodoro host: ticker + dialog + floating pill ─────────────────
//
// Mounted once in app/page.tsx. Owns the single 1-second interval that
// RE-DERIVES the display from the engine's wall-clock deadline (the interval
// is never the source of truth — the timer survives reloads and throttled
// tabs). Renders:
//   • a session-setup popup — clicking a task's pomodoro lands HERE first:
//     pick the session length (presets or custom) and press Start; nothing
//     is hardcoded and nothing auto-starts
//   • the full pomodoro dialog (ring, round dots, durations panel). Break
//     options appear ONLY at the moment a pomodoro finishes (short / long
//     choice) — they are never standing UI
//   • a floating pill with inline play/pause so the countdown stays visible
//     on every section
//   • an optional Document Picture-in-Picture mini timer — a tiny ALWAYS-ON-
//     TOP window that keeps the countdown visible while the student works in
//     OTHER apps/sites (no more tab-hopping back to Cortex to check the
//     clock). Chrome/Edge/Opera only; the button hides elsewhere (the live
//     tab-title countdown remains the universal fallback).

import { FaPause, FaPlay, FaStopwatch, FaForwardStep, FaXmark, FaBell, FaGear, FaWindowRestore, FaXmark as FaClose } from 'react-icons/fa6'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useUI } from '@/lib/nav-config'
import { usePomodoro, mmss, WORK_PRESETS, phaseLabel } from '@/lib/pomodoro'
import type { PomodoroTaskLink } from '@/lib/pomodoro'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

// ─── Document Picture-in-Picture plumbing ────────────────────────────
// The API is not in TypeScript's lib.dom yet — declare the surface we use.
interface DocumentPictureInPicture {
  window: Window | null
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>
}
declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture
  }
}

export function pomodoroPiPSupported(): boolean {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window
}

// The PiP portal lives inside <FocusTimer /> (mounted once in app/page.tsx),
// but the floating pill lives in the app-shell action stack. This module-
// level handoff lets the pill's pop-out button trigger FocusTimer's opener
// without threading state through two trees.
let pipRequestHandler: (() => void) | null = null
export function requestPomodoroPiP() {
  pipRequestHandler?.()
}

// Clone the app's stylesheets into the PiP document — Tailwind classes and
// theme variables then work inside the portal exactly as on the main page.
function copyStylesTo(w: Window) {
  for (const sheet of [...document.styleSheets]) {
    try {
      const css = [...sheet.cssRules].map((r) => r.cssText).join('\n')
      const style = w.document.createElement('style')
      style.textContent = css
      w.document.head.appendChild(style)
    } catch {
      // cross-origin sheet without CORS — clone the <link> instead
      if (sheet.href) {
        const link = w.document.createElement('link')
        link.rel = 'stylesheet'
        link.href = sheet.href
        w.document.head.appendChild(link)
      }
    }
  }
  // carry the theme (dark/light class on <html>) so tokens resolve
  w.document.documentElement.className = document.documentElement.className
}

export function FocusTimer() {
  const { toast } = useToast()
  // two-step End guard: armed by clicking End mid-phase, auto-disarms
  const [endArmed, setEndArmed] = useState(false)

  // ── Document PiP mini-timer state ──
  const [pipWin, setPipWin] = useState<Window | null>(null)
  const [pipSupported] = useState(pomodoroPiPSupported)
  const openPiP = useCallback(async () => {
    const dpip = window.documentPictureInPicture
    if (!dpip) return
    try {
      // reuse the existing window if one is already floating
      if (dpip.window && !dpip.window.closed) {
        dpip.window.focus()
        return
      }
      const w = await dpip.requestWindow({ width: 264, height: 168 })
      copyStylesTo(w)
      w.document.title = 'Cortex — Focus timer'
      w.document.body.style.margin = '0'
      w.document.body.className = 'bg-background text-foreground'
      w.addEventListener('pagehide', () => setPipWin(null))
      setPipWin(w)
      // the dialog hands the timer off to the floating window
      usePomodoro.getState().close()
    } catch {
      // request can be rejected (gesture/permission) — silently stay in-app
    }
  }, [])
  useEffect(() => {
    pipRequestHandler = () => void openPiP()
    return () => {
      pipRequestHandler = null
    }
  }, [openPiP])

  const phase = usePomodoro((s) => s.phase)
  const secondsLeft = usePomodoro((s) => s.secondsLeft)
  const running = usePomodoro((s) => s.running)
  const dialogOpen = usePomodoro((s) => s.dialogOpen)
  const completed = usePomodoro((s) => s.completed)
  const phaseElapsed = usePomodoro((s) => s.phaseElapsed)
  const taskLink = usePomodoro((s) => s.taskLink)
  const settings = usePomodoro((s) => s.settings)
  const focusSeconds = usePomodoro((s) => s.focusSeconds)
  const breakChoicePending = usePomodoro((s) => s.breakChoicePending)

  // session-setup popup: which task (may be none) + requested minutes
  const [armed, setArmed] = useState<{ link: PomodoroTaskLink | null } | null>(null)
  const [armedMin, setArmedMin] = useState<number>(25)

  // single 1-second driver — re-derives the display from the engine's endAt
  useEffect(() => {
    const t = setInterval(() => usePomodoro.getState().tick(), 1000)
    // immediate catch-up when the tab becomes visible again (interval was throttled)
    const onVisible = () => { if (document.visibilityState === 'visible') usePomodoro.getState().tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  // legacy channel: dashboard / task rows request focus on a task.
  // Subscribed (not polled in an effect body): a request OPENS the session
  // setup popup — the pomodoro never starts until the user picks the length
  // and presses Start.
  useEffect(() => {
    return useUI.subscribe((state, prev) => {
      const req = state.focusTask
      if (req && req !== prev.focusTask) {
        setArmed({ link: req })
        setArmedMin(usePomodoro.getState().settings.workMin)
        useUI.setState({ focusTask: null })
      }
    })
  }, [])

  // in-app feedback on phase transitions
  const prev = useRef({ completed, phase })
  useEffect(() => {
    const p = prev.current
    if (completed > p.completed) toast({ title: `Pomodoro ${completed} done — take a break`, description: taskLink ? `Logged against “${taskLink.title}”.` : 'Session logged.' })
    else if (p.phase !== 'work' && phase === 'work' && running) toast({ title: 'Break over — back to focus' })
    prev.current = { completed, phase }
  }, [completed, phase, running, taskLink, toast])

  // live countdown in the tab title while running
  const baseTitle = useRef<string | null>(null)
  useEffect(() => {
    if (baseTitle.current === null) baseTitle.current = document.title
    if (!running) {
      document.title = baseTitle.current
      return
    }
    document.title = `${mmss(secondsLeft)} · ${phase === 'work' ? 'Focus' : 'Break'}`
  }, [running, secondsLeft, phase])

  const isWork = phase === 'work'
  const total = isWork ? settings.workMin * 60 : (phase === 'short' ? settings.shortMin : settings.longMin) * 60
  const idle = !running && phaseElapsed === 0 && completed === 0 && !breakChoicePending
  const pct = total > 0 ? Math.min(1, 1 - secondsLeft / total) : 0
  const R = 78
  const C = 2 * Math.PI * R
  const doneInCycle = completed === 0 ? 0 : ((completed - 1) % settings.roundsBeforeLong) + 1
  const focusMinThisRun = Math.floor(focusSeconds / 60)
  // after every Nth pomodoro the long break is the suggested choice
  const longDue = completed > 0 && completed % settings.roundsBeforeLong === 0

  function launchArmed() {
    usePomodoro.getState().startWithDuration(armed?.link ?? null, armedMin)
    setArmed(null)
  }

  return (
    <>
      {/* ── main pomodoro dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) usePomodoro.getState().close() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            {/* pr-8 reserves the ✕ zone — the absolute close button sits at
                top-4 right-4, and a long task title used to run under it. */}
            <DialogTitle className="flex items-center gap-2 pr-8">
              <FaStopwatch className="h-4 w-4 text-primary" /> Pomodoro
              {taskLink && (
                <span className="ml-1 min-w-0 flex-1 truncate text-xs font-normal text-muted-foreground" title={taskLink.title}>
                  · {taskLink.title}
                </span>
              )}
              {completed > 0 && (
                <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary" title="Completed focus blocks this session">
                  🍅 × {completed}
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {taskLink ? `Pomodoro timer focused on ${taskLink.title}` : 'Pomodoro focus timer'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-1">
            {/* break choice — appears ONLY the moment a pomodoro finishes */}
            {breakChoicePending ? (
              <div className="w-full space-y-2.5 rounded-xl border bg-muted/30 p-3.5">
                <p className="text-center text-sm font-medium">
                  Pomodoro {completed} done — take a break?
                </p>
                <p className="text-center text-[11px] text-muted-foreground">
                  {longDue ? `That's ${settings.roundsBeforeLong} in a row — the long break is due.` : `Long break comes after ${settings.roundsBeforeLong} pomodoros.`}
                </p>
                <div className="flex justify-center gap-2">
                  <Button
                    variant={longDue ? 'outline' : 'default'}
                    onClick={() => usePomodoro.getState().startBreak('short')}
                    className="flex-1"
                  >
                    Short break · {settings.shortMin}m
                  </Button>
                  <Button
                    variant={longDue ? 'default' : 'outline'}
                    onClick={() => usePomodoro.getState().startBreak('long')}
                    className="flex-1"
                  >
                    Long break · {settings.longMin}m
                  </Button>
                </div>
                <div className="flex justify-center">
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => usePomodoro.getState().skip()}>
                    Skip break — next pomodoro
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="relative h-[176px] w-[176px]">
                  <svg width={176} height={176} className="-rotate-90" aria-hidden>
                    <circle cx={88} cy={88} r={R} fill="none" stroke="var(--muted)" strokeWidth={10} />
                    <circle
                      cx={88}
                      cy={88}
                      r={R}
                      fill="none"
                      stroke={isWork ? 'var(--primary)' : 'var(--success)'}
                      strokeWidth={10}
                      strokeLinecap="round"
                      strokeDasharray={C}
                      strokeDashoffset={C - pct * C}
                      style={{ transition: 'stroke-dashoffset 0.9s linear' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                    <span className="text-[2.6rem] font-bold leading-none tabular-nums tracking-tight">{mmss(secondsLeft)}</span>
                    <span className={cn('text-[10px] font-semibold uppercase tracking-[0.18em]', isWork ? 'text-primary' : 'text-success')}>
                      {isWork ? (running ? 'focusing' : phaseElapsed > 0 ? 'paused' : 'ready') : phaseLabel(phase).toLowerCase()}
                    </span>
                    {!isWork && completed > 0 && (
                      <span className="text-[10px] text-muted-foreground">{focusMinThisRun} min focused so far</span>
                    )}
                  </div>
                </div>

                {/* round dots — one group per long-break cycle */}
                <div className="flex items-center gap-1.5" aria-label={`${doneInCycle} of ${settings.roundsBeforeLong} work blocks in this cycle`}>
                  {Array.from({ length: settings.roundsBeforeLong }).map((_, i) => (
                    <span
                      key={i}
                      className={cn(
                        'h-2 w-2 rounded-full transition-colors',
                        i < doneInCycle ? 'bg-primary' : !isWork && i === doneInCycle ? 'bg-success animate-pulse' : 'bg-muted-foreground/25'
                      )}
                    />
                  ))}
                </div>

                <div className="flex gap-2">
                  {idle ? (
                    <Button onClick={() => { setArmedMin(settings.workMin); setArmed({ link: taskLink }) }} className="min-w-[112px]">
                      <FaPlay className="mr-1.5 h-4 w-4" /> Start focus
                    </Button>
                  ) : (
                    <Button onClick={() => usePomodoro.getState().toggle()} className="min-w-[112px]">
                      {running ? <><FaPause className="mr-1.5 h-4 w-4" /> Pause</> : <><FaPlay className="mr-1.5 h-4 w-4" /> Resume</>}
                    </Button>
                  )}
                  {!idle && (
                    <Button variant="outline" onClick={() => usePomodoro.getState().skip()} aria-label="Skip to next phase" title="Skip (not logged)">
                      <FaForwardStep className="h-4 w-4" />
                    </Button>
                  )}
                  {pipSupported && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => void openPiP()}
                      aria-label="Pop out the timer"
                      title="Pop out — the timer stays on top while you work in other apps or sites"
                    >
                      <FaWindowRestore className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => {
                      // mid-phase End discards the running pomodoro — warn once
                      if (running && secondsLeft > 30 && !endArmed) {
                        setEndArmed(true)
                        setTimeout(() => setEndArmed(false), 4000)
                        return
                      }
                      setEndArmed(false)
                      usePomodoro.getState().stop()
                    }}
                    className={cn(endArmed && 'border-danger/50 bg-danger/10 text-danger')}
                    aria-label={endArmed ? 'Click again to end and discard this session' : 'End session'}
                    title={endArmed ? 'Click again — this phase’s progress will be discarded' : 'End session'}
                  >
                    <FaXmark className="h-4 w-4" /> {endArmed ? 'Sure?' : 'End'}
                  </Button>
                  {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={async () => { try { await Notification.requestPermission() } catch { /* ignore */ } }}
                      aria-label="Enable notifications"
                      title="Enable notifications"
                    >
                      <FaBell className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </>
            )}

            <DurationsPanel idle={idle} />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── session setup popup: ask the time, then Start. Rendered AFTER
          the main dialog so it stacks on top when opened from it ── */}
      <Dialog open={!!armed} onOpenChange={(v) => { if (!v) setArmed(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FaStopwatch className="h-4 w-4 text-primary" /> New focus session
            </DialogTitle>
            <DialogDescription>
              {armed?.link ? <>How long do you want to focus on <span className="font-medium text-foreground">{armed.link.title}</span>?</> : 'How long should this focus session run?'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Session length presets">
              {[...WORK_PRESETS, settings.workMin].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setArmedMin(m)}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                    armedMin === m ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
                  )}
                  aria-pressed={armedMin === m}
                >
                  {m} min{m === settings.workMin && <span className="ml-1 text-[10px] opacity-70">default</span>}
                </button>
              ))}
            </div>
            <div>
              <Label htmlFor="pomo-custom-min" className="text-xs text-muted-foreground">Custom length (minutes)</Label>
              <Input
                id="pomo-custom-min"
                type="number"
                inputMode="numeric"
                min={1}
                max={180}
                value={armedMin}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value || '0', 10)
                  if (!Number.isNaN(n)) setArmedMin(Math.min(180, Math.max(1, n)))
                }}
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setArmed(null)}>Cancel</Button>
            <Button onClick={launchArmed}>
              <FaPlay className="mr-1.5 h-4 w-4" /> Start focus
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* floating pill moved into the app-shell action stacks (see
          <PomodoroPill /> below) so it can never sit on top of the
          quick-capture “+” — it is the top item of the same column */}

      {/* ── Document PiP mini timer — renders into the always-on-top
          window while it is open; the store's 1s tick drives it like the
          dialog. Closing the Cortex tab closes the PiP window with it. ── */}
      {pipWin && createPortal(<PipMiniTimer />, pipWin.document.body)}
    </>
  )
}

// ── PiP mini timer: the pomodoro as an always-on-top companion ──────
// Rendered via createPortal into the Document-PiP window's body. Shares the
// same zustand store as the dialog/pill, so play/pause/end act on the ONE
// real timer and the store's 1-second tick drives this view like any other.
function PipMiniTimer() {
  const secondsLeft = usePomodoro((s) => s.secondsLeft)
  const running = usePomodoro((s) => s.running)
  const phase = usePomodoro((s) => s.phase)
  const completed = usePomodoro((s) => s.completed)
  const taskLink = usePomodoro((s) => s.taskLink)
  const settings = usePomodoro((s) => s.settings)
  const breakChoicePending = usePomodoro((s) => s.breakChoicePending)

  // safety net for background-tab timer throttling: tick() re-derives from
  // the wall-clock deadline, so an extra 1s call here is idempotent and
  // keeps the floating window's countdown exact even if the main page's
  // interval is slowed down
  useEffect(() => {
    const t = setInterval(() => usePomodoro.getState().tick(), 1000)
    return () => clearInterval(t)
  }, [])

  const isWork = phase === 'work'
  const total = isWork ? settings.workMin * 60 : (phase === 'short' ? settings.shortMin : settings.longMin) * 60
  const pct = total > 0 ? Math.min(1, 1 - secondsLeft / total) : 0

  return (
    <div className="flex h-screen select-none flex-col bg-background text-foreground">
      {/* phase progress hairline across the top of the window */}
      <div className="h-1 w-full shrink-0 bg-muted">
        <div
          className={cn('h-full transition-[width] duration-1000 ease-linear', isWork ? 'bg-primary' : 'bg-success')}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 p-3">
        <div className="flex w-full items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          <span className={cn(isWork ? 'text-primary' : 'text-success')}>
            {breakChoicePending ? 'Break?' : phaseLabel(phase)}
          </span>
          {completed > 0 && <span className="tabular-nums normal-case tracking-normal">🍅 × {completed}</span>}
        </div>
        <span className="text-[2.75rem] font-bold leading-none tabular-nums tracking-tight">{mmss(secondsLeft)}</span>
        {taskLink && <span className="max-w-full truncate text-[10px] text-muted-foreground" title={taskLink.title}>{taskLink.title}</span>}

        {breakChoicePending ? (
          <div className="mt-1 flex w-full gap-1.5">
            <button
              onClick={() => usePomodoro.getState().startBreak('short')}
              className="flex-1 rounded-lg bg-success/15 px-2 py-1.5 text-xs font-semibold text-success transition-colors hover:bg-success/25"
            >
              Short {settings.shortMin}m
            </button>
            <button
              onClick={() => usePomodoro.getState().startBreak('long')}
              className="flex-1 rounded-lg bg-success/15 px-2 py-1.5 text-xs font-semibold text-success transition-colors hover:bg-success/25"
            >
              Long {settings.longMin}m
            </button>
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-2">
            <button
              onClick={() => usePomodoro.getState().toggle()}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full text-primary-foreground shadow-sm transition-transform active:scale-95',
                isWork ? 'bg-primary' : 'bg-success',
              )}
              aria-label={running ? 'Pause' : 'Resume'}
            >
              {running ? <FaPause className="h-3.5 w-3.5" /> : <FaPlay className="ml-0.5 h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => usePomodoro.getState().stop()}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
              aria-label="End pomodoro"
            >
              <FaClose className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── floating pill: the minimized pomodoro ────────────────────────────
// Rendered as the FIRST item of the app-shell floating action stacks
// (mobile + desktop), i.e. directly above the AI toggle and the
// quick-capture “+”. Belonging to the same anchored column means it can
// never overlap the “+” and it shifts left automatically when the
// Copilot dock opens.
export function PomodoroPill() {
  const secondsLeft = usePomodoro((s) => s.secondsLeft)
  const running = usePomodoro((s) => s.running)
  const dialogOpen = usePomodoro((s) => s.dialogOpen)
  const completed = usePomodoro((s) => s.completed)
  const phaseElapsed = usePomodoro((s) => s.phaseElapsed)
  const phase = usePomodoro((s) => s.phase)
  const breakChoicePending = usePomodoro((s) => s.breakChoicePending)

  const isWork = phase === 'work'
  const pillVisible = (running || phaseElapsed > 0 || completed > 0) && !dialogOpen
  const [pipSupported] = useState(pomodoroPiPSupported)
  if (!pillVisible) return null

  return (
    <div className="flex items-center gap-1 rounded-full border bg-card/95 py-2 pl-3 pr-1.5 shadow-soft backdrop-blur">
          <button
            onClick={() => usePomodoro.getState().open()}
            className="flex items-center gap-2"
            aria-label={`Pomodoro ${mmss(secondsLeft)} — open timer`}
          >
            <span className={cn('h-2 w-2 shrink-0 rounded-full', isWork ? 'bg-primary' : 'bg-success', !running && 'animate-pulse')} />
            <span className="text-sm font-semibold tabular-nums">{mmss(secondsLeft)}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {breakChoicePending ? 'break?' : isWork ? 'focus' : 'break'}
            </span>
          </button>
          <button
            onClick={() => (breakChoicePending ? usePomodoro.getState().open() : usePomodoro.getState().toggle())}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={breakChoicePending ? 'Choose a break' : running ? 'Pause pomodoro' : 'Resume pomodoro'}
          >
            {running && !breakChoicePending ? <FaPause className="h-3 w-3" /> : <FaPlay className="h-3 w-3" />}
          </button>
          {pipSupported && (
            <button
              onClick={() => requestPomodoroPiP()}
              className="hidden h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
              aria-label="Pop out the timer"
              title="Pop out — stays on top while you work elsewhere"
            >
              <FaWindowRestore className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={() => usePomodoro.getState().stop()}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
            aria-label="End pomodoro"
          >
            <FaClose className="h-3.5 w-3.5" />
          </button>
    </div>
  )
}

// ── durations panel: presets + fully custom lengths + auto-start ────
function DurationsPanel({ idle }: { idle: boolean }) {
  const [open, setOpen] = useState(false)
  const settings = usePomodoro((s) => s.settings)

  return (
    <div className="w-full space-y-3 border-t pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-col items-start gap-1 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          <FaGear className="h-3.5 w-3.5" /> Durations &amp; rules
        </span>
        <span className="whitespace-nowrap text-[10px]">{settings.workMin}m focus · {settings.shortMin}m / {settings.longMin}m breaks · long every {settings.roundsBeforeLong}</span>
      </button>

      {open && (
        <div className="space-y-3">
          {/* quick presets for the focus block */}
          <div className="flex items-center gap-1.5" role="group" aria-label="Focus block presets">
            {WORK_PRESETS.map((m) => (
              <button
                key={m}
                onClick={() => usePomodoro.getState().updateSettings({ workMin: m })}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  settings.workMin === m ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                )}
                aria-pressed={settings.workMin === m}
              >
                {m} min
              </button>
            ))}
          </div>

          {/* custom lengths */}
          <div className="grid grid-cols-2 gap-2">
            <DurationField label="Focus (min)" value={settings.workMin} onCommit={(v) => usePomodoro.getState().updateSettings({ workMin: v })} />
            <DurationField label="Short break (min)" value={settings.shortMin} onCommit={(v) => usePomodoro.getState().updateSettings({ shortMin: v })} />
            <DurationField label="Long break (min)" value={settings.longMin} onCommit={(v) => usePomodoro.getState().updateSettings({ longMin: v })} />
            <DurationField label="Long break every" value={settings.roundsBeforeLong} min={2} max={8} suffix="rounds" onCommit={(v) => usePomodoro.getState().updateSettings({ roundsBeforeLong: v })} />
          </div>
          {!idle && (
            <p className="text-[10px] text-muted-foreground">Changes apply from the next phase — the running countdown isn&apos;t disturbed.</p>
          )}

          {/* rules — breaks are always chosen when a pomodoro finishes;
              only the auto-start of the NEXT focus block is configurable */}
          <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="pomo-autostart-work" className="text-xs">Auto-start next focus</Label>
                <p className="text-[10px] text-muted-foreground">After a break ends, roll into the next pomodoro automatically.</p>
              </div>
              <Switch
                id="pomo-autostart-work"
                checked={settings.autoStartWork}
                onCheckedChange={(v) => usePomodoro.getState().updateSettings({ autoStartWork: v })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DurationField({ label, value, onCommit, min = 1, max = 180, suffix }: {
  label: string
  value: number
  onCommit: (v: number) => void
  min?: number
  max?: number
  suffix?: string
}) {
  const [raw, setRaw] = useState(String(value))
  // keep the field in sync when settings change elsewhere (presets) —
  // adjusting derived state during render (React's documented pattern)
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setRaw(String(value))
  }

  const commit = () => {
    const n = Number.parseInt(raw, 10)
    if (Number.isNaN(n)) return setRaw(String(value))
    onCommit(Math.min(max, Math.max(min, n)))
  }

  return (
    <div>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <div className="mt-1 flex items-center gap-1">
        <Input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="h-8 text-sm"
          aria-label={label}
        />
        {suffix && <span className="shrink-0 text-[10px] text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  )
}
