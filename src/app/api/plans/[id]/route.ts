import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// PATCH /api/plans/[id] — edit plan
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const existing = await db.plan.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    const data: Record<string, unknown> = {}
    for (const key of ['title', 'notes', 'timeframe', 'done'] as const) {
      if (key in body) data[key] = body[key]
    }
    if ('startDate' in body) data.startDate = body.startDate ? new Date(body.startDate) : null
    if ('endDate' in body) data.endDate = body.endDate ? new Date(body.endDate) : null
    if ('goalId' in body) {
      if (body.goalId) {
        const goal = await db.goal.findFirst({ where: { id: body.goalId, userId: user.id } })
        if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 400 })
      }
      data.goalId = body.goalId || null
    }
    if ('parentId' in body) {
      if (body.parentId) {
        const parent = await db.plan.findFirst({ where: { id: body.parentId, userId: user.id } })
        if (!parent) return NextResponse.json({ error: 'Parent plan not found' }, { status: 400 })
      }
      data.parentId = body.parentId || null
    }

    const plan = await db.plan.update({
      where: { id },
      data,
      include: { goal: { select: { id: true, title: true, color: true } }, tasks: true },
    })
    return NextResponse.json({ plan })
  } catch (e) {
    console.error('PATCH /api/plans/[id] error', e)
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 })
  }
}

// DELETE /api/plans/[id] — deletes subtree (children cascade)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const existing = await db.plan.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await db.plan.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/plans/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 })
  }
}
