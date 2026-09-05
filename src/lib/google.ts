import { NextRequest } from 'next/server'
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

export async function getSetting() {
  const existing = await db.setting.findUnique({ where: { id: 'user' } })
  if (existing) return existing
  return db.setting.create({ data: { id: 'user' } })
}

function parseTokens(raw: string | null): GoogleTokens | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as GoogleTokens
  } catch {
    return null
  }
}

// Returns a valid access token, refreshing via the stored refresh_token when
// needed. Returns null when the account is not connected.
export async function getAccessToken(): Promise<string | null> {
  const setting = await getSetting()
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
    const refreshed = (await res.json()) as GoogleTokens
    const merged: GoogleTokens = {
      ...tokens,
      access_token: refreshed.access_token,
      expiry_date: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
      refresh_token: refreshed.refresh_token ?? tokens.refresh_token,
    }
    await db.setting.update({ where: { id: 'user' }, data: { googleAuth: JSON.stringify(merged) } })
    return merged.access_token
  } catch (e) {
    console.error('google token refresh failed', e)
    return null
  }
}

export async function googleGet<T>(url: string): Promise<T | null> {
  const token = await getAccessToken()
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
