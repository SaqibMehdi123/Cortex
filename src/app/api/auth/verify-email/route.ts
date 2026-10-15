import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  createSessionToken,
  hashCode,
  CODE_MAX_ATTEMPTS,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from '@/lib/auth'
import { clientIp, rateLimit } from '@/lib/rate-limit'

// POST /api/auth/verify-email { email, code } — check the 6-digit code and, on
// success, mark the account verified and start the first session.
//
// Security notes:
//  - A session cookie is minted ONLY after the code matches. The previous
//    "already verified → sign in without checking the code" branch was an
//    account-takeover hole (anyone with just the victim's email got a valid
//    session for any 6-digit string) and has been removed — already-verified
//    users are sent to /login instead.
//  - Wrong-code attempts are counted atomically (conditional updateMany) so
//    parallel guesses cannot race past CODE_MAX_ATTEMPTS.
//  - The route is IP-rate-limited; it is reachable without a session.
export async function POST(req: NextRequest) {
  try {
    // Online-guess guard on top of the per-code attempt cap: 20 tries per IP
    // per 10 min covers a normal sign-in flow with room for retries.
    const rl = rateLimit(`verify-email:${clientIp(req.headers)}`, { limit: 20, windowMs: 10 * 60_000 })
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many attempts. Please try again in ${rl.retryAfter}s.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      )
    }

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
      // Already verified — do NOT mint a session on an unverified code.
      // The verify page routes this response to /login.
      return NextResponse.json({ alreadyVerified: true }, { status: 200 })
    }

    const record = await db.verificationCode.findFirst({
      where: { userId: user.id, purpose: 'email_verify', usedAt: null },
      orderBy: { createdAt: 'desc' },
    })

    const fail = (msg: string, status = 401) => NextResponse.json({ error: msg }, { status })

    if (!record) return fail('No active code — request a new one.')
    if (record.expiresAt < new Date()) return fail('That code has expired — request a new one.')

    // Atomic attempt budget: the increment only lands while attempts are below
    // the cap, so a burst of parallel guesses cannot squeeze extra tries past
    // CODE_MAX_ATTEMPTS (the old read-compare-then-increment had a TOCTOU
    // window). The counter deliberately counts correct attempts too — the
    // code is burned on success anyway.
    const bumped = await db.verificationCode.updateMany({
      where: { id: record.id, attempts: { lt: CODE_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    })
    if (bumped.count === 0) return fail('Too many wrong attempts — request a new code.')

    if (record.codeHash !== (await hashCode(code))) {
      const left = CODE_MAX_ATTEMPTS - (record.attempts + 1)
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
    res.cookies.set(SESSION_COOKIE, await createSessionToken(user.id, user.tokenVersion), SESSION_COOKIE_OPTIONS)
    return res
  } catch (e) {
    console.error('POST /api/auth/verify-email error', e)
    return NextResponse.json({ error: 'Verification failed. Try again.' }, { status: 500 })
  }
}
