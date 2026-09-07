'use client'

import { useEffect, useRef, useState } from 'react'
import { Reveal, SectionHeader } from './landing'
import { spotlightHandlers, useTypewriterLoop } from './motion'
import { BrainCircuit, CalendarCheck2, CornerDownRight, Layers, ScanSearch, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Workflow — scroll-driven timeline; the line fills as you scroll ──── */

const STEPS = [
  {
    n: '01',
    icon: Zap,
    title: 'Capture',
    desc: 'Clip it the second it appears. Quick capture and ⌘K from anywhere — no context switch, no friction.',
  },
  {
    n: '02',
    icon: ScanSearch,
    title: 'Understand',
    desc: 'Reader mode plus a copilot that has read everything you saved. Ask it, summarize with it, connect through it.',
  },
  {
    n: '03',
    icon: Layers,
    title: 'Retain',
    desc: 'Flashcards and mindmaps on an SM-2 schedule. Memory that compounds instead of rotting in a folder.',
  },
  {
    n: '04',
    icon: CalendarCheck2,
    title: 'Act',
    desc: 'Plan the week, run the focus timer, and let the radar hand you the right jobs and scholarships.',
  },
]

const FLOW_ACCENTS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-5)']

export function Workflow() {
  const trackRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(-1)

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    let raf = 0
    const update = () => {
      raf = 0
      const r = track.getBoundingClientRect()
      // a focal line ~62% down the viewport drives the fill
      const focus = window.innerHeight * 0.62
      const p = Math.min(1, Math.max(0, (focus - r.top) / r.height))
      track.style.setProperty('--flow', p.toFixed(4))

      let idx = -1
      track.querySelectorAll<HTMLElement>('[data-node]').forEach((node) => {
        const nr = node.getBoundingClientRect()
        const passed = nr.top + nr.height / 2 <= focus
        node.classList.toggle('node-on', passed)
        if (passed) idx = Number(node.dataset.node)
      })
      setActive((prev) => (prev === idx ? prev : idx))
    }

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <section id="workflow" className="relative scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeader
          index="02"
          label="Workflow"
          accent="var(--chart-2)"
          title={
            <>
              A loop, not a{' '}
              <em className="font-display italic text-[var(--chart-2)]">graveyard of notes.</em>
            </>
          }
          lede="Most tools stop at storage. Cortex closes the loop from first thought to finished work — scroll and watch it run."
        />

        <div ref={trackRef} className="relative mt-16 lg:mt-24" style={{ ['--flow' as string]: 0 }}>
          {/* the spine */}
          <div
            aria-hidden
            className="absolute bottom-2 left-[21px] top-2 w-px bg-border lg:left-1/2 lg:-translate-x-1/2"
          >
            <div
              className="flow-fill h-full w-full origin-top"
              style={{ transform: 'scaleY(var(--flow, 0))' }}
            />
          </div>

          <ol className="flex flex-col gap-12 lg:gap-4">
            {STEPS.map((s, i) => {
              const even = i % 2 === 0
              const accent = FLOW_ACCENTS[i % FLOW_ACCENTS.length]
              const on = active >= i
              return (
                <li key={s.n} className="relative lg:grid lg:min-h-[210px] lg:grid-cols-2 lg:gap-28">
                  {/* node on the spine */}
                  <span
                    data-node={i}
                    aria-hidden
                    className="flow-node absolute left-0 top-1 z-10 lg:left-1/2 lg:-translate-x-1/2"
                    style={{ ['--node-accent' as string]: accent }}
                  >
                    <span className="flow-node-core" />
                  </span>

                  {/* step card — alternates sides of the spine */}
                  <Reveal
                    className={cn(
                      'pl-16 lg:pl-0',
                      even ? 'lg:col-start-1' : 'lg:col-start-2'
                    )}
                  >
                    <div
                      {...spotlightHandlers()}
                      className={cn(
                        'spot tool-card relative max-w-xl overflow-hidden rounded-2xl border bg-card p-6 transition-all duration-500 sm:p-7',
                        on
                          ? 'border-transparent shadow-[0_18px_50px_-20px_rgb(0_0_0/0.25)]'
                          : 'border-border opacity-[0.82]'
                      )}
                      style={
                        {
                          ['--tool-accent' as string]: accent,
                          ...(on
                            ? {
                                borderColor: `color-mix(in srgb, ${accent} 42%, transparent)`,
                                boxShadow: `0 18px 50px -20px color-mix(in srgb, ${accent} 45%, transparent)`,
                              }
                            : {}),
                        } as React.CSSProperties
                      }
                    >
                      <span aria-hidden className="tool-glow" />
                      <div
                        className={cn(
                          'flex items-center gap-4',
                          even && 'lg:flex-row-reverse lg:text-right'
                        )}
                      >
                        <span
                          className="tool-tile inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border"
                        >
                          <s.icon className="h-[22px] w-[22px]" />
                        </span>
                        <div className={cn(even && 'lg:flex lg:flex-col lg:items-end')}>
                          <p
                            className="font-mono text-[11px] font-semibold tracking-[0.22em] tabular-nums"
                            style={{ color: accent }}
                          >
                            STEP {s.n}
                          </p>
                          <h3 className="font-display text-[1.7rem] font-medium leading-tight tracking-[-0.02em] text-foreground">
                            {s.title}
                          </h3>
                        </div>
                      </div>
                      <p
                        className={cn(
                          'mt-3 text-[14.5px] leading-relaxed text-muted-foreground',
                          even && 'lg:text-right'
                        )}
                      >
                        {s.desc}
                      </p>
                    </div>
                  </Reveal>
                </li>
              )
            })}
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
    <section id="copilot" className="relative scroll-mt-20 border-y border-border/70 bg-secondary/25 py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-16 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
        <div>
          <SectionHeader
            index="03"
            label="Copilot"
            accent="var(--chart-5)"
            title={
              <>
                An assistant that read{' '}
                <em className="font-display italic text-[var(--chart-5)]">
                  everything you did.
                </em>
              </>
            }
            lede="Not a chatbot bolted onto a file list — a dock that knows your library, plans and goals."
          />
          <div className="mt-10 flex flex-col">
            {POINTS.map((p, i) => (
              <Reveal key={p.title} delay={i * 90}>
                <div className="flex gap-4 border-b border-border/70 py-4 first:pt-0 last:border-0">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--chart-5)]" />
                  <div>
                    <h3 className="text-[15.5px] font-medium text-foreground">{p.title}</h3>
                    <p className="mt-0.5 text-[14.5px] leading-relaxed text-muted-foreground">
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
            className="spot relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_30px_90px_-30px_rgb(0_0_0/0.3)]"
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
            <div className="flex min-h-[290px] flex-col gap-3 p-4 sm:p-5">
              {text ? (
                <div className="max-w-[88%] self-end rounded-lg rounded-br-sm bg-primary px-3.5 py-2.5 text-[13px] leading-relaxed text-primary-foreground">
                  {text}
                  <span className="type-caret ml-0.5 inline-block h-3.5 w-[2px] translate-y-[2px] bg-current" />
                </div>
              ) : (
                <div className="flex h-[46px] items-center justify-end">
                  <span className="type-caret inline-block h-4 w-[2px] bg-muted-foreground/40" />
                </div>
              )}

              <div
                className={cn(
                  'max-w-[88%] self-start rounded-lg rounded-bl-sm border border-border bg-background/70 px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground transition-all duration-500',
                  reply ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-1 opacity-0'
                )}
              >
                {reply ?? ''}
              </div>

              <div className="mt-auto flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-[12.5px] text-muted-foreground">
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
