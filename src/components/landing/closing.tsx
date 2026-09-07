'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { CortexLogo } from '@/components/logo'
import { Reveal, SectionHeading } from './landing'
import { ArrowRight } from 'lucide-react'

/* ── FAQ ──────────────────────────────────────────────────────────────── */

const FAQS = [
  {
    q: 'Is Cortex free to use?',
    a: 'Yes — Cortex is free while in beta. Create an account with email or Google and every module is unlocked: library, plans, goals, radar, career, mindmaps, flashcards and analytics.',
  },
  {
    q: 'How does the news radar stay up to date?',
    a: 'It fetches automatically the first time you open it, then quietly refreshes in the background whenever the digest is older than three hours. A manual “Fetch latest” button is always there when you want to force it.',
  },
  {
    q: 'Where does my data live, and who can see it?',
    a: 'Your workspace is fully isolated per account — notes, reading and goals are yours alone. Everything is stored in your own Cortex account, synced between your laptop and phone.',
  },
  {
    q: 'Does it work on mobile?',
    a: 'Yes. Cortex is responsive with a dedicated mobile tab bar, and reading, reviews and capture all work offline — everything syncs when you reconnect.',
  },
]

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-24 border-t border-border/70 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="Questions, answered"
          title={
            <>
              The short <span className="italic text-primary">FAQ.</span>
            </>
          }
        />
        <Reveal delay={100} className="mt-10">
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((f, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border-border">
                <AccordionTrigger className="text-left font-display text-lg text-foreground hover:no-underline [&[data-state=open]]:text-primary">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-[15px] leading-relaxed text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  )
}

/* ── Final CTA ────────────────────────────────────────────────────────── */

export function FinalCta({ authed }: { authed: boolean }) {
  return (
    <section className="pb-20 pt-4 sm:pb-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-border bg-card px-6 py-16 text-center sm:px-12 sm:py-20">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
            >
              <div className="absolute inset-0 bg-grid-faint opacity-70" />
              <div className="absolute left-1/2 top-1/2 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow-hero),transparent)]" />
            </div>
            <div className="relative flex flex-col items-center">
              <h2 className="max-w-2xl font-display text-3xl leading-[1.1] tracking-tight text-foreground sm:text-5xl">
                Give your mind a <span className="italic text-primary">second home.</span>
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
                Set it up in minutes. Let it compound for years.
              </p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-12 rounded-full px-8 text-[15px] shadow-md">
                  <Link href={authed ? '/app' : '/signup'}>
                    {authed ? 'Open your workspace' : 'Start for free'}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
                {!authed && (
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="h-12 rounded-full px-8 text-[15px] bg-card/60"
                  >
                    <Link href="/login">I already have an account</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ── Footer ───────────────────────────────────────────────────────────── */

export function LandingFooter() {
  return (
    <footer className="mt-auto border-t border-border/70 bg-secondary/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-12 sm:px-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <CortexLogo size={22} />
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The second brain for people who think for a living — reading, planning, learning and
            career in one calm place.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:gap-16">
          <div>
            <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Product
            </h3>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              <li><a href="#features" className="text-foreground/80 transition-colors hover:text-primary">Features</a></li>
              <li><a href="#workflow" className="text-foreground/80 transition-colors hover:text-primary">Workflow</a></li>
              <li><a href="#copilot" className="text-foreground/80 transition-colors hover:text-primary">Copilot</a></li>
              <li><a href="#faq" className="text-foreground/80 transition-colors hover:text-primary">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Account
            </h3>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              <li><Link href="/app" className="text-foreground/80 transition-colors hover:text-primary">Open workspace</Link></li>
              <li><Link href="/login" className="text-foreground/80 transition-colors hover:text-primary">Sign in</Link></li>
              <li><Link href="/signup" className="text-foreground/80 transition-colors hover:text-primary">Create account</Link></li>
            </ul>
          </div>
        </nav>
      </div>
      <div className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-5 sm:flex-row sm:px-8">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Cortex. All rights reserved.</p>
          <p className="font-mono text-[11px] text-muted-foreground">Built for people who think for a living.</p>
        </div>
      </div>
    </footer>
  )
}
