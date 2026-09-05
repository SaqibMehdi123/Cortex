import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// GET /api/highlights?documentId= — the user's highlights (optionally per document)
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { searchParams } = new URL(req.url)
    const documentId = searchParams.get('documentId')
    const highlights = await db.highlight.findMany({
      where: { userId: user.id, ...(documentId ? { documentId } : {}) },
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

// POST /api/highlights — create a highlight on one of the user's documents
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const { documentId, text, color, note, position } = body
    if (!documentId || !text?.trim()) {
      return NextResponse.json({ error: 'documentId and text are required' }, { status: 400 })
    }
    const document = await db.document.findFirst({ where: { id: documentId, userId: user.id }, select: { id: true } })
    if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    const highlight = await db.highlight.create({
      data: {
        userId: user.id,
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
