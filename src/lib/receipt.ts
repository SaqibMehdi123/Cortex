// Branded order-receipt email for successful Cortex Pro payments.
//
// Goes through the same provider chain as every other Cortex mail
// (Resend first — see src/lib/mailer.ts). Callers:
//   - /api/billing/webhook/safepay        → REAL receipt on a successful PKR
//     payment. (Lemon Squeezy, as Merchant of Record, emails its own
//     invoice for international orders — we deliberately do not duplicate.)
//   - /api/billing/checkout + BILLING_TEST_MODE=true → a clearly-marked
//     SAMPLE receipt to the operator's own address. That sample is the
//     receipt-template evidence payment providers ask for during onboarding
//     ("screenshot of the receipt customers receive"), before any real
//     order exists. No charge, no plan change.

import { SUPPORT_EMAIL, SITE_URL } from '@/lib/site'
import { sendEmail, type SendCodeResult } from '@/lib/mailer'

export interface ReceiptInput {
  to: string
  /** provider order/tracker id shown on the receipt */
  orderId: string
  /** provider minor units: paisa for PKR, cents for USD */
  amountMinor: number | null
  currency: string
  /** "safepay" | "lemonsqueezy" | "test" — shown as the payment method line */
  provider: string
  /** when Pro expires / next renewal */
  expiresOn?: Date | null
  /** true → "(sample)" subject + sample banner, for test-mode evidence */
  sample?: boolean
}

const PROVIDER_LABEL: Record<string, string> = {
  safepay: 'Safepay — card, JazzCash, Easypaisa or bank transfer',
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
  const rows: Array<[string, string]> = [
    ['Order', i.orderId],
    ['Plan', 'Cortex Pro — monthly'],
    ['Amount paid', amount],
    ['Payment method', PROVIDER_LABEL[i.provider] ?? i.provider],
    ['Date', formatDate(new Date())],
  ]
  if (i.expiresOn) rows.push(['Pro active until', formatDate(i.expiresOn)])

  const rowHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:7px 0;font-size:13px;color:#71717a;">${k}</td><td style="padding:7px 0;text-align:right;font-size:13px;font-weight:600;color:#18181b;">${v}</td></tr>`
    )
    .join('')

  const sampleBanner = i.sample
    ? `<p style="margin:0 0 16px;padding:10px 14px;border-radius:10px;background:#fef9c3;border:1px solid #fde047;font-size:12.5px;line-height:1.6;color:#713f12;">SAMPLE — generated in test mode, no payment was taken. This is the exact receipt a customer receives when a real Pro order is placed.</p>`
    : ''

  return `<!doctype html>
<html><body style="margin:0;padding:32px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e4e4e7;">
    <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#18181b;">Cortex</p>
    <h1 style="margin:0 0 6px;font-size:18px;color:#18181b;">Your Cortex Pro receipt</h1>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#52525b;">Thanks for backing an independent, ad-free workspace. Pro is now active on your account.</p>
    ${sampleBanner}
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e4e4e7;">${rowHtml}</table>
    <p style="margin:18px 0 0;padding-top:14px;border-top:1px solid #e4e4e7;font-size:12.5px;line-height:1.7;color:#71717a;">
      Renews monthly — cancel anytime from Settings → Plan. Your first purchase is covered by the
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
