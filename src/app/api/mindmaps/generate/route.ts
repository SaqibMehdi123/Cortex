import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createAI } from '@/lib/ai'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// Long AI generations must not hit the default serverless timeout (Vercel Hobby caps at 60 s).
export const maxDuration = 60

interface GenNode {
  id: string
  label: string
  x: number
  y: number
  parentId: string | null
  color?: string
}

// POST /api/mindmaps/generate — AI-generate a mindmap from one of the user's documents, a topic, or their notes
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const { documentId, topic, source } = body as { documentId?: string; topic?: string; source?: string }

    let material = ''
    let title = topic?.trim() || 'New mindmap'

    if (documentId) {
      const doc = await db.document.findFirst({ where: { id: documentId, userId: user.id } })
      if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      // One mindmap per document: re-generating must never duplicate the
      // previous map — return the existing one untouched instead.
      const existing = await db.mindMap.findFirst({
        where: { userId: user.id, sourceDocId: documentId },
        orderBy: { updatedAt: 'desc' },
        include: { goal: { select: { id: true, title: true, color: true } } },
      })
      if (existing) {
        return NextResponse.json({ mindmap: { ...existing, nodes: JSON.parse(existing.nodes || '[]') }, existing: true })
      }
      material = `Title: ${doc.title}\n\n${(doc.content ?? doc.summary ?? '').slice(0, 14000)}`
      title = doc.title
    } else if (source === 'notes') {
      const notes = await db.note.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' }, take: 20 })
      material = notes.map((n) => `- ${n.title ?? '(untitled)'}: ${n.content.slice(0, 300)}`).join('\n')
      title = 'My notes overview'
    } else if (topic?.trim()) {
      material = `Topic to brainstorm: ${topic.trim()}`
    } else {
      return NextResponse.json({ error: 'Provide a documentId, topic, or source' }, { status: 400 })
    }

    const zai = await createAI()
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: [
            'You generate mindmaps as a tree. Return ONLY JSON: {"nodes": [{"id": "n1", "label": string, "parentId": string|null, "color": "indigo"|"emerald"|"amber"|"rose"|"violet"|"cyan"|"zinc"}]}.',
            'Rules: first node is the ROOT (parentId null) — it is the central idea. Then 3-6 main branches, each with 2-4 children. Labels under 6 words. Colors: root indigo, branches vary.',
          ].join('\n'),
        },
        { role: 'user', content: material },
      ],
      thinking: { type: 'disabled' },
    })

    let raw = (completion.choices[0]?.message?.content ?? '').replace(/```json|```/g, '').trim()
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end === -1) throw new Error('bad AI response')
    const parsed = JSON.parse(raw.slice(start, end + 1))

    const rawNodes: { id: string; label: string; parentId: string | null; color?: string }[] = Array.isArray(parsed.nodes)
      ? parsed.nodes.slice(0, 40)
      : []
    if (rawNodes.length === 0) throw new Error('empty tree')

    // Layout: root center, BFS levels left→right columns (horizontal tree)
    const nodes: GenNode[] = []
    const byParent = new Map<string | null, typeof rawNodes>()
    for (const n of rawNodes) {
      const key = n.parentId && rawNodes.some((r) => r.id === n.parentId) ? n.parentId : null
      if (!byParent.has(key)) byParent.set(key, [])
      byParent.get(key)!.push(n)
    }

    // compute depth
    const depth = new Map<string, number>()
    const visit = (id: string, d: number) => {
      depth.set(id, d)
      for (const n of rawNodes) {
        if (n.parentId === id && !depth.has(n.id)) visit(n.id, d + 1)
      }
    }
    for (const n of rawNodes) {
      if (!n.parentId || !rawNodes.some((r) => r.id === n.parentId)) visit(n.id, 0)
    }
    const maxDepth = Math.max(...Array.from(depth.values()), 0)
    const levelCount = new Map<number, number>()
    for (const n of rawNodes) {
      const d = depth.get(n.id) ?? 1
      const idx = levelCount.get(d) ?? 0
      levelCount.set(d, idx + 1)
      nodes.push({
        id: n.id,
        label: String(n.label ?? 'Idea').slice(0, 60),
        parentId: n.parentId && rawNodes.some((r) => r.id === n.parentId) ? n.parentId : null,
        color: n.color ?? (d === 0 ? 'indigo' : 'zinc'),
        x: 120 + d * 240,
        y: 80 + idx * 90 - (levelCount.get(d) ?? 1) * 15,
      })
    }
    void maxDepth

    const map = await db.mindMap.create({
      data: { userId: user.id, title, nodes: JSON.stringify(nodes), ...(documentId ? { sourceDocId: documentId } : {}) },
      include: { goal: { select: { id: true, title: true, color: true } } },
    })

    return NextResponse.json({ mindmap: { ...map, nodes } }, { status: 201 })
  } catch (e) {
    console.error('POST /api/mindmaps/generate error', e)
    return NextResponse.json({ error: 'AI mindmap generation failed. Try again.' }, { status: 500 })
  }
}
