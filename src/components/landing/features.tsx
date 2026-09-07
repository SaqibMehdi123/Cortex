'use client'

import { useEffect, useRef, useState } from 'react'
import { Reveal, SectionHeader } from './landing'
import { spotlightHandlers, useCountUp } from './motion'
import { BRAND_LOGOS, BrandMark } from './brand-logos'
import {
  BookOpen,
  Briefcase,
  CalendarRange,
  ChartLine,
  Command,
  Layers,
  Radar,
  Share2,
  Target,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Sources marquee — real platform marks, monochrome ────────────────── */

export function SourcesMarquee() {
  const row = [...BRAND_LOGOS, ...BRAND_LOGOS]
  return (
    <section aria-label="Sources" className="mt-2 border-y border-border/70 bg-secondary/30">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <Reveal>
          <p className="text-center font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
            The radar reads 97+ sources, so you don&rsquo;t have to
          </p>
        </Reveal>
        <Reveal delay={100}>
          <div className="marquee marquee-mask mt-6 overflow-hidden">
            <div className="marquee-track flex w-max items-center gap-12 pr-12">
              {row.map((logo, i) => (
                <span
                  key={`${logo.title}-${i}`}
                  className="flex items-center gap-2 text-muted-foreground/60 transition-colors duration-300 hover:text-foreground"
                  title={logo.title}
                >
                  <BrandMark logo={logo} size={17} />
                  <span className="whitespace-nowrap text-[13px] font-medium">{logo.title}</span>
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ── Feature index — editorial rows, hairline dividers ────────────────── */

interface FeatureRow {
  icon: React.ReactNode
  title: string
  desc: string
  tag: string
}

const GROUPS: { label: string; rows: FeatureRow[] }[] = [
  {
    label: 'Workspace',
    rows: [
      {
        icon: <BookOpen className="h-4 w-4" />,
        title: 'Library & reader',
        desc: 'Save papers and articles, read them clean, and keep every highlight searchable.',
        tag: 'reader',
      },
      {
        icon: <CalendarRange className="h-4 w-4" />,
        title: 'Weekly plans',
        desc: 'Time-block the week in minutes; unfinished work carries over in one click.',
        tag: 'weekly',
      },
      {
        icon: <Target className="h-4 w-4" />,
        title: 'Goals & milestones',
        desc: 'Progress rings that fill from real work — not manual updates.',
        tag: 'progress',
      },
      {
        icon: <Zap className="h-4 w-4" />,
        title: 'Instant capture',
        desc: 'A global quick-capture plus ⌘K means no thought ever escapes.',
        tag: '⌘K',
      },
    ],
  },
  {
    label: 'Intelligence',
    rows: [
      {
        icon: <Radar className="h-4 w-4" />,
        title: 'AI news radar',
        desc: '97+ sources auto-refreshed every few hours, each story summarized before you open it.',
        tag: 'auto',
      },
      {
        icon: <Briefcase className="h-4 w-4" />,
        title: 'Career radar',
        desc: 'Jobs matched to your profile, plus a masters & PhD scholarship feed — fetched for you.',
        tag: 'match',
      },
      {
        icon: <Share2 className="h-4 w-4" />,
        title: 'Mindmaps',
        desc: 'Drag notes into spatial maps and watch structure emerge from the mess.',
        tag: 'canvas',
      },
      {
        icon: <Layers className="h-4 w-4" />,
        title: 'Flashcards',
        desc: 'Cards grown from whatever you read, scheduled by the SM-2 algorithm.',
        tag: 'sm-2',
      },
      {
        icon: <ChartLine className="h-4 w-4" />,
        title: 'Analytics',
        desc: 'Streaks, pace and review load. Signal, not guilt.',
        tag: 'stats',
      },
    ],
  },
]

function Row({ row, index }: { row: FeatureRow; index: number }) {
  return (
    <div
      {...spotlightHandlers()}
      className="spot group flex items-center gap-4 border-b border-border/70 py-4 transition-colors first:pt-0 hover:bg-muted/30 sm:gap-5 sm:px-3"
    >
      <span className="w-6 shrink-0 font-mono text-[10.5px] text-muted-foreground/60">
        {String(index + 1).padStart(2, '0')}
      </span>
      <span className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground">
        {row.icon}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[14.5px] font-medium tracking-[-0.01em] text-foreground">{row.title}</h3>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{row.desc}</p>
      </div>
      <span className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground sm:block">
        {row.tag}
      </span>
    </div>
  )
}

export function FeatureIndex() {
  let n = 0
  return (
    <section id="platform" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeader
          index="01"
          label="Platform"
          title={<>Ten tools that used to be ten apps.</>}
          lede="Everything below ships in one account, syncs across your devices and works offline."
        />

        <div className="mt-12 grid gap-x-12 gap-y-12 lg:grid-cols-2">
          {GROUPS.map((g, gi) => (
            <Reveal key={g.label} delay={gi * 90}>
              <div>
                <div className="mb-2 flex items-baseline justify-between border-b border-foreground/20 pb-2">
                  <h3 className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground">
                    {g.label}
                  </h3>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {String(g.rows.length).padStart(2, '0')} modules
                  </span>
                </div>
                <div>
                  {g.rows.map((r) => (
                    <Row key={r.title} row={r} index={n++} />
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* scholarship note — inline strip, no cute card */}
        <Reveal delay={80}>
          <p className="mt-10 flex items-center gap-2 border-t border-border pt-6 text-[13px] text-muted-foreground">
            <Command className="h-3.5 w-3.5" />
            Plus a focus timer, AI copilot dock and command bar — woven through every view, not bolted on.
          </p>
        </Reveal>
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
  const counted = useCountUp(value ?? 0, started && value !== undefined)
  return (
    <div className="flex flex-col items-center gap-1 py-6 sm:py-8">
      <span className="font-mono text-[1.7rem] tracking-tight text-foreground sm:text-4xl">
        {plain ?? counted}
        {suffix}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

export function StatLine() {
  const ref = useRef<HTMLDivElement>(null)
  const [started, setStarted] = useState(false)

  useEffect(() => {
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
