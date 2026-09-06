import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  generateVerificationCode,
  hashCode,
  CODE_RESEND_COOLDOWN_SECONDS,
  CODE_TTL_MINUTES,
} from '@/lib/auth'
import { sendCodeEmail, emailResponseFields } from '@/lib/mailer'

// POST /api/auth/forgot-password { email } — step 1 of the reset flow.
// Always answers 200 { sent: true } so the endpoint can't be used to discover
// which emails have accounts. Existing users get a 6-digit code (10 min TTL).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = String(body.email ?? '').trim().toLowerCase()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })

    if (user) {
      const latest = await db.verificationCode.findFirst({
        where: { userId: user.id, purpose: 'password_reset' },
        orderBy: { createdAt: 'desc' },
      })
      if (latest && Date.now() - latest.createdAt.getTime() < CODE_RESEND_COOLDOWN_SECONDS * 1000) {
        // Cooldown active — answer as if sent; the client already has a code.
        return NextResponse.json({ sent: true })
      }

      const code = generateVerificationCode()
      await db.$transaction([
        db.verificationCode.updateMany({
          where: { userId: user.id, purpose: 'password_reset', usedAt: null },
          data: { usedAt: new Date() },
        }),
        db.verificationCode.create({
          data: {
            userId: user.id,
            purpose: 'password_reset',
            codeHash: await hashCode(code),
            expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000),
          },
        }),
      ])

      const result = await sendCodeEmail(user.email, user.name, code, 'reset')
      // For unknown accounts below we pretend everything was sent (no account
      // enumeration). A real account with a delivery problem DOES get honest
      // emailSent/emailError — the user would otherwise wait on a mail that
      // never arrives. devCode only appears with AUTH_DEV_CODE_FALLBACK=true.
      return NextResponse.json({ sent: true, ...emailResponseFields(result, code) })
    }

    return NextResponse.json({ sent: true, emailSent: true })
  } catch (e) {
    console.error('POST /api/auth/forgot-password error', e)
    return NextResponse.json({ error: 'Could not start the reset. Try again.' }, { status: 500 })
  }
}
