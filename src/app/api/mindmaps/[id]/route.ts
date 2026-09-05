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

// GET /api/mindmaps/[id]
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const mindmap = await db.mindMap.findUnique({
      where: { id },
      include: { goal: { select: { id: true, title: true, color: true } } },
    })
    if (!mindmap) return NextResponse.json({ error: 'Mindmap not found' }, { status: 404 })
    return NextResponse.json({ mindmap: serialize(mindmap) })
  } catch (e) {
    console.error('GET /api/mindmaps/[id] error', e)
    return NextResponse.json({ error: 'Failed to load mindmap' }, { status: 500 })
  }
}

// PATCH /api/mindmaps/[id] — save title / nodes
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = await req.json()

    const data: Record<string, unknown> = {}
    if ('title' in body) data.title = String(body.title).trim() || 'Untitled'
    if ('nodes' in body) {
      // accept array or string; normalize to a JSON string for storage
      if (typeof body.nodes === 'string') {
        try {
          const parsed = JSON.parse(body.nodes)
          data.nodes = JSON.stringify(Array.isArray(parsed) ? parsed : [])
        } catch {
          data.nodes = body.nodes
        }
      } else {
        data.nodes = JSON.stringify(Array.isArray(body.nodes) ? body.nodes : [])
      }
    }
    if ('goalId' in body) data.goalId = body.goalId || null

    const mindmap = await db.mindMap.update({
      where: { id },
      data,
      include: { goal: { select: { id: true, title: true, color: true } } },
    })
    return NextResponse.json({ mindmap: serialize(mindmap) })
  } catch (e) {
    console.error('PATCH /api/mindmaps/[id] error', e)
    return NextResponse.json({ error: 'Failed to save mindmap' }, { status: 500 })
  }
}

// DELETE /api/mindmaps/[id]
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    await db.mindMap.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/mindmaps/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete mindmap' }, { status: 500 })
  }
}
