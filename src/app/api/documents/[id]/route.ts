import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/documents/[id] — update reading item
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = await req.json()

    const data: Record<string, unknown> = {}
    const allowed = ['title', 'author', 'type', 'source', 'notes', 'content', 'status', 'tags'] as const
    for (const key of allowed) {
      if (key in body) data[key] = body[key] === '' ? null : body[key]
    }
    if ('progress' in body) {
      data.progress = Math.min(100, Math.max(0, Math.round(Number(body.progress) || 0)))
    }
    // keep progress consistent with status
    if (body.status === 'finished') data.progress = 100

    const document = await db.document.update({ where: { id }, data })
    return NextResponse.json({ document })
  } catch (e) {
    console.error('PATCH /api/documents/[id] error', e)
    return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
  }
}

// DELETE /api/documents/[id]
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    await db.document.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/documents/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}
