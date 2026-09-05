import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// GET /api/mindmaps — the signed-in user's maps with parsed nodes
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const maps = await db.mindMap.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      include: { goal: { select: { id: true, title: true, color: true } } },
    })
    return NextResponse.json({
      mindmaps: maps.map((m) => ({ ...m, nodes: JSON.parse(m.nodes || '[]') })),
    })
  } catch (e) {
    console.error('GET /api/mindmaps error', e)
    return NextResponse.json({ error: 'Failed to load mindmaps' }, { status: 500 })
  }
}

// POST /api/mindmaps — create map
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const { title, goalId, nodes } = body
    let safeGoalId: string | null = null
    if (goalId) {
      const goal = await db.goal.findFirst({ where: { id: goalId, userId: user.id } })
      if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 400 })
      safeGoalId = goal.id
    }
    const map = await db.mindMap.create({
      data: {
        userId: user.id,
        title: title?.trim() || 'Untitled map',
        goalId: safeGoalId,
        nodes: JSON.stringify(Array.isArray(nodes) ? nodes : []),
      },
      include: { goal: { select: { id: true, title: true, color: true } } },
    })
    return NextResponse.json({ mindmap: { ...map, nodes: JSON.parse(map.nodes) } }, { status: 201 })
  } catch (e) {
    console.error('POST /api/mindmaps error', e)
    return NextResponse.json({ error: 'Failed to create mindmap' }, { status: 500 })
  }
}
