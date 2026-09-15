import { NextResponse } from 'next/server'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { sendEmail, configuredProviders } from '@/lib/mailer'

// POST /api/ops/test-email — one-click deliverability probe for the signed-in
// operator. Sends a short "test" message to the caller's own address through
// the SAME provider chain the 9 AM morning briefing uses, then reports the
// concrete outcome (provider, delivered, underlying error text).
//
// Why: raw SMTP from serverless can fail at the auth/TLS layer even when the
// port is reachable, and the cron's only trace is a Vercel log line. This
// endpoint turns "no email at 9" into a visible, actionable answer.
//
// NOT in the middleware PUBLIC_APIS allow-list → requires a session. Rate
// limited in-memory (per lambda instance) to prevent mail-bombing.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const hits = new Map<string, number>()
const COOLDOWN_MS = 30_000

export async function POST() {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const last = hits.get(user.id) ?? 0
  if (Date.now() - last < COOLDOWN_MS) {
    return NextResponse.json(
      { error: 'Wait a few seconds between test emails.' },
      { status: 429 }
    )
  }
  hits.set(user.id, Date.now())

  const providers = configuredProviders()
  if (providers.length === 0) {
    return NextResponse.json({
      delivered: false,
      provider: null,
      reason: 'not_configured',
      detail: 'No mail provider env vars are set (RESEND_API_KEY / SENDGRID_API_KEY / SMTP_* / BREVO_API_KEY).',
    })
  }

  const started = Date.now()
  const result = await sendEmail(
    user.email,
    'Cortex test email',
    `<div style="max-width:440px;margin:0 auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#18181b;">Cortex — mail test</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#52525b;">
        If you can read this, outgoing mail works. This is the same chain the
        9 AM morning briefing uses — sent ${new Date().toISOString()}.
      </p>
    </div>`
  )

  return NextResponse.json({
    delivered: result.delivered,
    provider: result.provider ?? null,
    reason: result.reason ?? null,
    detail: result.detail ?? null,
    providersConfigured: providers,
    elapsedMs: Date.now() - started,
    to: user.email,
  })
}
