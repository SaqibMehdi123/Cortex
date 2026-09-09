'use client'

import { useEffect, useState } from 'react'
import {
  FaArrowRight,
  FaBookmark,
  FaBriefcase,
  FaFileLines,
  FaNewspaper,
  FaUpRightFromSquare,
  FaWandMagicSparkles,
} from 'react-icons/fa6'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Reveal } from './landing'
import type { IconType } from 'react-icons'

/* ── The briefing — today's catch, stacked like paper on a desk ────────── */

interface Signal {
  icon: IconType
  tag: string
  color: string
  title: string
  meta: string
  time: string
  fresh?: boolean
}

const SIGNALS: Signal[] = [
  {
    icon: FaFileLines,
    tag: 'paper',
    color: 'var(--chart-1)',
    title: 'Sparse attention holds at trillion-token scale',
    meta: 'arXiv · cs.LG',
    time: '07:12',
    fresh: true,
  },
  {
    icon: FaNewspaper,
    tag: 'news',
    color: 'var(--chart-2)',
    title: 'Open-weights model tops reasoning benchmarks',
    meta: 'The Rundown',
    time: '07:48',
  },
  {
    icon: FaBriefcase,
    tag: 'job',
    color: 'var(--chart-3)',
    title: 'ML Engineer — Zürich · visa sponsored',
    meta: '91% match',
    time: '08:05',
  },
  {
    icon: FaBookmark,
    tag: 'grant',
    color: 'var(--chart-5)',
    title: 'ETH Excellence Fellowship — full funding',
    meta: 'deadline oct 15',
    time: '08:20',
  },
]

const SWEEPING = ['arxiv.org', 'hacker news', 'nature.com', 'openreview', 'the rundown', 'gethired']

const SPECS = [
  { k: 'radar', v: '97+ sources' },
  { k: 'recall', v: 'sm-2 cards' },
  { k: 'speed', v: '⌘K everywhere' },
  { k: 'price', v: 'free in beta' },
] as const

function LiveDot({ color }: { color: string }) {
  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0">
      <span
        className="ping-dot absolute inline-flex h-full w-full rounded-full"
        style={{ background: color }}
      />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: color }} />
    </span>
  )
}

/** Cycles through source names for the briefing's sweep status line. */
function useCycle(items: readonly string[], ms = 1900) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setI((v) => (v + 1) % items.length), ms)
    return () => clearInterval(id)
  }, [items.length, ms])
  return items[i]
}

