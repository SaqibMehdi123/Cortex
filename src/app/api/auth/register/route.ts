import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  generateVerificationCode,
  hashPassword,
  hashCode,
  CODE_TTL_MINUTES,
} from '@/lib/auth'
import { sendCodeEmail } from '@/lib/mailer'

// POST /api/auth/register — create an account, then require email verification.
// The account starts unverified and NO session is issued: the client moves to
// the /verify step, where the 6-digit code unlocks the first session.
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
      if (!existing.emailVerified) {
        // Leftover unverified account (e.g. signup abandoned mid-verification).
        // Refresh its code so the person isn't stuck — without leaking data.
        const code = generateVerificationCode()
        await db.verificationCode.updateMany({
          where: { userId: existing.id, purpose: 'email_verify', usedAt: null },
          data: { usedAt: new Date() },
        })
        await db.verificationCode.create({
          data: {
            userId: existing.id,
            purpose: 'email_verify',
            codeHash: await hashCode(code),
            expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000),
          },
        })
        const { delivered } = await sendCodeEmail(email, existing.name, code, 'verify')
        return NextResponse.json(
          {
            needsVerification: true,
            email,
            ...(delivered ? {} : { devCode: code }),
            resendHint: 'An account with this email already exists but was never verified — we sent a fresh code.',
          },
          { status: 200 }
        )
      }
      return NextResponse.json({ error: 'An account with this email already exists — try signing in.' }, { status: 409 })
    }

    const user = await db.user.create({
      data: { name, email, passwordHash: await hashPassword(password), emailVerified: false },
    })

    // each account starts with its own private workspace preferences
    await db.setting.create({
      data: { userId: user.id, name: name.split(' ')[0] },
    })

    const code = generateVerificationCode()
    await db.verificationCode.create({
      data: {
        userId: user.id,
        purpose: 'email_verify',
        codeHash: await hashCode(code),
        expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000),
      },
    })

    const { delivered } = await sendCodeEmail(email, name, code, 'verify')

    return NextResponse.json(
      {
        needsVerification: true,
        email,
        ...(delivered ? {} : { devCode: code }),
      },
      { status: 201 }
    )
  } catch (e) {
    console.error('POST /api/auth/register error', e)
    return NextResponse.json({ error: 'Could not create the account. Try again.' }, { status: 500 })
  }
}
