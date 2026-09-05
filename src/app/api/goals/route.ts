import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

function computeVelocity(milestones: { completedAt: Date | null }[]): number[] {
  // milestones completed per week, last 8 weeks (oldest → newest)
  const weeks: number[] = Array(8).fill(0)
  const now = new Date()
  for (const m of milestones) {
    if (!m.completedAt) continue
    const diffWeeks = Math.floor((now.getTime() - m.completedAt.getTime()) / (7 * 86_400_000))
    if (diffWeeks >= 0 && diffWeeks < 8) weeks[7 - diffWeeks]++
  }
  return weeks
}

// GET /api/goals — all goals with milestones + velocity
export async function GET() {
  try {
    const goals = await db.goal.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        milestones: { orderBy: { order: 'asc' }, include: { _count: { select: { tasks: true } } } },
      },
    })
    return NextResponse.json({
      goals: goals.map((g) => ({ ...g, velocity: computeVelocity(g.milestones) })),
    })
  } catch (e) {
    console.error('GET /api/goals error', e)
    return NextResponse.json({ error: 'Failed to load goals' }, { status: 500 })
  }
}

// POST /api/goals — create goal (optionally with initial milestones)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, description, category, deadline, color, milestones } = body

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const goal = await db.goal.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        category: category || 'learning',
        deadline: deadline ? new Date(deadline) : null,
        color: color || 'indigo',
        milestones: {
          create: (Array.isArray(milestones) ? milestones : [])
            .filter((m: { title?: string }) => m?.title?.trim())
            .map((m: { title: string; dueDate?: string }, i: number) => ({
              title: m.title.trim(),
              order: i,
              dueDate: m.dueDate ? new Date(m.dueDate) : null,
            })),
        },
      },
      include: { milestones: { orderBy: { order: 'asc' } } },
    })

    return NextResponse.json({ goal: { ...goal, velocity: computeVelocity(goal.milestones) } }, { status: 201 })
  } catch (e) {
    console.error('POST /api/goals error', e)
    return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 })
  }
}
