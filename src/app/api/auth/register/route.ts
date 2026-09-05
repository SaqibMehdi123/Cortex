import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createSessionToken, hashPassword, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/auth'

// POST /api/auth/register — create an account and start a session.
// Every account gets its own private workspace: a fresh Settings row is
// created for the new user and no existing data is shared or adopted.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const name = String(body.name ?? '').trim()
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')

    if (!name || name.length > 80) {
      return NextResponse.json({ error: 'Please tell me your name.' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password needs at least 8 characters.' }, { status: 400 })
    }

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists — try signing in.' }, { status: 409 })
    }

    const user = await db.user.create({
      data: { name, email, passwordHash: await hashPassword(password) },
    })

    // each account starts with its own private workspace preferences
    await db.setting.create({
      data: { userId: user.id, name: name.split(' ')[0] },
    })

    const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } }, { status: 201 })
    res.cookies.set(SESSION_COOKIE, await createSessionToken(user.id), SESSION_COOKIE_OPTIONS)
    return res
  } catch (e) {
    console.error('POST /api/auth/register error', e)
    return NextResponse.json({ error: 'Could not create the account. Try again.' }, { status: 500 })
  }
}
