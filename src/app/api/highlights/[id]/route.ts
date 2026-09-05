import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/highlights/[id] — update color/note
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (body.color && ['yellow', 'green', 'blue', 'pink'].includes(body.color)) data.color = body.color
    if ('note' in body) data.note = body.note?.trim() || null
    const highlight = await db.highlight.update({ where: { id }, data })
    return NextResponse.json({ highlight })
  } catch (e) {
    console.error('PATCH /api/highlights/[id] error', e)
    return NextResponse.json({ error: 'Failed to update highlight' }, { status: 500 })
  }
}

// DELETE /api/highlights/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.highlight.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/highlights/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete highlight' }, { status: 500 })
  }
}
