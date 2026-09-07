'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CortexMark } from '@/components/logo'
import { Reveal, SectionHeader } from './landing'
import { ArrowRight, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── FAQ — hairline rows with rotating plus, no accordion chrome ──────── */

const FAQS = [
  {
    q: 'Is Cortex free?',
    a: 'Yes — free while in beta. Create an account with email or Google and every module is unlocked: library, plans, goals, radar, career, mindmaps, flashcards and analytics.',
  },
  {
    q: 'How does the radar stay current?',
    a: 'It fetches the moment you open it, then quietly refreshes in the background whenever the digest is older than three hours. A manual force-refresh is always one click away.',
  },
  {
    q: 'Where does my data live?',
    a: 'Your workspace is fully isolated per account. Notes, reading and goals are yours alone, synced between laptop and phone.',
  },
  {
    q: 'Does it work on mobile?',
    a: 'Cortex is responsive with a dedicated mobile tab bar, and reading, reviews and capture all work offline — everything syncs when you reconnect.',
  },
]

function FaqRow({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-border/70 last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className="text-[15.5px] font-medium tracking-[-0.01em] text-foreground transition-colors group-hover:text-primary">
          {q}
        </span>
        <Plus
          className={cn(
            'h-4.5 w-4.5 shrink-0 text-muted-foreground transition-transform duration-300',
            open && 'rotate-45 text-primary'
          )}
        />
      </button>
      <div
        className={cn(
          'grid transition-all duration-300 ease-out',
          open ? 'grid-rows-[1fr] pb-5 opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <p className="max-w-xl text-[14.5px] leading-relaxed text-muted-foreground">{a}</p>
        </div>
      </div>
    </div>
  )
}

export function Faq() {
  const [open, setOpen] = useState(0)

  return (
    <section id="faq" className="scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[380px_1fr] lg:gap-20">
          <SectionHeader
            index="04"
            label="FAQ"
            accent="var(--chart-4)"
            title={
              <>
                Questions,
                <br />
                <em className="font-display italic text-[var(--chart-4)]">answered.</em>
              </>
            }
            lede="Something else on your mind? The copilot reads the docs."
          />
          <Reveal delay={80} className="lg:pt-3">
            <div className="rounded-2xl border border-border bg-card px-6 sm:px-8">
              {FAQS.map((f, i) => (
                <FaqRow
                  key={i}
                  q={f.q}
                  a={f.a}
                  open={open === i}
                  onToggle={() => setOpen(open === i ? -1 : i)}
                />
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ── Final CTA ────────────────────────────────────────────────────────── */

export function FinalCta({ authed }: { authed: boolean }) {
  return (
    <section className="relative overflow-hidden border-t border-border/70 py-24 sm:py-32">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-grid-faint rotate-180" />
        <div className="absolute left-1/2 top-1/2 h-[480px] w-[720px] -translate-x-1/2 -translate-y-1/2 opacity-50 dark:opacity-35">
          <div className="aurora h-full w-full" />
        </div>
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-5 text-center sm:px-8">
        <Reveal>
          <h2 className="max-w-2xl font-display text-[clamp(2.6rem,6vw,4.5rem)] font-medium leading-[1.04] tracking-[-0.03em] text-foreground">
            Your second brain,
            <br />
            <em className="italic text-[var(--chart-1)]">ready in minutes.</em>
          </h2>
        </Reveal>
        <Reveal delay={100}>
          <p className="mt-5 max-w-md text-[16.5px] leading-relaxed text-muted-foreground">
            Set it up once. Let it compound for years.
          </p>
        </Reveal>
        <Reveal delay={180} className="mt-9">
          <Button asChild className="sheen h-12 rounded-lg px-7 text-[15px]">
            <Link href={authed ? '/app' : '/signup'}>
              {authed ? 'Open Cortex' : 'Start for free'}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </Reveal>
      </div>
    </section>
  )
}

/* ── Footer — dense, mono labels ──────────────────────────────────────── */

const FOOTER_COLS = [
  {
    label: 'Product',
    links: [
      { label: 'Platform', href: '#platform' },
      { label: 'Workflow', href: '#workflow' },
      { label: 'Copilot', href: '#copilot' },
      { label: 'FAQ', href: '#faq' },
    ],
  },
  {
    label: 'Account',
    links: [
      { label: 'Open app', href: '/app' },
      { label: 'Sign in', href: '/login' },
      { label: 'Create account', href: '/signup' },
    ],
  },
]

export function LandingFooter() {
  return (
    <footer className="border-t border-border/70 bg-secondary/30">
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-10 px-5 py-12 sm:px-8 md:flex-row">
        <div className="max-w-[240px]">
          <span className="flex items-center gap-2">
            <CortexMark size={18} />
            <span className="text-[14px] font-semibold tracking-[-0.01em] text-foreground">
              Cortex
            </span>
          </span>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
            Read, plan, learn and land the job — one workspace that keeps up with your field.
          </p>
        </div>
        <nav aria-label="Footer" className="flex gap-16 sm:gap-20">
          {FOOTER_COLS.map((col) => (
            <div key={col.label}>
              <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {col.label}
              </h3>
              <ul className="mt-3.5 flex flex-col gap-2">
                {col.links.map((l) =>
                  l.href.startsWith('#') ? (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        className="text-[13px] text-foreground/75 transition-colors hover:text-foreground"
                      >
                        {l.label}
                      </a>
                    </li>
                  ) : (
                    <li key={l.label}>
                      <Link
                        href={l.href}
                        className="text-[13px] text-foreground/75 transition-colors hover:text-foreground"
                      >
                        {l.label}
                      </Link>
                    </li>
                  )
                )}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-1.5 px-5 py-4 sm:flex-row sm:px-8">
          <p className="font-mono text-[10px] text-muted-foreground">
            © {new Date().getFullYear()} CORTEX
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">
            BUILT FOR PEOPLE WHO THINK FOR A LIVING
          </p>
        </div>
      </div>
    </footer>
  )
}
