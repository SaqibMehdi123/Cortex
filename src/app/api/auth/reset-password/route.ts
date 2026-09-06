import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  hashPassword,
  hashCode,
  CODE_MAX_ATTEMPTS,
} from '@/lib/auth'

// POST /api/auth/reset-password { email, code, newPassword } — step 2 of the
// reset flow. Validates the 6-digit code, swaps the password and burns every
// pending reset code. The user then signs in with the new password.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const code = String(body.code ?? '').trim()
    const newPassword = String(body.newPassword ?? '')

    if (!email || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Enter the 6-digit code from your email.' }, { status: 400 })
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password needs at least 8 characters.' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: 'No account found for this email.' }, { status: 404 })
    }

    const record = await db.verificationCode.findFirst({
      where: { userId: user.id, purpose: 'password_reset', usedAt: null },
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

    await db.$transaction([
      db.verificationCode.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      db.verificationCode.updateMany({
        where: { userId: user.id, purpose: 'password_reset', usedAt: null },
        data: { usedAt: new Date() },
      }),
      db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword), emailVerified: true } }),
    ])

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('POST /api/auth/reset-password error', e)
    return NextResponse.json({ error: 'Could not reset the password. Try again.' }, { status: 500 })
  }
}
