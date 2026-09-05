import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { GOOGLE_SCOPES, getSetting, googleConfigured, googleRedirectUri } from '@/lib/google'

// GET /api/auth/google — start the OAuth consent flow (302 to Google).
export async function GET(req: NextRequest) {
  if (!googleConfigured()) {
    return NextResponse.json(
      { error: 'Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env first.' },
      { status: 400 }
    )
  }
  const state = crypto.randomUUID()
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(req),
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline', // need refresh_token for background sync
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
}

// DELETE /api/auth/google — disconnect the account and revoke stored tokens.
export async function DELETE() {
  const setting = await getSetting()
  const raw = setting.googleAuth
  await db.setting.update({ where: { id: 'user' }, data: { googleAuth: null, googleEmail: null } })
  // Best-effort revocation so the refresh token can't be replayed
  if (raw) {
    try {
      const tokens = JSON.parse(raw) as { access_token?: string }
      if (tokens.access_token) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.access_token}`, { method: 'POST' })
      }
    } catch {}
  }
  return NextResponse.json({ ok: true })
}
