'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FaCheck, FaCrown, FaSeedling } from 'react-icons/fa6'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/client'
import { spotlightHandlers } from '@/components/landing/motion'
import { cn } from '@/lib/utils'

// The two-plan grid — dressed in the same card DNA as the landing bento
// (tool-card hover lift + cursor spotlight + accent icon tile + mono tag),
// driven by the --tool-accent variable. Pro carries a Monthly / Annual
// switch; the choice travels to /api/billing/checkout so the provider
// charges the matching price (LS annual variant / Safepay PKR amount).
//   ok                    → redirect to the provider's hosted checkout
//   401                   → logged out → /signup (checkout needs an account)
//   501 billing_*         → "launching soon" notice instead of a dead end
//   other err             → surface the message inline

type Interval = 'monthly' | 'annual'

// Card copy is deliberately terse — this page sells, it doesn't document.
// The full feature matrix lives on the landing page and in the FAQ.
const FREE_FEATURES: string[] = [
  'Unlimited tasks, plans & Pomodoro',
  'Goals, reminders & streaks',
  'Unlimited library & notes',
  'News, jobs & scholarships',
  'AI Copilot — 15 msgs/day',
  'AI summaries — 5 per month',
]

const PRO_FEATURES: string[] = [
  'Everything in Free, unlimited',
  'Unlimited Copilot, summaries & mind maps',
  'PDF library — 500 docs / 2 GB',
  'Instant job-alert emails',
  'Priority support from a real human',
]

function FeatureList({ items, accent }: { items: string[]; accent: string }) {
  // flex-1 lets the list absorb the card's leftover height, which pins the
  // CTA below it to the card's bottom edge — so both buttons sit on the same
  // baseline even though the Free list is longer than Pro's.
  return (
    <ul className="mt-6 flex flex-1 flex-col gap-2.5">
      {items.map((f) => (
        <li key={f} className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-foreground/85">
          <span
            aria-hidden
            className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border"
            style={{
              borderColor: `color-mix(in srgb, ${accent} 32%, transparent)`,
              background: `color-mix(in srgb, ${accent} 9%, transparent)`,
              color: accent,
            }}
          >
            <FaCheck className="h-2 w-2" />
          </span>
          <span>{f}</span>
        </li>
      ))}
    </ul>
  )
}

/** Card shell shared by both plans — the landing bento's exact hover DNA. */
function CardShell({
  accent,
  highlight,
  children,
}: {
  accent: string
  highlight?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      {...spotlightHandlers()}
      className={cn(
        'tool-card spot group relative flex flex-col overflow-hidden rounded-2xl border bg-card p-6 sm:p-8',
        highlight ? 'border-primary/40 shadow-soft' : 'border-border'
      )}
      style={{ ['--tool-accent' as string]: accent }}
    >
      <span aria-hidden className="tool-glow" />
      {children}
    </div>
  )
}

