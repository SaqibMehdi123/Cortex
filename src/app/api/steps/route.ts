import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/steps — add a step to a goal
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { goalId, title } = body

    if (!goalId || !title?.trim()) {
      return NextResponse.json({ error: 'goalId and title are required' }, { status: 400 })
    }

    const count = await db.step.count({ where: { goalId } })
    const step = await db.step.create({
      data: { goalId, title: title.trim(), order: count },
    })

    return NextResponse.json({ step }, { status: 201 })
  } catch (e) {
    console.error('POST /api/steps error', e)
    return NextResponse.json({ error: 'Failed to add step' }, { status: 500 })
  }
}
