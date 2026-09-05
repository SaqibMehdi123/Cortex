import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/goals/[id] — edit or complete/pause
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
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
    const { id } = await params
    await db.goal.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/goals/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 })
  }
}
