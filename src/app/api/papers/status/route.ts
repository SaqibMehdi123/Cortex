import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// GET /api/papers/status — staleness signal for the papers auto-sync.
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const row = await db.user.findUnique({ where: { id: user.id }, select: { lastPapersFetchAt: true } })
    const total = await db.paper.count({ where: { userId: user.id } })
    return NextResponse.json({ lastFetchedAt: row?.lastPapersFetchAt ?? null, total })
  } catch (e) {
    console.error('GET /api/papers/status error', e)
    return NextResponse.json({ error: 'Failed to load papers status' }, { status: 500 })
  }
}
