import { NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { db } from '@/lib/db'
// ─── Google OAuth 2.0 + Gmail + Calendar helpers ─────────────────────
// Credentials come from env: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.
// Redirect URI is derived from the request origin (overridable via
// GOOGLE_REDIRECT_URI) and shown in Settings so it can be pasted into
// the Google Cloud Console.

export const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ')

export interface GoogleTokens {
  access_token: string
  refresh_token?: string
  expiry_date?: number
  scope?: string
  token_type?: string
}

// ─── Tokens at rest (AES-256-GCM) ─────────────────────────────────────────
//
// googleAuth holds a live Gmail-read + Calendar-write refresh token per user.
// Stored plaintext, one DB leak = persistent mailbox access for every
// connected account — so the JSON blob is encrypted with a key derived from
// AUTH_SECRET before it ever touches the database. Values written before
// this change are read via the legacy-plaintext fallback and silently
// upgraded to ciphertext on the next refresh; AUTH_SECRET rotation simply
// forces users through reconnect (fail-closed, nothing decrypts).

const ENC_PREFIX = 'enc.v1:'

function tokenCipherKey(): Buffer {
  const secret = process.env.AUTH_SECRET || 'cortex-local-dev-secret-change-me'
  return crypto.createHash('sha256').update(`cortex-google-tokens:${secret}`).digest()
}

export function encryptGoogleTokens(json: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenCipherKey(), iv)
  const data = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ENC_PREFIX + Buffer.concat([iv, tag, data]).toString('base64')
}

/** Returns the token JSON string, or null when the blob cannot be opened. */
function decryptGoogleTokens(raw: string): string | null {
  if (!raw.startsWith(ENC_PREFIX)) return raw // legacy plaintext — upgraded on next write
  try {
    const buf = Buffer.from(raw.slice(ENC_PREFIX.length), 'base64')
    const decipher = crypto.createDecipheriv('aes-256-gcm', tokenCipherKey(), buf.subarray(0, 12))
    decipher.setAuthTag(buf.subarray(12, 28))
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8')
  } catch (e) {
    console.error('google token decrypt failed (reconnect required)', e)
    return null
  }
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function googleRedirectUri(req: NextRequest): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI
  const origin = req.headers.get('x-forwarded-proto')
    ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('x-forwarded-host') ?? req.headers.get('host')}`
    : new URL(req.url).origin
  return `${origin}/api/auth/google/callback`
}

// ─── Per-user settings row (created on demand) ──────────────────────────
export async function getUserSetting(userId: string) {
  const existing = await db.setting.findUnique({ where: { userId } })
  if (existing) return existing
  return db.setting.create({ data: { userId } })
}

function parseTokens(raw: string | null): GoogleTokens | null {
  if (!raw) return null
  try {
    const json = decryptGoogleTokens(raw)
    return json ? (JSON.parse(json) as GoogleTokens) : null
  } catch {
    return null
  }
}

// Returns a valid access token for the given user, refreshing via the stored
// refresh_token when needed. Returns null when the account is not connected.
export async function getAccessToken(userId: string): Promise<string | null> {
  const setting = await getUserSetting(userId)
  const tokens = parseTokens(setting.googleAuth)
  if (!tokens?.access_token) return null

  const expiresSoon = !tokens.expiry_date || tokens.expiry_date < Date.now() + 60_000
  if (!expiresSoon) return tokens.access_token

  if (!tokens.refresh_token || !googleConfigured()) {
    // Access token expired and we cannot refresh — force reconnect
    return null
  }

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const refreshed = (await res.json()) as GoogleTokens & { expires_in?: number }
    const merged: GoogleTokens = {
      ...tokens,
      access_token: refreshed.access_token,
      expiry_date: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
      refresh_token: refreshed.refresh_token ?? tokens.refresh_token,
    }
    await db.setting.update({ where: { userId }, data: { googleAuth: encryptGoogleTokens(JSON.stringify(merged)) } })
    return merged.access_token
  } catch (e) {
    console.error('google token refresh failed', e)
    return null
  }
}

export async function googleGet<T>(url: string, userId: string): Promise<T | null> {
  const token = await getAccessToken(userId)
  if (!token) return null
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) {
    console.error(`google GET ${url} → ${res.status}`)
    return null
  }
  return (await res.json()) as T
}
