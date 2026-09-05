import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { refreshGoalStreak } from '../route'

// PATCH /api/milestones/[id] — toggle done / edit
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const existing = await db.milestone.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    const data: Record<string, unknown> = {}
    if ('title' in body) data.title = body.title
    if ('done' in body) {
      data.done = Boolean(body.done)
      data.completedAt = body.done ? new Date() : null
    }
    if ('dueDate' in body) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
    if ('order' in body) data.order = body.order

    const milestone = await db.milestone.update({ where: { id }, data })

    // Recompute goal streak after completion changes
    if ('done' in body) {
      await refreshGoalStreak(milestone.goalId)
    }

    return NextResponse.json({ milestone })
  } catch (e) {
    console.error('PATCH /api/milestones/[id] error', e)
    return NextResponse.json({ error: 'Failed to update milestone' }, { status: 500 })
  }
}

// DELETE /api/milestones/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const existing = await db.milestone.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await db.milestone.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/milestones/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete milestone' }, { status: 500 })
  }
}
