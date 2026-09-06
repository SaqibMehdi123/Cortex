import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  generateVerificationCode,
  hashCode,
  CODE_RESEND_COOLDOWN_SECONDS,
  CODE_TTL_MINUTES,
} from '@/lib/auth'
import { sendCodeEmail, emailResponseFields } from '@/lib/mailer'

type Purpose = 'email_verify' | 'password_reset'

// POST /api/auth/resend-code { email, purpose: 'email_verify' | 'password_reset' }
// Issues a fresh 6-digit code (at most one per minute per account+purpose) and
// burns any previous unused code so only the newest one works.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const purpose: Purpose = body.purpose === 'password_reset' ? 'password_reset' : 'email_verify'

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })
    // Do not reveal whether the account exists; pretend success like the
    // forgot-password route does for unknown addresses.
    if (!user || (purpose === 'email_verify' && user.emailVerified)) {
      return NextResponse.json({ sent: true, emailSent: true })
    }

    const latest = await db.verificationCode.findFirst({
      where: { userId: user.id, purpose },
      orderBy: { createdAt: 'desc' },
    })
    if (latest && Date.now() - latest.createdAt.getTime() < CODE_RESEND_COOLDOWN_SECONDS * 1000) {
      const wait = Math.ceil((CODE_RESEND_COOLDOWN_SECONDS * 1000 - (Date.now() - latest.createdAt.getTime())) / 1000)
      return NextResponse.json(
        { error: `Please wait ${wait}s before requesting another code.` },
        { status: 429 }
      )
    }

    const code = generateVerificationCode()
    await db.$transaction([
      db.verificationCode.updateMany({
        where: { userId: user.id, purpose, usedAt: null },
        data: { usedAt: new Date() },
      }),
      db.verificationCode.create({
        data: {
          userId: user.id,
          purpose,
          codeHash: await hashCode(code),
          expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000),
        },
      }),
    ])

    const result = await sendCodeEmail(
      user.email,
      user.name,
      code,
      purpose === 'email_verify' ? 'verify' : 'reset'
    )

    return NextResponse.json({ sent: true, ...emailResponseFields(result, code) })
  } catch (e) {
    console.error('POST /api/auth/resend-code error', e)
    return NextResponse.json({ error: 'Could not send the code. Try again.' }, { status: 500 })
  }
}
