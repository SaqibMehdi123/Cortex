import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { db } from '@/lib/db'

// POST /api/billing/webhook/polar — Polar → Cortex (Merchant of Record).
//
// Setup (once, in the Polar dashboard → Settings → Webhooks → Add endpoint):
//   URL     : https://cortex.scrutinies.dev/api/billing/webhook/polar
//   Format  : Raw
//   Secret  : shown once when creating the endpoint (whsec_…) — put the SAME
//             value in POLAR_WEBHOOK_SECRET (Vercel). Requests whose
//             webhook-signature does not HMAC-match are rejected with 401.
//   Events  : order created / order paid / order refunded,
//             subscription created / active / updated / canceled / revoked
//
// What this does (mirrors the Lemon Squeezy webhook exactly):
//   order paid + subscription active events
//                    → User.plan='pro', planExpiresAt = the subscription's
//                      current_period_end (annual products simply come back
//                      with +1 year), providerCustomerId + Payment row
//                    → NEVER shortens a later existing expiry (Math.max) so
//                      switching providers can't take away paid days.
//   subscription canceled → access kept until current_period_end (isActivePro
//                    cuts it off automatically when the date passes).
//   past_due         → nothing (dunning; buyer keeps access while retrying).
//   subscription revoked → User.plan='free' (period truly over / refund).
//
// Buyer identity: checkout metadata { userId, interval } propagates to the
// order and the subscription; fallback = customer email lookup (covers
// dashboard-created checkouts).
//
// Receipts: Polar, as Merchant of Record, emails its own invoice to the
// buyer — we deliberately do not duplicate (same policy as Lemon Squeezy).

export const dynamic = 'force-dynamic'

const PRO_FALLBACK_DAYS = 31

