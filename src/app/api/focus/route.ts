import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/focus — log a completed pomodoro/focus session
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { taskId, goalId, minutes, startedAt } = body
    if (typeof minutes !== 'number' || minutes <= 0) {
      return NextResponse.json({ error: 'minutes required' }, { status: 400 })
    }

    const session = await db.focusSession.create({
      data: {
        taskId: taskId || null,
        goalId: goalId || null,
        minutes: Math.round(minutes),
        startedAt: startedAt ? new Date(startedAt) : new Date(),
        endedAt: new Date(),
      },
    })

    // roll focus minutes into the task
    if (taskId) {
      const task = await db.task.findUnique({ where: { id: taskId } })
      if (task) {
        await db.task.update({ where: { id: taskId }, data: { focusMinutes: task.focusMinutes + Math.round(minutes) } })
      }
    }

    return NextResponse.json({ session }, { status: 201 })
  } catch (e) {
    console.error('POST /api/focus error', e)
    return NextResponse.json({ error: 'Failed to log focus session' }, { status: 500 })
  }
}

// GET /api/focus — recent sessions
export async function GET() {
  try {
    const sessions = await db.focusSession.findMany({
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
