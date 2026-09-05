import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/tasks?date=&status=&planId=&milestoneId=&goalId= — flexible task list
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
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

// POST /api/tasks — create task
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, priority, dueDate, estimate, milestoneId, goalId, planId, status, order } = body
    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

    const task = await db.task.create({
      data: {
        title: title.trim(),
        priority: ['low', 'med', 'high'].includes(priority) ? priority : 'med',
        dueDate: dueDate ? new Date(dueDate) : null,
        estimate: typeof estimate === 'number' ? estimate : 30,
        status: ['todo', 'doing', 'done'].includes(status) ? status : 'todo',
        milestoneId: milestoneId || null,
        goalId: goalId || null,
        planId: planId || null,
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
