import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { MindMap } from '@prisma/client'

// SQLite stores `nodes` as a JSON string — always send it back as a parsed array.
function serialize(mindmap: MindMap) {
  let nodes: unknown = []
  try {
    nodes = JSON.parse(mindmap.nodes)
  } catch {
    nodes = []
  }
  if (!Array.isArray(nodes)) nodes = []
  return { ...mindmap, nodes }
}

// GET /api/mindmaps — list all mindmaps
export async function GET() {
  try {
    const mindmaps = await db.mindMap.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { goal: { select: { id: true, title: true, color: true } } },
    })
    return NextResponse.json({ mindmaps: mindmaps.map(serialize) })
  } catch (e) {
    console.error('GET /api/mindmaps error', e)
    return NextResponse.json({ error: 'Failed to load mindmaps' }, { status: 500 })
  }
}

// POST /api/mindmaps — create a mindmap
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, goalId, nodes } = body

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const mindmap = await db.mindMap.create({
      data: {
        title: title.trim(),
        goalId: goalId || null,
        nodes: JSON.stringify(
          Array.isArray(nodes) && nodes.length
            ? nodes
            : [{ id: 'root', label: title.trim(), x: 900, y: 560, parentId: null, color: 'emerald' }]
        ),
      },
      include: { goal: { select: { id: true, title: true, color: true } } },
    })

    return NextResponse.json({ mindmap: serialize(mindmap) }, { status: 201 })
  } catch (e) {
    console.error('POST /api/mindmaps error', e)
    return NextResponse.json({ error: 'Failed to create mindmap' }, { status: 500 })
  }
}
