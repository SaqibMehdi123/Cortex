import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/notes/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if ('title' in body) data.title = body.title || null
    if ('content' in body) data.content = body.content
    if ('pinned' in body) data.pinned = Boolean(body.pinned)
    const note = await db.note.update({ where: { id }, data })
    return NextResponse.json({ note })
  } catch (e) {
    console.error('PATCH /api/notes/[id] error', e)
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 })
  }
}

// DELETE /api/notes/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.note.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/notes/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 })
  }
}
