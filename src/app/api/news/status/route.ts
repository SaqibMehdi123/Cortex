import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// GET /api/news/status — lightweight signal the client uses to decide whether a
// background auto-fetch is needed (empty feed or data older than the staleness
// window). Kept separate from GET /api/news so the list endpoint stays purely a
// filtered read.
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const row = await db.user.findUnique({ where: { id: user.id }, select: { lastNewsFetchAt: true } })
    const total = await db.newsArticle.count({ where: { userId: user.id } })
    return NextResponse.json({ lastFetchedAt: row?.lastNewsFetchAt ?? null, total })
  } catch (e) {
    console.error('GET /api/news/status error', e)
    return NextResponse.json({ error: 'Failed to load news status' }, { status: 500 })
  }
}
