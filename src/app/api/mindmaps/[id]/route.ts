import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// PATCH /api/mindmaps/[id] — save nodes / rename
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const existing = await db.mindMap.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    const data: Record<string, unknown> = {}
    if ('title' in body) data.title = body.title
    if ('nodes' in body) data.nodes = JSON.stringify(Array.isArray(body.nodes) ? body.nodes : [])
    if ('goalId' in body) {
      if (body.goalId) {
        const goal = await db.goal.findFirst({ where: { id: body.goalId, userId: user.id } })
        if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 400 })
      }
      data.goalId = body.goalId || null
    }

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
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const existing = await db.mindMap.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await db.mindMap.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/mindmaps/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete mindmap' }, { status: 500 })
  }
}
