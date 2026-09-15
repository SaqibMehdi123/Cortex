import type { Metadata } from 'next'
import { LandingFooter } from '@/components/landing/closing'
import { CortexMark } from '@/components/logo'
import { SITE_URL } from '@/lib/site'
import { PricingCards } from './pricing-cards'

// Public pricing page — the billing skeleton's front door. Server-rendered
// (crawlable, fast); only the CTA buttons hydrate (they POST to
// /api/billing/checkout and redirect to Lemon Squeezy / Safepay).

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Cortex is free for all core planning and knowledge work. Pro adds unlimited AI — copilot, summaries, flashcards and mind maps — bigger PDF storage and instant job alerts for $5/month or $50/year.',
  alternates: { canonical: `${SITE_URL}/pricing` },
  openGraph: {
    title: 'Pricing · Cortex',
    description:
      'Free forever for planning and reading. Pro: unlimited AI, 500+ PDF library, instant job alerts — $5/month or $50/year.',
    url: `${SITE_URL}/pricing`,
    type: 'website',
  },
}

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-2">
            <CortexMark size={18} />
            <span className="text-[14px] font-semibold tracking-[-0.01em]">Cortex</span>
          </a>
          <a
            href="/app"
            className="text-[13px] text-foreground/75 transition-colors hover:text-foreground"
          >
            Open app →
          </a>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pt-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Pricing
          </p>
          <h1 className="mt-4 max-w-2xl font-display text-[clamp(2.3rem,5vw,3.4rem)] font-medium leading-[1.06] tracking-[-0.025em]">
            Free where it matters.{' '}
            <em className="italic text-[var(--chart-1)]">Pro where it compounds.</em>
          </h1>
          <p className="mt-5 max-w-xl text-[16.5px] leading-relaxed text-muted-foreground">
            Every core feature — tasks, plans, goals, reminders, library, notes, flashcards, the
            news, papers, jobs and scholarship radars — is free and unlimited. Pro only lifts the
            things that cost real money to run: AI usage and heavy storage.
          </p>

          <PricingCards />

          <div className="mt-14 grid gap-4 border-t border-border/70 pt-10 sm:grid-cols-3">
            {[
              {
                t: 'Students pay half',
                d: 'Enrolled students get Pro at 50% off. Write from your account email with proof of enrolment and we will apply it manually within a day.',
              },
              {
                t: 'Cancel anytime',
                d: 'Pick monthly or yearly billing — subscriptions renew at that pace and stop the moment you cancel. First purchase carries a 14-day no-questions-asked refund.',
              },
              {
                t: 'Local & global payments',
                d: 'Visitors from Pakistan pay in PKR via cards, JazzCash, Easypaisa or bank (Safepay). Everyone else checks out with card or PayPal via Lemon Squeezy.',
              },
            ].map((c) => (
              <div key={c.t}>
                <h2 className="font-display text-[16px] font-medium tracking-[-0.01em]">{c.t}</h2>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{c.d}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  )
}
