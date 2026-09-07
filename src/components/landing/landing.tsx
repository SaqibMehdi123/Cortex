'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { LandingNav } from './nav'
import { LandingHero } from './hero'
import { StatStrip, BentoFeatures } from './features'
import { Workflow, CopilotSection } from './flow'
import { Faq, FinalCta, LandingFooter } from './closing'

/**
 * Scroll-reveal wrapper — fades content up the first time it enters the
 * viewport. Pure IntersectionObserver; honors prefers-reduced-motion via CSS.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
  as?: 'div' | 'section' | 'span'
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
      { threshold: 0.12, rootMargin: '0px 0px -48px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Tag
      ref={ref as React.RefObject<never>}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn('reveal', shown && 'reveal-in', className)}
    >
      {children}
    </Tag>
  )
}

/** Shared section heading — mono eyebrow + display-serif title + lede. */
export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = 'center',
}: {
  eyebrow: string
  title: React.ReactNode
  lede?: string
  align?: 'center' | 'left'
}) {
  return (
    <Reveal
      className={cn(
        'flex flex-col gap-4',
        align === 'center' ? 'items-center text-center' : 'items-start text-left'
      )}
    >
      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-primary">
        {eyebrow}
      </span>
      <h2 className="max-w-2xl font-display text-3xl leading-[1.12] tracking-tight text-foreground sm:text-4xl md:text-[2.75rem]">
        {title}
      </h2>
      {lede ? (
        <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">{lede}</p>
      ) : null}
    </Reveal>
  )
}

export function Landing({ authed, firstName }: { authed: boolean; firstName: string | null }) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-foreground">
      <LandingNav authed={authed} />
      <main className="flex-1">
        <LandingHero authed={authed} firstName={firstName} />
        <StatStrip />
        <BentoFeatures />
        <Workflow />
        <CopilotSection />
        <Faq />
        <FinalCta authed={authed} />
      </main>
      <LandingFooter />
    </div>
  )
}
