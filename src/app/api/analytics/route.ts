import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// GET /api/analytics?range=week|month — the user's reading, tasks, focus, goal velocity
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { searchParams } = new URL(req.url)
    const range = searchParams.get('range') === 'month' ? 'month' : 'week'
    const days = range === 'week' ? 7 : 30

    const start = new Date()
    start.setDate(start.getDate() - (days - 1))
    start.setHours(0, 0, 0, 0)

    const [readingSessions, doneTasks, focusSessions, reviews, activeGoals, finishedDocs] = await Promise.all([
      db.readingSession.findMany({ where: { userId: user.id, day: { gte: start } } }),
      db.task.findMany({ where: { userId: user.id, status: 'done', completedAt: { gte: start } }, select: { completedAt: true } }),
      db.focusSession.findMany({ where: { userId: user.id, startedAt: { gte: start } } }),
      db.reviewLog.findMany({ where: { userId: user.id, reviewedAt: { gte: start } }, select: { id: true } }),
      db.goal.count({ where: { userId: user.id, status: 'active' } }),
      db.document.count({ where: { userId: user.id, status: 'finished' } }),
    ])

    const dayKeys: string[] = []
    for (let i = 0; i < days; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      dayKeys.push(d.toISOString().slice(0, 10))
    }

    const perDay = dayKeys.map((key) => ({
      day: key,
      readingMinutes: readingSessions.filter((r) => r.day.toISOString().slice(0, 10) === key).reduce((a, r) => a + r.minutes, 0),
      tasksCompleted: doneTasks.filter((t) => t.completedAt!.toISOString().slice(0, 10) === key).length,
      focusMinutes: focusSessions.filter((f) => f.startedAt.toISOString().slice(0, 10) === key).reduce((a, f) => a + f.minutes, 0),
    }))

    // goal velocity: milestones completed per week over last 8 weeks
    const milestones = await db.milestone.findMany({ where: { userId: user.id, completedAt: { not: null } }, select: { completedAt: true } })
    const velocity: { week: string; completed: number }[] = []
    const now = new Date()
    for (let w = 7; w >= 0; w--) {
      const weekStart = new Date(now.getTime() - (w + 1) * 7 * 86_400_000)
      const weekEnd = new Date(now.getTime() - w * 7 * 86_400_000)
      velocity.push({
        week: weekEnd.toISOString().slice(0, 10),
        completed: milestones.filter((m) => {
          const t = new Date(m.completedAt!)
          return t >= weekStart && t < weekEnd
        }).length,
      })
    }

    return NextResponse.json({
      range,
      days: perDay,
      velocity,
      totals: {
        readingMinutes: perDay.reduce((a, d) => a + d.readingMinutes, 0),
        tasksCompleted: perDay.reduce((a, d) => a + d.tasksCompleted, 0),
        focusMinutes: perDay.reduce((a, d) => a + d.focusMinutes, 0),
        flashcardsReviewed: reviews.length,
        activeGoals,
        docsFinished: finishedDocs,
      },
    })
  } catch (e) {
    console.error('GET /api/analytics error', e)
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 })
  }
}
