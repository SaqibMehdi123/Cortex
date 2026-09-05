import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// POST /api/focus — log a completed pomodoro/focus session
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const { taskId, goalId, minutes, startedAt } = body
    if (typeof minutes !== 'number' || minutes <= 0) {
      return NextResponse.json({ error: 'minutes required' }, { status: 400 })
    }

    // only link to the user's own task/goal
    let safeTaskId: string | null = null
    let safeGoalId: string | null = null
    if (taskId) {
      const task = await db.task.findFirst({ where: { id: taskId, userId: user.id } })
      if (task) {
        safeTaskId = task.id
        safeGoalId = task.goalId
      }
    } else if (goalId) {
      const goal = await db.goal.findFirst({ where: { id: goalId, userId: user.id } })
      if (goal) safeGoalId = goal.id
    }

    const session = await db.focusSession.create({
      data: {
        userId: user.id,
        taskId: safeTaskId,
        goalId: safeGoalId,
        minutes: Math.round(minutes),
        startedAt: startedAt ? new Date(startedAt) : new Date(),
        endedAt: new Date(),
      },
    })

    // roll focus minutes into the task
    if (safeTaskId) {
      const task = await db.task.findUnique({ where: { id: safeTaskId } })
      if (task) {
        await db.task.update({ where: { id: safeTaskId }, data: { focusMinutes: task.focusMinutes + Math.round(minutes) } })
      }
    }

    return NextResponse.json({ session }, { status: 201 })
  } catch (e) {
    console.error('POST /api/focus error', e)
    return NextResponse.json({ error: 'Failed to log focus session' }, { status: 500 })
  }
}

// GET /api/focus — the user's recent sessions
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const sessions = await db.focusSession.findMany({
      where: { userId: user.id },
      orderBy: { startedAt: 'desc' },
      take: 100,
      include: { task: { select: { title: true } }, goal: { select: { title: true } } },
    })
    return NextResponse.json({ sessions })
  } catch (e) {
    console.error('GET /api/focus error', e)
    return NextResponse.json({ error: 'Failed to load focus sessions' }, { status: 500 })
  }
}
