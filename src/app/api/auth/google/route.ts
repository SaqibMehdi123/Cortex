import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { GOOGLE_SCOPES, getUserSetting, googleConfigured, googleRedirectUri } from '@/lib/google'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// GET /api/auth/google — start the OAuth consent flow (302 to Google).
// The signed-in user's id travels in the `state` param so the callback can
// attach the tokens to the right account even though this endpoint is public.
export async function GET(req: NextRequest) {
  if (!googleConfigured()) {
    return NextResponse.json(
      { error: 'Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env first.' },
      { status: 400 }
    )
  }
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const stateNonce = crypto.randomUUID()
  const state = `${user.id}.${stateNonce}`
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
  // CSRF binding: the callback must see the same nonce in the state param AND
  // in this HttpOnly cookie, plus a session whose user matches the state user.
  // Without it, anyone who knew a victim's user id could complete their own
  // Google consent with state=<victimId>.anything and attach their tokens to
  // the victim's account.
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
  res.cookies.set('g_oauth_state', stateNonce, {
    httpOnly: true,
    sameSite: 'lax', // top-level GET navigation back from Google must send it
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600, // consent screens rarely outlive ten minutes
  })
  return res
}

// DELETE /api/auth/google — disconnect the signed-in user's account and revoke stored tokens.
export async function DELETE() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const setting = await getUserSetting(user.id)
    const raw = setting.googleAuth
    await db.setting.update({ where: { userId: user.id }, data: { googleAuth: null, googleEmail: null } })
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
  } catch (e) {
    console.error('DELETE /api/auth/google error', e)
    return NextResponse.json({ error: 'Failed to disconnect Google account' }, { status: 500 })
  }
}
