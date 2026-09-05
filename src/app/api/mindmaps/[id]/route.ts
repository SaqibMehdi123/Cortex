import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/mindmaps/[id] — save nodes / rename
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if ('title' in body) data.title = body.title
    if ('nodes' in body) data.nodes = JSON.stringify(Array.isArray(body.nodes) ? body.nodes : [])
    if ('goalId' in body) data.goalId = body.goalId || null

    const map = await db.mindMap.update({
      where: { id },
      data,
      include: { goal: { select: { id: true, title: true, color: true } } },
    })
    return NextResponse.json({ mindmap: { ...map, nodes: JSON.parse(map.nodes || '[]') } })
  } catch (e) {
    console.error('PATCH /api/mindmaps/[id] error', e)
    return NextResponse.json({ error: 'Failed to save mindmap' }, { status: 500 })
  }
}

// DELETE /api/mindmaps/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.mindMap.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/mindmaps/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete mindmap' }, { status: 500 })
  }
}
