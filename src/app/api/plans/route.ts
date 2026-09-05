import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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

// GET /api/plans — nested plan tree with tasks
export async function GET() {
  try {
    const plans = (await db.plan.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        goal: { select: { id: true, title: true, color: true } },
        tasks: {
          orderBy: [{ dueDate: 'asc' }, { order: 'asc' }],
        },
      },
    })) as unknown as FlatPlan[]

    return NextResponse.json({ plans: buildTree(plans) })
  } catch (e) {
    console.error('GET /api/plans error', e)
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }
}

// POST /api/plans — create plan (optionally nested under a parent)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, timeframe, notes, startDate, endDate, goalId, parentId, done } = body
    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

    const plan = await db.plan.create({
      data: {
        title: title.trim(),
        timeframe: ['year', 'month', 'week', 'day'].includes(timeframe) ? timeframe : 'day',
        notes: notes || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        goalId: goalId || null,
        parentId: parentId || null,
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
