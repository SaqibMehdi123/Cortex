'use client'

import { FaBolt, FaBookOpen, FaBriefcase, FaCalendarWeek, FaChartLine, FaCrosshairs, FaLayerGroup, FaShareNodes, FaTerminal, FaTowerBroadcast } from 'react-icons/fa6'
import React from 'react'
import { Reveal, SectionHeader } from './landing'
import { spotlightHandlers, useCountUp } from './motion'
import { BRAND_LOGOS, BrandMark } from './brand-logos'
import { cn } from '@/lib/utils'

/* ── Sources marquee — real platform marks, monochrome ────────────────── */

export function SourcesMarquee() {
  const row = [...BRAND_LOGOS, ...BRAND_LOGOS]
  return (
    <section aria-label="Sources" className="mt-2 border-y border-border/70 bg-secondary/30">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <Reveal>
          <p className="text-center text-[12.5px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            The radar reads 97+ sources, so you don&rsquo;t have to
          </p>
        </Reveal>
        <Reveal delay={100}>
          <div className="marquee marquee-mask mt-7 overflow-hidden">
            <div className="marquee-track flex w-max items-center gap-12 pr-12">
              {row.map((logo, i) => (
                <span
                  key={`${logo.title}-${i}`}
                  className="flex items-center gap-2.5 text-muted-foreground/55 transition-colors duration-300 hover:text-foreground"
                  title={logo.title}
                >
                  <BrandMark logo={logo} size={19} />
                  <span className="whitespace-nowrap text-[14px] font-medium">{logo.title}</span>
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ── Platform bento — ten tools as living cards ───────────────────────── */

interface Tool {
  icon: React.ReactNode
  title: string
  desc: string
  tag: string
  accent: string
  span: string // tailwind col-span classes
  featured?: 'radar' | 'career'
}

const TOOLS: Tool[] = [
  {
    icon: <FaTowerBroadcast className="h-[22px] w-[22px]" />,
    title: 'AI news radar',
    desc: '97+ sources re-read every few hours. Each story lands pre-summarized, ranked by what it changes for you.',
    tag: 'auto-refresh',
    accent: 'var(--chart-1)',
    span: 'sm:col-span-2 lg:col-span-3',
    featured: 'radar',
  },
  {
    icon: <FaBriefcase className="h-[22px] w-[22px]" />,
    title: 'Career radar',
    desc: 'Jobs matched to your profile, plus a live masters & PhD scholarship feed.',
    tag: 'match',
    accent: 'var(--chart-3)',
    span: 'sm:col-span-2 lg:col-span-3',
    featured: 'career',
  },
  {
    icon: <FaBookOpen className="h-[22px] w-[22px]" />,
    title: 'Library & reader',
    desc: 'Save papers and articles, read them clean, keep every highlight searchable.',
    tag: 'reader',
    accent: 'var(--chart-2)',
    span: 'lg:col-span-2',
  },
  {
    icon: <FaCalendarWeek className="h-[22px] w-[22px]" />,
    title: 'Weekly plans',
    desc: 'Time-block the week in minutes; unfinished work carries over in one click.',
    tag: 'weekly',
    accent: 'var(--chart-4)',
    span: 'lg:col-span-2',
  },
  {
    icon: <FaBolt className="h-[22px] w-[22px]" />,
    title: 'Instant capture',
    desc: 'A global quick-capture plus ⌘K means no thought ever escapes.',
    tag: '⌘K',
    accent: 'var(--chart-5)',
    span: 'lg:col-span-2',
  },
  {
    icon: <FaCrosshairs className="h-[22px] w-[22px]" />,
    title: 'Goals & milestones',
    desc: 'Progress rings that fill from real work — not manual updates.',
    tag: 'progress',
    accent: 'var(--chart-1)',
    span: 'lg:col-span-2',
  },
  {
    icon: <FaShareNodes className="h-[22px] w-[22px]" />,
    title: 'Mindmaps',
    desc: 'Drag notes into spatial maps and watch structure emerge from the mess.',
    tag: 'canvas',
    accent: 'var(--chart-2)',
    span: 'lg:col-span-2',
  },
  {
    icon: <FaLayerGroup className="h-[22px] w-[22px]" />,
    title: 'Flashcards',
    desc: 'Cards grown from whatever you read, scheduled by the SM-2 algorithm.',
    tag: 'sm-2',
    accent: 'var(--chart-3)',
    span: 'lg:col-span-2',
  },
  {
    icon: <FaChartLine className="h-[22px] w-[22px]" />,
    title: 'Analytics',
    desc: 'Streaks, pace and review load. Signal, not guilt.',
    tag: 'stats',
    accent: 'var(--chart-4)',
    span: 'lg:col-span-3',
  },
  {
    icon: <FaTerminal className="h-[22px] w-[22px]" />,
    title: 'Command bar',
    desc: 'Focus timer, copilot dock and ⌘K — woven through every view, not bolted on.',
    tag: 'system-wide',
    accent: 'var(--chart-5)',
    span: 'lg:col-span-3',
  },
]

/* Featured visuals — small live scenes instead of dead space */

function RadarVisual() {
  return (
    <div aria-hidden className="relative mx-auto mt-7 h-32 w-32">
      <span className="radar-ring absolute inset-0" />
      <span className="radar-ring absolute inset-[18%]" />
      <span className="radar-ring absolute inset-[36%]" />
      <span className="radar-sweep absolute inset-0" />
      <span className="radar-blip left-[24%] top-[30%]" style={{ animationDelay: '0.4s' }} />
      <span className="radar-blip left-[62%] top-[22%]" style={{ animationDelay: '1.3s' }} />
      <span className="radar-blip left-[55%] top-[64%]" style={{ animationDelay: '2.1s' }} />
      <span className="radar-crosshair" />
    </div>
  )
}

const MATCHES = [
  { role: 'ML Engineer — Zürich', fit: 0.91, note: 'visa sponsored' },
  { role: 'Research Asst — ETH', fit: 0.84, note: 'funded' },
  { role: 'Data Scientist — Berlin', fit: 0.76, note: 'hybrid' },
]

function CareerVisual() {
  return (
    <div aria-hidden className="mt-7 flex flex-col gap-3">
      {MATCHES.map((m, i) => (
        <div key={m.role} className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-[12.5px] font-medium text-foreground">{m.role}</p>
              <span
                className="shrink-0 font-mono text-[11px] font-semibold tabular-nums"
                style={{ color: 'var(--chart-3)' }}
              >
                {Math.round(m.fit * 100)}%
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="bar-fill h-full rounded-full"
                style={{
                  ['--w' as string]: m.fit,
                  ['--wd' as string]: `${0.25 + i * 0.18}s`,
                  background: 'var(--chart-3)',
                }}
              />
            </div>
          </div>
          <span className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
            {m.note}
          </span>
        </div>
      ))}
    </div>
  )
}

function ToolCard({ tool, index }: { tool: Tool; index: number }) {
  return (
    <div
      {...spotlightHandlers()}
      className={cn(
        'tool-card spot group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-7'
      )}
      style={{ ['--tool-accent' as string]: tool.accent }}
    >
      {/* hover corner glow */}
      <span aria-hidden className="tool-glow" />

      <div className="flex items-start justify-between gap-3">
        <span className="tool-tile inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border">
          {tool.icon}
        </span>
        <span className="flex items-center gap-2">
          <span className="font-display text-[15px] font-medium italic leading-none tracking-[-0.01em] text-foreground/60 tabular-nums">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="tool-tag rounded-full border px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em]">
            {tool.tag}
          </span>
        </span>
      </div>

      <h3 className="mt-5 text-[17px] font-semibold tracking-[-0.015em] text-foreground">
        {tool.title}
      </h3>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{tool.desc}</p>

      {tool.featured === 'radar' ? <RadarVisual /> : null}
      {tool.featured === 'career' ? <CareerVisual /> : null}
    </div>
  )
}

export function PlatformBento() {
  return (
    <section id="platform" className="relative scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeader
          index="01"
          label="Platform"
          accent="var(--chart-1)"
          title={
            <>
              Ten tools that used to be{' '}
              <em className="font-display italic text-[var(--chart-1)]">ten apps.</em>
            </>
          }
          lede="One account, every module unlocked, synced across devices and ready offline. Stop paying rent on chaos."
        />

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-6">
          {TOOLS.map((t, i) => (
            <Reveal key={t.title} delay={(i % 3) * 90} className={cn('h-full', t.span)}>
              <ToolCard tool={t} index={i} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Stat line with count-up ──────────────────────────────────────────── */

function StatCell({
  value,
  suffix,
  plain,
  label,
  started,
}: {
  value?: number
  suffix?: string
  plain?: string
  label: string
  started: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-8 sm:py-10">
      <StatNumber value={value} suffix={suffix} plain={plain} started={started} />
      <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

function StatNumber({
  value,
  suffix,
  plain,
  started,
}: {
  value?: number
  suffix?: string
  plain?: string
  started: boolean
}) {
  const counted = useCountUp(value ?? 0, started && value !== undefined)
  return (
    <span className="font-display text-[2.5rem] font-medium leading-none tracking-[-0.02em] text-foreground tabular-nums sm:text-[3.4rem]">
      {plain ?? counted}
      {suffix ? <span className="text-[var(--chart-1)]">{suffix}</span> : null}
    </span>
  )
}


export function StatLine() {
  const ref = React.useRef<HTMLDivElement>(null)
  const [started, setStarted] = React.useState(false)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setStarted(true)
          io.disconnect()
        }
      },
      { threshold: 0.4 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <section aria-label="Numbers" className="border-y border-border/70 bg-secondary/30">
      <div ref={ref} className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid grid-cols-2 divide-x divide-border/70 md:grid-cols-4">
          <StatCell value={97} suffix="+" label="sources tracked" started={started} />
          <StatCell value={10} label="modules included" started={started} />
          <StatCell plain="SM-2" label="memory engine" started={started} />
          <StatCell plain="3h" label="radar refresh" started={started} />
        </div>
      </div>
    </section>
  )
}
