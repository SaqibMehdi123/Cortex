import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createSessionToken, verifyPassword, dummyPasswordHash, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/auth'
import { clientIp, rateLimit } from '@/lib/rate-limit'

// POST /api/auth/login — verify credentials and start a session.
// Accounts that never finished email verification get 403 with a distinct
// code so the login page can offer "send a new code" instead of a dead end.
export async function POST(req: NextRequest) {
  try {
    // Password-spray guard: 10 attempts per (IP, email) per 5 min.
    const body = await req.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const rl = await rateLimit(`login:${clientIp(req.headers)}:${email}`, { limit: 10, windowMs: 5 * 60_000 })
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many sign-in attempts. Please try again in ${rl.retryAfter}s.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      )
    }

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })

    // Timing-equalized credential check: an unknown account still pays the
    // full PBKDF2 cost (via a dummy hash) so the 401 response time is flat
    // whether or not the email exists — account existence cannot be read
    // from a stopwatch. The message is identical for both cases.
    let valid = false
    if (user) {
      valid = await verifyPassword(password, user.passwordHash)
    } else {
      await verifyPassword(password, await dummyPasswordHash())
    }
    if (!valid || !user) {
      return NextResponse.json({ error: 'Wrong email or password.' }, { status: 401 })
    }

    if (!user.emailVerified) {
      return NextResponse.json(
        { error: 'Verify your email first — we can send you a fresh code.', code: 'email_not_verified' },
        { status: 403 }
      )
    }

    const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } })
    res.cookies.set(SESSION_COOKIE, await createSessionToken(user.id, user.tokenVersion), SESSION_COOKIE_OPTIONS)
    return res
  } catch (e) {
    console.error('POST /api/auth/login error', e)
    return NextResponse.json({ error: 'Could not sign in. Try again.' }, { status: 500 })
  }
}
