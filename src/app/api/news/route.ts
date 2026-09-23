import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// PATCH /api/news — bulk actions on the feed ({ markAllRead: true })
export async function PATCH(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json().catch(() => ({}))
    if (body?.markAllRead) {
      const r = await db.newsArticle.updateMany({
        where: { userId: user.id, read: false },
        data: { read: true },
      })
      return NextResponse.json({ ok: true, updated: r.count })
    }
    return NextResponse.json({ error: 'Nothing to do' }, { status: 400 })
  } catch (e) {
    console.error('PATCH /api/news error', e)
    return NextResponse.json({ error: 'Failed to update news' }, { status: 500 })
  }
}

// GET /api/news?category=&saved=&source=&q=&range=day|week|month|year — the user's feed
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')
    const saved = searchParams.get('saved')
    const source = searchParams.get('source')
    const q = searchParams.get('q')?.trim()
    const range = searchParams.get('range')

    const where: Record<string, unknown> = { userId: user.id }
    if (category && category !== 'all') where.category = category
    if (saved === '1') where.saved = true
    if (source && source !== 'all') where.source = source
    if (q) where.title = { contains: q }
    if (range && range !== 'all') {
      const days = range === 'day' ? 1 : range === 'week' ? 7 : range === 'month' ? 31 : range === 'year' ? 365 : 0
      if (days > 0) {
        const cutoff = new Date(Date.now() - days * 86_400_000)
        where.OR = [{ publishedAt: { gte: cutoff } }, { AND: [{ publishedAt: null }, { createdAt: { gte: cutoff } }] }]
      }
    }

    const [articles, sourcesAgg] = await Promise.all([
      db.newsArticle.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: 150,
      }),
      db.newsArticle.groupBy({ by: ['source'], where: { userId: user.id }, _count: { _all: true } }),
    ])

    return NextResponse.json({
      articles,
      sources: sourcesAgg
        .filter((s) => s.source)
        .map((s) => ({ name: s.source as string, count: s._count._all }))
        .sort((a, b) => b.count - a.count),
    })
  } catch (e) {
    console.error('GET /api/news error', e)
    return NextResponse.json({ error: 'Failed to load news' }, { status: 500 })
  }
}
