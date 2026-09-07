'use client'

import { FaArrowRight, FaBookOpen, FaBullseye, FaCalendarWeek, FaChartLine, FaFileLines, FaFire, FaLayerGroup, FaLock, FaShareNodes, FaTowerBroadcast, FaUpRightFromSquare, FaWandMagicSparkles } from 'react-icons/fa6'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CortexMark } from '@/components/logo'
import { Reveal } from './landing'
import { useTilt } from './motion'
import type { IconType } from 'react-icons'
import { cn } from '@/lib/utils'

/* ── The app mock — dense, branded, and quietly alive ─────────────────── */

interface SideItem {
  icon: IconType
  label: string
  active?: boolean
  live?: boolean
  due?: string
}

const SIDE: Record<'workspace' | 'intelligence', SideItem[]> = {
  workspace: [
    { icon: FaFileLines, label: 'Today', active: true },
    { icon: FaBookOpen, label: 'Library' },
    { icon: FaCalendarWeek, label: 'Plans' },
    { icon: FaBullseye, label: 'Goals' },
  ],
  intelligence: [
    { icon: FaTowerBroadcast, label: 'Radar', live: true },
    { icon: FaLayerGroup, label: 'Cards', due: '14' },
    { icon: FaShareNodes, label: 'Maps' },
    { icon: FaChartLine, label: 'Stats' },
  ],
}

const FEED = [
  {
    dot: 'var(--chart-1)',
    title: 'Sparse attention holds at trillion-token scale',
    meta: 'arXiv · cs.LG',
    tag: 'paper',
    hot: true,
  },
  {
    dot: 'var(--chart-2)',
    title: 'Open-weights model tops reasoning benchmarks',
    meta: 'The Rundown · 12m',
    tag: 'news',
  },
  {
    dot: 'var(--chart-3)',
    title: 'ML Engineer — Zürich · visa sponsored',
    meta: '91% match',
    tag: 'job',
  },
]

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

