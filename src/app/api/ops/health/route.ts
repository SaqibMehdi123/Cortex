import { NextResponse } from 'next/server'

// GET /api/ops/health — operator diagnostic for the two external services
// Cortex depends on at runtime (transactional email + PDF Blob storage).
//
// Public by design (middleware allow-list): it returns ONLY booleans, coarse
// error classes and a MASKED sender address — never API keys, tokens, or
// account payloads. Its purpose is to answer "is production actually able to
// send mail / use Blob right now?" without granting dashboard access.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'no-store' }

function maskEmail(email: string | null): string | null {
  if (!email) return null
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  const head = local.slice(0, 1)
  const tail = local.length > 2 ? local.slice(-1) : ''
  return `${head}${'*'.repeat(Math.max(2, local.length - 2))}${tail}@${domain}`
}

/** Same derivation the mailer uses for the From address. */
function configuredFromEmail(): string | null {
  const raw =
    process.env.MAIL_FROM ||
    (process.env.BREVO_API_KEY
      ? `${process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER || ''}`
      : process.env.SMTP_USER || '')
  const m = raw.match(/<([^>]+)>/)
  const email = (m ? m[1] : raw).trim()
  return email && email.includes('@') ? email.toLowerCase() : null
}

async function checkBrevo() {
  const key = (process.env.BREVO_API_KEY || '').trim()
  const provider = key ? 'brevo' : process.env.SMTP_HOST ? 'smtp' : null
  const base = {
    provider,
    from: maskEmail(configuredFromEmail()),
    keyValid: null as boolean | null,
    senderFound: null as boolean | null,
    senderConfirmed: null as boolean | null,
    note: null as string | null,
  }
  if (!key) return { ...base, note: provider === 'smtp' ? 'smtp mode — live check skipped' : 'no provider configured' }

  try {
    // 1) Key validity — /v3/account is a free, side-effect-free call.
    const accRes = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': key, accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (accRes.status === 401 || accRes.status === 403) {
      return { ...base, keyValid: false, note: 'API key rejected by Brevo (401/403) — re-copy the key from Brevo → SMTP & API → API keys' }
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

export async function GET() {
  const [mail, blob] = await Promise.all([checkBrevo(), checkBlob()])
  return NextResponse.json(
    { ok: (mail.provider === 'brevo' ? mail.keyValid && mail.senderConfirmed : Boolean(mail.provider)) && (blob.tokenPresent ? blob.tokenValid === true : true), mail, blob, checkedAt: new Date().toISOString() },
    { headers: noStore }
  )
}
