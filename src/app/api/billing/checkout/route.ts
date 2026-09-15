import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { SITE_NAME, SUPPORT_EMAIL } from '@/lib/site'
import { sendReceiptEmail } from '@/lib/receipt'

// POST /api/billing/checkout — start a Pro subscription.
//
// Routing:
//   • Pakistan visitors (Vercel geo header x-vercel-ip-country = "PK")
//     → Safepay (cards, JazzCash, Easypaisa, bank — PKR).
//   • Everyone else → Lemon Squeezy (Merchant of Record — they handle tax
//     and compliance; payouts to Pakistan via Payoneer).
//
// Configuration (all in Vercel env):
//   LEMONSQUEEZY_API_KEY        re-… api key from Lemon Squeezy → Settings → API
//   LEMONSQUEEZY_STORE_ID       numeric store id (from the store URL/dashboard)
//   LEMONSQUEEZY_VARIANT_ID     the "Cortex Pro monthly" variant id — checkout
//                               is created against THIS, so the price you set
//                               in the LS dashboard is what the buyer sees
//   SAFEPAY_SECRET_KEY          from Safepay dashboard (sandbox or live)
//   SAFEPAY_MODE                "sandbox" (default) | "live"
//   BILLING_TEST_MODE           "true" → skip providers and return a fake
//                               checkout url (LOCAL DEV ONLY)
//
// When a provider is not configured the route answers 501 with
// { error: 'billing_not_configured' } — the pricing page turns that into a
// friendly "launching soon" message instead of a dead end.

export const dynamic = 'force-dynamic'

interface CheckoutBody {
  plan?: string // reserved for future tiers (pro_yearly, pro_student…)
}

function billingConfigured(provider: 'lemonsqueezy' | 'safepay'): boolean {
  if (provider === 'lemonsqueezy') {
    return Boolean(
      (process.env.LEMONSQUEEZY_API_KEY || '').trim() &&
        (process.env.LEMONSQUEEZY_STORE_ID || '').trim() &&
        (process.env.LEMONSQUEEZY_VARIANT_ID || '').trim()
    )
  }
  return Boolean((process.env.SAFEPAY_SECRET_KEY || '').trim())
}

async function createLemonSqueezyCheckout(userId: string, email: string, name: string): Promise<string> {
  const base = process.env.LEMONSQUEEZY_API_BASE || 'https://api.lemonsqueezy.com'
  const res = await fetch(`${base}/v1/checkouts`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.api+json',
      'content-type': 'application/vnd.api+json',
      authorization: `Bearer ${(process.env.LEMONSQUEEZY_API_KEY || '').trim()}`,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          custom_price: null, // price lives on the variant — single source of truth
          product_options: { name: `${SITE_NAME} Pro`, description: 'Unlimited AI, bigger library, instant job alerts' },
          checkout_options: { embed: false, dark: true },
          checkout_data: {
            email, // pre-fill — buyers never retype their address
            name: name || undefined,
            custom: [userId], // arrives back as meta.custom_data[0] in webhooks
          },
          expires_at: null,
        },
        relationships: {
          store: { data: { type: 'stores', id: String(process.env.LEMONSQUEEZY_STORE_ID) } },
          variant: { data: { type: 'variants', id: String(process.env.LEMONSQUEEZY_VARIANT_ID) } },
        },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error(`Lemon Squeezy checkout failed (${res.status}):`, detail.slice(0, 400))
    throw new Error('lemonsqueezy_checkout_failed')
  }
  const json = (await res.json()) as { data?: { attributes?: { url?: string } } }
  const url = json.data?.attributes?.url
  if (!url) throw new Error('lemonsqueezy_no_url')
  return url
}

// Safepay creates a "tracker" the buyer is redirected to. Endpoint shape per
// Safepay's docs (https://docs.getsafepay.com) — verify the exact field names
// against your dashboard's API reference when you enable the live mode.
async function createSafepayPayment(userId: string, email: string): Promise<string> {
  const mode = (process.env.SAFEPAY_MODE || 'sandbox').toLowerCase() === 'live' ? 'www' : 'sandbox'
  const base = process.env.SAFEPAY_API_BASE || `https://${mode}.api.getsafepay.com`
  const tracker = `cortex-${userId.slice(-8)}-${Date.now().toString(36)}`
  const res = await fetch(`${base}/payment/v1`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${(process.env.SAFEPAY_SECRET_KEY || '').trim()}`,
    },
    body: JSON.stringify({
      tracker,
      type: 'MPR',
      client: { email },
      style: 'plan',
      currency: 'PKR',
      amount: 150000, // PKR 1,500 ≈ $5 — keep in sync with the pricing page
      environment: mode === 'www' ? 'live' : 'sandbox',
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error(`Safepay payment create failed (${res.status}):`, detail.slice(0, 400))
    throw new Error('safepay_create_failed')
  }
  const json = (await res.json()) as { data?: { redirect_url?: string } }
  const url = json.data?.redirect_url
  if (!url) throw new Error('safepay_no_url')
  return url
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    let body: CheckoutBody = {}
    try {
      body = (await req.json()) as CheckoutBody
    } catch {}
    if (body.plan && body.plan !== 'pro') {
      return NextResponse.json({ error: 'Unknown plan' }, { status: 400 })
    }

    // Dev-only escape hatch: exercise the whole pricing → checkout UI flow
    // with no provider accounts. NEVER enable outside a local machine.
    if (process.env.BILLING_TEST_MODE === 'true') {
      // Also email a clearly-marked SAMPLE receipt to the operator's own
      // address — that sample is the "receipt customers receive" evidence
      // payment providers ask for during onboarding, before any real order
      // exists. No charge is made and no plan is changed.
      void sendReceiptEmail({
        to: user.email,
        orderId: `test-${Date.now().toString(36)}`,
        amountMinor: 150_000,
        currency: 'PKR',
        provider: 'test',
        expiresOn: new Date(Date.now() + 31 * 86_400_000),
        sample: true,
      }).catch((e) => console.error('test-mode sample receipt failed', e))
      return NextResponse.json({ ok: true, provider: 'test', url: `${new URL(req.url).origin}/app?billing=test` })
    }

    // Geo routing: Vercel injects the visitor's country on every request.
    const country = (req.headers.get('x-vercel-ip-country') || '').toUpperCase()
    const provider: 'lemonsqueezy' | 'safepay' = country === 'PK' ? 'safepay' : 'lemonsqueezy'

    if (!billingConfigured(provider)) {
      // The other provider may still be configured — try it before giving up.
      const fallback = provider === 'safepay' ? 'lemonsqueezy' : 'safepay'
      if (billingConfigured(fallback)) {
        const url = fallback === 'lemonsqueezy'
          ? await createLemonSqueezyCheckout(user.id, user.email, user.name)
          : await createSafepayPayment(user.id, user.email)
        return NextResponse.json({ ok: true, provider: fallback, url })
      }
      return NextResponse.json(
        {
          error: 'billing_not_configured',
          detail: `Payments are launching soon. Questions? ${SUPPORT_EMAIL}`,
        },
        { status: 501 }
      )
    }

    const url = provider === 'lemonsqueezy'
      ? await createLemonSqueezyCheckout(user.id, user.email, user.name)
      : await createSafepayPayment(user.id, user.email)
    return NextResponse.json({ ok: true, provider, url })
  } catch (e) {
    console.error('POST /api/billing/checkout error', e)
    const detail = e instanceof Error ? e.message : 'checkout_failed'
    return NextResponse.json({ error: 'Could not start checkout. Try again.', detail }, { status: 502 })
  }
}
