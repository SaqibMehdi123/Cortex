import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { planSpan } from '@/lib/plan-span'

// The signed-in user's local calendar day as UTC instants — `tzOffset` is
// Date#getTimezoneOffset() minutes from the browser (negative east of UTC).
// Without it a PKT user's 00:00–05:00 items land on the wrong server day,
// because the serverless runtime always runs on UTC.
function userDayWindow(offsetMin: number, now: Date): { start: Date; end: Date } {
  const safeOffset = Number.isFinite(offsetMin) ? offsetMin : 0
  const shifted = new Date(now.getTime() - safeOffset * 60_000)
  const y = shifted.getUTCFullYear()
  const m = shifted.getUTCMonth()
  const d = shifted.getUTCDate()
  const start = new Date(Date.UTC(y, m, d) + safeOffset * 60_000)
  return { start, end: new Date(start.getTime() + 86_400_000 - 1) }
}

// GET /api/dashboard?tzOffset= — everything the "Today" screen needs for the
// signed-in user, including the Copilot briefing. Every query is scoped to
// the account; `tzOffset` keeps day windows on the USER's calendar.
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { searchParams } = new URL(req.url)
    const tzOffset = Number.parseInt(searchParams.get('tzOffset') || '', 10)

    const now = new Date()
    const userDay = userDayWindow(tzOffset, now)
    const today = userDay.start
    const todayEnd = userDay.end
    const in7 = new Date(now.getTime() + 7 * 86_400_000)

    const setting = await db.setting.findUnique({ where: { userId: user.id } })

    const [todayTasks, todayPlanRows, goals, newsDigest, documents, flashcardsDue, focusSessionsToday, readingToday, opportunities, doneTodayCount] =
      await Promise.all([
        db.task.findMany({
          where: { userId: user.id, dueDate: { gte: today, lte: todayEnd }, status: { not: 'done' } },
          orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
          include: { goal: { select: { id: true, title: true, color: true } } },
          take: 20,
        }),
        // Span-aware: a plan is "today" when its start→end span (explicit, or
        // derived from its timeframe) covers the user's current day. Day plans
        // show only on their date; week/month/quarter/year plans show across
        // their whole span. Undated plans can't be placed on a calendar.
        db.plan.findMany({
          where: { userId: user.id, done: false, timeframe: { not: 'template' }, OR: [{ startDate: { not: null } }, { endDate: { not: null } }] },
          orderBy: { createdAt: 'asc' },
          take: 200,
        }),
        db.goal.findMany({
          where: { userId: user.id, status: 'active' },
          include: { milestones: { orderBy: { order: 'asc' } } },
        }),
        db.newsArticle.findMany({ where: { userId: user.id }, orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }], take: 5 }),
        db.document.findMany({ where: { userId: user.id, status: 'reading' }, orderBy: { lastReadAt: 'desc' }, take: 4 }),
        db.flashcard.count({ where: { userId: user.id, dueAt: { lte: now } } }),
        db.focusSession.findMany({ where: { userId: user.id, startedAt: { gte: today } } }),
        db.readingSession.aggregate({ where: { userId: user.id, day: { gte: today } }, _sum: { minutes: true } }),
        db.opportunity.findMany({
          where: { userId: user.id, status: { in: ['saved', 'applied', 'interview'] }, deadline: { not: null } },
          orderBy: { deadline: 'asc' },
          take: 6,
        }),
        db.task.count({ where: { userId: user.id, status: 'done', completedAt: { gte: today, lte: todayEnd } } }),
      ])

    const todayPlans = todayPlanRows
      .filter((p) => {
        const span = planSpan(p)
        return span && span.start.getTime() <= todayEnd.getTime() && span.end.getTime() >= today.getTime()
      })
      .slice(0, 10)

    // deadlines: tasks + opportunity deadlines + goal deadlines in next 7 days
    const upcomingTasks = await db.task.findMany({
      where: { userId: user.id, status: { not: 'done' }, dueDate: { gte: todayEnd, lte: in7 } },
      orderBy: { dueDate: 'asc' },
      take: 8,
    })
    const overdueTasks = await db.task.findMany({
      where: { userId: user.id, status: { not: 'done' }, dueDate: { lt: today } },
      orderBy: { dueDate: 'asc' },
      take: 8,
    })

    const deadlines: {
      id: string
      kind: 'task' | 'opportunity' | 'goal'
      title: string
      subtitle: string | null
      date: string
      daysLeft: number
    }[] = []

    const dayMs = 86_400_000
    for (const t of [...overdueTasks, ...upcomingTasks]) {
      const dl = t.dueDate ? new Date(t.dueDate) : null
      if (!dl) continue
      deadlines.push({
        id: t.id,
        kind: 'task',
        title: t.title,
        subtitle: null,
        date: dl.toISOString(),
        daysLeft: Math.ceil((dl.getTime() - now.getTime()) / dayMs),
      })
    }
    for (const o of opportunities) {
      const dl = o.deadline ? new Date(o.deadline) : null
      if (!dl) continue
      deadlines.push({
        id: o.id,
        kind: 'opportunity',
        title: `${o.company} — ${o.role}`,
        subtitle: o.nextAction,
        date: dl.toISOString(),
        daysLeft: Math.ceil((dl.getTime() - now.getTime()) / dayMs),
      })
    }
    for (const g of goals) {
      const dl = g.deadline ? new Date(g.deadline) : null
      if (!dl || dl > in7) continue
      deadlines.push({
        id: g.id,
        kind: 'goal',
        title: g.title,
        subtitle: 'Goal deadline',
        date: dl.toISOString(),
        daysLeft: Math.ceil((dl.getTime() - now.getTime()) / dayMs),
      })
    }
    deadlines.sort((a, b) => a.daysLeft - b.daysLeft)

    const goalsWithProgress = goals
      .map((g) => {
        const done = g.milestones.filter((m) => m.done).length
        return {
          id: g.id,
          title: g.title,
          category: g.category,
          color: g.color,
          deadline: g.deadline,
          progress: g.milestones.length ? Math.round((done / g.milestones.length) * 100) : 0,
          milestonesDone: done,
          milestonesTotal: g.milestones.length,
          streak: g.streak,
          nextMilestone: g.milestones.find((m) => !m.done)?.title ?? null,
        }
      })
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 6)

    // Briefing: next best task = open task soonest due, prefer high priority
    const allOpen = await db.task.findMany({
      where: { userId: user.id, status: { not: 'done' } },
      orderBy: [{ dueDate: 'asc' }],
      take: 50,
    })
    const nextBestTask =
      allOpen.find((t) => t.priority === 'high') ??
      allOpen.find((t) => t.dueDate && new Date(t.dueDate) <= todayEnd) ??
      allOpen[0] ??
      null

    // at-risk goals: deadline within 14 days but < 50% progress, or no milestone done in 10 days
    const atRisk = goals
      .map((g) => {
        const done = g.milestones.filter((m) => m.done).length
        const pct = g.milestones.length ? done / g.milestones.length : 0
        const lastDone = g.milestones
          .filter((m) => m.completedAt)
          .map((m) => new Date(m.completedAt!).getTime())
          .sort((a, b) => b - a)[0]
        const daysSince = lastDone ? Math.floor((now.getTime() - lastDone) / dayMs) : null
        if (g.deadline && new Date(g.deadline).getTime() - now.getTime() < 14 * dayMs && pct < 0.5) {
          return { id: g.id, title: g.title, reason: `Deadline in ${Math.ceil((new Date(g.deadline).getTime() - now.getTime()) / dayMs)} days but only ${Math.round(pct * 100)}% done` }
        }
        if (daysSince !== null && daysSince > 10 && g.milestones.length && done < g.milestones.length) {
          return { id: g.id, title: g.title, reason: `No milestone completed in ${daysSince} days` }
        }
        return null
      })
      .filter((x): x is { id: string; title: string; reason: string } => x !== null)
      .slice(0, 3)

    const focusMinutesToday = focusSessionsToday.reduce((acc, f) => acc + f.minutes, 0)
    const totalToday = todayTasks.length + doneTodayCount

    // greeting prefers the signed-in account, falls back to the profile setting
    const firstName = user.name.split(' ')[0]

    return NextResponse.json({
      greetingName: firstName ?? setting?.name ?? 'there',
      todayTasks,
      todayPlans,
      goals: goalsWithProgress,
      newsDigest,
      deadlines: deadlines.slice(0, 8),
      continueReading: documents,
      briefing: {
        dueFlashcards: flashcardsDue,
        nextBestTask,
        atRiskGoals: atRisk,
        focusMinutesToday,
        readMinutesToday: readingToday._sum.minutes ?? 0,
        unreadNews: await db.newsArticle.count({ where: { userId: user.id, read: false } }),
        tasksDoneToday: doneTodayCount,
        tasksTotalToday: totalToday,
        streakBest: goals.reduce((max, g) => Math.max(max, g.streak), 0),
      },
    })
  } catch (e) {
    console.error('GET /api/dashboard error', e)
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 })
  }
}
