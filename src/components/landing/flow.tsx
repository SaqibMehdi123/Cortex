'use client'

import { Reveal, SectionHeading } from './landing'
import {
  ArrowDownRight,
  BrainCircuit,
  StickyNote,
  CalendarCheck2,
  Layers,
  ScanSearch,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Workflow: capture → understand → retain → act ────────────────────── */

const STEPS = [
  {
    icon: StickyNote,
    step: '01',
    title: 'Capture',
    desc: 'Clip ideas the second they strike — quick capture and ⌘K put every thought somewhere safe before it evaporates.',
  },
  {
    icon: ScanSearch,
    step: '02',
    title: 'Understand',
    desc: 'Read distraction-free, ask the copilot about anything you saved, and let AI summarize dense papers into plain language.',
  },
  {
    icon: Layers,
    step: '03',
    title: 'Retain',
    desc: 'Grow flashcards and mindmaps from your notes. SM-2 schedules the reviews, so what you learn actually sticks.',
  },
  {
    icon: CalendarCheck2,
    step: '04',
    title: 'Act',
    desc: 'Plan the week, advance your goals, and let the career radar deliver matched jobs and scholarships while you work.',
  },
]

export function Workflow() {
  return (
    <section id="workflow" className="scroll-mt-24 border-y border-border/70 bg-secondary/40 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="A workflow, not a warehouse"
          title={
            <>
              From fleeting thought to <span className="italic text-primary">finished work.</span>
            </>
          }
          lede="Most tools stop at storage. Cortex is built around the loop that actually compounds: capture, understand, retain, act."
        />

        <ol className="relative mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {/* connecting line (desktop) */}
          <div
            aria-hidden
            className="absolute left-0 right-0 top-6 hidden h-px bg-[linear-gradient(to_right,transparent,var(--border)_12%,var(--border)_88%,transparent)] lg:block"
          />
          {STEPS.map((s, i) => (
            <Reveal key={s.step} delay={i * 110} as="div" className="relative">
              <li className="flex flex-col items-start gap-4 lg:pt-14">
                <span className="relative z-10 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card text-primary shadow-sm">
                  <s.icon className="h-5 w-5" />
                </span>
                <div>
                  <span className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
                    {s.step}
                  </span>
                  <h3 className="mt-1 font-display text-2xl text-foreground">{s.title}</h3>
                  <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ── Copilot split section ─────────────────────────────────────────────── */

const COPILOT_POINTS = [
  {
    title: 'Grounded in your own notes',
    desc: 'Answers come from your library and documents — with links back to the source, not the open internet.',
  },
  {
    title: 'One dock, every view',
    desc: 'Slide the copilot open beside whatever you are doing — reading a paper, planning the week, reviewing cards.',
  },
  {
    title: 'From question to draft',
    desc: 'Ask for a summary, an outline or a rewrite — then drop it straight into your documents.',
  },
]

const CHAT = [
  {
    role: 'user' as const,
    text: 'What did I read this month about attention efficiency?',
  },
  {
    role: 'cortex' as const,
    text: 'Three papers and two articles. The through-line: sparse and linear attention dominate your recent saves. The clearest intro is “Efficient Attention at Scale” — want a two-minute summary?',
  },
  {
    role: 'user' as const,
    text: 'Yes — and turn it into 4 flashcards.',
  },
  {
    role: 'cortex' as const,
    text: 'Done. Summary added to your Library, and 4 cards are queued for this evening’s review.',
  },
]

export function CopilotSection() {
  return (
    <section id="copilot" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHeading
            align="left"
            eyebrow="Meet your copilot"
            title={
              <>
                An assistant that has <span className="italic text-primary">read everything you have.</span>
              </>
            }
            lede="The copilot dock knows your library, your plans and your goals — so its answers start from your context, not a blank page."
          />
          <div className="mt-8 flex flex-col gap-6">
            {COPILOT_POINTS.map((p, i) => (
              <Reveal key={p.title} delay={i * 90} className="flex gap-4">
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-[15px] font-medium text-foreground">{p.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* chat mockup */}
        <Reveal delay={140}>
          <div className="relative">
            <div
              aria-hidden
              className="absolute -inset-6 rounded-[2rem] bg-[radial-gradient(closest-side,var(--glow-hero),transparent)]"
            />
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_80px_-24px_rgb(0_0_0/0.22)]">
              <div className="flex items-center gap-2 border-b border-border bg-background/60 px-4 py-3">
                <BrainCircuit className="h-4 w-4 text-primary" />
                <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
                  Copilot dock
                </span>
                <span className="ml-auto flex items-center gap-1.5 rounded-full bg-accent px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-accent-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--chart-1)]" /> grounded
                </span>
              </div>
              <div className="flex flex-col gap-3 p-4 sm:p-5">
                {CHAT.map((m, i) => (
                  <div
                    key={i}
                    className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed',
                        m.role === 'user'
                          ? 'rounded-br-md bg-primary text-primary-foreground'
                          : 'rounded-bl-md border border-border bg-background/70 text-foreground'
                      )}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
                <div className="mt-1 flex items-center gap-2 rounded-full border border-border bg-background/70 px-3.5 py-2 text-[12px] text-muted-foreground">
                  <ArrowDownRight className="h-3.5 w-3.5" />
                  Ask about anything you’ve saved…
                  <span className="ml-auto font-mono text-[10px]">↵</span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
