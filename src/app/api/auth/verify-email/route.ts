import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  createSessionToken,
  hashCode,
  CODE_MAX_ATTEMPTS,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from '@/lib/auth'

// POST /api/auth/verify-email { email, code } — check the 6-digit code and, on
// success, mark the account verified and start the first session.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const code = String(body.code ?? '').trim()

    if (!email || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Enter the 6-digit code from your email.' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: 'No account found for this email.' }, { status: 404 })
    }

    if (user.emailVerified) {
      // Already verified — just sign them in (idempotent UX).
      const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email }, alreadyVerified: true })
      res.cookies.set(SESSION_COOKIE, await createSessionToken(user.id), SESSION_COOKIE_OPTIONS)
      return res
    }

    const record = await db.verificationCode.findFirst({
      where: { userId: user.id, purpose: 'email_verify', usedAt: null },
      orderBy: { createdAt: 'desc' },
    })

    const fail = (msg: string, status = 401) => NextResponse.json({ error: msg }, { status })

    if (!record) return fail('No active code — request a new one.')
    if (record.expiresAt < new Date()) return fail('That code has expired — request a new one.')
    if (record.attempts >= CODE_MAX_ATTEMPTS) return fail('Too many wrong attempts — request a new code.')

    if (record.codeHash !== (await hashCode(code))) {
      await db.verificationCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } })
      const left = CODE_MAX_ATTEMPTS - record.attempts - 1
      return fail(left > 0 ? `Wrong code — ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong attempts — request a new code.')
    }

    // Success: burn the code, mark verified, invalidate any other pending codes.
    await db.$transaction([
      db.verificationCode.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      db.verificationCode.updateMany({
        where: { userId: user.id, purpose: 'email_verify', usedAt: null },
        data: { usedAt: new Date() },
      }),
      db.user.update({ where: { id: user.id }, data: { emailVerified: true } }),
    ])

    const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } })
    res.cookies.set(SESSION_COOKIE, await createSessionToken(user.id), SESSION_COOKIE_OPTIONS)
    return res
  } catch (e) {
    console.error('POST /api/auth/verify-email error', e)
    return NextResponse.json({ error: 'Verification failed. Try again.' }, { status: 500 })
  }
}
