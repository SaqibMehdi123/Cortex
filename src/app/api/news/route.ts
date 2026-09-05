import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/news?filter=all|unread|saved
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const filter = searchParams.get('filter') || 'all'

    const where: Record<string, unknown> = {}
    if (filter === 'unread') where.read = false
    if (filter === 'saved') where.saved = true

    const articles = await db.newsArticle.findMany({
      where,
      orderBy: [{ saved: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 120,
    })

    return NextResponse.json({ articles })
  } catch (e) {
    console.error('GET /api/news error', e)
    return NextResponse.json({ error: 'Failed to load news' }, { status: 500 })
  }
}

// POST /api/news — manually save an article
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, url, source, summary, category, publishedAt } = body

    if (!title?.trim() || !url?.trim()) {
      return NextResponse.json({ error: 'Title and URL are required' }, { status: 400 })
    }

    const article = await db.newsArticle.upsert({
      where: { url: url.trim() },
      update: {},
      create: {
        title: title.trim(),
        url: url.trim(),
        source: source?.trim() || null,
        summary: summary?.trim() || null,
        category: category || 'blog',
        publishedAt: publishedAt ? new Date(publishedAt) : null,
      },
    })

    return NextResponse.json({ article }, { status: 201 })
  } catch (e) {
    console.error('POST /api/news error', e)
    return NextResponse.json({ error: 'Failed to save article' }, { status: 500 })
  }
}

// DELETE /api/news — clear all non-saved articles
export async function DELETE() {
  try {
    await db.newsArticle.deleteMany({ where: { saved: false } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/news error', e)
    return NextResponse.json({ error: 'Failed to clear news' }, { status: 500 })
  }
}
