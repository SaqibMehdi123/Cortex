import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/steps/[id] — toggle / rename
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = await req.json()

    const data: Record<string, unknown> = {}
    if ('title' in body) data.title = String(body.title).trim()
    if ('done' in body) data.done = Boolean(body.done)
    if ('order' in body) data.order = Number(body.order) || 0

    const step = await db.step.update({ where: { id }, data })
    return NextResponse.json({ step })
  } catch (e) {
    console.error('PATCH /api/steps/[id] error', e)
    return NextResponse.json({ error: 'Failed to update step' }, { status: 500 })
  }
}

// DELETE /api/steps/[id]
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    await db.step.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/steps/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete step' }, { status: 500 })
  }
}
