import { NextResponse } from 'next/server'
import { activeMailProvider, configuredFromEmail } from '@/lib/mailer'

// GET /api/ops/health — operator diagnostic for the two external services
// Cortex depends on at runtime (transactional email + PDF Blob storage).
//
// Public by design (middleware allow-list): it returns ONLY booleans, coarse
// error classes and a MASKED sender address — never API keys, tokens, or
// account payloads. Its purpose is to answer "is production actually able to
// send mail / use Blob right now?" without granting dashboard access.
//
// Mail section reflects the active provider (first configured of
// sendgrid → smtp → brevo, same order the mailer sends with).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'no-store' }

interface MailCheck {
  provider: 'sendgrid' | 'smtp' | 'brevo' | null
  from: string | null
  keyValid: boolean | null
  senderFound: boolean | null
  senderConfirmed: boolean | null
  note: string | null
}

function maskEmail(email: string | null): string | null {
  if (!email) return null
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  const head = local.slice(0, 1)
  const tail = local.length > 2 ? local.slice(-1) : ''
  return `${head}${'*'.repeat(Math.max(2, local.length - 2))}${tail}@${domain}`
}

/** Public-safe error text: strip IPv4 addresses, cap length. */
function safeDetail(text: string): string {
  return text.replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '*.*.*.*').replace(/\s+/g, ' ').slice(0, 140)
}

async function checkSendGrid(): Promise<MailCheck> {
  const key = (process.env.SENDGRID_API_KEY || '').trim()
  const base: MailCheck = {
    provider: 'sendgrid',
    from: maskEmail(configuredFromEmail()),
    keyValid: null,
    senderFound: null,
    senderConfirmed: null,
    note: null,
  }
  if (!key) return { ...base, note: 'no provider configured' }
  const headers = { authorization: `Bearer ${key}`, accept: 'application/json' }

  try {
    // 1) Key validity — /v3/scopes lists the key's own scopes; free, read-only.
    const scopesRes = await fetch('https://api.sendgrid.com/v3/scopes', {
      headers,
      signal: AbortSignal.timeout(10_000),
    })
    if (scopesRes.status === 401 || scopesRes.status === 403) {
      return {
        ...base,
        keyValid: false,
        note: 'API key rejected by SendGrid — re-create it under SendGrid → Settings → API Keys (needs "Mail Send" permission) and update SENDGRID_API_KEY',
      }
    }
    if (!scopesRes.ok) return { ...base, keyValid: null, note: `scopes check returned ${scopesRes.status}` }

    // 2) Sender verification — the #1 cause of "provider rejected it".
    const from = configuredFromEmail()
    if (!from)
      return { ...base, keyValid: true, note: 'key valid, but no sender email configured (set MAIL_FROM or SENDGRID_SENDER_EMAIL)' }

    const sendersRes = await fetch('https://api.sendgrid.com/v3/senders', {
      headers,
      signal: AbortSignal.timeout(10_000),
    })
    if (sendersRes.status === 401 || sendersRes.status === 403)
      return {
        ...base,
        keyValid: true,
        note: 'key valid, but restricted — it cannot read sender identities. If sends still fail, verify the From address under SendGrid → Settings → Sender Authentication',
      }
    if (!sendersRes.ok) return { ...base, keyValid: true, note: `senders check returned ${sendersRes.status}` }

    const list = (await sendersRes.json()) as Array<{ from?: { email?: string }; verified?: boolean }>
    const match = Array.isArray(list) ? list.find((s) => (s?.from?.email || '').toLowerCase() === from) : undefined
    if (!match) {
      return {
        ...base,
        keyValid: true,
        senderFound: false,
        senderConfirmed: false,
        note: 'configured sender is NOT a verified Sender Identity — SendGrid → Settings → Sender Authentication → Verify a Single Sender, then click the link in the email',
      }
    }
    const confirmed = match.verified !== false
    return {
      ...base,
      keyValid: true,
      senderFound: true,
      senderConfirmed: confirmed,
      note: confirmed ? 'ok' : 'sender exists but is NOT verified yet — click the confirmation link SendGrid emailed you',
    }
  } catch (e) {
    return { ...base, keyValid: null, note: `sendgrid unreachable: ${e instanceof Error ? e.message : 'network error'}` }
  }
}

