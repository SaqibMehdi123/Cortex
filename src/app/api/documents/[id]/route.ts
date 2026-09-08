import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// GET /api/documents/[id] — full document with highlights and chat
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const document = await db.document.findFirst({
      where: { id, userId: user.id },
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
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const existing = await db.document.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    const allowed = ['title', 'author', 'type', 'source', 'notes', 'content', 'status', 'progress', 'lastPage', 'tags', 'summary', 'takeaways'] as const

    const data: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) data[key] = body[key]
    }
    // shelfId is validated separately: it must be null (unshelve) or point to
    // one of the user's own shelves — never somebody else's.
    if ('shelfId' in body) {
      const shelfId = body.shelfId
      if (shelfId === null) {
        data.shelfId = null
      } else if (typeof shelfId === 'string' && shelfId) {
        const shelf = await db.shelf.findFirst({ where: { id: shelfId, userId: user.id }, select: { id: true } })
        if (!shelf) return NextResponse.json({ error: 'Shelf not found' }, { status: 404 })
        data.shelfId = shelfId
      }
    }
    if (typeof data.progress === 'number') data.progress = Math.min(100, Math.max(0, Math.round(data.progress)))
    if (typeof data.lastPage === 'number') {
      data.lastPage = Math.max(1, Math.round(data.lastPage))
      if (!('status' in data)) data.lastReadAt = new Date()
    }
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
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const existing = await db.document.findFirst({
      where: { id, userId: user.id },
      select: { filePath: true },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await db.document.delete({ where: { id } })
    // clean up the stored PDF — from Vercel Blob (URL ref) or from disk
    if (existing?.filePath) {
      if (existing.filePath.startsWith('https://')) {
        const { del } = await import('@vercel/blob')
        await del(existing.filePath).catch(() => {})
      } else {
        const { unlink } = await import('fs/promises')
        const path = await import('path')
        await unlink(path.join(process.cwd(), 'uploads', path.basename(existing.filePath))).catch(() => {})
      }
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/documents/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}
