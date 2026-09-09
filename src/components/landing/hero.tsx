'use client'

import { useEffect, useState } from 'react'
import { FaArrowRight } from 'react-icons/fa6'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Reveal } from './landing'

/* ── The front page — typography is the hero ──────────────────────────── */

const ROTATING_WORDS = ['papers.', 'the news.', 'job leads.', 'grants.', 'your reading.']

const PRODUCT_INDEX = [
  { n: '01', name: 'Radar', desc: '97+ sources, ranked for you' },
  { n: '02', name: 'Library', desc: 'read, highlight, remember' },
  { n: '03', name: 'Notes', desc: 'recall cards that stick' },
  { n: '04', name: 'Plans', desc: 'goals with a focus timer' },
] as const

export function LandingHero({ authed, firstName }: { authed: boolean; firstName: string | null }) {
  const [word, setWord] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setWord((i) => (i + 1) % ROTATING_WORDS.length), 2600)
    return () => clearInterval(id)
  }, [])

  return (
    <section className="relative overflow-hidden pb-16 pt-28 sm:pb-24 sm:pt-36">
      {/* backdrop: faint blueprint grid + a quiet wash */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-grid-faint" />
        <div
          className="absolute left-1/2 top-[-20%] h-[560px] w-[860px] -translate-x-1/2 rounded-full"
          style={{
            background: 'radial-gradient(50% 50% at 50% 50%, var(--glow-hero), transparent 72%)',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        {/* masthead — nameplate between hairlines */}
        <Reveal>
          <div className="flex items-center justify-between gap-4 border-y border-border/80 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:text-[10.5px]">
            <span>Cortex — Knowledge-work OS</span>
            <span className="hidden md:inline">Reading · Notes · Plans · Radar</span>
            <span>Vol. 01 — Daily</span>
          </div>
        </Reveal>

        {/* display headline — each line rises out of its own clipped mask */}
        <h1
          aria-label="One calm page for papers, the news, job leads, grants, and your reading."
          className="mt-10 font-display text-[clamp(2.75rem,8.6vw,7.25rem)] leading-[0.98] tracking-[-0.02em] text-foreground sm:mt-14"
        >
          <span aria-hidden className="-mb-[0.14em] block overflow-hidden pb-[0.14em]">
            <span className="h1-line" style={{ animationDelay: '0.1s' }}>
              One <em>calm</em> page for
            </span>
          </span>
          <span aria-hidden className="-mb-[0.14em] block overflow-hidden pb-[0.14em]">
            <span className="h1-line" style={{ animationDelay: '0.24s' }}>
              <span key={word} className="swap-word italic text-primary">
                {ROTATING_WORDS[word]}
              </span>
            </span>
          </span>
        </h1>

        {/* lede + product index */}
        <div className="mt-12 grid gap-12 sm:mt-16 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <Reveal delay={380}>
              {authed && firstName ? (
                <p className="max-w-md text-[15px] leading-relaxed text-muted-foreground sm:text-base">
                  <span className="font-display text-xl italic text-foreground sm:text-2xl">
                    Welcome back, {firstName}.
                  </span>
                  <br />
                  <span className="mt-3 block">
                    Your radar kept sweeping while you were away — today&rsquo;s briefing is ready.
                  </span>
                </p>
              ) : (
                <p className="max-w-md text-[15px] leading-relaxed text-muted-foreground sm:text-base">
                  Cortex sweeps 97+ sources around the clock, ranks what matters to you, and lays
                  it beside your notes, plans and goals — so the important stuff finds you first.
                </p>
              )}
            </Reveal>

            <Reveal delay={480} className="mt-8 flex flex-wrap items-center gap-2.5">
              <Button asChild className="sheen h-11 rounded-full px-6 text-[14px]">
                <Link href={authed ? '/app' : '/signup'}>
                  {authed ? 'Open Cortex' : 'Start for free'}
                  <FaArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-11 rounded-full bg-card/50 px-6 text-[14px] backdrop-blur"
              >
                <Link href={authed ? '/app' : '/login'}>
                  {authed ? 'Jump back in' : 'Sign in'}
                </Link>
              </Button>
            </Reveal>

            <Reveal delay={560}>
              <p className="mt-6 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground/70">
                {authed ? 'Synced across your desk' : 'Free while in beta · No credit card'}
              </p>
            </Reveal>
          </div>

          {/* index of what's inside — a table of contents for the product */}
          <Reveal delay={440} className="lg:col-span-6 lg:col-start-7">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-muted-foreground/70">
              Inside
            </p>
            <ul className="mt-3">
              {PRODUCT_INDEX.map((item) => (
                <li
                  key={item.n}
                  className="group flex items-baseline gap-4 border-t border-border/80 py-3.5 last:border-b"
                >
                  <span className="font-mono text-[11px] tabular-nums text-primary">{item.n}</span>
                  <span className="font-display text-xl text-foreground transition-colors duration-300 group-hover:text-primary sm:text-2xl">
                    {item.name}
                  </span>
                  <span className="ml-auto text-right font-mono text-[10.5px] text-muted-foreground/80 sm:text-[11px]">
                    {item.desc}
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
