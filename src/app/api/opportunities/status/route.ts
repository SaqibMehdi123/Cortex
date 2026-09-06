import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// GET /api/opportunities/status — staleness signal for the jobs auto-sync.
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const row = await db.user.findUnique({ where: { id: user.id }, select: { lastJobsFetchAt: true } })
    const total = await db.jobListing.count({ where: { userId: user.id } })
    return NextResponse.json({ lastFetchedAt: row?.lastJobsFetchAt ?? null, total })
  } catch (e) {
    console.error('GET /api/opportunities/status error', e)
    return NextResponse.json({ error: 'Failed to load jobs status' }, { status: 500 })
  }
}
