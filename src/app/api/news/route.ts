import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/news?category=&saved=&source=&q=
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')
    const saved = searchParams.get('saved')
    const q = searchParams.get('q')?.trim()

    const where: Record<string, unknown> = {}
    if (category && category !== 'all') where.category = category
    if (saved === '1') where.saved = true
    if (q) where.title = { contains: q }

    const articles = await db.newsArticle.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 120,
    })

    return NextResponse.json({ articles })
  } catch (e) {
    console.error('GET /api/news error', e)
    return NextResponse.json({ error: 'Failed to load news' }, { status: 500 })
  }
}
