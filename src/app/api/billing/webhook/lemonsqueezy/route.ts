import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { db } from '@/lib/db'

// POST /api/billing/webhook/lemonsqueezy — Lemon Squeezy → Cortex.
//
// Setup (once, in the LS dashboard → Settings → Webhooks):
//   Callback URL : https://cortex.scrutinies.dev/api/billing/webhook/lemonsqueezy
//   Signing secret: generate one (openssl rand -hex 32) and put the SAME value
//                   in LEMONSQUEEZY_WEBHOOK_SECRET (Vercel) — requests whose
//                   X-Signature does not HMAC-match are rejected with 401.
//   Events       : order created, subscription created / payment success /
//                  payment failed / cancelled / expired
//
// What this does:
//   success events → User.plan='pro', planExpiresAt=renews_at (±31d fallback),
//                    providerCustomerId + Payment row (idempotent)
//   failed         → Payment row marked failed (plan keeps its remaining time)
//   cancelled      → nothing yet: LS keeps access until the period end
//   expired        → User.plan='free' (period truly over)
//
// Buyer identity: the checkout we create embeds custom: [userId], which
// arrives as meta.custom_data[0]. Fallback = buyer email lookup (covers
// manual dashboard-created checkouts).

export const dynamic = 'force-dynamic'

const PRO_FALLBACK_DAYS = 31

function verifySignature(raw: string, signature: string | null): boolean {
  const secret = (process.env.LEMONSQUEEZY_WEBHOOK_SECRET || '').trim()
  if (!secret) {
    console.error('lemonsqueezy webhook: LEMONSQUEEZY_WEBHOOK_SECRET is not set — refusing to process (webhooks are forgeable without it)')
    return false
  }
  if (!signature) return false
  const digest = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex')
  const a = Buffer.from(digest)
  const b = Buffer.from(signature.trim())
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

interface LSWebhook {
  meta?: { event_name?: string; custom_data?: string[] | { user_id?: string } }
  data?: {
    id?: string | number
    type?: string
    attributes?: {
      status?: string
      renews_at?: string | null
      ends_at?: string | null
      customer_id?: number | string
      order_id?: number | string
      user_email?: string
      total?: number
      currency?: string
      first_order_item?: { variant_id?: number | string } | null
    }
  }
}

function resolveUserId(meta: LSWebhook['meta'], email: string | null | undefined): Promise<string | null> {
  const raw = meta?.custom_data
  const embedded = Array.isArray(raw) ? raw[0] : raw?.user_id
  if (embedded) return Promise.resolve(String(embedded))
  if (email) {
    return db.user
      .findUnique({ where: { email: email.toLowerCase() }, select: { id: true } })
      .then((u) => u?.id ?? null)
  }
  return Promise.resolve(null)
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (!verifySignature(raw, req.headers.get('x-signature'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: LSWebhook
  try {
    payload = JSON.parse(raw) as LSWebhook
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 })
  }

  const event = payload.meta?.event_name || ''
  const attrs = payload.data?.attributes ?? {}
  const providerInvoiceId = String(attrs.order_id ?? payload.data?.id ?? '')
  const status = (attrs.status || '').toLowerCase()
  const isFailedPayment = event === 'subscription_payment_failed'

  try {
    // Expired = the cancelled period truly ended → drop to free.
    if (event === 'subscription_expired') {
      const userId = await resolveUserId(payload.meta, attrs.user_email)
      if (userId) {
        await db.user.update({ where: { id: userId }, data: { plan: 'free' } })
      }
      return NextResponse.json({ ok: true, handled: 'expired' })
    }

    if (event !== 'order_created' && event !== 'subscription_created' && event !== 'subscription_payment_success' && !isFailedPayment) {
      return NextResponse.json({ ok: true, handled: 'ignored', event })
    }

    const userId = await resolveUserId(payload.meta, attrs.user_email)
    if (!userId) {
      console.error('lemonsqueezy webhook: could not resolve user from custom_data or email', { event, providerInvoiceId })
      return NextResponse.json({ ok: false, handled: 'no_user' }, { status: 200 })
    }

    // Record the payment attempt (paid + failed) — idempotent by invoice id.
    if (providerInvoiceId) {
      await db.payment.upsert({
        where: { provider_providerInvoiceId: { provider: 'lemonsqueezy', providerInvoiceId } },
        create: {
          userId,
          provider: 'lemonsqueezy',
          providerInvoiceId,
          status: isFailedPayment ? 'failed' : 'paid',
          amountCents: typeof attrs.total === 'number' ? attrs.total : null,
          currency: attrs.currency || null,
          plan: 'pro',
        },
        update: { status: isFailedPayment ? 'failed' : 'paid' },
      })
    }

    if (!isFailedPayment) {
      const renews = attrs.renews_at ? new Date(attrs.renews_at) : null
      const planExpiresAt = renews && !isNaN(renews.getTime()) && renews.getTime() > Date.now()
        ? renews
        : new Date(Date.now() + PRO_FALLBACK_DAYS * 86_400_000)
      await db.user.update({
        where: { id: userId },
        data: {
          plan: 'pro',
          planExpiresAt,
          billingProvider: 'lemonsqueezy',
          ...(attrs.customer_id ? { providerCustomerId: String(attrs.customer_id) } : {}),
        },
      })
    }

    return NextResponse.json({ ok: true, handled: event })
  } catch (e) {
    console.error('POST /api/billing/webhook/lemonsqueezy error', e)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
