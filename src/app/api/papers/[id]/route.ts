import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/papers/[id] — toggle saved / update fields
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (typeof body.saved === 'boolean') data.saved = body.saved
    const paper = await db.paper.update({ where: { id }, data })
    return NextResponse.json({ paper })
  } catch (e) {
    console.error('PATCH /api/papers/[id] error', e)
    return NextResponse.json({ error: 'Failed to update paper' }, { status: 500 })
  }
}

// POST /api/papers/[id] — save the paper into the Library (Knowledge Hub)
// so it can be highlighted, chatted with and mind-mapped in the Reader.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const paper = await db.paper.findUnique({ where: { id } })
    if (!paper) return NextResponse.json({ error: 'Paper not found' }, { status: 404 })

    if (paper.documentId) {
      const doc = await db.document.findUnique({ where: { id: paper.documentId } })
      if (doc) return NextResponse.json({ document: doc, alreadySaved: true })
    }

    const doc = await db.document.create({
      data: {
        title: paper.title,
        author: paper.authors,
        type: 'paper',
        source: paper.url,
        content: paper.abstract
          ? `${paper.title}\n\nAuthors: ${paper.authors ?? 'unknown'}\n\nAbstract:\n${paper.abstract}`
          : null,
        status: 'queued',
        tags: 'paper,research',
      },
    })
    await db.paper.update({ where: { id }, data: { documentId: doc.id, saved: true } })
    return NextResponse.json({ document: doc }, { status: 201 })
  } catch (e) {
    console.error('POST /api/papers/[id] error', e)
    return NextResponse.json({ error: 'Failed to save paper to library' }, { status: 500 })
  }
}
