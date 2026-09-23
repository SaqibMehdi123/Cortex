// Branded order-receipt email for successful Cortex Pro payments.
//
// Goes through the same provider chain as every other Cortex mail
// (Resend first — see src/lib/mailer.ts). Callers:
//   - /api/billing/webhook/polar         → receipt on the FIRST order.paid
//     event. Polar (as Merchant of Record) also emails its own tax invoice —
//     that one proves the payment; this one proves the ACTIVATION ("Pro is
//     now active on your account"). Deliberate, and deduped against webhook
//     retries via the Payment row.
//   - /api/billing/webhook/safepay       → REAL receipt on a successful PKR
//     payment (Safepay sends no buyer email of its own).
//   - /api/billing/checkout + BILLING_TEST_MODE=true → a clearly-marked
//     SAMPLE receipt to the operator's own address. That sample is the
//     receipt-template evidence payment providers ask for during onboarding
//     ("screenshot of the receipt customers receive"), before any real order
//     exists. No charge, no plan change.

import { SUPPORT_EMAIL, SITE_URL } from '@/lib/site'
import { sendEmail, type SendCodeResult } from '@/lib/mailer'

export interface ReceiptInput {
  to: string
  /** provider order/tracker id shown on the receipt */
  orderId: string
  /** provider minor units: paisa for PKR, cents for USD */
  amountMinor: number | null
  currency: string
  /** "safepay" | "polar" | "lemonsqueezy" | "test" — shown as the payment method line */
  provider: string
  /** "Cortex Pro — monthly" | "Cortex Pro — annual"; drives the renewal line */
  plan?: string
  /** when Pro expires / next renewal */
  expiresOn?: Date | null
  /** true → "(sample)" subject + sample banner, for test-mode evidence */
  sample?: boolean
}

const PROVIDER_LABEL: Record<string, string> = {
  safepay: 'Safepay — card, JazzCash, Easypaisa or bank transfer',
  polar: 'Polar — card, Apple Pay or Google Pay',
  lemonsqueezy: 'Lemon Squeezy — card or PayPal',
  test: 'Test mode — no payment was taken',
}

function formatAmount(amountMinor: number, currency: string): string {
  const major = amountMinor / 100
  const s = major.toLocaleString('en-US', { maximumFractionDigits: major % 1 === 0 ? 0 : 2 })
  if (currency === 'PKR') return `PKR ${s}`
  if (currency === 'USD') return `$${s}`
  return `${currency} ${s}`
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function receiptHtml(i: ReceiptInput): string {
  const amount = i.amountMinor != null ? formatAmount(i.amountMinor, i.currency) : `${i.currency} —`
  const plan = i.plan || 'Cortex Pro — monthly'
  const annual = /annual|year/i.test(plan)
  const rows: Array<[string, string]> = [
    ['Order', i.orderId],
    ['Plan', plan],
    ['Amount paid', amount],
    ['Payment method', PROVIDER_LABEL[i.provider] ?? i.provider],
    ['Date', formatDate(new Date())],
  ]
  if (i.expiresOn) rows.push([annual ? 'Pro active until' : 'Renews / Pro active until', formatDate(i.expiresOn)])

  const rowHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td class="kv-k" style="padding:7px 0;font-size:13px;color:#71717a;white-space:nowrap;">${k}</td><td class="kv-v" style="padding:7px 0 7px 12px;text-align:right;font-size:13px;font-weight:600;color:#18181b;overflow-wrap:anywhere;word-break:break-word;">${v}</td></tr>`
    )
    .join('')

  const sampleBanner = i.sample
    ? `<p style="margin:0 0 16px;padding:10px 14px;border-radius:10px;background:#fef9c3;border:1px solid #fde047;font-size:12.5px;line-height:1.6;color:#713f12;">SAMPLE — generated in test mode, no payment was taken. This is the exact receipt a customer receives when a real Pro order is placed.</p>`
    : ''

  const renewNote = i.sample
    ? 'Test-mode receipt — nothing will renew.'
    : annual
      ? 'Renews yearly — cancel anytime from Settings → Plan.'
      : 'Renews monthly — cancel anytime from Settings → Plan.'

  // Mobile: this template ships with the same responsive pattern as the
  // morning briefing — inline styles as the base, a <style> block (kept by
  // Gmail/iOS/Outlook on modern clients) that only refines small screens.
  // Without it the desktop paddings + fixed card swallowed half of a 390px
  // phone screen and the receipt "didn't fit".
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @media only screen and (max-width:520px) {
    .card { padding:22px 16px 18px !important; border-radius:12px !important; }
    .amount { font-size:26px !important; }
    .kv-k, .kv-v { font-size:12.5px !important; }
    .foot { padding:0 4px !important; }
  }
</style>
</head>
<body style="margin:0;padding:24px 12px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;text-size-adjust:100%;">
  <div class="card" style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e4e4e7;">
    <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#18181b;">Cortex</p>
    <h1 style="margin:0 0 6px;font-size:18px;color:#18181b;">Your Cortex Pro receipt</h1>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#52525b;">Thanks for backing an independent, ad-free workspace. Pro is now active on your account.</p>
    ${sampleBanner}
    <p class="amount" style="margin:0 0 14px;font-size:32px;font-weight:700;letter-spacing:-0.01em;color:#18181b;">${amount}</p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e4e4e7;">${rowHtml}</table>
    <p class="foot" style="margin:18px 0 0;padding-top:14px;border-top:1px solid #e4e4e7;font-size:12.5px;line-height:1.7;color:#71717a;">
      ${renewNote} Your first purchase is covered by the
      <a href="${SITE_URL}/refund" style="color:#52525b;">14-day refund guarantee</a>.
      <br>Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:#71717a;">${SUPPORT_EMAIL}</a>
    </p>
  </div>
</body></html>`
}

/** Fire the receipt through the shared mailer chain; never throws. */
export async function sendReceiptEmail(i: ReceiptInput): Promise<SendCodeResult> {
  const subject = i.sample ? `Your Cortex Pro receipt (sample)` : `Your Cortex Pro receipt — ${i.orderId}`
  try {
    const result = await sendEmail(i.to, subject, receiptHtml(i))
    if (!result.delivered) {
      console.error(`receipt email to ${i.to} not delivered:`, result.reason, result.detail ?? '')
    }
    return result
  } catch (e) {
    console.error('receipt email threw:', e)
    return { delivered: false, reason: 'send_failed', detail: e instanceof Error ? e.message : String(e) }
  }
}
