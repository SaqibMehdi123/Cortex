import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// PATCH /api/goals/[id] — edit or complete/pause
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const existing = await db.goal.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    const data: Record<string, unknown> = {}
    for (const key of ['title', 'description', 'category', 'status', 'color'] as const) {
      if (key in body) data[key] = body[key]
    }
    if ('deadline' in body) data.deadline = body.deadline ? new Date(body.deadline) : null
    if (body.status === 'completed') data.completedAt = new Date()

    const goal = await db.goal.update({ where: { id }, data, include: { milestones: { orderBy: { order: 'asc' } } } })
    return NextResponse.json({ goal })
  } catch (e) {
    console.error('PATCH /api/goals/[id] error', e)
    return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 })
  }
}

// DELETE /api/goals/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const existing = await db.goal.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await db.goal.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/goals/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 })
  }
}
