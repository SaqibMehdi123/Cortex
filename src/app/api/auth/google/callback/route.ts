import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserSetting, googleConfigured, googleRedirectUri } from '@/lib/google'
import { getSessionUser } from '@/lib/auth-server'

// GET /api/auth/google/callback — exchange the authorization code for
// tokens, read the user's email, persist everything, then bounce to the app.
export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin
  const code = new URL(req.url).searchParams.get('code')
  const error = new URL(req.url).searchParams.get('error')
  const state = new URL(req.url).searchParams.get('state') ?? ''

  if (error) return NextResponse.redirect(`${origin}/app?google=denied:${encodeURIComponent(error)}`)
  if (!code) return NextResponse.redirect(`${origin}/app?google=error:no_code`)

  // The user id that started the flow rides in `state`; fall back to the
  // current session cookie (same browser) if the state is malformed.
  let stateUserId = state.split('.')[0]
  if (stateUserId) {
    const exists = await db.user.findUnique({ where: { id: stateUserId }, select: { id: true } })
    if (!exists) stateUserId = ''
  }
  if (!stateUserId) {
    const sessionUser = await getSessionUser()
    if (!sessionUser) return NextResponse.redirect(`${origin}/app?google=error:no_session`)
    stateUserId = sessionUser.id
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: googleRedirectUri(req),
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!tokenRes.ok) {
      const detail = await tokenRes.text()
      console.error('google token exchange failed', detail.slice(0, 300))
      return NextResponse.redirect(`${origin}/app?google=error:token_exchange`)
    }
    const tokens = (await tokenRes.json()) as {
      access_token: string
      refresh_token?: string
      expires_in?: number
      scope?: string
    }

    // Who logged in?
    let email: string | null = null
    let name: string | null = null
    try {
      const ui = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(15000),
      })
      if (ui.ok) {
        const info = (await ui.json()) as { email?: string; name?: string }
        email = info.email ?? null
        name = info.name ?? null
      }
    } catch {}

    const setting = await getUserSetting(stateUserId)
    await db.setting.update({
      where: { userId: stateUserId },
      data: {
        googleAuth: JSON.stringify({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expiry_date: Date.now() + (tokens.expires_in ?? 3600) * 1000,
          scope: tokens.scope,
        }),
        googleEmail: email,
      },
    })

    return NextResponse.redirect(`${origin}/app?google=connected${name ? `&name=${encodeURIComponent(name)}` : ''}`)
  } catch (e) {
    console.error('GET /api/auth/google/callback error', e)
    return NextResponse.redirect(`${origin}/app?google=error:callback_failed`)
  }
}
