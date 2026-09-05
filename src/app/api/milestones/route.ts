import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

async function refreshGoalStreak(goalId: string) {
  // Streak = consecutive days (ending today or yesterday) with >=1 milestone completed
  const goal = await db.goal.findUnique({ where: { id: goalId }, include: { milestones: true } })
  if (!goal) return
  const days = new Set<string>()
  for (const m of goal.milestones) {
    if (m.completedAt) days.add(m.completedAt.toISOString().slice(0, 10))
  }
  let streak = 0
  const cursor = new Date()
  // allow streak to survive if today not yet done but yesterday was
  if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1)
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  await db.goal.update({ where: { id: goalId }, data: { streak, lastCompletedAt: new Date() } })
}

// POST /api/milestones — add milestone to a goal
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { goalId, title, dueDate } = body
    if (!goalId || !title?.trim()) {
      return NextResponse.json({ error: 'goalId and title are required' }, { status: 400 })
    }
    const count = await db.milestone.count({ where: { goalId } })
    const milestone = await db.milestone.create({
      data: {
        goalId,
        title: title.trim(),
        dueDate: dueDate ? new Date(dueDate) : null,
        order: count,
      },
    })
    return NextResponse.json({ milestone }, { status: 201 })
  } catch (e) {
    console.error('POST /api/milestones error', e)
    return NextResponse.json({ error: 'Failed to create milestone' }, { status: 500 })
  }
}

// PATCH handled in [id]; export helper for tasks route reuse
export { refreshGoalStreak }
