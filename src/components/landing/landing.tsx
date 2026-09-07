'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { LandingNav } from './nav'
import { LandingHero } from './hero'
import { SourcesMarquee, FeatureIndex, StatLine } from './features'
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
 * Editorial section header — mono index + hairline rule, tight sans title
 * left, lede right. Left-aligned on purpose: no more centered AI cadence.
 */
export function SectionHeader({
  index,
  label,
  title,
  lede,
}: {
  index: string
  label: string
  title: React.ReactNode
  lede?: string
}) {
  return (
    <div className="border-t border-border pt-5">
      <Reveal>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[11px] text-muted-foreground">{index}</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
      </Reveal>
      <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-12">
        <Reveal delay={60}>
          <h2 className="max-w-xl text-[1.65rem] font-semibold leading-[1.15] tracking-[-0.022em] text-foreground sm:text-[2.1rem]">
            {title}
          </h2>
        </Reveal>
        {lede ? (
          <Reveal delay={140}>
            <p className="max-w-sm text-[15px] leading-relaxed text-muted-foreground md:pb-1 md:text-right">
              {lede}
            </p>
          </Reveal>
        ) : null}
      </div>
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
        <FeatureIndex />
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
