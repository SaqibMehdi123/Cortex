'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FaCheck } from 'react-icons/fa6'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/client'

// The two-plan grid. CTA POSTs /api/billing/checkout:
//   ok        → redirect to the provider's hosted checkout (Lemon Squeezy /
//               Safepay — Stripe-class hosted pages; no card data touches us)
//   501       → billing_not_configured: show the "launching soon" line
//   other err → surface the message inline (api client throws with it)

const FREE_FEATURES: string[] = [
  'Unlimited tasks, plans, kanban & Pomodoro',
  'Goals, milestones, reminders & streaks',
  'Library & notes — unlimited text, URLs and captures',
  'News, papers, jobs, scholarships & exchange feeds',
  'Daily 9 AM briefing email',
  'Flashcards with SM-2 scheduling',
  'AI Copilot — 15 messages/day',
  'PDF library — 20 documents / 100 MB',
  'AI summaries — 5/month · cards & mind maps — 2/month',
]

const PRO_FEATURES: string[] = [
  'Everything in Free, unlimited',
  'AI Copilot — unlimited (fair use ~500/day)',
  'Unlimited AI summaries, cards & mind maps',
  'PDF library — 500+ documents / 2 GB',
  'Instant job-alert emails the moment a matching role drops',
  'Priority support from a human at support@scrutinies.dev',
  'Help fund an independent, ad-free workspace',
]

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 flex flex-col gap-2.5">
      {items.map((f) => (
        <li key={f} className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-foreground/85">
          <FaCheck aria-hidden className="mt-[3px] h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{f}</span>
        </li>
      ))}
    </ul>
  )
}

export function PricingCards() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function upgrade() {
    setBusy(true)
    setNotice(null)
    setError(null)
    try {
      const res = await api.post<{ url?: string }>('/api/billing/checkout', { plan: 'pro' })
      if (res.url) window.location.href = res.url
    } catch (err) {
      const status = (err as { status?: number }).status
      const message = err instanceof Error ? err.message : 'Could not start checkout.'
      if (status === 401) {
        // Logged out — Pro checkout starts after an account exists.
        router.push('/signup')
        return
      }
      if (status === 501 || message.includes('billing_not_configured')) {
        setNotice('Payments are launching soon — you are on the Free plan and nothing is charged.')
      } else {
        setError(message)
      }
      setBusy(false)
    }
  }

  return (
    <div className="mt-12">
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Free */}
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[20px] font-medium tracking-[-0.015em]">Free</h2>
            <span className="rounded-full border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Forever
            </span>
          </div>
          <p className="mt-3 font-display text-[34px] font-medium tracking-[-0.02em]">
            $0
            <span className="ml-1.5 text-[14px] font-normal text-muted-foreground">/ month</span>
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
            The whole workspace, no time limit. Limits only apply to metered AI usage.
          </p>
          <FeatureList items={FREE_FEATURES} />
          <Button asChild variant="outline" className="mt-7 w-full">
            <Link href="/signup">Start free</Link>
          </Button>
        </div>

        {/* Pro */}
        <div className="relative rounded-2xl border border-primary/40 bg-card p-6 shadow-soft sm:p-8">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[20px] font-medium tracking-[-0.015em]">Pro</h2>
            <span className="rounded-full bg-primary px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-primary-foreground">
              Most value
            </span>
          </div>
          <p className="mt-3 font-display text-[34px] font-medium tracking-[-0.02em]">
            $5
            <span className="ml-1.5 text-[14px] font-normal text-muted-foreground">/ month</span>
            <span className="ml-3 text-[14px] font-normal text-muted-foreground">≈ PKR 1,500</span>
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
            Unlimited AI on top of everything free. Students: $2.50 after verification.
          </p>
          <FeatureList items={PRO_FEATURES} />
          <Button className="mt-7 w-full" disabled={busy} onClick={upgrade}>
            {busy ? 'Opening checkout…' : 'Upgrade to Pro'}
          </Button>
        </div>
      </div>

      {notice && (
        <p role="status" className="mt-4 rounded-lg border border-border bg-secondary/40 px-4 py-3 text-[13px] text-foreground/80">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-[13px] text-danger">
          {error}
        </p>
      )}
      <p className="mt-4 text-center text-[12px] text-muted-foreground">
        Prices in USD. Pakistan visitors are billed in PKR. Refunds:{' '}
        <Link href="/refund" className="underline underline-offset-2 hover:text-foreground">
          14-day guarantee on your first purchase
        </Link>
        . Terms &amp; Privacy:{' '}
        <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
          terms
        </Link>{' '}
        ·{' '}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
          privacy
        </Link>
      </p>
    </div>
  )
}
