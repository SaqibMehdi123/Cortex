import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/documents?q=&status= — list reading library
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim()
    const status = searchParams.get('status')?.trim()

    const where: Record<string, unknown> = {}
    if (status && status !== 'all') where.status = status
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { author: { contains: q } },
        { tags: { contains: q } },
      ]
    }

    const documents = await db.document.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json({ documents })
  } catch (e) {
    console.error('GET /api/documents error', e)
    return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 })
  }
}

// POST /api/documents — add a new reading item
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, author, type, source, notes, content, status, progress, tags } = body

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const document = await db.document.create({
      data: {
        title: title.trim(),
        author: author?.trim() || null,
        type: type || 'article',
        source: source?.trim() || null,
        notes: notes || null,
        content: content || null,
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
