import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/plans?timeframe=day|week|month — list plans
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const timeframe = searchParams.get('timeframe')

    const where: Record<string, unknown> = {}
    if (timeframe && timeframe !== 'all') where.timeframe = timeframe

    const plans = await db.plan.findMany({
      where,
      orderBy: [{ done: 'asc' }, { createdAt: 'desc' }],
      include: { goal: { select: { id: true, title: true, color: true } } },
    })

    return NextResponse.json({ plans })
  } catch (e) {
    console.error('GET /api/plans error', e)
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }
}

// POST /api/plans — create a plan item
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { timeframe, title, notes, dueDate, goalId } = body

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const plan = await db.plan.create({
      data: {
        timeframe: timeframe || 'day',
        title: title.trim(),
        notes: notes?.trim() || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        goalId: goalId || null,
      },
      include: { goal: { select: { id: true, title: true, color: true } } },
    })

    return NextResponse.json({ plan }, { status: 201 })
  } catch (e) {
    console.error('POST /api/plans error', e)
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 })
  }
}
