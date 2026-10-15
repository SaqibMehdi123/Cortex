import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-server'

// GET /api/auth/me — the signed-in account (401 when there is none).
//
// Deliberately goes through getSessionUser() (NOT a bare verifySessionToken):
// getSessionUser also enforces tokenVersion, so a session invalidated by a
// password reset stops resolving here like everywhere else. Any route that
// rolls its own session check silently skips revocation — don't.
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } })
  } catch (e) {
    console.error('GET /api/auth/me error', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
