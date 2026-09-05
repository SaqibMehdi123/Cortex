import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/mindmaps — all maps with parsed nodes
export async function GET() {
  try {
    const maps = await db.mindMap.findMany({
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
    const body = await req.json()
    const { title, goalId, nodes } = body
    const map = await db.mindMap.create({
      data: {
        title: title?.trim() || 'Untitled map',
        goalId: goalId || null,
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
