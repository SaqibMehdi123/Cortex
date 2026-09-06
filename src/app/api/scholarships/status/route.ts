import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// GET /api/scholarships/status — staleness signal for the scholarships auto-sync.
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const row = await db.user.findUnique({ where: { id: user.id }, select: { lastScholarshipsFetchAt: true } })
    const total = await db.scholarship.count({ where: { userId: user.id } })
    return NextResponse.json({ lastFetchedAt: row?.lastScholarshipsFetchAt ?? null, total })
  } catch (e) {
    console.error('GET /api/scholarships/status error', e)
    return NextResponse.json({ error: 'Failed to load scholarships status' }, { status: 500 })
  }
}
