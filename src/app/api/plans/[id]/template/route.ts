import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { copyPlanSubtree, templateSubtreeIds } from '@/lib/plan-template'

// POST /api/plans/[id]/template — save one of the user's plans (with its
// whole subtree) as a reusable template. Stored as a date-stripped copy
// inside the Plan table under a timeframe='template' root — no migration.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const source = await db.plan.findFirst({
      where: { id, userId: user.id },
      select: { id: true, title: true, timeframe: true },
    })
    if (!source) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    if (source.timeframe === 'template') {
      return NextResponse.json({ error: 'That plan is already a template' }, { status: 400 })
    }

    let name = source.title
    let description: string | null = null
    try {
      const body = await req.json()
      if (body?.name && typeof body.name === 'string' && body.name.trim()) name = body.name.trim().slice(0, 120)
      if (body?.description && typeof body.description === 'string' && body.description.trim()) description = body.description.trim().slice(0, 300)
    } catch {
      // body optional
    }

    const root = await db.plan.create({
      data: {
        userId: user.id,
        title: name,
        timeframe: 'template',
        notes: description,
        startDate: null,
        endDate: null,
        goalId: null,
        done: false,
        parentId: null,
      },
    })

    await copyPlanSubtree(user.id, source.id, root.id)

    const ids = await templateSubtreeIds(user.id, root.id)
    const planCount = Math.max(0, ids.length - 1)
    const taskCount = await db.task.count({ where: { userId: user.id, planId: { in: ids } } })

    return NextResponse.json({ template: { id: root.id, name, planCount, taskCount } }, { status: 201 })
  } catch (e) {
    console.error('POST /api/plans/[id]/template error', e)
    return NextResponse.json({ error: 'Failed to save template' }, { status: 500 })
  }
}
