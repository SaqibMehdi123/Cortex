'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Reveal } from './landing'
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  CalendarRange,
  ChartLine,
  Flame,
  LayoutDashboard,
  Library,
  Radar,
  Share2,
  Sparkles,
  Target,
  Timer,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Sidebar rows used inside the mock window ─────────────────────────── */
const MOCK_NAV = [
  { icon: LayoutDashboard, label: 'Today', active: true },
  { icon: Library, label: 'Library', active: false },
  { icon: CalendarRange, label: 'Plans', active: false },
  { icon: Target, label: 'Goals', active: false },
  { icon: Radar, label: 'Radar', active: false },
  { icon: Briefcase, label: 'Career', active: false },
]

const FEED_ROWS = [
  { dot: 'bg-[var(--chart-1)]', tag: 'Paper', tagCls: 'text-[var(--chart-1)] border-[color-mix(in_srgb,var(--chart-1)_25%,transparent)] bg-[color-mix(in_srgb,var(--chart-1)_10%,transparent)]', title: 'Sparse attention at trillion-token scale', meta: 'arXiv · cs.LG · saved to Library' },
  { dot: 'bg-[var(--chart-2)]', tag: 'News', tagCls: 'text-[var(--chart-2)] border-[color-mix(in_srgb,var(--chart-2)_25%,transparent)] bg-[color-mix(in_srgb,var(--chart-2)_10%,transparent)]', title: 'New open-weights model tops reasoning benchmarks', meta: 'The Rundown · 12 min ago · AI summary ready' },
  { dot: 'bg-[var(--chart-3)]', tag: 'Job', tagCls: 'text-[var(--chart-3)] border-[color-mix(in_srgb,var(--chart-3)_25%,transparent)] bg-[color-mix(in_srgb,var(--chart-3)_10%,transparent)]', title: 'ML Engineer — Zurich · visa sponsorship', meta: 'Matched to your profile · 92% fit' },
]

