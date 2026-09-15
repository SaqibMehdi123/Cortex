import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { isActivePro } from '@/lib/entitlements'

// GET /api/billing/status — the signed-in user's plan snapshot for the
// settings view / pricing page header. Booleans + dates only; no secrets.
export async function GET() {
  try {
    const session = await getSessionUser()
    if (!session) return unauthorized()

    const user = await db.user.findUnique({
      where: { id: session.id },
      select: { plan: true, planExpiresAt: true, billingProvider: true },
    })
    if (!user) return unauthorized()

    const pro = isActivePro(user)
    return NextResponse.json({
      plan: pro ? 'pro' : 'free',
      pro,
      planExpiresAt: pro ? user.planExpiresAt : null,
      billingProvider: user.billingProvider ?? null,
    })
  } catch (e) {
    console.error('GET /api/billing/status error', e)
    return NextResponse.json({ error: 'Failed to load billing status' }, { status: 500 })
  }
}
