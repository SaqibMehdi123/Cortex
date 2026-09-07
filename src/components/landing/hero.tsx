'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Reveal } from './landing'
import { useTilt } from './motion'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarRange,
  ChartLine,
  FileText,
  Layers,
  Radar,
  Share2,
  Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Denser, realistic app mock ───────────────────────────────────────── */

const SIDE = {
  workspace: [
    { icon: FileText, label: 'Today', active: true },
    { icon: BookOpen, label: 'Library', active: false },
    { icon: CalendarRange, label: 'Plans', active: false },
    { icon: Target, label: 'Goals', active: false },
  ],
  intelligence: [
    { icon: Radar, label: 'Radar', active: false },
    { icon: Layers, label: 'Cards', active: false },
    { icon: Share2, label: 'Maps', active: false },
    { icon: ChartLine, label: 'Stats', active: false },
  ],
}

const FEED = [
  {
    dot: 'bg-[var(--chart-1)]',
    title: 'Sparse attention holds at trillion-token scale',
    meta: 'arXiv · cs.LG',
    tag: 'paper',
    tagCls: 'text-[var(--chart-1)] border-[color-mix(in_srgb,var(--chart-1)_30%,transparent)]',
  },
  {
    dot: 'bg-[var(--chart-2)]',
    title: 'Open-weights model tops reasoning benchmarks',
    meta: 'The Rundown · 12m',
    tag: 'news',
    tagCls: 'text-[var(--chart-2)] border-[color-mix(in_srgb,var(--chart-2)_30%,transparent)]',
  },
  {
    dot: 'bg-[var(--chart-3)]',
    title: 'ML Engineer — Zürich · visa sponsored',
    meta: '91% profile match',
    tag: 'job',
    tagCls: 'text-[var(--chart-3)] border-[color-mix(in_srgb,var(--chart-3)_30%,transparent)]',
  },
]

