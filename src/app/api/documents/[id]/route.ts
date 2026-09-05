import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/documents/[id] — full document with highlights and chat
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const document = await db.document.findUnique({
      where: { id },
      include: {
        highlights: { orderBy: { position: 'asc' } },
      },
    })
    if (!document) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ document })
  } catch (e) {
    console.error('GET /api/documents/[id] error', e)
    return NextResponse.json({ error: 'Failed to load document' }, { status: 500 })
  }
}

// PATCH /api/documents/[id] — update fields
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const allowed = ['title', 'author', 'type', 'source', 'notes', 'content', 'status', 'progress', 'tags', 'summary', 'takeaways'] as const

    const data: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) data[key] = body[key]
    }
    if (typeof data.progress === 'number') data.progress = Math.min(100, Math.max(0, Math.round(data.progress)))
    if (data.status === 'reading') data.lastReadAt = new Date()

    const document = await db.document.update({ where: { id }, data })
    return NextResponse.json({ document })
  } catch (e) {
    console.error('PATCH /api/documents/[id] error', e)
    return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
  }
}

// DELETE /api/documents/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const existing = await db.document.findUnique({ where: { id }, select: { filePath: true } })
    await db.document.delete({ where: { id } })
    // clean up the stored PDF from disk
    if (existing?.filePath) {
      const { unlink } = await import('fs/promises')
      const path = await import('path')
      await unlink(path.join(process.cwd(), 'uploads', path.basename(existing.filePath))).catch(() => {})
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/documents/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}
