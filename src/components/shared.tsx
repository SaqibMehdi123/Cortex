'use client'

import { FaCheck, FaClock } from 'react-icons/fa6'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useRef, useState, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { motion, useMotionValue, animate } from 'framer-motion'
import { toast } from '@/hooks/use-toast'
import type { Task } from '@/lib/types'

// ─── Goal color palette (cool-neutral register for the mono skin — keys
//     stay DB-compatible, only the hex values moved) ────────────────────
export const GOAL_COLORS: Record<string, string> = {
  indigo: '#6E6F76', // graphite
  teal: '#3B7A74', // harbor
  emerald: '#299E60', // signal green
  amber: '#B8860B', // dark gold
  rose: '#D4442E', // signal red
  violet: '#6E56CF', // muted iris
  cyan: '#4F7F7B', // eucalyptus
  zinc: '#8F8F8F', // neutral gray
}

export function colorHex(color?: string | null) {
  return GOAL_COLORS[color ?? 'indigo'] ?? GOAL_COLORS.indigo
}

// ─── Vercel-mono structural primitives ─────────────────────────────
// The B direction is a LAYOUT language, not just a palette: stat cards
// with mono numerals, one flat panel of hairline rows, horizontal
// meters. These primitives encode that so every view stays consistent.

// Stat card: quiet label → large Geist Mono value → mono delta line.
// tone: 'up' (green) | 'down' (red) | 'flat' (muted) — used sparingly,
// color only ever carries status, never decoration.
export function StatCard({
  label,
  value,
  delta,
  tone = 'flat',
  onClick,
}: {
  label: string
  value: ReactNode
  delta?: ReactNode
  tone?: 'up' | 'down' | 'flat'
  onClick?: () => void
}) {
  const toneCls = tone === 'up' ? 'text-success' : tone === 'down' ? 'text-danger' : 'text-muted-foreground'
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'block w-full rounded-[10px] border bg-card px-4 py-3.5 text-left shadow-soft',
        onClick && 'transition-colors hover:bg-muted/40'
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-[26px] font-medium leading-none tracking-[-0.03em] tabular-nums">{value}</div>
      {delta !== undefined && <div className={cn('mt-1.5 font-mono text-xs tabular-nums', toneCls)}>{delta}</div>}
    </Tag>
  )
}

// Responsive row of stat cards: 2-up on mobile, N-up from sm up.
export function StatRow({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 6 }) {
  const sm = cols === 3 ? 'sm:grid-cols-3' : cols === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3 lg:grid-cols-6'
  return <div className={cn('grid grid-cols-2 gap-3.5', sm)}>{children}</div>
}

// Flat panel: one bordered card, header row, children are hairline rows.
// This replaces grids of chunky cards — the Vercel list register.
export function Panel({
  title,
  count,
  action,
  children,
  className,
}: {
  title: ReactNode
  count?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('overflow-hidden rounded-[10px] border bg-card shadow-soft', className)}>
      <header className="flex min-h-[46px] items-center gap-2 border-b px-4 py-2.5">
        <h2 className="text-[13px] font-semibold tracking-[-0.01em]">{title}</h2>
        {count !== undefined && <span className="font-mono text-xs tabular-nums text-muted-foreground">{count}</span>}
        {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
      </header>
      {children}
    </section>
  )
}

// Hairline row inside a Panel — every row after the first gets a top border.
export function PanelRow({ children, className, first }: { children: ReactNode; className?: string; first?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3 text-sm', !first && 'border-t', className)}>
      {children}
    </div>
  )
}

// Horizontal meter — the B progress bar: thin track in border color,
// near-black fill. `value` 0..100. Mono pct is rendered by the caller.
export function Meter({ value, className }: { value: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className={cn('h-[6px] w-full overflow-hidden rounded-[3px] bg-border', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-[3px] bg-primary transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
    </div>
  )
}

// ─── Progress ring (SVG) ───────────────────────────────────────────
export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  color = 'var(--chart-1)',
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
  secondaryAction,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: { label: string; onClick: () => void }
  secondaryAction?: { label: string; onClick: () => void }
}) {
  return (
    <div className="anim-fade-up flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/50 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:h-5 [&_svg]:w-5">
        {icon}
      </div>
      <div>
        <p className="text-lg font-semibold tracking-[-0.01em]">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {(action || secondaryAction) && (
        <div className="mt-1 flex flex-col items-center gap-2 sm:flex-row">
          {action && (
            <Button size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button size="sm" variant="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
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
        <h1 className="text-2xl font-semibold leading-tight tracking-[-0.02em] sm:text-[1.7rem]">{title}</h1>
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
    <div className="relative overflow-hidden">
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
        className={cn('relative rounded-md transition-colors', hint === 'done' && 'bg-success/10 ring-1 ring-success/50', hint === 'snooze' && 'bg-warning/10 ring-1 ring-warning/50')}
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
