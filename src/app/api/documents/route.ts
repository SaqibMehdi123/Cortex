import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/documents?q=&status=&tag= — library list
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim()
    const status = searchParams.get('status')?.trim()
    const tag = searchParams.get('tag')?.trim()

    const where: Record<string, unknown> = {}
    if (status && status !== 'all') where.status = status
    if (tag) where.tags = { contains: tag }
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { author: { contains: q } },
        { tags: { contains: q } },
        { summary: { contains: q } },
      ]
    }

    const documents = await db.document.findMany({
      where,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      select: {
        id: true, title: true, author: true, type: true, source: true,
        status: true, progress: true, tags: true, summary: true,
        lastReadAt: true, createdAt: true, updatedAt: true,
      },
    })

    return NextResponse.json({ documents })
  } catch (e) {
    console.error('GET /api/documents error', e)
    return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 })
  }
}

// POST /api/documents — create (manual, paste, or URL with server-side extraction)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, author, type, source, notes, content, status, progress, tags, autoExtract } = body

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    let extracted: { title?: string; content?: string } = {}
    if (autoExtract && source && /^https?:\/\//.test(source) && !content) {
      try {
        const res = await fetch(source, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CortexReader/1.0)' },
          signal: AbortSignal.timeout(12000),
        })
        const html = await res.text()
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
        const bodyText = html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
          .replace(/<header[\s\S]*?<\/header>/gi, ' ')
          .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, ' ')
          .trim()
        if (bodyText.length > 400) extracted.content = bodyText.slice(0, 200000)
        if ((!title || title === source) && titleMatch?.[1]) {
          extracted.title = titleMatch[1].replace(/\s+/g, ' ').trim().slice(0, 300)
        }
      } catch (err) {
        console.error('URL extraction failed', err)
      }
    }

    const document = await db.document.create({
      data: {
        title: (extracted.title || title).trim(),
        author: author?.trim() || null,
        type: type || (source ? 'url' : 'text'),
        source: source?.trim() || null,
        notes: notes || null,
        content: content || extracted.content || null,
        status: status || 'reading',
        progress: typeof progress === 'number' ? Math.min(100, Math.max(0, Math.round(progress))) : 0,
        tags: tags?.trim() || null,
      },
    })

    return NextResponse.json({ document }, { status: 201 })
  } catch (e) {
    console.error('POST /api/documents error', e)
    return NextResponse.json({ error: 'Failed to create document' }, { status: 500 })
  }
}
