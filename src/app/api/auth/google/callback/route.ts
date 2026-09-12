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

  // Full state binding (three checks — all must pass):
  //   1. a session exists (the connect flow always starts signed-in),
  //   2. the state's user id equals the session user,
  //   3. the state's nonce equals the HttpOnly cookie set when the flow
  //      started (proves THIS browser started THIS flow).
  // This replaces the old "trust any state whose user exists" logic, which
  // let a third party attach their Google tokens to a victim's account.
  const [stateUserId, stateNonce] = state.split('.')
  const cookieNonce = req.cookies.get('g_oauth_state')?.value
  const sessionUser = await getSessionUser()
  if (!sessionUser || !stateUserId || !stateNonce || !cookieNonce) {
    return NextResponse.redirect(`${origin}/app?google=error:state_mismatch`)
  }
  if (stateUserId !== sessionUser.id || stateNonce !== cookieNonce) {
    return NextResponse.redirect(`${origin}/app?google=error:state_mismatch`)
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
