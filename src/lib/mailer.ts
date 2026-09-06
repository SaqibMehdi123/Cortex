// Outgoing email for verification / password-reset codes.
//
// Two delivery channels, tried in this order:
//   1. Resend HTTPS API  — set RESEND_API_KEY (no SMTP ports, no domain needed
//      to mail your own address; free tier is enough for a personal tool)
//   2. Raw SMTP          — set SMTP_HOST + SMTP_USER + SMTP_PASS
//      (Gmail users: create an App Password, regular passwords are rejected)
//
// If neither is configured the email content is printed to the server log and
// the caller receives { delivered: false, reason: 'not_configured' } — the
// verification code is NEVER returned to the browser unless the operator
// explicitly opts in with AUTH_DEV_CODE_FALLBACK=true (local development only).
//
// Environment (all optional):
//   RESEND_API_KEY            preferred channel
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE ("true" for 465)
//   MAIL_FROM                 e.g. "Cortex <no-reply@yourdomain.com>"
//                             (Resend default: onboarding@resend.dev — may only
//                              send to your own account email until a domain
//                              is verified)
//   AUTH_DEV_CODE_FALLBACK    "true" → API responses may include devCode
//                             when delivery is impossible (DEV ONLY)

export type MailReason = 'not_configured' | 'send_failed'

export interface SendCodeResult {
  delivered: boolean // true = handed to a real mail provider
  reason?: MailReason
}

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS))
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

async function sendViaResend(to: string, from: string, subject: string, html: string): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error(`Resend send failed (${res.status}):`, detail.slice(0, 400))
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

export async function sendCodeEmail(
  to: string,
  name: string,
  code: string,
  kind: 'verify' | 'reset'
): Promise<SendCodeResult> {
  const subject = kind === 'verify' ? 'Your Cortex verification code' : 'Your Cortex password reset code'
  const html = codeEmailHtml(name, code, kind)

  const resendKey = process.env.RESEND_API_KEY
  const smtpReady = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)

  if (!resendKey && !smtpReady) {
    logDevBanner(to, subject, code)
    return { delivered: false, reason: 'not_configured' }
  }

  const from = process.env.MAIL_FROM || (resendKey ? 'Cortex <onboarding@resend.dev>' : String(process.env.SMTP_USER))

  try {
    const delivered = resendKey ? await sendViaResend(to, from, subject, html) : await sendViaSmtp(to, from, subject, html)
    if (delivered) return { delivered: true }
    // Provider exists but rejected/failed — fall through to SMTP when both are set.
    if (resendKey && smtpReady) {
      try {
        await sendViaSmtp(to, from, subject, html)
        return { delivered: true }
      } catch (e2) {
        console.error('SMTP fallback send failed:', e2)
      }
    }
    return { delivered: false, reason: 'send_failed' }
  } catch (e) {
    console.error('Email send failed:', e)
    return { delivered: false, reason: 'send_failed' }
  }
}
