import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function endOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

// GET /api/dashboard — aggregated overview for the home screen
export async function GET() {
  try {
    const now = new Date()

    const [todayPlans, goals, documents, unreadNews, opportunities, openPlans] = await Promise.all([
      db.plan.findMany({
        where: { timeframe: 'day', done: false },
        orderBy: { createdAt: 'asc' },
        take: 10,
      }),
      db.goal.findMany({
        where: { status: 'active' },
        include: { steps: { orderBy: { order: 'asc' } } },
      }),
      db.document.findMany({ where: { status: 'reading' }, orderBy: { updatedAt: 'desc' }, take: 5 }),
      db.newsArticle.count({ where: { read: false } }),
      db.opportunity.findMany({
        where: { status: { in: ['new', 'applied', 'interview'] } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      db.plan.count({ where: { done: false } }),
    ])

    const finishedDocs = await db.document.count({ where: { status: 'finished' } })
    const totalDocs = await db.document.count()
    const totalStepsDone = await db.step.count({ where: { done: true } })
    const totalSteps = await db.step.count()

    const goalsWithProgress = goals.map((g) => {
      const done = g.steps.filter((s) => s.done).length
      return {
        id: g.id,
        title: g.title,
        category: g.category,
        color: g.color,
        deadline: g.deadline,
        progress: g.steps.length ? Math.round((done / g.steps.length) * 100) : 0,
        stepsDone: done,
        stepsTotal: g.steps.length,
        nextStep: g.steps.find((s) => !s.done)?.title ?? null,
      }
    })

    return NextResponse.json({
      todayPlans,
      goals: goalsWithProgress,
      documents,
      stats: {
        unreadNews,
        openPlans,
        activeOpportunities: opportunities.length,
        totalDocs,
        finishedDocs,
        totalSteps,
        totalStepsDone,
      },
      opportunities,
    })
  } catch (e) {
    console.error('GET /api/dashboard error', e)
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 })
  }
}
