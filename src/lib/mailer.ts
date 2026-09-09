// Outgoing email for verification / password-reset codes.
//
// Delivery channels, tried in this order — the first configured one sends,
// and the next configured one is the automatic fallback if a send fails:
//   1. SendGrid HTTPS API — set SENDGRID_API_KEY (free tier: 100 emails/day
//      to ANY recipient; only the sender address must be verified in the
//      SendGrid dashboard — no custom domain, and crucially NO IP allow-list,
//      which is exactly what killed Brevo on Vercel's rotating egress IPs)
//   2. Raw SMTP           — set SMTP_HOST + SMTP_USER + SMTP_PASS
//      (works with SMTP2GO, Postmark, Gmail App Password, any provider)
//   3. Brevo HTTPS API    — set BREVO_API_KEY (legacy fallback only; Brevo's
//      Authorised-IPs feature intermittently blocks serverless egress, so
//      don't rely on it — remove the BREVO_* env vars once SendGrid works)
//
// If none is configured the email content is printed to the server log and
// the caller receives { delivered: false, reason: 'not_configured' } — the
// verification code is NEVER returned to the browser unless the operator
// explicitly opts in with AUTH_DEV_CODE_FALLBACK=true (local development only).
//
// Environment (all optional):
//   SENDGRID_API_KEY          key from SendGrid → Settings → API Keys
//                             (needs "Mail Send" permission; SG.xxxx…)
//   SENDGRID_SENDER_EMAIL     the sender address verified under SendGrid →
//                             Settings → Sender Authentication
//   MAIL_FROM                 full RFC form override, e.g.
//                             "Cortex <you@example.com>" (display name
//                             defaults to "Cortex" when not set)
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE ("true" for 465)
//   BREVO_API_KEY             legacy — see above
//   BREVO_SENDER_EMAIL        legacy sender address (BREVO mode)
//   AUTH_DEV_CODE_FALLBACK    "true" → API responses may include devCode
//                             when delivery is impossible (DEV ONLY)
//
// TEST HOOKS (never set in production): SENDGRID_API_BASE and BREVO_API_BASE
// override https://api.sendgrid.com / https://api.brevo.com so tests can point
// the HTTP clients at a local mock server.

export type MailReason = 'not_configured' | 'send_failed'
export type MailProviderId = 'sendgrid' | 'smtp' | 'brevo'

export interface SendCodeResult {
  delivered: boolean // true = handed to a real mail provider
  reason?: MailReason
}

/** Providers configured via env vars, in the order the mailer will try them. */
export function configuredProviders(): MailProviderId[] {
  const list: MailProviderId[] = []
  if ((process.env.SENDGRID_API_KEY || '').trim()) list.push('sendgrid')
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) list.push('smtp')
  if ((process.env.BREVO_API_KEY || '').trim()) list.push('brevo')
  return list
}

/** The provider that will actually send (first configured one). */
export function activeMailProvider(): MailProviderId | null {
  return configuredProviders()[0] ?? null
}

export function mailConfigured(): boolean {
  return configuredProviders().length > 0
}

/** Bare sender address the current env resolves to (no display name). */
export function configuredFromEmail(): string | null {
  const raw =
    process.env.MAIL_FROM ||
    process.env.SENDGRID_SENDER_EMAIL ||
    process.env.BREVO_SENDER_EMAIL ||
    process.env.SMTP_USER ||
    ''
  const m = raw.match(/<([^>]+)>/)
  const email = (m ? m[1] : raw).trim()
  return email && email.includes('@') ? email.toLowerCase() : null
}

/** RFC "Name <email>" form actually used on outgoing messages. */
export function mailFrom(): string {
  if (process.env.MAIL_FROM) return process.env.MAIL_FROM
  const email = configuredFromEmail()
  return email ? `Cortex <${email}>` : 'Cortex <no-reply@unconfigured.local>'
}

/** Explicit operator opt-in to show codes in the UI (local dev only). */
export function devCodeAllowed(): boolean {
  return process.env.AUTH_DEV_CODE_FALLBACK === 'true'
}

/**
 * Build the response fields every code-sending route returns, in one place so
 * the security rule lives in a single spot:
 *   - emailSent / emailError always describe what actually happened
 *   - devCode is present ONLY when delivery failed AND the operator turned the
 *     dev fallback on — never by default, never in production configs
 */
export function emailResponseFields(result: SendCodeResult, code: string) {
  return {
    emailSent: result.delivered,
    ...(result.delivered ? {} : { emailError: result.reason }),
    ...(result.delivered || !devCodeAllowed() ? {} : { devCode: code }),
  }
}

