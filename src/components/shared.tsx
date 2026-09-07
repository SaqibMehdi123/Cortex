'use client'

import { FaCheck, FaClock } from 'react-icons/fa6'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useRef, useState, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { motion, useMotionValue, animate } from 'framer-motion'
import { toast } from '@/hooks/use-toast'
import type { Task } from '@/lib/types'

// ─── Goal color palette (muted, editorial — keys stay DB-compatible) ─
export const GOAL_COLORS: Record<string, string> = {
  indigo: '#5E6B73', // slate
  teal: '#2F6B57', // pine
  emerald: '#557A4E', // moss
  amber: '#C08A2D', // ochre
  rose: '#C25E3A', // terracotta
  violet: '#7D5A6C', // plum
  cyan: '#4F7F7B', // eucalyptus
  zinc: '#8A8375', // stone
}

export function colorHex(color?: string | null) {
  return GOAL_COLORS[color ?? 'indigo'] ?? GOAL_COLORS.indigo
}

// ─── Progress ring (SVG) ───────────────────────────────────────────
export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  color = '#2F6B57',
  label,
  sublabel,
}: {
  value: number
  size?: number
  stroke?: number
  color?: string
  label?: ReactNode
  sublabel?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`Progress ${pct}%`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (pct / 100) * c}
            style={{ transition: 'stroke-dashoffset 500ms ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {label ?? <span className="text-sm font-semibold">{pct}%</span>}
        </div>
      </div>
      {sublabel && <div className="max-w-[96px] truncate text-center text-xs text-muted-foreground">{sublabel}</div>}
    </div>
  )
}

// ─── Empty state that teaches ──────────────────────────────────────
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="anim-fade-up flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/50 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:h-5 [&_svg]:w-5">
        {icon}
      </div>
      <div>
        <p className="font-display text-lg">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action && (
        <Button size="sm" onClick={action.onClick} className="mt-1">
          {action.label}
        </Button>
      )}
    </div>
  )
}

// ─── Consistent page header (title + subtitle + actions) ───────────
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl leading-tight sm:text-[1.7rem]">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

// ─── Skeleton card ─────────────────────────────────────────────────
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border bg-card p-5 space-y-3', className)}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  )
}

// ─── Swipeable task row (mobile: right=complete, left=snooze) ─────
export function SwipeTaskRow({
  task,
  onToggle,
  onSnooze,
  children,
}: {
  task: Task
  onToggle: (t: Task) => void
  onSnooze: (t: Task) => void
  children: ReactNode
}) {
  const x = useMotionValue(0)
  const [hint, setHint] = useState<'none' | 'done' | 'snooze'>('none')
  const dragging = useRef(false)

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* action backgrounds */}
      <div className="absolute inset-y-0 right-0 flex w-1/2 items-center justify-end bg-success/15 pr-4 text-success">
        <FaCheck className="h-5 w-5" />
      </div>
      <div className="absolute inset-y-0 left-0 flex w-1/2 items-center bg-warning/15 pl-4 text-warning">
        <FaClock className="h-5 w-5" />
      </div>
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.35}
        dragMomentum={false}
        style={{ x }}
        onDragStart={() => (dragging.current = true)}
        onDrag={(_, info) => setHint(info.offset.x > 44 ? 'done' : info.offset.x < -44 ? 'snooze' : 'none')}
        onDragEnd={(_, info) => {
          dragging.current = false
          setHint('none')
          if (info.offset.x > 64 && task.status !== 'done') {
            animate(x, 0, { duration: 0.15 })
            onToggle(task)
          } else if (info.offset.x < -64) {
            animate(x, 0, { duration: 0.15 })
            onSnooze(task)
          } else {
            animate(x, 0, { type: 'spring', stiffness: 400, damping: 30 })
          }
        }}
        className={cn('relative rounded-lg border bg-card', hint === 'done' && 'ring-2 ring-success/50', hint === 'snooze' && 'ring-2 ring-warning/50')}
      >
        {children}
      </motion.div>
    </div>
  )
}

// ─── Priority dot & status helpers ─────────────────────────────────
export function PriorityDot({ priority }: { priority: string }) {
  return (
    <span
      aria-label={`Priority ${priority}`}
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', priority === 'high' ? 'bg-danger' : priority === 'med' ? 'bg-warning' : 'bg-muted-foreground/40')}
    />
  )
}

// ─── Toast helper ──────────────────────────────────────────────────
export function useToastHelper() {
  return {
    success: (title: string, description?: string) => toast({ title, description }),
    error: (title: string, description?: string) => toast({ title, description, variant: 'destructive' }),
  }
}

// ─── Keyboard shortcut hint chip ───────────────────────────────────
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{children}</kbd>
}

// hook: mounted (SSR-safe, no setState-in-effect)
const emptySubscribe = () => () => {}
export function useMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false)
}

// hook: media query
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const update = () => setMatches(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [query])
  return matches
}