function BriefingCard() {
  const sweeping = useCycle(SWEEPING)

  return (
    <div className="group relative">
      {/* flashcard peeking off the top of the stack */}
      <div
        aria-hidden
        className="absolute -top-8 left-6 hidden w-60 -rotate-[5deg] rounded-xl border border-border bg-card p-3.5 shadow-soft transition-transform duration-500 group-hover:-translate-y-1 group-hover:-rotate-3 sm:block"
      >
        <p className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-muted-foreground/70">
          card · due today
        </p>
        <p className="mt-1.5 font-display text-[13.5px] leading-snug text-foreground">
          What does sparse attention actually approximate?
        </p>
        <div className="mt-2.5 flex gap-1.5">
          {['again', 'good', 'easy'].map((g) => (
            <span
              key={g}
              className="flex-1 rounded border border-border bg-background/70 py-0.5 text-center font-mono text-[8.5px] text-muted-foreground"
            >
              {g}
            </span>
          ))}
        </div>
      </div>

      {/* a blank sheet underneath, for the desk-stack feel */}
      <div
        aria-hidden
        className="absolute inset-x-5 -bottom-3 h-full rotate-[1.6deg] rounded-2xl border border-border bg-secondary/60"
      />

      {/* the briefing itself */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-lift">
        <div className="flex items-center justify-between px-4 py-3 sm:px-5">
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <LiveDot color="var(--chart-1)" />
            briefing · tue sep 8
          </p>
          <p className="font-mono text-[10px] text-muted-foreground/60">no. 214</p>
        </div>

        <div className="divide-y divide-border border-t border-border">
          {SIGNALS.map((s, i) => (
            <div
              key={s.title}
              className="mock-rise flex items-center gap-3 px-4 py-3 sm:px-5"
              style={{ animationDelay: `${0.45 + i * 0.1}s` }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
                style={{
                  color: s.color,
                  borderColor: `color-mix(in srgb, ${s.color} 26%, transparent)`,
                  background: `color-mix(in srgb, ${s.color} 8%, transparent)`,
                }}
              >
                <s.icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-foreground">{s.title}</p>
                <p className="mt-0.5 font-mono text-[9.5px] text-muted-foreground">{s.meta}</p>
              </div>
              {s.fresh ? <LiveDot color={s.color} /> : null}
              <span className="hidden shrink-0 font-mono text-[9.5px] tabular-nums text-muted-foreground/70 sm:block">
                {s.time}
              </span>
              <span
                className="shrink-0 rounded border px-1.5 py-px font-mono text-[8.5px] uppercase tracking-wide"
                style={{
                  color: s.color,
                  borderColor: `color-mix(in srgb, ${s.color} 30%, transparent)`,
                  background: `color-mix(in srgb, ${s.color} 6%, transparent)`,
                }}
              >
                {s.tag}
              </span>
            </div>
          ))}
        </div>

        {/* digest + sweep status */}
        <div className="border-t border-border px-4 py-3.5 sm:px-5">
          <div className="mock-rise flex items-start gap-2.5" style={{ animationDelay: '0.9s' }}>
            <FaWandMagicSparkles className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--chart-1)]" />
            <p className="text-[12px] leading-snug text-foreground/90">
              2 new papers match your thesis — a 4-minute review is queued for 17:00.
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-dashed border-border pt-2.5">
            <p className="flex min-w-0 items-center gap-1.5 font-mono text-[9.5px] text-muted-foreground">
              <LiveDot color="var(--chart-2)" />
              sweeping{' '}
              <span key={sweeping} className="anim-fade-up inline-block truncate text-foreground/80">
                {sweeping}
              </span>
            </p>
            <p className="shrink-0 font-mono text-[9.5px] text-muted-foreground/70">
              next sweep 09:00
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function LandingHero({ authed, firstName }: { authed: boolean; firstName: string | null }) {
  return (
    <section className="relative overflow-hidden pb-16 pt-28 sm:pb-24 sm:pt-36">
      {/* backdrop: faint blueprint grid + a quiet wash behind the briefing */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-grid-faint" />
        <div
          className="absolute right-[-12%] top-[6%] h-[560px] w-[560px] rounded-full"
          style={{
            background: 'radial-gradient(50% 50% at 50% 50%, var(--glow-hero), transparent 72%)',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10 xl:gap-16">
          {/* copy */}
          <div>
            <Reveal>
              <a
                href="#platform"
                className="group inline-flex items-center gap-2 font-mono text-[10.5px] tracking-wide text-muted-foreground transition-colors hover:text-foreground sm:text-[11.5px]"
              >
                <LiveDot color="var(--chart-1)" />
                <span>
                  <span className="text-muted-foreground/50">[</span>
                  {' v2.1 · radar now fetches jobs & scholarships '}
                  <span className="text-muted-foreground/50">]</span>
                </span>
                <FaUpRightFromSquare className="h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </a>
            </Reveal>

            {/* headline — each line rises out of its own clipped mask */}
            <h1 className="mt-6 font-display text-[2.6rem] leading-[1.04] tracking-[-0.02em] text-foreground sm:text-[3.6rem] lg:text-[3.5rem] xl:text-[4.15rem]">
              <span className="-mb-[0.12em] block overflow-hidden pb-[0.12em]">
                <span className="h1-line" style={{ animationDelay: '0.08s' }}>
                  Let knowledge
                </span>
              </span>
              <span className="-mb-[0.12em] block overflow-hidden pb-[0.12em]">
                <span className="h1-line" style={{ animationDelay: '0.22s' }}>
                  <span className="italic text-primary">come to you.</span>
                </span>
              </span>
            </h1>

            <Reveal delay={170}>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground sm:text-base">
                {authed && firstName ? (
                  <>
                    Welcome back, {firstName}. Your radar kept sweeping while you were away —
                    today&rsquo;s briefing is ready.
                  </>
                ) : (
                  <>
                    Cortex is one quiet desk for your reading, notes, plans and goals — while an AI
                    radar sweeps 97+ sources, so the papers, news and jobs that matter find you
                    first.
                  </>
                )}
              </p>
            </Reveal>

            <Reveal delay={250} className="mt-7 flex flex-wrap items-center gap-2.5">
              <Button asChild className="sheen h-10 rounded-lg px-5 text-[14px]">
                <Link href={authed ? '/app' : '/signup'}>
                  {authed ? 'Open Cortex' : 'Start for free'}
                  <FaArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-10 rounded-lg bg-card/50 px-5 text-[14px] backdrop-blur"
              >
                <Link href={authed ? '/app' : '/login'}>{authed ? 'Jump back in' : 'Sign in'}</Link>
              </Button>
            </Reveal>

            {/* spec sheet — the product in four mono facts */}
            <Reveal delay={320}>
              <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-border pt-6 sm:grid-cols-4">
                {SPECS.map((s) => (
                  <div key={s.k}>
                    <dt className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-muted-foreground/70">
                      {s.k}
                    </dt>
                    <dd className="mt-1 font-mono text-[12.5px] font-medium text-foreground">
                      {s.v}
                    </dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>

          {/* the briefing */}
          <Reveal delay={200} className="relative">
            <BriefingCard />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
