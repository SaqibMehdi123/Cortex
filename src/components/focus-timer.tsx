'use client'

// ─── Pomodoro host: ticker + dialog + floating pill ─────────────────
//
// Mounted once in app/page.tsx. Owns the single 1-second interval that
// RE-DERIVES the display from the engine's wall-clock deadline (the interval
// is never the source of truth — the timer survives reloads and throttled
// tabs). Bridges the legacy `focusTask` channel (dashboard / plans task rows
// set it) into the engine, and renders:
//   • the full pomodoro dialog (ring, phases, round dots, durations panel)
//   • a floating pill with inline play/pause so the countdown stays visible
//     on every section

import { FaPause, FaPlay, FaStopwatch, FaForwardStep, FaXmark, FaBullseye, FaBell, FaGear, FaXmark as FaClose } from 'react-icons/fa6'
import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useUI } from '@/lib/nav-config'
import { usePomodoro, mmss, WORK_PRESETS, phaseLabel } from '@/lib/pomodoro'
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
  const settings = usePomodoro((s) => s.settings)
  const focusSeconds = usePomodoro((s) => s.focusSeconds)

  // single 1-second driver — re-derives the display from the engine's endAt
  useEffect(() => {
    const t = setInterval(() => usePomodoro.getState().tick(), 1000)
    // immediate catch-up when the tab becomes visible again (interval was throttled)
    const onVisible = () => { if (document.visibilityState === 'visible') usePomodoro.getState().tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
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
    const rounds = settings.roundsBeforeLong
    if (completed > p.completed) toast({ title: `Pomodoro ${completed} done — ${completed % rounds === 0 ? `long break (${settings.longMin}m)` : `${settings.shortMin}m break`}`, description: taskLink ? `Logged against “${taskLink.title}”.` : 'Session logged.' })
    else if (p.phase !== 'work' && phase === 'work' && running) toast({ title: 'Break over — back to focus' })
    prev.current = { completed, phase }
  }, [completed, phase, running, taskLink, toast, settings.roundsBeforeLong, settings.shortMin, settings.longMin])

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
  const idle = !running && phaseElapsed === 0 && completed === 0
  const pillVisible = (running || phaseElapsed > 0 || completed > 0) && !dialogOpen
  const pct = total > 0 ? Math.min(1, 1 - secondsLeft / total) : 0
  const R = 78
  const C = 2 * Math.PI * R
  const doneInCycle = completed === 0 ? 0 : ((completed - 1) % settings.roundsBeforeLong) + 1
  const focusMinThisRun = Math.floor(focusSeconds / 60)

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) usePomodoro.getState().close() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FaStopwatch className="h-4 w-4 text-primary" /> Pomodoro
              {completed > 0 && (
                <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary" title="Completed focus blocks this session">
                  🍅 × {completed}
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-1.5 line-clamp-2">
              <FaBullseye className={cn('h-3 w-3 shrink-0', taskLink ? 'text-primary' : 'text-muted-foreground')} />
              {taskLink ? taskLink.title : 'Focus session — no task linked'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-1">
            {/* phase tabs — read-only indicator of where you are */}
            <div className="grid w-full grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1" role="group" aria-label="Current phase">
              {(['work', 'short', 'long'] as const).map((p) => (
                <span
                  key={p}
                  className={cn(
                    'rounded-lg px-2 py-1.5 text-center text-xs font-medium transition-colors',
                    phase === p
                      ? p === 'work' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-success text-white shadow-sm'
                      : 'text-muted-foreground'
                  )}
                >
                  {p === 'work' ? `Focus ${settings.workMin}m` : p === 'short' ? `Short ${settings.shortMin}m` : `Long ${settings.longMin}m`}
                </span>
              ))}
            </div>

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
                <Button onClick={() => usePomodoro.getState().start()} className="min-w-[112px]">
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
              <Button variant="outline" onClick={() => usePomodoro.getState().stop()} aria-label="End session">
                <FaXmark className="h-4 w-4" /> End
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

            <DurationsPanel idle={idle} />
          </div>
        </DialogContent>
      </Dialog>

      {/* floating pill — countdown survives navigation & closed dialog */}
      {pillVisible && (
        <div className="fixed bottom-16 right-3 z-40 flex items-center gap-1 rounded-full border bg-card/95 py-2 pl-3 pr-1.5 shadow-soft backdrop-blur sm:bottom-5 sm:right-5">
          <button
            onClick={() => usePomodoro.getState().open()}
            className="flex items-center gap-2"
            aria-label={`Pomodoro ${mmss(secondsLeft)} — open timer`}
          >
            <span className={cn('h-2 w-2 shrink-0 rounded-full', isWork ? 'bg-primary' : 'bg-success', !running && 'animate-pulse')} />
            <span className="text-sm font-semibold tabular-nums">{mmss(secondsLeft)}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{isWork ? 'focus' : 'break'}</span>
          </button>
          <button
            onClick={() => usePomodoro.getState().toggle()}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={running ? 'Pause pomodoro' : 'Resume pomodoro'}
          >
            {running ? <FaPause className="h-3 w-3" /> : <FaPlay className="h-3 w-3" />}
          </button>
          <button
            onClick={() => usePomodoro.getState().stop()}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
            aria-label="End pomodoro"
          >
            <FaClose className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
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
        className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          <FaGear className="h-3.5 w-3.5" /> Durations &amp; rules
        </span>
        <span className="text-[10px]">{settings.workMin}m focus · {settings.shortMin}m / {settings.longMin}m breaks · long every {settings.roundsBeforeLong}</span>
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

          {/* auto-start rules (TickTick-style) */}
          <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="pomo-autostart-break" className="text-xs">Auto-start breaks</Label>
              <Switch
                id="pomo-autostart-break"
                checked={settings.autoStartBreaks}
                onCheckedChange={(v) => usePomodoro.getState().updateSettings({ autoStartBreaks: v })}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="pomo-autostart-work" className="text-xs">Auto-start next focus</Label>
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
