import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

// GET /api/auth/me — the signed-in account (401 when there is none).
export async function GET(req: NextRequest) {
  try {
    const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
    if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, email: true },
    })
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    return NextResponse.json({ user })
  } catch (e) {
    console.error('GET /api/auth/me error', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
