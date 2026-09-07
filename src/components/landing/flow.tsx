'use client'

import { useEffect, useRef, useState } from 'react'
import { Reveal, SectionHeader } from './landing'
import { spotlightHandlers, useTypewriterLoop } from './motion'
import { BrainCircuit, CornerDownRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Workflow — numbered steps, line draws on scroll ──────────────────── */

const STEPS = [
  {
    n: '01',
    title: 'Capture',
    desc: 'Clip it the second it appears — quick capture and ⌘K from anywhere.',
  },
  {
    n: '02',
    title: 'Understand',
    desc: 'Reader mode, plus a copilot that has read everything you saved.',
  },
  {
    n: '03',
    title: 'Retain',
    desc: 'Cards and maps on an SM-2 schedule. Memory that compounds.',
  },
  {
    n: '04',
    title: 'Act',
    desc: 'Plan the week; let the radar hand you jobs and scholarships.',
  },
]

function useInView<T extends HTMLElement>(threshold = 0.35) {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])
  return { ref, seen }
}

export function Workflow() {
  const { ref, seen } = useInView<HTMLDivElement>()

  return (
    <section id="workflow" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeader
          index="02"
          label="Workflow"
          title={<>A loop, not a graveyard of notes.</>}
          lede="Most tools stop at storage. Cortex closes the loop from thought to finished work."
        />

        <div ref={ref} className="relative mt-14">
          {/* connecting line — draws itself when scrolled into view */}
          <div
            aria-hidden
            className={cn(
              'draw-line absolute left-0 right-0 top-[9px] hidden h-px bg-gradient-to-r from-[var(--chart-1)] via-[var(--chart-2)] to-[var(--chart-3)] opacity-60 lg:block',
              seen && 'drawn'
            )}
          />
          <ol className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 110}>
                <li>
                  <span
                    className={cn(
                      'relative z-10 block h-[19px] w-[19px] rounded-full border-2 bg-background transition-colors duration-500',
                      seen ? 'border-[var(--chart-1)]' : 'border-border'
                    )}
                  />
                  <p className="mt-5 font-mono text-[10.5px] tracking-[0.18em] text-muted-foreground">
                    {s.n}
                  </p>
                  <h3 className="mt-1.5 text-[17px] font-semibold tracking-[-0.015em] text-foreground">
                    {s.title}
                  </h3>
                  <p className="mt-1.5 max-w-[240px] text-[13.5px] leading-relaxed text-muted-foreground">
                    {s.desc}
                  </p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

/* ── Copilot — live typewriter conversation ───────────────────────────── */

const PROMPTS = [
  'What did I read this month about attention efficiency?',
  'Summarize this week’s saved papers',
  'Turn my thesis notes into 4 flashcards',
]

const REPLIES: Record<string, string> = {
  [PROMPTS[0]]:
    'Three papers and two articles. The through-line is sparse & linear attention. The clearest entry is “Efficient Attention at Scale” — want the two-minute version?',
  [PROMPTS[1]]:
    'Five papers this week. Two are follow-ups on the MoE scaling law you saved in August — I flagged both for Friday’s review.',
  [PROMPTS[2]]:
    'Done — 4 cards queued for this evening, scheduled by SM-2 and linked back to the source note.',
}

const POINTS = [
  {
    title: 'Grounded in your library',
    desc: 'Answers come from your notes and papers, with links back to the source — not the open internet.',
  },
  {
    title: 'One dock, every view',
    desc: 'Slide it open beside whatever you’re doing: reading, planning, reviewing.',
  },
  {
    title: 'From question to draft',
    desc: 'Summaries, outlines, rewrites — dropped straight into your documents.',
  },
]

export function CopilotSection() {
  const { text, phase } = useTypewriterLoop(PROMPTS)
  const reply = REPLIES[text]

  return (
    <section id="copilot" className="scroll-mt-20 border-t border-border/70 py-20 sm:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHeader
            index="03"
            label="Copilot"
            title={<>An assistant that read everything you did.</>}
            lede="Not a chatbot bolted onto a file list — a dock that knows your library, plans and goals."
          />
          <div className="mt-10 flex flex-col">
            {POINTS.map((p, i) => (
              <Reveal key={p.title} delay={i * 90}>
                <div className="flex gap-4 border-b border-border/70 py-4 first:pt-0 last:border-0">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--chart-1)]" />
                  <div>
                    <h3 className="text-[14.5px] font-medium text-foreground">{p.title}</h3>
                    <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted-foreground">
                      {p.desc}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal delay={140}>
          <div
            {...spotlightHandlers()}
            className="spot relative overflow-hidden rounded-xl border border-border bg-card shadow-[0_30px_90px_-30px_rgb(0_0_0/0.3)]"
          >
            {/* header */}
            <div className="flex items-center gap-2 border-b border-border bg-background/70 px-4 py-2.5">
              <BrainCircuit className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                copilot
              </span>
              <span className="ml-auto flex items-center gap-1.5 rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                <span className="h-1 w-1 rounded-full bg-[var(--chart-1)]" />
                grounded
              </span>
            </div>

            {/* conversation */}
            <div className="flex min-h-[280px] flex-col gap-3 p-4 sm:p-5">
              <div className="max-w-[88%] self-end rounded-lg rounded-br-sm bg-primary px-3.5 py-2.5 text-[12.5px] leading-relaxed text-primary-foreground">
                {text}
                <span className="type-caret ml-0.5 inline-block h-3.5 w-[2px] translate-y-[2px] bg-current" />
              </div>

              <div
                className={cn(
                  'max-w-[88%] self-start rounded-lg rounded-bl-sm border border-border bg-background/70 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-foreground transition-all duration-500',
                  reply ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-1 opacity-0'
                )}
              >
                {reply ?? ''}
              </div>

              <div className="mt-auto flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-[12px] text-muted-foreground">
                <CornerDownRight className="h-3.5 w-3.5" />
                Ask anything you&rsquo;ve saved
                <span className="ml-auto rounded border border-border px-1 font-mono text-[9px]">
                  ↵
                </span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
