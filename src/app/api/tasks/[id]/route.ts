import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/tasks/[id] — update / complete / snooze / reschedule / log focus
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}

    if ('title' in body) data.title = body.title
    if ('priority' in body) data.priority = body.priority
    if ('status' in body) {
      data.status = body.status
      data.completedAt = body.status === 'done' ? new Date() : null
    }
    if ('estimate' in body) data.estimate = body.estimate
    if ('order' in body) data.order = body.order
    if ('planId' in body) data.planId = body.planId
    if ('snooze' in body) {
      // snooze: push dueDate to tomorrow (or by N days)
      const days = typeof body.snooze === 'number' ? body.snooze : 1
      const base = body.baseDue ? new Date(body.baseDue) : new Date()
      base.setDate(base.getDate() + days)
      data.dueDate = base
    }
    if ('dueDate' in body) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
    if ('focusDelta' in body) {
      const task = await db.task.findUnique({ where: { id } })
      data.focusMinutes = (task?.focusMinutes ?? 0) + Number(body.focusDelta || 0)
    }

    const task = await db.task.update({
      where: { id },
      data,
      include: { goal: { select: { id: true, title: true, color: true } } },
    })
    return NextResponse.json({ task })
  } catch (e) {
    console.error('PATCH /api/tasks/[id] error', e)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}

// DELETE /api/tasks/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.task.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/tasks/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}
