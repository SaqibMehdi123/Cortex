import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { stripTemplateRows } from '@/lib/plan-template'

type PlanWithChildren = {
  id: string
  timeframe: string
  title: string
  notes: string | null
  startDate: Date | null
  endDate: Date | null
  done: boolean
  goalId: string | null
  goal: { id: string; title: string; color: string } | null
  parentId: string | null
  tasks: {
    id: string
    title: string
    status: string
    priority: string
    dueDate: Date | null
    estimate: number
    order: number
    goalId: string | null
    completedAt: Date | null
  }[]
  children: PlanWithChildren[]
}

function buildTree(plans: FlatPlan[]): PlanWithChildren[] {
  const byId = new Map<string, PlanWithChildren>()
  for (const p of plans) {
    byId.set(p.id, { ...p, children: [] })
  }
  const roots: PlanWithChildren[] = []
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  const sortRec = (nodes: PlanWithChildren[]) => {
    nodes.sort((a, b) => a.timeframe.localeCompare(b.timeframe) || a.title.localeCompare(b.title))
    nodes.forEach((n) => sortRec(n.children))
  }
  sortRec(roots)
  return roots
}

type FlatPlan = {
  id: string
  timeframe: string
  title: string
  notes: string | null
  startDate: Date | null
  endDate: Date | null
  done: boolean
  goalId: string | null
  goal: { id: string; title: string; color: string } | null
  parentId: string | null
  tasks: {
    id: string
    title: string
    status: string
    priority: string
    dueDate: Date | null
    estimate: number
    order: number
    goalId: string | null
    completedAt: Date | null
  }[]
}

// GET /api/plans — the signed-in user's nested plan tree with tasks
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const plans = (await db.plan.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      include: {
        goal: { select: { id: true, title: true, color: true } },
        tasks: {
          orderBy: [{ dueDate: 'asc' }, { order: 'asc' }],
        },
      },
    })) as unknown as FlatPlan[]

    // saved templates live in this table too (timeframe='template' roots with
    // descendants) — drop them and anything nested under them
    return NextResponse.json({ plans: buildTree(stripTemplateRows(plans)) })
  } catch (e) {
    console.error('GET /api/plans error', e)
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }
}

// POST /api/plans — create plan (optionally nested under a parent)
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const { title, timeframe, notes, startDate, endDate, goalId, parentId, done } = body
    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

    let safeGoalId: string | null = null
    if (goalId) {
      const goal = await db.goal.findFirst({ where: { id: goalId, userId: user.id } })
      if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 400 })
      safeGoalId = goal.id
    }
    let safeParentId: string | null = null
    if (parentId) {
      const parent = await db.plan.findFirst({ where: { id: parentId, userId: user.id } })
      if (!parent) return NextResponse.json({ error: 'Parent plan not found' }, { status: 400 })
      safeParentId = parent.id
    }

    const plan = await db.plan.create({
      data: {
        userId: user.id,
        title: title.trim(),
        timeframe: ['year', 'quarter', 'month', 'week', 'day'].includes(timeframe) ? timeframe : 'day',
        notes: notes || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        goalId: safeGoalId,
        parentId: safeParentId,
        done: Boolean(done),
      },
      include: { goal: { select: { id: true, title: true, color: true } }, tasks: true },
    })

    return NextResponse.json({ plan }, { status: 201 })
  } catch (e) {
    console.error('POST /api/plans error', e)
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 })
  }
}
