import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/highlights?documentId= — highlights for a document (or all recent)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const documentId = searchParams.get('documentId')
    const highlights = await db.highlight.findMany({
      where: documentId ? { documentId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { document: { select: { id: true, title: true } } },
    })
    return NextResponse.json({ highlights })
  } catch (e) {
    console.error('GET /api/highlights error', e)
    return NextResponse.json({ error: 'Failed to load highlights' }, { status: 500 })
  }
}

// POST /api/highlights — create a highlight
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { documentId, text, color, note, position } = body
    if (!documentId || !text?.trim()) {
      return NextResponse.json({ error: 'documentId and text are required' }, { status: 400 })
    }
    const highlight = await db.highlight.create({
      data: {
        documentId,
        text: text.trim().slice(0, 4000),
        color: ['yellow', 'green', 'blue', 'pink'].includes(color) ? color : 'yellow',
        note: note?.trim() || null,
        position: typeof position === 'number' ? position : 0,
      },
    })
    return NextResponse.json({ highlight }, { status: 201 })
  } catch (e) {
    console.error('POST /api/highlights error', e)
    return NextResponse.json({ error: 'Failed to create highlight' }, { status: 500 })
  }
}
