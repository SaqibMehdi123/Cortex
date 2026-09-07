'use client'

import { FaPause, FaPlay, FaStopwatch, FaXmark } from 'react-icons/fa6'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useUI } from '@/lib/nav-config'
import { api } from '@/lib/client'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

const WORK_MIN = 25
const BREAK_MIN = 5

export function FocusTimer() {
  const focusTask = useUI((s) => s.focusTask)
  const setFocusTask = useUI((s) => s.setFocusTask)
  const { toast } = useToast()
  const [mode, setMode] = useState<'work' | 'break'>('work')
  const [secondsLeft, setSecondsLeft] = useState(WORK_MIN * 60)
  const [running, setRunning] = useState(false)
  const [elapsedWork, setElapsedWork] = useState(0)
  const startedAt = useRef<number>(Date.now())
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const total = mode === 'work' ? WORK_MIN * 60 : BREAK_MIN * 60

  useEffect(() => {
    if (focusTask) {
      setMode('work')
      setSecondsLeft(WORK_MIN * 60)
      setRunning(true)
      setElapsedWork(0)
      startedAt.current = Date.now()
    }
  }, [focusTask])

  const finishSession = useCallback(async () => {
    const minutes = Math.max(1, Math.round(elapsedWork / 60))
    try {
      await api.post('/api/focus', {
        taskId: focusTask?.id,
        goalId: focusTask?.goalId ?? null,
        minutes,
        startedAt: new Date(startedAt.current).toISOString(),
      })
      toast({ title: `Focus session logged: ${minutes}m`, description: 'It counts toward your goal velocity.' })
    } catch {
      toast({ title: 'Could not log focus session', variant: 'destructive' })
    }
  }, [elapsedWork, focusTask, toast])

  useEffect(() => {
    if (!running) return
    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (mode === 'work') {
            setElapsedWork((e) => e + total)
            void finishSession()
            setMode('break')
            return BREAK_MIN * 60
          }
          setMode('work')
          return WORK_MIN * 60
        }
        return s - 1
      })
    }, 1000)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [running, mode, total, finishSession])

  const pct = 1 - secondsLeft / total
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')
  const R = 54
  const C = 2 * Math.PI * R

  return (
    <Dialog open={!!focusTask} onOpenChange={(open) => {
      if (!open) {
        if (elapsedWork > 60) void finishSession()
        setRunning(false)
        setElapsedWork(0)
        setFocusTask(null)
      }
    }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FaStopwatch className="h-4 w-4 text-primary" /> Focus mode
          </DialogTitle>
          <DialogDescription className="line-clamp-2">{focusTask?.title ?? 'Pomodoro session'}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <div className="relative h-32 w-32">
            <svg width={128} height={128} className="-rotate-90">
              <circle cx={64} cy={64} r={R} fill="none" stroke="var(--muted)" strokeWidth={8} />
              <circle
                cx={64}
                cy={64}
                r={R}
                fill="none"
                stroke={mode === 'work' ? 'var(--primary)' : 'var(--success)'}
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C - pct * C}
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold tabular-nums">{mm}:{ss}</span>
              <span className={cn('text-[10px] font-semibold uppercase tracking-widest', mode === 'work' ? 'text-primary' : 'text-success')}>
                {mode === 'work' ? 'focus' : 'break'}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => setRunning((r) => !r)} className="min-w-[100px]">
              {running ? <><FaPause className="mr-1.5 h-4 w-4" /> Pause</> : <><FaPlay className="mr-1.5 h-4 w-4" /> Resume</>}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (elapsedWork > 60) void finishSession()
                setRunning(false)
                setElapsedWork(0)
                setFocusTask(null)
              }}
            >
              <FaXmark className="mr-1.5 h-4 w-4" /> End
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">25 min focus → 5 min break. Logged to the linked task & goal.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
