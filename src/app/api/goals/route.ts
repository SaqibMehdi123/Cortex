import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/goals — all goals with steps
export async function GET() {
  try {
    const goals = await db.goal.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: { steps: { orderBy: { order: 'asc' } } },
    })
    return NextResponse.json({ goals })
  } catch (e) {
    console.error('GET /api/goals error', e)
    return NextResponse.json({ error: 'Failed to load goals' }, { status: 500 })
  }
}

// POST /api/goals — create goal (optionally with initial steps)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, description, category, deadline, color, steps } = body

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const goal = await db.goal.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        category: category || 'learning',
        deadline: deadline ? new Date(deadline) : null,
        color: color || 'emerald',
        steps: {
          create: (Array.isArray(steps) ? steps : [])
            .filter((s: { title?: string }) => s?.title?.trim())
            .map((s: { title: string }, i: number) => ({ title: s.title.trim(), order: i })),
        },
      },
      include: { steps: { orderBy: { order: 'asc' } } },
    })

    return NextResponse.json({ goal }, { status: 201 })
  } catch (e) {
    console.error('POST /api/goals error', e)
    return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 })
  }
}
