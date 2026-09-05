import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/plans/[id]
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = await req.json()

    const data: Record<string, unknown> = {}
    for (const key of ['title', 'notes', 'timeframe'] as const) {
      if (key in body) data[key] = body[key] === '' ? null : body[key]
    }
    if ('done' in body) data.done = Boolean(body.done)
    if ('dueDate' in body) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
    if ('goalId' in body) data.goalId = body.goalId || null

    const plan = await db.plan.update({
      where: { id },
      data,
      include: { goal: { select: { id: true, title: true, color: true } } },
    })
    return NextResponse.json({ plan })
  } catch (e) {
    console.error('PATCH /api/plans/[id] error', e)
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 })
  }
}

// DELETE /api/plans/[id]
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    await db.plan.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/plans/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 })
  }
}
