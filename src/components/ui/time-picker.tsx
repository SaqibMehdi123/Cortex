'use client'

// ─── Clock-shaped time picker (analog dial, Material-style) ─────────
//
// Replaces the native <input type="time"> (tiny spinny fields) with a real
// clock face: pick the HOUR on the dial → it flips to MINUTES → pick a
// minute chip. AM/PM toggle + a digital readout that doubles as a mode
// switch (click hh / mm to jump back), and ±1min nudges for exact minutes
// beyond the 5-minute dial grid. Value format stays "HH:MM" (24h) so every
// existing caller keeps composing due instants the same way.

import { FaClock, FaMinus, FaPlus } from 'react-icons/fa6'
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type Ampm = 'AM' | 'PM'

const HOUR_DIAL = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const MIN_DIAL = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

function parseValue(v: string): { h12: number; ampm: Ampm; min: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
  if (!m) return null
  const h24 = Number.parseInt(m[1], 10)
  const min = Number.parseInt(m[2], 10)
  if (h24 > 23 || min > 59) return null
  return { h12: h24 % 12 || 12, ampm: h24 < 12 ? 'AM' : 'PM', min }
}

function to24h(h12: number, ampm: Ampm): number {
  const base = h12 % 12
  return ampm === 'AM' ? base : base + 12
}

function fmtValue(v: string): string | null {
  const p = parseValue(v)
  if (!p) return null
  const mm = String(p.min).padStart(2, '0')
  return `${p.h12}:${mm} ${p.ampm}`
}

// position n of 12 around the dial, 0 = top (12 o'clock), clockwise
function dialPos(i: number, radiusPct = 38): { left: string; top: string } {
  const angle = (i * 30 - 90) * (Math.PI / 180)
  return {
    left: `${50 + radiusPct * Math.cos(angle)}%`,
    top: `${50 + radiusPct * Math.sin(angle)}%`,
  }
}

export function TimePicker({
  value,
  onChange,
  disabled,
  placeholder = '—:—',
  ariaLabel = 'Pick a time',
  className,
  clearable = false,
  onClear,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  placeholder?: string
  ariaLabel?: string
  className?: string
  clearable?: boolean
  onClear?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'hour' | 'minute'>('hour')
  // selections live in dial terms until a complete time is composed
  const [h12, setH12] = useState<number | null>(null)
  const [ampm, setAmpm] = useState<Ampm>('AM')
  const [min, setMin] = useState<number | null>(null)

  // re-sync internal state whenever the outer value changes — adjusted
  // during render (React's documented pattern), not in an effect
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    const p = parseValue(value)
    setH12(p ? p.h12 : null)
    setAmpm(p ? p.ampm : 'AM')
    setMin(p ? p.min : null)
  }

  function emit(nextH: number | null, nextAmpm: Ampm, nextMin: number | null) {
    if (nextH !== null && nextMin !== null) onChange(`${String(to24h(nextH, nextAmpm)).padStart(2, '0')}:${String(nextMin).padStart(2, '0')}`)
  }

  function pickHour(h: number) {
    setH12(h)
    setMode('minute')
    emit(h, ampm, min)
  }

  function pickMinute(m: number) {
    setMin(m)
    emit(h12, ampm, m)
    // time is complete — close the dial
    setOpen(false)
    setMode('hour')
  }

  function nudgeMinute(delta: number) {
    const base = min ?? 0
    const next = ((base + delta) % 60 + 60) % 60
    if (h12 === null) {
      // no hour yet — default to 12 AM/PM current? keep it simple: 9 AM-ish is
      // surprising; require an hour first (dial opens on hour mode anyway)
      setMode('hour')
      return
    }
    setMin(next)
    emit(h12, ampm, next)
  }

  const display = fmtValue(value)
  const handAngle = mode === 'hour'
    ? ((h12 ?? 12) % 12) * 30
    : (min ?? 0) * 6

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (v) setMode('hour')
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            'flex w-full items-center gap-1.5 rounded-md border border-input bg-transparent text-sm shadow-xs transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50',
            display ? 'text-foreground' : 'text-muted-foreground',
            className ?? 'h-9 px-3',
          )}
        >
          <FaClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-left tabular-nums">{display ?? placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[248px] rounded-2xl p-3" align="start" sideOffset={6}>
        {/* digital readout — click hh / mm to switch dial mode */}
        <div className="mb-2 flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => setMode('hour')}
            className={cn(
              'rounded-lg px-2.5 py-1 text-xl font-semibold tabular-nums transition-colors',
              mode === 'hour' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
            )}
            aria-label="Pick hour"
          >
            {h12 !== null ? h12 : '--'}
          </button>
          <span className="text-xl font-semibold text-muted-foreground">:</span>
          <button
            type="button"
            onClick={() => setMode('minute')}
            className={cn(
              'rounded-lg px-2.5 py-1 text-xl font-semibold tabular-nums transition-colors',
              mode === 'minute' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
              h12 === null && 'opacity-40',
            )}
            aria-label="Pick minute"
          >
            {min !== null ? String(min).padStart(2, '0') : '--'}
          </button>
          <div className="ml-1 flex flex-col overflow-hidden rounded-lg border text-[10px] font-semibold">
            {(['AM', 'PM'] as const).map((ap) => (
              <button
                key={ap}
                type="button"
                onClick={() => {
                  setAmpm(ap)
                  emit(h12, ap, min)
                }}
                className={cn(
                  'px-1.5 py-0.5 transition-colors',
                  ampm === ap ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}
                aria-pressed={ampm === ap}
              >
                {ap}
              </button>
            ))}
          </div>
        </div>

        {/* dial */}
        <div className="relative mx-auto aspect-square w-[196px] rounded-full border bg-muted/30">
          {/* hand */}
          <div
            className="absolute left-1/2 top-1/2 h-[1px] w-[26%] origin-left bg-primary"
            style={{ transform: `rotate(${handAngle}deg)` }}
            aria-hidden
          />
          <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" aria-hidden />
          {mode === 'hour'
            ? HOUR_DIAL.map((h, i) => {
                const pos = dialPos(i)
                const active = h12 === h
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => pickHour(h)}
                    style={pos}
                    className={cn(
                      'absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-medium transition-colors',
                      active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/80 hover:bg-muted',
                    )}
                    aria-label={`${h} o'clock`}
                  >
                    {h}
                  </button>
                )
              })
            : MIN_DIAL.map((m, i) => {
                const pos = dialPos(i)
                const active = min === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => pickMinute(m)}
                    style={pos}
                    className={cn(
                      'absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-medium tabular-nums transition-colors',
                      active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/80 hover:bg-muted',
                    )}
                    aria-label={`${m} minutes`}
                  >
                    {String(m).padStart(2, '0')}
                  </button>
                )
              })}
        </div>

        {/* fine adjust + clear */}
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1" aria-label="Nudge minutes">
            <button
              type="button"
              onClick={() => nudgeMinute(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
              aria-label="One minute earlier"
            >
              <FaMinus className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => nudgeMinute(1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
              aria-label="One minute later"
            >
              <FaPlus className="h-3 w-3" />
            </button>
            <span className="ml-0.5 text-[10px] text-muted-foreground">exact min</span>
          </div>
          {clearable && onClear && (
            <button
              type="button"
              onClick={() => {
                onClear()
                setOpen(false)
              }}
              className="rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
