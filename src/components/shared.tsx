'use client'

import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'

// Goal / accent palette (no indigo/blue)
export const PALETTE: Record<string, { dot: string; soft: string; text: string; bar: string }> = {
  emerald: { dot: 'bg-emerald-500', soft: 'bg-emerald-100 dark:bg-emerald-950/60', text: 'text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500' },
  amber: { dot: 'bg-amber-500', soft: 'bg-amber-100 dark:bg-amber-950/60', text: 'text-amber-700 dark:text-amber-300', bar: 'bg-amber-500' },
  rose: { dot: 'bg-rose-500', soft: 'bg-rose-100 dark:bg-rose-950/60', text: 'text-rose-700 dark:text-rose-300', bar: 'bg-rose-500' },
  violet: { dot: 'bg-violet-500', soft: 'bg-violet-100 dark:bg-violet-950/60', text: 'text-violet-700 dark:text-violet-300', bar: 'bg-violet-500' },
  cyan: { dot: 'bg-cyan-500', soft: 'bg-cyan-100 dark:bg-cyan-950/60', text: 'text-cyan-700 dark:text-cyan-300', bar: 'bg-cyan-500' },
  orange: { dot: 'bg-orange-500', soft: 'bg-orange-100 dark:bg-orange-950/60', text: 'text-orange-700 dark:text-orange-300', bar: 'bg-orange-500' },
}

export function paletteOf(color?: string | null) {
  return PALETTE[color ?? 'emerald'] ?? PALETTE.emerald
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string
  value: string | number
  hint?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function LabeledProgress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Progress value={value} className="h-2" />
      <span className="w-9 text-right text-xs font-medium tabular-nums text-muted-foreground">{value}%</span>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon?: React.ReactNode
  title: string
  hint?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted-foreground/60">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  )
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  )
}

// Small badge with consistent tone
export function Tone({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize',
        'bg-muted text-muted-foreground',
        className
      )}
    >
      {children}
    </span>
  )
}
