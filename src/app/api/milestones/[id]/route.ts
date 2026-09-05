import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/milestones/[id] — toggle done / edit
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
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
      const days = new Set<string>()
      const goalMilestones = await db.milestone.findMany({ where: { goalId: milestone.goalId } })
      for (const m of goalMilestones) {
        if (m.completedAt) days.add(m.completedAt.toISOString().slice(0, 10))
      }
      let streak = 0
      const cursor = new Date()
      if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1)
      while (days.has(cursor.toISOString().slice(0, 10))) {
        streak++
        cursor.setDate(cursor.getDate() - 1)
      }
      await db.goal.update({
        where: { id: milestone.goalId },
        data: { streak, lastCompletedAt: body.done ? new Date() : undefined },
      })
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
    const { id } = await params
    await db.milestone.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/milestones/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete milestone' }, { status: 500 })
  }
}