function MockWindow() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_40px_120px_-32px_rgb(0_0_0/0.4)]">
      <span aria-hidden className="mock-topline" />

      {/* chrome */}
      <div className="flex items-center gap-3 border-b border-border bg-background/80 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#f87171]/55" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]/55" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#4ade80]/55" />
        </div>
        <div className="mx-auto flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-3.5 py-1 font-mono text-[10px] text-muted-foreground">
          <FaLock className="h-2.5 w-2.5" />
          cortex.app
        </div>
        <div className="rounded-md border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground">
          ⌘K
        </div>
      </div>

      <div className="flex text-left">
        {/* sidebar */}
        <aside className="hidden w-40 shrink-0 flex-col border-r border-border p-3 sm:flex">
          <div className="flex items-center gap-1.5 px-1.5 pb-2.5">
            <CortexMark size={13} />
            <span className="text-[11px] font-semibold tracking-[-0.01em] text-foreground">
              Cortex
            </span>
          </div>

          {(['workspace', 'intelligence'] as const).map((group) => (
            <div key={group} className={cn(group === 'intelligence' && 'mt-3.5')}>
              <p className="px-1.5 pb-1 font-mono text-[8px] uppercase tracking-[0.18em] text-muted-foreground/60">
                {group}
              </p>
              {SIDE[group].map((n, i) => (
                <div
                  key={n.label}
                  className={cn(
                    'mock-rise relative flex items-center gap-1.5 rounded-md px-1.5 py-[5px] text-[10.5px]',
                    n.active
                      ? 'bg-accent font-medium text-accent-foreground'
                      : 'text-muted-foreground'
                  )}
                  style={{ animationDelay: `${0.55 + i * 0.07}s` }}
                >
                  {n.active ? (
                    <span className="absolute left-0 top-1/2 h-3.5 w-[2.5px] -translate-y-1/2 rounded-full bg-[var(--chart-1)]" />
                  ) : null}
                  <n.icon className="h-3 w-3 shrink-0" />
                  <span className="flex-1 truncate">{n.label}</span>
                  {n.live ? <LiveDot color="var(--chart-1)" /> : null}
                  {n.due ? (
                    <span className="rounded border border-border bg-background/70 px-1 font-mono text-[7.5px] text-muted-foreground">
                      {n.due}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ))}

          {/* user card */}
          <div
            className="mock-rise mt-4 flex items-center gap-2 rounded-lg border border-border bg-background/60 p-1.5 sm:mt-auto"
            style={{ animationDelay: '0.95s' }}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--chart-1)] to-[var(--chart-5)] font-mono text-[8.5px] font-bold text-white">
              S
            </span>
            <div className="min-w-0">
              <p className="truncate text-[9.5px] font-medium leading-tight text-foreground">
                Saqib
              </p>
              <p className="font-mono text-[7.5px] leading-tight text-muted-foreground">
                beta · sync on
              </p>
            </div>
          </div>
        </aside>

        {/* main */}
        <div className="min-w-0 flex-1 p-4">
          {/* header */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[14px] font-semibold tracking-[-0.01em] text-foreground">
              Good morning, Saqib
            </p>
            <div className="flex items-center gap-2">
              <span
                className="flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[8.5px] font-medium"
                style={{
                  borderColor: 'color-mix(in srgb, var(--chart-2) 32%, transparent)',
                  color: 'var(--chart-2)',
                  background: 'color-mix(in srgb, var(--chart-2) 7%, transparent)',
                }}
              >
                <FaFire className="h-2.5 w-2.5" />
                12-day
              </span>
              <span className="hidden font-mono text-[9px] uppercase tracking-wider text-muted-foreground sm:block">
                tue · sep 8
              </span>
            </div>
          </div>

          {/* status chips */}
          <div className="mt-2.5 flex gap-1.5">
            {['3 cards due', '2 unread', '4 tasks'].map((c, i) => (
              <span
                key={c}
                className="mock-rise rounded border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground"
                style={{ animationDelay: `${0.6 + i * 0.08}s` }}
              >
                {c}
              </span>
            ))}
          </div>

          {/* AI digest */}
          <div className="digest-card mock-rise mt-3 flex items-start gap-2.5 rounded-lg p-2.5" style={{ animationDelay: '0.7s' }}>
            <FaWandMagicSparkles className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--chart-1)]" />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.18em] text-muted-foreground">
                radar digest
                <LiveDot color="var(--chart-1)" />
                live
              </p>
              <p className="mt-0.5 text-[10.5px] leading-snug text-foreground/90">
                2 new papers match your thesis — a 4-minute review is queued for 17:00.
              </p>
            </div>
          </div>

          {/* feed */}
          <div
            className="mock-rise mt-2.5 rounded-lg border border-border"
            style={{ animationDelay: '0.78s' }}
          >
            {FEED.map((r, i) => (
              <div
                key={r.title}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-[7px]',
                  i > 0 && 'border-t border-border'
                )}
                style={
                  r.hot
                    ? { background: 'color-mix(in srgb, var(--chart-1) 5%, transparent)' }
                    : undefined
                }
              >
                {r.hot ? <LiveDot color={r.dot} /> : (
                  <span
                    className="h-1 w-1 shrink-0 rounded-full"
                    style={{ background: r.dot }}
                  />
                )}
                <p className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-foreground">
                  {r.title}
                </p>
                <span className="hidden shrink-0 font-mono text-[8.5px] text-muted-foreground sm:block">
                  {r.meta}
                </span>
                <span
                  className="shrink-0 rounded border px-1 py-px font-mono text-[8px] uppercase"
                  style={{
                    color: r.dot,
                    borderColor: `color-mix(in srgb, ${r.dot} 30%, transparent)`,
                    background: `color-mix(in srgb, ${r.dot} 6%, transparent)`,
                  }}
                >
                  {r.tag}
                </span>
              </div>
            ))}
          </div>

          {/* bottom row — focus ring + goal bar */}
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <div
              className="mock-rise rounded-lg border border-border bg-background/50 p-2.5"
              style={{ animationDelay: '0.86s' }}
            >
              <div className="flex items-center gap-2.5">
                <div className="relative h-11 w-11 shrink-0">
                  <svg viewBox="0 0 36 36" className="mock-ring h-11 w-11">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth="3" />
                    <circle
                      className="ring-val"
                      cx="18"
                      cy="18"
                      r="15.5"
                      fill="none"
                      stroke="var(--chart-1)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray="97.4"
                      strokeDashoffset="97.4"
                      style={{ ['--ring-off' as string]: '31.2' }}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center font-mono text-[8px] font-semibold tabular-nums text-foreground">
                    68%
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[8.5px] uppercase tracking-wider text-muted-foreground">
                    focus
                  </p>
                  <p className="font-mono text-[15px] font-medium tabular-nums tracking-tight text-foreground">
                    24:13
                  </p>
                </div>
              </div>
            </div>

            <div
              className="mock-rise rounded-lg border border-border bg-background/50 p-2.5"
              style={{ animationDelay: '0.94s' }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-mono text-[8.5px] uppercase tracking-wider text-muted-foreground">
                  goal · thesis
                </p>
                <p className="font-mono text-[11px] font-semibold tabular-nums text-[var(--chart-2)]">
                  80%
                </p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="bar-fill bar-shimmer h-full rounded-full"
                  style={{
                    ['--w' as string]: 0.8,
                    background: 'linear-gradient(90deg, var(--chart-2), var(--chart-1))',
                  }}
                />
              </div>
              <p className="mt-1.5 font-mono text-[8px] text-muted-foreground">
                14 of 18 chapters · on pace
              </p>
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
              <FaUpRightFromSquare className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </Reveal>

          {/* headline — each line rises out of its own clipped mask */}
          <h1 className="mt-7 max-w-3xl text-[2.7rem] font-semibold leading-[1.02] tracking-[-0.035em] text-foreground sm:text-[4.2rem]">
            <span className="-mb-[0.12em] block overflow-hidden pb-[0.12em]">
              <span className="h1-line" style={{ animationDelay: '0.08s' }}>
                Knowledge work,
              </span>
            </span>
            <span className="-mb-[0.12em] block overflow-hidden pb-[0.12em]">
              <span className="h1-line" style={{ animationDelay: '0.22s' }}>
                <span className="text-muted-foreground">without the chaos.</span>
              </span>
            </span>
          </h1>

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
                <FaArrowRight className="ml-1 h-4 w-4" />
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

        {/* mock with 3D tilt, breathing glow, floating chips */}
        <Reveal delay={180} className="relative mx-auto mt-14 max-w-3xl [perspective:1400px]">
          <div
            aria-hidden
            className="mock-glow pointer-events-none absolute -inset-x-12 -bottom-10 -top-14"
          />
          <div ref={tiltRef} className="tilt relative [transform-style:preserve-3d]">
            <div className="[transform:translateZ(24px)]">
              <div className="mock-float">
                <MockWindow />
              </div>
            </div>

            {/* depth-layered floating chips, phase-offset so they never sync */}
            <div
              aria-hidden
              className="absolute -left-24 top-10 hidden [transform:translateZ(90px)] lg:block"
            >
              <div className="chip-float flex items-center gap-2.5 rounded-xl border border-border bg-card/95 py-2.5 pl-3 pr-4 shadow-xl backdrop-blur">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background/70">
                  <FaBookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
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
              <div
                className="chip-float flex items-center gap-2.5 rounded-xl border border-border bg-card/95 py-2.5 pl-3 pr-4 shadow-xl backdrop-blur"
                style={{ animationDelay: '-2.6s' }}
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg border font-mono text-[10px] font-semibold"
                  style={{
                    color: 'var(--chart-3)',
                    borderColor: 'color-mix(in srgb, var(--chart-3) 30%, transparent)',
                    background: 'color-mix(in srgb, var(--chart-3) 8%, transparent)',
                  }}
                >
                  91%
                </span>
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
            <div
              aria-hidden
              className="absolute -left-16 bottom-4 hidden [transform:translateZ(55px)] lg:block"
            >
              <div
                className="chip-float flex items-center gap-2 rounded-lg border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur"
                style={{ animationDelay: '-4.9s' }}
              >
                <FaLayerGroup className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="font-mono text-[10px] text-muted-foreground">
                  <span className="font-semibold text-foreground">14 cards</span> due · SM-2
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