function MockWindow() {
  return (
    <div
      aria-hidden
      className="relative w-full overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_80px_-24px_rgb(0_0_0/0.25)]"
    >
      {/* window chrome */}
      <div className="flex items-center gap-3 border-b border-border bg-background/60 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--chart-3)]/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--chart-2)]/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--chart-1)]/70" />
        </div>
        <div className="mx-auto hidden w-56 rounded-md border border-border bg-muted/60 px-3 py-1 text-center font-mono text-[10px] text-muted-foreground sm:block">
          cortex — today
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-1 font-mono text-[10px] text-muted-foreground sm:ml-0">
          <Sparkles className="h-3 w-3" /> ⌘K
        </div>
      </div>

      <div className="flex">
        {/* mini sidebar (desktop only) */}
        <div className="hidden w-40 shrink-0 flex-col gap-0.5 border-r border-border p-3 md:flex">
          {MOCK_NAV.map((n) => (
            <div
              key={n.label}
              className={cn(
                'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11.5px]',
                n.active
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground'
              )}
            >
              <n.icon className="h-3.5 w-3.5" />
              {n.label}
            </div>
          ))}
          <div className="mt-2 border-t border-border pt-2">
            <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11.5px] text-muted-foreground">
              <ChartLine className="h-3.5 w-3.5" /> Analytics
            </div>
          </div>
        </div>

        {/* main panel */}
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-display text-base text-foreground sm:text-lg">Good morning, Saqib</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Tue · Sep 8</p>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Radar pulled 3 new stories while you slept.</p>

          <div className="mt-3 rounded-xl border border-border bg-background/50 p-2.5">
            {FEED_ROWS.map((r, i) => (
              <div
                key={r.title}
                className={cn(
                  'flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50',
                  i > 0 && 'border-t border-border/60'
                )}
              >
                <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', r.dot)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium leading-snug text-foreground">{r.title}</p>
                  <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">{r.meta}</p>
                </div>
                <span className={cn('shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide', r.tagCls)}>
                  {r.tag}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-border bg-background/50 p-3">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Timer className="h-3.5 w-3.5" />
                <span className="font-mono text-[9.5px] uppercase tracking-wider">Focus</span>
              </div>
              <p className="mt-1 font-mono text-lg text-foreground">24:13</p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-[68%] rounded-full bg-[var(--chart-1)]" />
              </div>
            </div>
            <div className="rounded-xl border border-border bg-background/50 p-3">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Target className="h-3.5 w-3.5" />
                <span className="font-mono text-[9.5px] uppercase tracking-wider">Goal · Thesis</span>
              </div>
              <p className="mt-1 font-mono text-lg text-foreground">80%</p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-[80%] rounded-full bg-[var(--chart-2)]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FloatChip({
  className,
  delay,
  icon,
  title,
  meta,
}: {
  className?: string
  delay: string
  icon: React.ReactNode
  title: string
  meta: string
}) {
  return (
    <div
      style={{ animationDelay: delay }}
      className={cn(
        'float-slow absolute z-10 hidden items-center gap-2.5 rounded-xl border border-border bg-card/90 py-2.5 pl-3 pr-4 shadow-lg backdrop-blur lg:flex',
        className
      )}
      aria-hidden
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        {icon}
      </span>
      <span>
        <span className="block text-xs font-medium leading-tight text-foreground">{title}</span>
        <span className="mt-0.5 block text-[10.5px] leading-tight text-muted-foreground">{meta}</span>
      </span>
    </div>
  )
}

export function LandingHero({ authed, firstName }: { authed: boolean; firstName: string | null }) {
  const ctaHref = authed ? '/app' : '/signup'
  const secondaryHref = authed ? '/app' : '/login'

  return (
    <section className="relative overflow-hidden pb-16 pt-32 sm:pb-20 sm:pt-40">
      {/* backdrop: pine glow + faint grid */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-grid-faint" />
        <div className="absolute left-1/2 top-[-320px] h-[640px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow-hero),transparent)]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <div className="flex flex-col items-center text-center">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 py-1.5 pl-2 pr-4 text-xs text-muted-foreground shadow-sm backdrop-blur">
              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-accent-foreground">
                <Sparkles className="h-3 w-3" /> New
              </span>
              Auto-refreshing radar for news, papers, jobs & scholarships
            </span>
          </Reveal>

          <Reveal delay={90}>
            <h1 className="mt-6 max-w-3xl font-display text-[2.6rem] leading-[1.06] tracking-tight text-foreground sm:text-6xl md:text-[4.35rem]">
              Keep what you read.
              <br />
              Finish what you start.
              <br />
              <span className="italic text-primary">See what&rsquo;s next.</span>
            </h1>
          </Reveal>

          <Reveal delay={180}>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {authed && firstName
                ? `Welcome back, ${firstName}. Cortex is one calm workspace for your reading, notes, plans and goals — with an AI radar that keeps up with your field for you.`
                : 'Cortex is one calm workspace for your reading, notes, plans and goals — with an AI radar that keeps up with your field, so you can focus on the work only you can do.'}
            </p>
          </Reveal>

          <Reveal delay={260} className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 rounded-full px-7 text-[15px] shadow-md">
              <Link href={ctaHref}>
                {authed ? 'Open your workspace' : 'Build your second brain'}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 rounded-full px-7 text-[15px] bg-card/60 backdrop-blur"
            >
              <Link href={secondaryHref}>{authed ? 'Jump back in' : 'Sign in'}</Link>
            </Button>
          </Reveal>

          <Reveal delay={320}>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Free while in beta · No credit card · Works offline
            </p>
          </Reveal>
        </div>

        {/* product preview */}
        <Reveal delay={200} className="relative mx-auto mt-14 max-w-4xl sm:mt-16">
          <FloatChip
            className="-left-40 top-8"
            delay="0s"
            icon={<BookOpen className="h-4 w-4" />}
            title="Paper added to Library"
            meta="“Attention Is All You Need” · reader ready"
          />
          <FloatChip
            className="-right-36 top-24"
            delay="1.4s"
            icon={<Briefcase className="h-4 w-4" />}
            title="New job match — ML Engineer"
            meta="92% fit · Zurich · sponsorship"
          />
          <FloatChip
            className="-bottom-5 right-10"
            delay="2.6s"
            icon={<Flame className="h-4 w-4" />}
            title="12-day streak"
            meta="Plans on track · 3 reviews due"
          />
          <MockWindow />
        </Reveal>
      </div>
    </section>
  )
}