export function PricingCards() {
  const router = useRouter()
  const [cycle, setCycle] = useState<Interval>('monthly')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)

  // Notices and errors render below the card grid — on a phone they can sit
  // below the fold, which made failures look like the button "did nothing".
  // Scroll them into view the moment they appear.
  function revealStatus() {
    setTimeout(() => statusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
  }

  async function upgrade() {
    setBusy(true)
    setNotice(null)
    setError(null)
    try {
      const res = await api.post<{ url?: string; test?: boolean }>('/api/billing/checkout', {
        plan: 'pro',
        interval: cycle,
      })
      if (res.test) {
        // BILLING_TEST_MODE is still enabled on this deployment. Never fake a
        // purchase: no redirect, no success vibes — an operator-actionable
        // warning. (A stale test-mode flag in prod used to bounce buyers back
        // to the app with a sample receipt, looking exactly like checkout.)
        setError(
          'Test mode is ON — no real checkout was opened and nothing was charged. Remove BILLING_TEST_MODE in Vercel → Settings → Environment Variables, then redeploy to enable live payments.'
        )
        setBusy(false)
        revealStatus()
        return
      }
      if (res.url) window.location.href = res.url
    } catch (err) {
      const status = (err as { status?: number }).status
      const message = err instanceof Error ? err.message : 'Could not start checkout.'
      if (status === 401) {
        // Logged out — Pro checkout starts after an account exists. Carry the
        // intent so signup → verify lands back here, ready to check out.
        router.push('/signup?next=%2Fpricing')
        return
      }
      if (status === 501 && message.includes('annual_not_available')) {
        // Annual isn't live on the active provider yet — flip the toggle to
        // Monthly so the very next click checks out instead of failing twice.
        setCycle('monthly')
        setNotice('Annual billing is launching soon — switched you to Monthly, which is ready right now.')
      } else if (status === 501 || message.includes('billing_not_configured')) {
        setNotice('Payments are launching soon — you are on the Free plan and nothing is charged.')
      } else {
        setError(message)
      }
      setBusy(false)
      revealStatus()
    }
  }

  return (
    <div className="mt-12">
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Free — quiet card, muted accent */}
        <CardShell accent="var(--muted-foreground)">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <span className="tool-tile inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border">
                <FaSeedling aria-hidden className="h-[18px] w-[18px]" />
              </span>
              <h2 className="font-display text-[20px] font-medium tracking-[-0.015em]">Free</h2>
            </div>
            <span className="tool-tag rounded-full border px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em]">
              Forever
            </span>
          </div>

          <p className="mt-6 font-display text-[34px] font-medium tracking-[-0.02em]">
            $0
            <span className="ml-1.5 text-[14px] font-normal text-muted-foreground">/ month</span>
          </p>
          <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">no card required — ever</p>

          <FeatureList items={FREE_FEATURES} accent="var(--muted-foreground)" />

          <div className="mt-7">
            <Button asChild variant="outline" className="w-full">
              <Link href="/signup">Start free</Link>
            </Button>
          </div>
        </CardShell>

        {/* Pro — accent card, billing-interval switch */}
        <CardShell accent="var(--chart-3)" highlight>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <span className="tool-tile inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border">
                <FaCrown aria-hidden className="h-[18px] w-[18px]" />
              </span>
              <h2 className="font-display text-[20px] font-medium tracking-[-0.015em]">Pro</h2>
            </div>
            <span className="rounded-full bg-primary px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-primary-foreground">
              Most value
            </span>
          </div>

          {/* Monthly / Annual switch — the choice is charged accordingly */}
          <div
            role="group"
            aria-label="Billing interval"
            className="mt-5 inline-flex w-fit self-center rounded-full border border-border bg-background/60 p-1"
          >
            {(['monthly', 'annual'] as const).map((iv) => (
              <button
                key={iv}
                type="button"
                onClick={() => setCycle(iv)}
                aria-pressed={cycle === iv}
                className={cn(
                  'rounded-full px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors',
                  cycle === iv ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {iv === 'monthly' ? 'Monthly' : 'Annual · −2 mo'}
              </button>
            ))}
          </div>

          <p aria-live="polite" className="mt-4 flex flex-wrap items-baseline gap-x-2 font-display text-[34px] font-medium tracking-[-0.02em]">
            {cycle === 'annual' ? '$50' : '$5'}
            <span className="text-[14px] font-normal text-muted-foreground">
              {cycle === 'annual' ? '/ year' : '/ month'}
            </span>
            <span className="tool-tag rounded-full border px-2 py-0.5 font-mono text-[9.5px] normal-case tracking-[0.08em]">
              {cycle === 'annual' ? '2 months free' : 'cancel anytime'}
            </span>
          </p>
          <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
            {cycle === 'annual' ? '≈ PKR 15,000/yr · students 50% off' : '≈ PKR 1,500/mo · students 50% off'}
          </p>

          <FeatureList items={PRO_FEATURES} accent="var(--chart-3)" />

          <div className="mt-7">
            <Button className="sheen w-full" disabled={busy} onClick={upgrade}>
              {busy
                ? 'Opening checkout…'
                : cycle === 'annual'
                  ? 'Upgrade to Pro — annual'
                  : 'Upgrade to Pro — monthly'}
            </Button>
          </div>
        </CardShell>
      </div>

      <p ref={statusRef} aria-live="polite">
        {notice && (
          <span className="mt-4 block rounded-lg border border-border bg-secondary/40 px-4 py-3 text-[13px] text-foreground/80">
            {notice}
          </span>
        )}
        {error && (
          <span role="alert" className="mt-4 block rounded-lg bg-danger/10 px-4 py-3 text-[13px] leading-relaxed text-danger">
            {error}
          </span>
        )}
      </p>
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