function MockWindow() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_30px_90px_-30px_rgb(0_0_0/0.35)]">
      {/* chrome */}
      <div className="flex items-center gap-3 border-b border-border bg-background/70 px-3.5 py-2">
        <div className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-border" />
          <span className="h-2 w-2 rounded-full bg-border" />
          <span className="h-2 w-2 rounded-full bg-border" />
        </div>
        <div className="mx-auto rounded border border-border bg-muted/50 px-6 py-0.5 font-mono text-[9.5px] text-muted-foreground">
          cortex.app
        </div>
        <div className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground">
          ⌘K
        </div>
      </div>

      <div className="flex text-left">
        {/* sidebar */}
        <div className="hidden w-36 shrink-0 flex-col border-r border-border p-2.5 sm:flex">
          {(['workspace', 'intelligence'] as const).map((group) => (
            <div key={group} className={cn(group === 'intelligence' && 'mt-3')}>
              <p className="px-2 pb-1 font-mono text-[8.5px] uppercase tracking-[0.16em] text-muted-foreground/70">
                {group}
              </p>
              {SIDE[group].map((n) => (
                <div
                  key={n.label}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2 py-1 text-[10.5px]',
                    n.active
                      ? 'bg-accent font-medium text-accent-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  <n.icon className="h-3 w-3" />
                  {n.label}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* main */}
        <div className="min-w-0 flex-1 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">
              Good morning, Saqib
            </p>
            <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              tue · sep 8
            </p>
          </div>

          <div className="mt-2.5 flex gap-1.5">
            {['3 cards due', '2 unread', '4 tasks'].map((c) => (
              <span
                key={c}
                className="rounded border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground"
              >
                {c}
              </span>
            ))}
          </div>

          <div className="mt-2.5 rounded-lg border border-border">
            {FEED.map((r, i) => (
              <div
                key={r.title}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-[7px]',
                  i > 0 && 'border-t border-border'
                )}
              >
                <span className={cn('h-1 w-1 shrink-0 rounded-full', r.dot)} />
                <p className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-foreground">
                  {r.title}
                </p>
                <span className="hidden shrink-0 font-mono text-[8.5px] text-muted-foreground sm:block">
                  {r.meta}
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded border px-1 py-px font-mono text-[8px] uppercase',
                    r.tagCls
                  )}
                >
                  {r.tag}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border bg-background/50 p-2.5">
              <p className="font-mono text-[8.5px] uppercase tracking-wider text-muted-foreground">
                focus
              </p>
              <p className="mt-0.5 font-mono text-[15px] tracking-tight text-foreground">24:13</p>
              <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-[68%] rounded-full bg-[var(--chart-1)]" />
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background/50 p-2.5">
              <p className="font-mono text-[8.5px] uppercase tracking-wider text-muted-foreground">
                goal · thesis
              </p>
              <p className="mt-0.5 font-mono text-[15px] tracking-tight text-foreground">80%</p>
              <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-[80%] rounded-full bg-[var(--chart-2)]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function LandingHero({ authed, firstName }: { authed: boolean; firstName: string | null }) {
  const tiltRef = useTilt<HTMLDivElement>(2.6)

  return (
    <section className="relative overflow-hidden pb-14 pt-28 sm:pt-36">
      {/* backdrop: grid + rotating aurora */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-grid-faint" />
        <div className="absolute left-1/2 top-[-340px] h-[680px] w-[680px] -translate-x-1/2 opacity-[0.55] dark:opacity-40">
          <div className="aurora h-full w-full" />
        </div>
      </div>

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <div className="flex flex-col items-center text-center">
          <Reveal>
            <a
              href="#platform"
              className="announce group inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="rounded bg-accent px-1.5 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-wider text-accent-foreground">
                v2.1
              </span>
              Radar now auto-fetches news, papers, jobs & scholarships
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </Reveal>

          <Reveal delay={90}>
            <h1 className="mt-7 max-w-3xl text-[2.7rem] font-semibold leading-[1.02] tracking-[-0.035em] text-foreground sm:text-[4.2rem]">
              Knowledge work,
              <br />
              <span className="text-muted-foreground">without the chaos.</span>
            </h1>
          </Reveal>

          <Reveal delay={170}>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              {authed && firstName ? (
                <>Welcome back, {firstName}. Your radar kept working while you were away.</>
              ) : (
                <>
                  Cortex pulls your reading, notes, plans and goals into one fast workspace — and
                  keeps an AI radar running over 97+ sources, so nothing that matters slips past you.
                </>
              )}
            </p>
          </Reveal>

          <Reveal delay={250} className="mt-7 flex items-center gap-2.5">
            <Button asChild className="sheen h-10 rounded-lg px-5 text-[14px]">
              <Link href={authed ? '/app' : '/signup'}>
                {authed ? 'Open Cortex' : 'Start for free'}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-10 rounded-lg px-5 text-[14px] bg-card/50 backdrop-blur"
            >
              <Link href={authed ? '/app' : '/login'}>{authed ? 'Jump back in' : 'Sign in'}</Link>
            </Button>
          </Reveal>

          <Reveal delay={310}>
            <p className="mt-4 font-mono text-[10.5px] tracking-wide text-muted-foreground/80">
              FREE IN BETA · NO CREDIT CARD · OFFLINE-READY
            </p>
          </Reveal>
        </div>

        {/* mock with 3D tilt + depth chips */}
        <Reveal delay={180} className="relative mx-auto mt-14 max-w-3xl [perspective:1400px]">
          <div ref={tiltRef} className="tilt [transform-style:preserve-3d]">
            <div className="[transform:translateZ(24px)]">
              <MockWindow />
            </div>

            {/* depth-layered floating chips */}
            <div
              aria-hidden
              className="absolute -left-24 top-10 hidden [transform:translateZ(90px)] lg:block"
            >
              <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card/95 py-2.5 pl-3 pr-4 shadow-xl backdrop-blur">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                <div>
                  <p className="text-[11.5px] font-medium leading-tight text-foreground">
                    Saved to Library
                  </p>
                  <p className="font-mono text-[9.5px] leading-tight text-muted-foreground">
                    attention-is-all-you-ne…
                  </p>
                </div>
              </div>
            </div>
            <div
              aria-hidden
              className="absolute -right-28 top-1/3 hidden [transform:translateZ(70px)] lg:block"
            >
              <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card/95 py-2.5 pl-3 pr-4 shadow-xl backdrop-blur">
                <span className="font-mono text-[10px] text-[var(--chart-1)]">91%</span>
                <div>
                  <p className="text-[11.5px] font-medium leading-tight text-foreground">
                    Job match — ML Engineer
                  </p>
                  <p className="font-mono text-[9.5px] leading-tight text-muted-foreground">
                    zürich · visa sponsored
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