// Polar signs with the Standard Webhooks scheme:
//   signed content = "<webhook-id>.<webhook-timestamp>.<raw body>"
//   key            = the secret (whsec_ prefix → base64-decoded remainder)
//   signature      = v1,<base64 HMAC-SHA256> (may repeat, space-separated)
// A >5 min timestamp delta is treated as a replay attempt and rejected.
function verifyPolarSignature(raw: string, headers: Headers): boolean {
  const secret = (process.env.POLAR_WEBHOOK_SECRET || '').trim()
  if (!secret) {
    console.error('polar webhook: POLAR_WEBHOOK_SECRET is not set — refusing to process (webhooks are forgeable without it)')
    return false
  }
  const id = headers.get('webhook-id') || ''
  const ts = headers.get('webhook-timestamp') || ''
  const sigHeader = headers.get('webhook-signature') || ''
  if (!id || !ts || !sigHeader) return false

  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
    console.error('polar webhook: timestamp outside the 5-minute tolerance — rejecting as replay')
    return false
  }

  let key: Buffer
  if (secret.startsWith('whsec_')) {
    key = Buffer.from(secret.slice(6), 'base64')
    if (key.length === 0) key = Buffer.from(secret, 'utf8')
  } else {
    key = Buffer.from(secret, 'utf8')
  }

  const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${raw}`, 'utf8').digest()
  return sigHeader.split(' ').some((part) => {
    const [version, sig] = part.trim().split(',')
    if (version !== 'v1' || !sig) return false
    const given = Buffer.from(sig, 'base64')
    return given.length === expected.length && crypto.timingSafeEqual(given, expected)
  })
}

// Order events carry the order (with an optional nested subscription);
// subscription events carry the subscription itself. One loose shape covers both.
interface PolarWebhook {
  type?: string
  data?: {
    id?: string
    status?: string
    amount?: number
    currency?: string
    metadata?: Record<string, string> | null
    customer?: { id?: string; email?: string } | null
    customer_id?: string
    // order payload → nested subscription · subscription payload → itself
    subscription?: { current_period_end?: string | null } | null
    current_period_end?: string | null
  }
}

function resolveUserId(data: PolarWebhook['data']): Promise<string | null> {
  const embedded = data?.metadata?.userId
  if (embedded) return Promise.resolve(String(embedded))
  const email = data?.customer?.email
  if (email) {
    return db.user
      .findUnique({ where: { email: email.toLowerCase() }, select: { id: true } })
      .then((u) => u?.id ?? null)
  }
  return Promise.resolve(null)
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (!verifyPolarSignature(raw, req.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: PolarWebhook
  try {
    payload = JSON.parse(raw) as PolarWebhook
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 })
  }

  const event = payload.type || ''
  const data = payload.data ?? {}

  try {
    // The cancelled period truly ended / subscription removed (refund, fraud,
    // manual revoke) → drop to free.
    if (event === 'subscription.revoked') {
      const userId = await resolveUserId(data)
      if (userId) {
        await db.user.update({ where: { id: userId }, data: { plan: 'free' } })
      }
      return NextResponse.json({ ok: true, handled: 'revoked' })
    }

    // Refund bookkeeping only — the plan keeps its remaining time (14-day
    // guarantee operations happen in the Polar dashboard like LS's).
    if (event === 'order.refunded') {
      const userId = await resolveUserId(data)
      if (userId && data.id) {
        await db.payment.upsert({
          where: { provider_providerInvoiceId: { provider: 'polar', providerInvoiceId: data.id } },
          create: {
            userId,
            provider: 'polar',
            providerInvoiceId: data.id,
            status: 'refunded',
            amountCents: typeof data.amount === 'number' ? data.amount : null,
            currency: data.currency || null,
            plan: 'pro',
          },
          update: { status: 'refunded' },
        })
      }
      return NextResponse.json({ ok: true, handled: 'refunded' })
    }

    const isOrderPaid = event === 'order.paid' || (event === 'order.created' && data.status === 'paid')
    const isSubscriptionGrant =
      (event === 'subscription.created' || event === 'subscription.active' || event === 'subscription.updated') &&
      ['active', 'trialing', 'uncanceled', 'canceled'].includes((data.status || '').toLowerCase())

    if (!isOrderPaid && !isSubscriptionGrant) {
      return NextResponse.json({ ok: true, handled: 'ignored', event })
    }

    const userId = await resolveUserId(data)
    if (!userId) {
      console.error('polar webhook: could not resolve user from metadata or email', { event, id: data.id })
      return NextResponse.json({ ok: false, handled: 'no_user' }, { status: 200 })
    }

    // Money trail lives on order events; subscription events only touch the plan.
    if (isOrderPaid && data.id) {
      await db.payment.upsert({
        where: { provider_providerInvoiceId: { provider: 'polar', providerInvoiceId: data.id } },
        create: {
          userId,
          provider: 'polar',
          providerInvoiceId: data.id,
          status: 'paid',
          amountCents: typeof data.amount === 'number' ? data.amount : null,
          currency: data.currency || null,
          plan: 'pro',
        },
        update: { status: 'paid' },
      })
    }

    // planExpiresAt: the subscription's own period end (annual products return
    // +1 year automatically). Fallback for orders without subscription data:
    // metadata.interval → 365 / 31 days. Math.max guard — never shorten an
    // already-longer expiry (e.g. an annual Safepay year still running).
    const periodEnd = data.subscription?.current_period_end || data.current_period_end || null
    const parsed = periodEnd ? new Date(periodEnd) : null
    const fallback = new Date(
      Date.now() + (data.metadata?.interval === 'annual' ? 365 : PRO_FALLBACK_DAYS) * 86_400_000
    )
    const candidate = parsed && !isNaN(parsed.getTime()) && parsed.getTime() > Date.now() ? parsed : fallback

    const current = await db.user.findUnique({ where: { id: userId }, select: { planExpiresAt: true } })
    const planExpiresAt =
      current?.planExpiresAt && current.planExpiresAt.getTime() > candidate.getTime()
        ? current.planExpiresAt
        : candidate

    await db.user.update({
      where: { id: userId },
      data: {
        plan: 'pro',
        planExpiresAt,
        billingProvider: 'polar',
        ...(data.customer_id || data.customer?.id
          ? { providerCustomerId: String(data.customer_id || data.customer?.id) }
          : {}),
      },
    })

    return NextResponse.json({ ok: true, handled: event })
  } catch (e) {
    console.error('POST /api/billing/webhook/polar error', e)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