const codeEmailHtml = (name: string, code: string, kind: 'verify' | 'reset'): string => {
  const heading = kind === 'verify' ? 'Verify your email' : 'Reset your password'
  const intro =
    kind === 'verify'
      ? `Hi ${name || 'there'} — welcome to Cortex. Enter this code to verify your email address:`
      : `Hi ${name || 'there'} — enter this code to reset your Cortex password:`
  return `<!doctype html>
<html><body style="margin:0;padding:32px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e4e4e7;">
    <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#18181b;">Cortex</p>
    <h1 style="margin:0 0 12px;font-size:18px;color:#18181b;">${heading}</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#52525b;">${intro}</p>
    <p style="margin:0 0 20px;font-size:34px;font-weight:700;letter-spacing:0.35em;color:#18181b;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${code}</p>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#a1a1aa;">This code expires in 10 minutes and can be used once. If you didn't request it, you can safely ignore this email.</p>
  </div>
</body></html>`
}

/** Crude plain-text projection of the code email — improves deliverability. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const logDevBanner = (to: string, subject: string, code: string) => {
  console.log(
    [
      '',
      '┌─────────────────────────────────────────────────',
      `│  DEV EMAIL (no mail provider configured)`,
      `│  to:      ${to}`,
      `│  subject: ${subject}`,
      `│  code:    ${code}`,
      '└─────────────────────────────────────────────────',
      '',
    ].join('\n')
  )
}

/** "Cortex <you@example.com>" → { name: "Cortex", email: "you@example.com" } */
function parseFrom(from: string): { name?: string; email: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  if (m) return { name: m[1].replace(/^"|"$/g, '') || undefined, email: m[2].trim() }
  return { email: from.trim() }
}

async function sendViaSendGrid(to: string, from: string, subject: string, html: string): Promise<boolean> {
  const apiKey = (process.env.SENDGRID_API_KEY || '').trim()
  const base = process.env.SENDGRID_API_BASE || 'https://api.sendgrid.com'
  const f = parseFrom(from)
  const res = await fetch(`${base}/v3/mail/send`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: f.name ? { email: f.email, name: f.name } : { email: f.email },
      subject,
      content: [
        { type: 'text/plain', value: htmlToText(html) },
        { type: 'text/html', value: html },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  })
  // SendGrid accepts async with 202 Accepted — that's our success contract.
  if (res.status === 202) return true
  const detail = await res.text().catch(() => '')
  console.error(`SendGrid send failed (${res.status}):`, detail.slice(0, 400))
  if (res.status === 401 || res.status === 403)
    console.error('SendGrid: API key rejected — check SENDGRID_API_KEY (SendGrid → Settings → API Keys, needs "Mail Send" permission).')
  if (/verified sender|sender identity|from address/i.test(detail))
    console.error('SendGrid: the From address is not a verified Sender Identity — verify it under SendGrid → Settings → Sender Authentication → Verify a Single Sender (then set SENDGRID_SENDER_EMAIL / MAIL_FROM to it).')
  return false
}

async function sendViaBrevo(to: string, from: string, subject: string, html: string): Promise<boolean> {
  const apiKey = (process.env.BREVO_API_KEY || '').trim()
  const base = process.env.BREVO_API_BASE || 'https://api.brevo.com'
  const res = await fetch(`${base}/v3/smtp/email`, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: parseFrom(from),
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error(`Brevo send failed (${res.status}):`, detail.slice(0, 400))
    if (res.status === 401) console.error('Brevo: API key rejected — check BREVO_API_KEY (Brevo → SMTP & API → API keys).')
    if (res.status === 400 && detail.includes('invalid sender'))
      console.error('Brevo: sender not confirmed — set MAIL_FROM / BREVO_SENDER_EMAIL to an address confirmed under “Senders, Domains & Dedicated IPs”.')
    return false
  }
  return true
}

async function sendViaSmtp(to: string, from: string, subject: string, html: string): Promise<boolean> {
  // Dynamic import keeps nodemailer out of any edge/bundled path.
  const nodemailer = await import('nodemailer')
  const port = Number(process.env.SMTP_PORT || 587)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  })
  await transporter.sendMail({ from, to, subject, html })
  return true
}

const senders: Record<MailProviderId, (to: string, from: string, subject: string, html: string) => Promise<boolean>> = {
  sendgrid: sendViaSendGrid,
  smtp: sendViaSmtp,
  brevo: sendViaBrevo,
}

export async function sendCodeEmail(
  to: string,
  name: string,
  code: string,
  kind: 'verify' | 'reset'
): Promise<SendCodeResult> {
  const subject = kind === 'verify' ? 'Your Cortex verification code' : 'Your Cortex password reset code'
  const html = codeEmailHtml(name, code, kind)

  const providers = configuredProviders()
  if (providers.length === 0) {
    logDevBanner(to, subject, code)
    return { delivered: false, reason: 'not_configured' }
  }

  const from = mailFrom()
  for (const p of providers) {
    try {
      if (await senders[p](to, from, subject, html)) return { delivered: true }
      console.error(`Mail provider "${p}" rejected the message — trying the next configured provider`)
    } catch (e) {
      console.error(`Mail provider "${p}" threw:`, e)
    }
  }
  return { delivered: false, reason: 'send_failed' }
}
