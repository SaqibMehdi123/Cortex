import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// GET /api/papers?range=day|week|month|year&q=&saved=&sort=upvotes|date — the user's paper feed
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim()
    const range = searchParams.get('range')
    const saved = searchParams.get('saved')
    const sort = searchParams.get('sort') ?? 'date'

    const where: Record<string, unknown> = { userId: user.id }
    if (saved === '1') where.saved = true
    if (q) where.OR = [{ title: { contains: q } }, { abstract: { contains: q } }, { authors: { contains: q } }]
    if (range && range !== 'all') {
      const days = range === 'day' ? 1 : range === 'week' ? 7 : range === 'month' ? 31 : range === 'year' ? 365 : 0
      if (days > 0) {
        const cutoff = new Date(Date.now() - days * 86_400_000)
        where.OR = [{ publishedAt: { gte: cutoff } }, { AND: [{ publishedAt: null }, { createdAt: { gte: cutoff } }] }]
      }
    }

    const papers = await db.paper.findMany({
      where,
      orderBy: sort === 'upvotes' ? [{ upvotes: 'desc' }, { publishedAt: 'desc' }] : [{ publishedAt: 'desc' }, { upvotes: 'desc' }],
      take: 120,
    })

    return NextResponse.json({ papers })
  } catch (e) {
    console.error('GET /api/papers error', e)
    return NextResponse.json({ error: 'Failed to load papers' }, { status: 500 })
  }
}
