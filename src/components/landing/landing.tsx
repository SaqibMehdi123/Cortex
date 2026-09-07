'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { LandingNav } from './nav'
import { LandingHero } from './hero'
import { SourcesMarquee, PlatformBento, StatLine } from './features'
import { Workflow, CopilotSection } from './flow'
import { Faq, FinalCta, LandingFooter } from './closing'

/**
 * Scroll-reveal wrapper — blurs content up the first time it enters the
 * viewport. Pure IntersectionObserver; honors prefers-reduced-motion via CSS.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      const id = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(id)
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -56px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn('reveal', shown && 'reveal-in', className)}
    >
      {children}
    </div>
  )
}

/**
 * Section header with a real identity: colored eyebrow pill, oversized serif
 * display title, and a giant ghost index behind it — you always know which
 * section you're looking at.
 */
export function SectionHeader({
  index,
  label,
  title,
  lede,
  accent = 'var(--chart-1)',
  center = false,
  className,
}: {
  index: string
  label: string
  title: React.ReactNode
  lede?: string
  accent?: string
  center?: boolean
  className?: string
}) {
  return (
    <div className={cn('relative', center && 'text-center', className)}>
      {/* giant ghost index — the section's signature */}
      <span
        aria-hidden
        className="ghost-num font-display"
        style={{ ['--ghost-accent' as string]: accent }}
      >
        {index}
      </span>

      <Reveal>
        <span
          className={cn(
            'eyebrow-pill inline-flex items-center gap-2.5 rounded-full border py-1.5 pl-3 pr-4',
            center && 'mx-auto'
          )}
          style={{
            borderColor: `color-mix(in srgb, ${accent} 30%, transparent)`,
            background: `color-mix(in srgb, ${accent} 7%, transparent)`,
          }}
        >
          <span className="relative flex h-2 w-2">
            <span
              className="ping-dot absolute inline-flex h-full w-full rounded-full"
              style={{ background: accent }}
            />
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ background: accent }}
            />
          </span>
          <span className="font-mono text-[11.5px] font-medium uppercase tracking-[0.2em] text-foreground/80">
            {index} · {label}
          </span>
        </span>
      </Reveal>

      <Reveal delay={80}>
        <h2
          className={cn(
            'mt-6 max-w-3xl font-display text-[clamp(2.3rem,5vw,3.6rem)] font-medium leading-[1.06] tracking-[-0.025em] text-foreground',
            center && 'mx-auto'
          )}
        >
          {title}
        </h2>
      </Reveal>

      {lede ? (
        <Reveal delay={150}>
          <p
            className={cn(
              'mt-5 max-w-xl text-[16.5px] leading-relaxed text-muted-foreground',
              center && 'mx-auto'
            )}
          >
            {lede}
          </p>
        </Reveal>
      ) : null}
    </div>
  )
}

export function Landing({ authed, firstName }: { authed: boolean; firstName: string | null }) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-foreground">
      <LandingNav authed={authed} />
      <main className="flex-1">
        <LandingHero authed={authed} firstName={firstName} />
        <SourcesMarquee />
        <PlatformBento />
        <StatLine />
        <Workflow />
        <CopilotSection />
        <Faq />
        <FinalCta authed={authed} />
      </main>
      <LandingFooter />
    </div>
  )
}
