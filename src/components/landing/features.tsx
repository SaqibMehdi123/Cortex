'use client'

import { Reveal, SectionHeading } from './landing'
import {
  BookOpen,
  Briefcase,
  CalendarRange,
  ChartLine,
  Command,
  GraduationCap,
  Layers,
  Radar,
  Repeat,
  Share2,
  Target,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Stat strip ───────────────────────────────────────────────────────── */
const STATS = [
  { value: '10', label: 'modules, one coherent workspace' },
  { value: '97+', label: 'sources on the auto-refreshing radar' },
  { value: 'SM-2', label: 'spaced repetition behind every card' },
  { value: '⌘K', label: 'to reach anything, from anywhere' },
]

export function StatStrip() {
  return (
    <section aria-label="Cortex at a glance" className="border-y border-border/70 bg-secondary/40">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-5 py-10 sm:px-8 md:grid-cols-4">
        {STATS.map((s, i) => (
          <Reveal key={s.value} delay={i * 80} className="flex flex-col items-center gap-1 text-center">
            <span className="font-display text-3xl text-primary sm:text-4xl">{s.value}</span>
            <span className="max-w-[180px] text-xs leading-snug text-muted-foreground sm:text-[13px]">
              {s.label}
            </span>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* ── Bento features ────────────────────────────────────────────────────── */

function FeatureCard({
  icon,
  accent,
  title,
  desc,
  className,
  children,
  delay = 0,
}: {
  icon: React.ReactNode
  accent: string
  title: string
  desc: string
  className?: string
  children?: React.ReactNode
  delay?: number
}) {
  return (
    <Reveal delay={delay} className={className}>
      <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] hover:shadow-[0_16px_48px_-20px_rgb(0_0_0/0.18)]">
        <span
          className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl text-[color:var(--accent-ink)]"
          style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)` }}
        >
          {icon}
        </span>
        <h3 className="font-display text-xl leading-snug text-foreground">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{desc}</p>
        {children ? <div className="mt-auto pt-5">{children}</div> : null}
      </div>
    </Reveal>
  )
}

function MiniRow({
  dot,
  title,
  meta,
  chip,
  chipCls,
}: {
  dot: string
  title: string
  meta: string
  chip: string
  chipCls: string
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-background/60 px-3 py-2">
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11.5px] font-medium leading-tight text-foreground">{title}</p>
        <p className="truncate text-[10px] text-muted-foreground">{meta}</p>
      </div>
      <span className={cn('shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase', chipCls)}>
        {chip}
      </span>
    </div>
  )
}

const PINE = 'var(--chart-1)'
const AMBER = 'var(--chart-2)'
const CLAY = 'var(--chart-3)'
const SLATE = 'var(--chart-4)'
const MAUVE = 'var(--chart-5)'

export function BentoFeatures() {
  return (
    <section id="features" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="One workspace, ten tools"
          title={
            <>
              Everything you juggle today, <span className="italic text-primary">finally connected.</span>
            </>
          }
          lede="Notes, reading, planning, learning and career — grouped into a single calm system instead of eight different apps."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Radar — wide */}
          <FeatureCard
            className="sm:col-span-2"
            icon={<Radar className="h-5 w-5" style={{ color: PINE }} />}
            accent={PINE}
            title="AI news radar that refreshes itself"
            desc="A curated digest from 97+ AI sources, fetched automatically and summarized per story — so staying current costs you minutes, not mornings."
            delay={0}
          >
            <div className="flex flex-col gap-1.5">
              <MiniRow
                dot="bg-[var(--chart-1)]"
                title="Open-weights model tops reasoning benchmark"
                meta="The Rundown · AI summary ready"
                chip="News"
                chipCls="text-[var(--chart-2)] border-[color-mix(in_srgb,var(--chart-2)_30%,transparent)] bg-[color-mix(in_srgb,var(--chart-2)_10%,transparent)]"
              />
              <MiniRow
                dot="bg-[var(--chart-1)]"
                title="Efficient scaling laws for sparse MoE"
                meta="arXiv · cs.LG · 3 related papers"
                chip="Paper"
                chipCls="text-[var(--chart-1)] border-[color-mix(in_srgb,var(--chart-1)_30%,transparent)] bg-[color-mix(in_srgb,var(--chart-1)_10%,transparent)]"
              />
            </div>
          </FeatureCard>

          {/* Career — wide */}
          <FeatureCard
            className="sm:col-span-2"
            icon={<Briefcase className="h-5 w-5" style={{ color: AMBER }} />}
            accent={AMBER}
            title="Career pipeline, matched to you"
            desc="Jobs fetched automatically and matched against your profile — plus a live feed of masters & PhD scholarships, all in one tab."
            delay={60}
          >
            <div className="flex flex-col gap-1.5">
              <MiniRow
                dot="bg-[var(--chart-3)]"
                title="Research Intern — Vision · Berlin"
                meta="Matched to your profile · 91% fit"
                chip="Job"
                chipCls="text-[var(--chart-3)] border-[color-mix(in_srgb,var(--chart-3)_30%,transparent)] bg-[color-mix(in_srgb,var(--chart-3)_10%,transparent)]"
              />
              <MiniRow
                dot="bg-[var(--chart-2)]"
                title="DAAD EPOS — development-related postgrad"
                meta="Masters · deadline in 6 weeks"
                chip="Scholarship"
                chipCls="text-[var(--chart-2)] border-[color-mix(in_srgb,var(--chart-2)_30%,transparent)] bg-[color-mix(in_srgb,var(--chart-2)_10%,transparent)]"
              />
            </div>
          </FeatureCard>

          {/* Library */}
          <FeatureCard
            icon={<BookOpen className="h-5 w-5" style={{ color: PINE }} />}
            accent={PINE}
            title="Library & reader"
            desc="Save articles and papers, then read them distraction-free with annotations that stay yours."
            delay={0}
          />
          {/* Plans */}
          <FeatureCard
            icon={<CalendarRange className="h-5 w-5" style={{ color: SLATE }} />}
            accent={SLATE}
            title="Weekly plans"
            desc="Time-block your week in minutes and carry loose ends forward with one click."
            delay={60}
          />
          {/* Goals */}
          <FeatureCard
            icon={<Target className="h-5 w-5" style={{ color: CLAY }} />}
            accent={CLAY}
            title="Goals & milestones"
            desc="Break ambitions into milestones with visible progress that updates as you work."
            delay={120}
          />
          {/* Flashcards */}
          <FeatureCard
            icon={<Layers className="h-5 w-5" style={{ color: MAUVE }} />}
            accent={MAUVE}
            title="Flashcards, SM-2 timed"
            desc="Turn any note into a card. The review schedule adapts so memory sticks for good."
            delay={180}
          />
          {/* Mindmaps */}
          <FeatureCard
            icon={<Share2 className="h-5 w-5" style={{ color: PINE }} />}
            accent={PINE}
            title="Mindmaps"
            desc="Drag ideas into spatial maps and watch scattered thoughts become structure."
            delay={0}
          />
          {/* Analytics */}
          <FeatureCard
            icon={<ChartLine className="h-5 w-5" style={{ color: AMBER }} />}
            accent={AMBER}
            title="Analytics"
            desc="Streaks, reading pace and review load — gentle signals, never guilt trips."
            delay={60}
          />
          {/* Fast capture */}
          <FeatureCard
            icon={<Zap className="h-5 w-5" style={{ color: CLAY }} />}
            accent={CLAY}
            title="Capture in a heartbeat"
            desc="A global quick-capture and ⌘K command bar put every thought one keystroke from safety."
            delay={120}
          />
          {/* Offline */}
          <FeatureCard
            icon={<Repeat className="h-5 w-5" style={{ color: SLATE }} />}
            accent={SLATE}
            title="Synced & offline-ready"
            desc="Laptop and phone stay in step; read and review even when the Wi-Fi doesn't."
            delay={180}
          />
        </div>

        {/* scholarship callout strip */}
        <Reveal delay={120} className="mt-4">
          <div className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-gradient-to-br from-accent/70 via-card to-card p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--chart-2)_16%,transparent)]">
                <GraduationCap className="h-5 w-5" style={{ color: AMBER }} />
              </span>
              <div>
                <h3 className="font-display text-lg text-foreground">For students & researchers</h3>
                <p className="mt-0.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  The Career tab tracks masters & PhD scholarships alongside job openings — deadlines,
                  funding notes and eligibility, surfaced before they close.
                </p>
              </div>
            </div>
            <a
              href="#workflow"
              className="shrink-0 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              See how it fits together
            </a>
          </div>
        </Reveal>

        <Reveal delay={80} className="mt-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Command className="h-3.5 w-3.5" />
          <span>Plus a keyboard-first command bar, focus timer and AI copilot dock — woven through every view.</span>
        </Reveal>
      </div>
    </section>
  )
}
