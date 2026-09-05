import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import ZAI from 'z-ai-web-dev-sdk'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// GET /api/flashcards?mode=due|all — the signed-in user's cards
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { searchParams } = new URL(req.url)
    const mode = searchParams.get('mode') ?? 'all'
    const now = new Date()

    if (mode === 'due') {
      const cards = await db.flashcard.findMany({
        where: { userId: user.id, dueAt: { lte: now } },
        orderBy: { dueAt: 'asc' },
        include: { document: { select: { id: true, title: true } } },
      })
      return NextResponse.json({ cards })
    }

    const cards = await db.flashcard.findMany({
      where: { userId: user.id },
      orderBy: { dueAt: 'asc' },
      include: { document: { select: { id: true, title: true } } },
      take: 500,
    })
    const dueCount = await db.flashcard.count({ where: { userId: user.id, dueAt: { lte: now } } })
    return NextResponse.json({ cards, dueCount })
  } catch (e) {
    console.error('GET /api/flashcards error', e)
    return NextResponse.json({ error: 'Failed to load flashcards' }, { status: 500 })
  }
}

// POST /api/flashcards — create manually, or {generate:true, highlightId} to AI-generate Q/A from a highlight
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const { front, back, documentId, highlightId, generate } = body

    if (generate && highlightId) {
      const highlight = await db.highlight.findFirst({
        where: { id: highlightId, userId: user.id },
        include: { document: { select: { title: true } } },
      })
      if (!highlight) return NextResponse.json({ error: 'Highlight not found' }, { status: 404 })

      const zai = await ZAI.create()
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content:
              'Turn this highlighted passage into ONE flashcard for spaced repetition. Return ONLY JSON: {"front": "a crisp question", "back": "a concise answer (1-3 sentences) covering the passage"}. No markdown fences.',
          },
          { role: 'user', content: `Document: ${highlight.document.title}\nHighlight: ${highlight.text}` },
        ],
        thinking: { type: 'disabled' },
      })
      let raw = (completion.choices[0]?.message?.content ?? '').replace(/```json|```/g, '').trim()
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      if (start === -1 || end === -1) throw new Error('bad AI response')
      const parsed = JSON.parse(raw.slice(start, end + 1))

      const card = await db.flashcard.create({
        data: {
          userId: user.id,
          front: String(parsed.front ?? highlight.text.slice(0, 200)),
          back: String(parsed.back ?? highlight.text.slice(0, 500)),
          documentId: highlight.documentId,
          highlightId: highlight.id,
        },
      })
      return NextResponse.json({ card }, { status: 201 })
    }

    if (!front?.trim() || !back?.trim()) {
      return NextResponse.json({ error: 'Front and back are required' }, { status: 400 })
    }

    // document links are validated so cards can't be pinned to another user's doc
    let safeDocumentId: string | null = null
    if (documentId) {
      const document = await db.document.findFirst({ where: { id: documentId, userId: user.id } })
      if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 400 })
      safeDocumentId = document.id
    }

    const card = await db.flashcard.create({
      data: {
        userId: user.id,
        front: front.trim(),
        back: back.trim(),
        documentId: safeDocumentId,
        highlightId: highlightId || null,
      },
    })
    return NextResponse.json({ card }, { status: 201 })
  } catch (e) {
    console.error('POST /api/flashcards error', e)
    return NextResponse.json({ error: 'Failed to create flashcard' }, { status: 500 })
  }
}
