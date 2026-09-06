// Outgoing email for verification codes. Uses real SMTP when SMTP_HOST (and
// credentials) are configured in the environment; otherwise the email content
// is written to the server log and the caller surfaces the code in the UI as
// a clearly-labelled development fallback — so the flow works end-to-end on a
// machine with no mail server.
//
// Environment (all optional):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE ("true" for 465),
//   MAIL_FROM (e.g. "Cortex <no-reply@yourdomain.com>")

export interface SendCodeResult {
  delivered: boolean // true = actually sent via SMTP
  reason?: 'not_configured' | 'send_failed'
}

const smtpConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)

function codeEmailHtml(name: string, code: string, kind: 'verify' | 'reset'): string {
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

export async function sendCodeEmail(
  to: string,
  name: string,
  code: string,
  kind: 'verify' | 'reset'
): Promise<SendCodeResult> {
  const subject = kind === 'verify' ? 'Your Cortex verification code' : 'Your Cortex password reset code'
  const html = codeEmailHtml(name, code, kind)

  if (!smtpConfigured()) {
    // Development fallback: print a clearly-marked banner to the server log.
    console.log(
      [
        '',
        '┌─────────────────────────────────────────────────',
        `│  DEV EMAIL (SMTP not configured)`,
        `│  to:      ${to}`,
        `│  subject: ${subject}`,
        `│  code:    ${code}`,
        '└─────────────────────────────────────────────────',
        '',
      ].join('\n')
    )
    return { delivered: false, reason: 'not_configured' }
  }

  try {
    // Dynamic import keeps nodemailer out of any edge/bundled path.
    const nodemailer = await import('nodemailer')
    const port = Number(process.env.SMTP_PORT || 587)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
    })
    return { delivered: true }
  } catch (e) {
    console.error('SMTP send failed:', e)
    return { delivered: false, reason: 'send_failed' }
  }
}
