import { NextResponse } from 'next/server'
import net from 'node:net'
import { activeMailProvider, configuredFromEmail } from '@/lib/mailer'
import { r2Configured, r2ConnectionCheck } from '@/lib/storage'
import { aiConfigured, aiProvider, AI_MODEL } from '@/lib/ai'

// GET /api/ops/health — operator diagnostic for the external services
// Cortex depends on at runtime (transactional email, PDF Blob storage, AI).
//
// Public by design (middleware allow-list): it returns ONLY booleans, coarse
// error classes, provider/model NAMES and a MASKED sender address — never API
// keys, tokens, or account payloads. Its purpose is to answer "is production
// actually able to send mail / use Blob / call the AI provider right now?"
// without granting dashboard access.
//
// Mail section reflects the active provider (first configured of
// sendgrid → smtp → brevo, same order the mailer sends with).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'no-store' }

interface MailCheck {
  provider: 'resend' | 'sendgrid' | 'smtp' | 'brevo' | null
  from: string | null
  keyValid: boolean | null
  senderFound: boolean | null
  senderConfirmed: boolean | null
  note: string | null
  /** smtp mode only — did a real TCP connect to SMTP_HOST:PORT succeed? */
  portReachable?: boolean | null
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

/**
 * LIVE SMTP reachability probe. Raw SMTP used to be reported as "ok" without
 * any network test — while Vercel functions block outbound SMTP ports
 * (25/587), so the morning briefing silently never sent. A TCP connect
 * attempt makes that failure visible here instead of in a missing inbox.
 */
async function probeSmtpPort(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const done = (ok: boolean) => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(8_000)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

async function checkSmtp(): Promise<MailCheck> {
  const base: MailCheck = {
    provider: 'smtp',
    from: maskEmail(configuredFromEmail()),
    keyValid: null,
    senderFound: null,
    senderConfirmed: null,
    note: null,
    portReachable: null,
  }
  const host = (process.env.SMTP_HOST || '').trim()
  const port = Number(process.env.SMTP_PORT || 587)
  if (!host) return { ...base, note: 'SMTP_HOST not set' }

  const reachable = await probeSmtpPort(host, port)
  if (!reachable) {
    return {
      ...base,
      portReachable: false,
      note: `SMTP port ${port} is UNREACHABLE from this runtime — serverless platforms (Vercel) block outbound SMTP, so NO email can send via raw SMTP. Add an HTTP-API provider (RESEND_API_KEY or SENDGRID_API_KEY) — it sits above SMTP in the fallback chain and needs no redeploy of code, only the env var.`,
    }
  }
  return {
    ...base,
    portReachable: true,
    note: `port ${port} reachable — SMTP connection possible (delivery still depends on credentials/sender policy)`,
  }
}

async function checkResend(): Promise<MailCheck> {
  const key = (process.env.RESEND_API_KEY || '').trim()
  const base: MailCheck = {
    provider: 'resend',
    from: maskEmail(process.env.RESEND_FROM || 'onboarding@resend.dev'),
    keyValid: null,
    senderFound: null,
    senderConfirmed: null,
    note: null,
  }
  if (!key) return { ...base, note: 'no provider configured' }

  try {
    // GET /domains is a free, read-only key-validity probe.
    const res = await fetch('https://api.resend.com/domains', {
      headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 401 || res.status === 403)
      return { ...base, keyValid: false, note: 'API key rejected by Resend — re-create it under resend.com → API Keys' }
    if (!res.ok) return { ...base, keyValid: null, note: `domains check returned ${res.status}` }
    return { ...base, keyValid: true, note: 'ok — HTTP API works from serverless; without a verified domain sends go from onboarding@resend.dev and deliver to the Resend account\'s own email only' }
  } catch (e) {
    return { ...base, keyValid: null, note: `resend unreachable: ${e instanceof Error ? e.message : 'network error'}` }
  }
}

async function checkMail(): Promise<MailCheck> {
  const provider = activeMailProvider()
  if (provider === 'resend') return checkResend()
  if (provider === 'sendgrid') return checkSendGrid()
  if (provider === 'smtp') return checkSmtp()
  if (provider === 'brevo') return checkBrevo()
  return {
    provider,
    from: maskEmail(configuredFromEmail()),
    keyValid: null,
    senderFound: null,
    senderConfirmed: null,
    note: 'no provider configured',
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

/** Public-safe R2 check: booleans + S3 protocol error CODE only (codes are
 * constants like SignatureDoesNotMatch — no bucket names, endpoints, IPs, or
 * SDK messages, which can echo credentials). */
async function checkR2() {
  const configured = r2Configured()
  if (!configured) {
    return {
      configured,
      connectionOk: null as boolean | null,
      errorCode: 'NOT_CONFIGURED' as string,
      hint: 'R2 env vars not set — uploads use Vercel Blob (or disk locally)',
    }
  }
  const check = await r2ConnectionCheck()
  return {
    configured,
    connectionOk: check.ok,
    writeOk: check.writeOk,
    errorCode: check.code,
    hint: check.hint,
    accountIdShape: check.accountId,
  }
}

/** Public-safe AI check: provider + model NAMES and booleans only (no keys).
 *  Uses the OpenAI-compat GET /models endpoint — free, read-only — to prove
 *  the key is accepted AND that the configured model actually exists there
 *  (a wrong AI_MODEL otherwise only surfaces as a confusing chat failure). */
async function checkAI() {
  const provider = aiProvider()
  const model = AI_MODEL
  if (!aiConfigured()) {
    return {
      configured: false,
      provider,
      model,
      keyValid: null as boolean | null,
      modelAvailable: null as boolean | null,
      note: 'OPENAI_API_KEY not set on this deployment — copilot, doc Q&A, summaries, flashcards and mindmaps all fail until it is set and the project is redeployed',
    }
  }
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
  try {
    const res = await fetch(`${base}/models`, {
      headers: { authorization: `Bearer ${(process.env.OPENAI_API_KEY || '').trim()}`, accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 401 || res.status === 403) {
      return { configured: true, provider, model, keyValid: false, modelAvailable: null, note: 'API key rejected by the provider — re-copy it (for Gemini: aistudio.google.com/apikey, keys start with AIza) and redeploy' }
    }
    if (!res.ok) {
      return { configured: true, provider, model, keyValid: null, modelAvailable: null, note: `models check returned ${res.status}` }
    }
    const data = (await res.json()) as { data?: Array<{ id?: string }> }
    const ids = (data.data ?? []).map((m) => (m.id || '').replace(/^models\//, ''))
    const available = ids.length === 0 ? null : ids.includes(model)
    return {
      configured: true,
      provider,
      model,
      keyValid: true,
      modelAvailable: available,
      note:
        available === false
          ? `key valid, but model "${model}" is NOT in the provider's model list — set AI_MODEL to one of: ${ids.filter((i) => i.includes('gemini') || i.includes('gpt') || i.includes('llama')).slice(0, 6).join(', ') || '(see provider docs)'} and redeploy`
          : available === true
            ? 'ok — key accepted and model exists'
            : 'key accepted; provider returned no model list to verify against — a real chat request is the only remaining proof',
    }
  } catch (e) {
    return { configured: true, provider, model, keyValid: null, modelAvailable: null, note: `provider unreachable: ${e instanceof Error ? e.message : 'network error'}` }
  }
}

/** Public-safe billing check: WHICH providers are configured (booleans only —
 *  no ids, tokens, or store numbers). When a Polar token exists, probes
 *  GET /v1/products to prove the token works AND that the configured product
 *  ids actually belong to that org/mode — a wrong product id otherwise only
 *  surfaces as an opaque "checkout failed" at click time. */
async function checkBilling() {
  const token = (process.env.POLAR_ACCESS_TOKEN || '').trim()
  const monthlyId = (process.env.POLAR_PRODUCT_ID_MONTHLY || '').trim()
  const annualId = (process.env.POLAR_PRODUCT_ID_ANNUAL || '').trim()
  const polarConfigured = Boolean(token && monthlyId)
  const lemonsqueezyConfigured = Boolean(
    (process.env.LEMONSQUEEZY_API_KEY || '').trim() &&
      (process.env.LEMONSQUEEZY_STORE_ID || '').trim() &&
      (process.env.LEMONSQUEEZY_VARIANT_ID || '').trim()
  )
  const safepayConfigured = Boolean((process.env.SAFEPAY_SECRET_KEY || '').trim())
  const base = {
    polarConfigured,
    polarMonthlyProductSet: Boolean(monthlyId),
    polarAnnualProductSet: Boolean(annualId),
    lemonsqueezyConfigured,
    safepayConfigured,
    // BILLING_TEST_MODE=true short-circuits ALL providers: Upgrade returns a
    // fake /app?billing=test redirect and emails a sample receipt. It exists
    // for local dev / provider-onboarding evidence only — if it is ever left
    // on in production, buyers see a "completed checkout" that charged nobody
    // and the real providers are never called. Surface it loudly here.
    testMode: (process.env.BILLING_TEST_MODE || '').trim().toLowerCase() === 'true',
    checkoutReady: polarConfigured || lemonsqueezyConfigured || safepayConfigured,
    tokenValid: null as boolean | null,
    monthlyProductFound: null as boolean | null,
    annualProductFound: null as boolean | null,
    note: '',
  }
  if (base.testMode) {
    return {
      ...base,
      note:
        'BILLING_TEST_MODE is ON — Upgrade clicks skip every real provider (fake redirect + sample receipt email). Remove BILLING_TEST_MODE in Vercel → Settings → Environment Variables and redeploy to take real payments.',
    }
  }
  if (!base.checkoutReady) {
    return { ...base, note: 'no payment provider configured — Upgrade shows "launching soon" (Polar needs POLAR_ACCESS_TOKEN + POLAR_PRODUCT_ID_MONTHLY at minimum)' }
  }
  if (!token) {
    return { ...base, note: 'checkout will use the first configured non-Polar provider for the visitor\'s geo' }
  }
  const sandbox = (process.env.POLAR_MODE || 'live').toLowerCase() === 'sandbox'
  try {
    const res = await fetch(`${sandbox ? 'https://sandbox-api.polar.sh' : 'https://api.polar.sh'}/v1/products?limit=100`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 401 || res.status === 403) {
      return { ...base, tokenValid: false, note: `Polar access token REJECTED on the ${sandbox ? 'sandbox' : 'live'} API — the token was likely created in the other org (check POLAR_MODE) or was revoked; regenerate under polar.sh → Settings → API, update POLAR_ACCESS_TOKEN in Vercel, and REDEPLOY (env changes never reach an already-running deployment)` }
    }
    if (!res.ok) {
      return { ...base, tokenValid: null, note: `Polar products check returned ${res.status}` }
    }
    const data = (await res.json()) as { items?: Array<{ id?: string }> }
    const ids = new Set((data.items ?? []).map((p) => p.id || ''))
    const foundMonthly = monthlyId ? ids.has(monthlyId) : null
    const foundAnnual = annualId ? ids.has(annualId) : null
    let note = `ok — token accepted on the ${sandbox ? 'sandbox' : 'live'} API`
    if (foundMonthly === false || foundAnnual === false) {
      note = `token accepted, but ${foundMonthly === false ? 'POLAR_PRODUCT_ID_MONTHLY ' : ''}${foundAnnual === false ? (foundMonthly === false ? 'and ' : '') + 'POLAR_PRODUCT_ID_ANNUAL ' : ''}do(es) NOT exist in this ${sandbox ? 'sandbox' : 'live'} org — create the product(s) in polar.sh's ${sandbox ? 'sandbox' : 'live'} dashboard and copy the right ids (or fix POLAR_MODE)`
    }
    return { ...base, tokenValid: true, monthlyProductFound: foundMonthly, annualProductFound: foundAnnual, note }
  } catch (e) {
    return { ...base, tokenValid: null, note: `Polar unreachable: ${e instanceof Error ? e.message : 'network error'}` }
  }
}

export async function GET() {
  const [mail, blob, r2, ai, billing] = await Promise.all([checkMail(), checkBlob(), checkR2(), checkAI(), checkBilling()])
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
    mail.provider === 'resend' || mail.provider === 'sendgrid' || mail.provider === 'brevo'
      ? mail.keyValid === true && mail.senderConfirmed !== false
      : mail.provider === 'smtp'
        ? mail.portReachable === true
        : false
  const storageOk = r2.configured ? r2.connectionOk === true : blob.tokenPresent ? blob.tokenValid === true : true
  return NextResponse.json(
    {
      ok: mailOk && storageOk,
      mail,
      brevoEvents,
      blob,
      r2,
      ai,
      billing,
      checkedAt: new Date().toISOString(),
    },
    { headers: noStore }
  )
}
