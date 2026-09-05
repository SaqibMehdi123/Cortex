import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/opportunities/[id] — move stage / edit / set deadline / resume
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    for (const key of ['company', 'role', 'type', 'classification', 'status', 'nextAction', 'resume', 'notes'] as const) {
      if (key in body) data[key] = body[key] || null
    }
    if ('deadline' in body) data.deadline = body.deadline ? new Date(body.deadline) : null
    const opportunity = await db.opportunity.update({ where: { id }, data })
    return NextResponse.json({ opportunity })
  } catch (e) {
    console.error('PATCH /api/opportunities/[id] error', e)
    return NextResponse.json({ error: 'Failed to update opportunity' }, { status: 500 })
  }
}

// DELETE /api/opportunities/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.opportunity.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/opportunities/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete opportunity' }, { status: 500 })
  }
}
