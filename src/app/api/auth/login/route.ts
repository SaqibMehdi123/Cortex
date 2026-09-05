import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createSessionToken, verifyPassword, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/auth'

// POST /api/auth/login — verify credentials and start a session.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: 'Wrong email or password.' }, { status: 401 })
    }

    const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } })
    res.cookies.set(SESSION_COOKIE, await createSessionToken(user.id), SESSION_COOKIE_OPTIONS)
    return res
  } catch (e) {
    console.error('POST /api/auth/login error', e)
    return NextResponse.json({ error: 'Could not sign in. Try again.' }, { status: 500 })
  }
}
