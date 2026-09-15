import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { db } from '@/lib/db'
import { sendReceiptEmail } from '@/lib/receipt'

// POST /api/billing/webhook/safepay — Safepay → Cortex (Pakistan payments).
//
// Setup (once, in the Safepay dashboard → Developers → Webhooks):
//   URL    : https://cortex.scrutinies.dev/api/billing/webhook/safepay
//   Secret : SAFEPAY_WEBHOOK_SECRET (Vercel env) — the webhook's signing key
//
// Safepay signs its webhook payloads with an HMAC over a concatenation of the
// payload fields (t + tracker). The exact canonical string is documented in
// YOUR dashboard's developer section and has changed between API revisions —
// verify it once there (or capture one sandbox webhook and compare) before
// switching SAFEPAY_MODE to live. Until then the verification below uses the
// documented `hash = HMAC-SHA256(secret, `${t}.${tracker}`)` shape; a mismatch
// is logged loudly but DOES NOT upgrade anyone — fail-closed.
//
// Success path: mark the Payment row paid and extend the user's plan by 31
// days from the current expiry (Safepay local payments are typically one-off
// purchases rather than auto-renewing subscriptions; re-subscription happens
// when the buyer returns to /pricing).

export const dynamic = 'force-dynamic'

const PRO_FALLBACK_DAYS = 31

interface SafepayWebhook {
  t?: number | string
  tracker?: string
  status?: string // "success" | "failed" | …
  hash?: string
  amount?: number
  currency?: string
  client?: { email?: string }
}

function verifySafepaySignature(payload: SafepayWebhook): boolean {
  const secret = (process.env.SAFEPAY_WEBHOOK_SECRET || '').trim()
  if (!secret) {
    console.error('safepay webhook: SAFEPAY_WEBHOOK_SECRET is not set — refusing to process')
    return false
  }
  if (!payload.t || !payload.tracker || !payload.hash) return false
  const digest = crypto.createHmac('sha256', secret).update(`${payload.t}.${payload.tracker}`, 'utf8').digest('hex')
  const a = Buffer.from(digest)
  const b = Buffer.from(String(payload.hash).trim())
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  let payload: SafepayWebhook
  try {
    payload = (await req.json()) as SafepayWebhook
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 })
  }

  if (!verifySafepaySignature(payload)) {
    console.error('safepay webhook: signature verification failed — payload ignored', { tracker: payload.tracker ?? null })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const tracker = String(payload.tracker)
    const payment = await db.payment.findUnique({
      where: { provider_providerInvoiceId: { provider: 'safepay', providerInvoiceId: tracker } },
      select: { userId: true },
    })
    const userId = payment?.userId ?? (await findUserIdByTrackerOrEmail(payload))

    if (!userId) {
      console.error('safepay webhook: no user for tracker', tracker)
      return NextResponse.json({ ok: false, handled: 'no_user' }, { status: 200 })
    }

    if ((payload.status || '').toLowerCase() !== 'success') {
      await db.payment.upsert({
        where: { provider_providerInvoiceId: { provider: 'safepay', providerInvoiceId: tracker } },
        create: {
          userId,
          provider: 'safepay',
          providerInvoiceId: tracker,
          status: 'failed',
          amountCents: typeof payload.amount === 'number' ? Math.round(payload.amount) : null,
          currency: payload.currency || 'PKR',
          plan: 'pro',
        },
        update: { status: 'failed' },
      })
      return NextResponse.json({ ok: true, handled: 'failed_payment' })
    }

    await db.payment.upsert({
      where: { provider_providerInvoiceId: { provider: 'safepay', providerInvoiceId: tracker } },
      create: {
        userId,
        provider: 'safepay',
        providerInvoiceId: tracker,
        status: 'paid',
        amountCents: typeof payload.amount === 'number' ? Math.round(payload.amount) : null,
        currency: payload.currency || 'PKR',
        plan: 'pro',
      },
      update: { status: 'paid' },
    })

    // Extend from the current expiry so a renewal never loses paid days.
    const user = await db.user.findUnique({ where: { id: userId }, select: { planExpiresAt: true, email: true } })
    const from = user?.planExpiresAt && user.planExpiresAt.getTime() > Date.now() ? user.planExpiresAt : new Date()
    const planExpiresAt = new Date(from.getTime() + PRO_FALLBACK_DAYS * 86_400_000)
    await db.user.update({
      where: { id: userId },
      data: { plan: 'pro', planExpiresAt, billingProvider: 'safepay' },
    })

    // Branded receipt to the buyer (fire after the plan is committed; a mail
    // failure must never fail the webhook — it is logged inside the helper).
    if (user?.email) {
      await sendReceiptEmail({
        to: user.email,
        orderId: tracker,
        amountMinor: typeof payload.amount === 'number' ? payload.amount : 150_000,
        currency: payload.currency || 'PKR',
        provider: 'safepay',
        expiresOn: planExpiresAt,
      })
    }

    return NextResponse.json({ ok: true, handled: 'success' })
  } catch (e) {
    console.error('POST /api/billing/webhook/safepay error', e)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

async function findUserIdByTrackerOrEmail(payload: SafepayWebhook): Promise<string | null> {
  if (payload.client?.email) {
    const u = await db.user.findUnique({ where: { email: payload.client.email.toLowerCase() }, select: { id: true } })
    if (u) return u.id
  }
  // tracker format: cortex-<last 8 of userId>-<base36 ts> (see /api/billing/checkout)
  const m = /^cortex-([a-z0-9]+)-/.exec(payload.tracker || '')
  if (!m) return null
  const suffix = m[1]
  const candidates = await db.user.findMany({ where: { id: { endsWith: suffix } }, select: { id: true }, take: 2 })
  return candidates.length === 1 ? candidates[0].id : null
}
