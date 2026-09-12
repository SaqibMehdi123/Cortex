'use client'

// ─── Pomodoro host: ticker + dialog + floating pill ─────────────────
//
// Mounted once in app/page.tsx. Owns the single 1-second interval that
// drives the pomodoro store, bridges the legacy `focusTask` channel
// (dashboard / plans task rows set it) into the engine, and renders:
//   • the full pomodoro dialog (ring, phases, round dots, presets)
//   • a floating pill so the countdown stays visible on every section

import { FaPause, FaPlay, FaStopwatch, FaForwardStep, FaXmark, FaBullseye } from 'react-icons/fa6'
import { useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useUI } from '@/lib/nav-config'
import { usePomodoro, mmss, WORK_PRESETS, ROUNDS_BEFORE_LONG, SHORT_BREAK_MIN, LONG_BREAK_MIN } from '@/lib/pomodoro'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

export function FocusTimer() {
  const { toast } = useToast()
  const focusTask = useUI((s) => s.focusTask)
  const setFocusTask = useUI((s) => s.setFocusTask)

  const phase = usePomodoro((s) => s.phase)
  const secondsLeft = usePomodoro((s) => s.secondsLeft)
  const running = usePomodoro((s) => s.running)
  const dialogOpen = usePomodoro((s) => s.dialogOpen)
  const completed = usePomodoro((s) => s.completed)
  const phaseElapsed = usePomodoro((s) => s.phaseElapsed)
  const taskLink = usePomodoro((s) => s.taskLink)
  const workMin = usePomodoro((s) => s.workMin)

  // single 1-second driver for the whole engine
  useEffect(() => {
    const t = setInterval(() => usePomodoro.getState().tick(), 1000)
    return () => clearInterval(t)
  }, [])

  // legacy channel: dashboard / task rows request focus on a task
  useEffect(() => {
    if (!focusTask) return
    usePomodoro.getState().start(focusTask)
    setFocusTask(null)
  }, [focusTask, setFocusTask])

  // in-app feedback on phase transitions
  const prev = useRef({ completed, phase })
  useEffect(() => {
    const p = prev.current
    if (completed > p.completed) toast({ title: `Pomodoro ${completed} done — ${completed % ROUNDS_BEFORE_LONG === 0 ? `long break (${LONG_BREAK_MIN}m)` : `${SHORT_BREAK_MIN}m break`}`, description: taskLink ? `Logged against “${taskLink.title}”.` : 'Session logged.' })
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
  const total = isWork ? workMin * 60 : (phase === 'short' ? SHORT_BREAK_MIN : LONG_BREAK_MIN) * 60
  const idle = !running && phaseElapsed === 0 && completed === 0
  const pillVisible = (running || phaseElapsed > 0 || completed > 0) && !dialogOpen
  const pct = total > 0 ? 1 - secondsLeft / total : 0
  const R = 54
  const C = 2 * Math.PI * R

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) usePomodoro.getState().close() }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FaStopwatch className="h-4 w-4 text-primary" /> Pomodoro
            </DialogTitle>
            <DialogDescription className="line-clamp-2">
              {taskLink ? taskLink.title : 'Focus session — no task linked'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-1">
            {/* phase dots — one group of 4 per long-break cycle */}
            <div className="flex items-center gap-1.5" aria-label={`${completed % ROUNDS_BEFORE_LONG || (completed ? ROUNDS_BEFORE_LONG : 0)} of ${ROUNDS_BEFORE_LONG} work blocks in this cycle`}>
              {Array.from({ length: ROUNDS_BEFORE_LONG }).map((_, i) => {
                const doneInCycle = completed === 0 ? 0 : ((completed - 1) % ROUNDS_BEFORE_LONG) + 1
                const active = !isWork && i === doneInCycle
                return (
                  <span
                    key={i}
                    className={cn(
                      'h-2 w-2 rounded-full transition-colors',
                      i < doneInCycle ? 'bg-primary' : active ? 'bg-success animate-pulse' : 'bg-muted-foreground/25'
                    )}
                  />
                )
              })}
            </div>

            <div className="relative h-32 w-32">
              <svg width={128} height={128} className="-rotate-90" aria-hidden>
                <circle cx={64} cy={64} r={R} fill="none" stroke="var(--muted)" strokeWidth={8} />
                <circle
                  cx={64}
                  cy={64}
                  r={R}
                  fill="none"
                  stroke={isWork ? 'var(--primary)' : 'var(--success)'}
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={C - pct * C}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold tabular-nums">{mmss(secondsLeft)}</span>
                <span className={cn('text-[10px] font-semibold uppercase tracking-widest', isWork ? 'text-primary' : 'text-success')}>
                  {isWork ? 'focus' : phase === 'short' ? 'short break' : 'long break'}
                </span>
              </div>
            </div>

            {/* work-length presets — only before the first block starts */}
            {idle && (
              <div className="flex items-center gap-1.5" role="group" aria-label="Work block length">
                {WORK_PRESETS.map((m) => (
                  <button
                    key={m}
                    onClick={() => usePomodoro.getState().setWorkMin(m)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      workMin === m ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                    )}
                    aria-pressed={workMin === m}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              {idle ? (
                <Button onClick={() => usePomodoro.getState().start()} className="min-w-[104px]">
                  <FaPlay className="mr-1.5 h-4 w-4" /> Start
                </Button>
              ) : (
                <Button onClick={() => usePomodoro.getState().toggle()} className="min-w-[104px]">
                  {running ? <><FaPause className="mr-1.5 h-4 w-4" /> Pause</> : <><FaPlay className="mr-1.5 h-4 w-4" /> Resume</>}
                </Button>
              )}
              {!idle && (
                <Button variant="outline" onClick={() => usePomodoro.getState().skip()} aria-label="Skip to next phase">
                  <FaForwardStep className="h-4 w-4" />
                </Button>
              )}
              <Button variant="outline" onClick={() => usePomodoro.getState().stop()}>
                <FaXmark className="mr-1.5 h-4 w-4" /> End
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {workMin}m focus → {SHORT_BREAK_MIN}m break, long break every {ROUNDS_BEFORE_LONG} rounds.
              {completed > 0 && <> {completed} block{completed > 1 ? 's' : ''} done{phaseElapsed > 0 && !isWork ? '' : ''}.</>}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* floating pill — countdown survives navigation & closed dialog */}
      {pillVisible && (
        <button
          onClick={() => usePomodoro.getState().open()}
          className="fixed bottom-16 right-3 z-40 flex items-center gap-2 rounded-full border bg-card/95 py-2 pl-3 pr-4 shadow-soft backdrop-blur transition-transform hover:scale-[1.03] sm:bottom-5 sm:right-5"
          aria-label={`Pomodoro ${mmss(secondsLeft)} — open timer`}
        >
          <span className={cn('h-2 w-2 shrink-0 rounded-full', isWork ? 'bg-primary' : 'bg-success', !running && 'animate-pulse')} />
          <span className="text-sm font-semibold tabular-nums">{mmss(secondsLeft)}</span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{isWork ? 'focus' : 'break'}</span>
          {taskLink && <FaBullseye className="h-3 w-3 text-muted-foreground" aria-label="linked to a task" />}
        </button>
      )}
    </>
  )
}
