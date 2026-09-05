'use client'

import { cn } from '@/lib/utils'

/**
 * Cortex mark — two nested "cortex fold" arcs forming a C,
 * with a synaptic node at the center.
 *
 * Theme-aware: the folds use currentColor (ink in light mode,
 * warm off-white in dark mode) and the center node uses the
 * pine accent (--primary), so it reads cleanly in both modes.
 */
export function CortexMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      {/* outer fold */}
      <path
        d="M24 8.8 A10.8 10.8 0 1 0 24 23.2"
        stroke="currentColor"
        strokeWidth="2.7"
        strokeLinecap="round"
      />
      {/* inner fold */}
      <path
        d="M18.6 11.1 A5.6 5.6 0 1 0 18.6 20.9"
        stroke="currentColor"
        strokeWidth="2.7"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* synaptic node */}
      <circle cx="16" cy="16" r="2.8" style={{ fill: 'var(--primary)' }} />
    </svg>
  )
}

/** Full lockup: mark + serif wordmark + pine dot. */
export function CortexLogo({ size = 26, className, markClassName }: { size?: number; className?: string; markClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <CortexMark size={size} className={markClassName} />
      <span className="font-display text-[1.35rem] leading-none">Cortex</span>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
    </span>
  )
}
