import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/news?category=&saved=&source=&q=&range=day|week|month|year
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')
    const saved = searchParams.get('saved')
    const source = searchParams.get('source')
    const q = searchParams.get('q')?.trim()
    const range = searchParams.get('range')

    const where: Record<string, unknown> = {}
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
      db.newsArticle.groupBy({ by: ['source'], _count: { _all: true } }),
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