async function checkBrevo(): Promise<MailCheck> {
  const key = (process.env.BREVO_API_KEY || '').trim()
  const base: MailCheck = {
    provider: 'brevo',
    from: maskEmail(configuredFromEmail()),
    keyValid: null,
    senderFound: null,
    senderConfirmed: null,
    note: null,
  }
  if (!key) return { ...base, note: 'no provider configured' }

  try {
    // 1) Key validity — /v3/account is a free, side-effect-free call.
    const accRes = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': key, accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (accRes.status === 401 || accRes.status === 403) {
      const detail = safeDetail(await accRes.text().catch(() => ''))
      if (/ip/i.test(detail) && /author|restrict|block|denied|not allowed|unauthor/i.test(detail)) {
        return { ...base, keyValid: false, note: `Brevo IP AUTHORISATION is blocking this server (${detail}) — disable it in Brevo → Senders, Domains & Dedicated IPs → Authorised IPs` }
      }
      if (/suspended|blocked|deactiv/i.test(detail)) {
        return { ...base, keyValid: false, note: `Brevo account issue (${detail}) — check account status/campaigns page` }
      }
      return { ...base, keyValid: false, note: `API key rejected by Brevo (401/403): ${detail || 'no detail'} — re-copy the key from Brevo → SMTP & API → API keys` }
    }
    if (!accRes.ok) {
      return { ...base, keyValid: null, note: `account check returned ${accRes.status}` }
    }

    // 2) Sender confirmation — the #1 cause of "provider rejected it".
    const from = configuredFromEmail()
    if (!from) return { ...base, keyValid: true, note: 'key valid, but no sender email configured (set BREVO_SENDER_EMAIL)' }

    const sendersRes = await fetch('https://api.brevo.com/v3/senders', {
      headers: { 'api-key': key, accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!sendersRes.ok) return { ...base, keyValid: true, note: `senders check returned ${sendersRes.status}` }

    const data = (await sendersRes.json()) as { senders?: Array<{ email?: string; active?: boolean; confirmed?: boolean }> }
    const match = data.senders?.find((s) => (s.email || '').toLowerCase() === from)
    if (!match) {
      return { ...base, keyValid: true, senderFound: false, senderConfirmed: false, note: 'configured sender does not exist in Brevo — add & confirm it under Senders, Domains & Dedicated IPs' }
    }
    const confirmed = match.confirmed ?? match.active ?? false
    return {
      ...base,
      keyValid: true,
      senderFound: true,
      senderConfirmed: confirmed,
      note: confirmed ? 'ok' : 'sender exists but is NOT confirmed — click the link in the email Brevo sent you',
    }
  } catch (e) {
    return { ...base, keyValid: null, note: `brevo unreachable: ${e instanceof Error ? e.message : 'network error'}` }
  }
}

async function checkMail(): Promise<MailCheck> {
  const provider = activeMailProvider()
  if (provider === 'sendgrid') return checkSendGrid()
  if (provider === 'brevo') return checkBrevo()
  return {
    provider,
    from: maskEmail(configuredFromEmail()),
    keyValid: null,
    senderFound: null,
    senderConfirmed: null,
    note: provider === 'smtp' ? 'smtp mode — live check skipped' : 'no provider configured',
  }
}

async function checkBlob() {
  const tokenPresent = Boolean(process.env.BLOB_READ_WRITE_TOKEN)
  if (!tokenPresent) {
    return { tokenPresent, tokenValid: null, error: null, note: 'no Blob store connected — PDFs fall back to server-streaming mode' }
  }
  try {
    const { list } = await import('@vercel/blob')
    await list({ limit: 1 })
    return { tokenPresent, tokenValid: true, error: null, note: 'ok' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = (e as { status?: number }).status
    const error = status === 401 || /access denied|unauthorized/i.test(msg) ? 'unauthorized' : status === 403 || /forbidden/i.test(msg) ? 'forbidden' : 'network'
    return { tokenPresent, tokenValid: false, error, note: msg.slice(0, 160) }
  }
}

/** Last transactional-email events from Brevo, aggregated & anonymised (Brevo is the only provider with a pull-API for events). */
async function checkBrevoEvents(key: string) {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/statistics/events?limit=25&sort=desc', {
      headers: { 'api-key': key, accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return { available: false, note: `events check returned ${res.status}` }
    const data = (await res.json()) as {
      events?: Array<{ event?: string; email?: string; reason?: string; date?: string }>
    }
    const events = data.events ?? []
    const counts: Record<string, number> = {}
    for (const ev of events) if (ev.event) counts[ev.event] = (counts[ev.event] || 0) + 1
    const recent = events.slice(0, 5).map((ev) => ({
      event: ev.event ?? 'unknown',
      to: maskEmail(ev.email ?? null),
      reason: ev.reason ? safeDetail(ev.reason) : undefined,
      date: ev.date,
    }))
    return { available: true, totalRecent: events.length, counts, recent }
  } catch (e) {
    return { available: false, note: `events check failed: ${e instanceof Error ? e.message : 'network'}` }
  }
}

export async function GET() {
  const [mail, blob] = await Promise.all([checkMail(), checkBlob()])
  const brevoEvents =
    mail.provider === 'brevo' && (process.env.BREVO_API_KEY || '').trim() && mail.keyValid
      ? await checkBrevoEvents((process.env.BREVO_API_KEY || '').trim())
      : {
          available: false,
          note:
            mail.provider === 'brevo'
              ? 'brevo key not valid — events unavailable'
              : `events feed is Brevo-only (active provider: ${mail.provider ?? 'none'})`,
        }
  const mailOk =
    mail.provider === 'sendgrid' || mail.provider === 'brevo'
      ? mail.keyValid === true && mail.senderConfirmed === true
      : mail.provider === 'smtp'
  return NextResponse.json(
    {
      ok: mailOk && (blob.tokenPresent ? blob.tokenValid === true : true),
      mail,
      brevoEvents,
      blob,
      checkedAt: new Date().toISOString(),
    },
    { headers: noStore }
  )
}
