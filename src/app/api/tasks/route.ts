import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// GET /api/tasks?date=&status= — the signed-in user's tasks
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = { userId: user.id }
    if (status === 'open') where.status = { not: 'done' }
    else if (status) where.status = status

    if (date) {
      const dayStart = new Date(`${date}T00:00:00`)
      const dayEnd = new Date(`${date}T23:59:59.999`)
      where.dueDate = { gte: dayStart, lte: dayEnd }
    }

    const tasks = await db.task.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
      include: { goal: { select: { id: true, title: true, color: true } } },
      take: 300,
    })

    return NextResponse.json({ tasks })
  } catch (e) {
    console.error('GET /api/tasks error', e)
    return NextResponse.json({ error: 'Failed to load tasks' }, { status: 500 })
  }
}

// POST /api/tasks — create task, optionally under one of the user's
// milestones/goals/plans (parent links are validated so records can't be
// attached to another account's items)
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const { title, priority, dueDate, estimate, milestoneId, goalId, planId, status, order } = body
    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

    let safeGoalId: string | null = null
    let safeMilestoneId: string | null = null
    let safePlanId: string | null = null

    if (milestoneId) {
      const milestone = await db.milestone.findFirst({ where: { id: milestoneId, userId: user.id } })
      if (!milestone) return NextResponse.json({ error: 'Milestone not found' }, { status: 400 })
      safeMilestoneId = milestone.id
      safeGoalId = milestone.goalId
    } else if (goalId) {
      const goal = await db.goal.findFirst({ where: { id: goalId, userId: user.id } })
      if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 400 })
      safeGoalId = goal.id
    }

    if (planId) {
      const plan = await db.plan.findFirst({ where: { id: planId, userId: user.id } })
      if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 400 })
      safePlanId = plan.id
    }

    const task = await db.task.create({
      data: {
        userId: user.id,
        title: title.trim(),
        priority: ['low', 'med', 'high'].includes(priority) ? priority : 'med',
        dueDate: dueDate ? new Date(dueDate) : null,
        estimate: typeof estimate === 'number' ? estimate : 30,
        status: ['todo', 'doing', 'done'].includes(status) ? status : 'todo',
        milestoneId: safeMilestoneId,
        goalId: safeGoalId,
        planId: safePlanId,
        order: typeof order === 'number' ? order : 0,
        completedAt: status === 'done' ? new Date() : null,
      },
      include: { goal: { select: { id: true, title: true, color: true } } },
    })

    return NextResponse.json({ task }, { status: 201 })
  } catch (e) {
    console.error('POST /api/tasks error', e)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}
