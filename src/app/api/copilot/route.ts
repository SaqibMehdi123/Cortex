import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { usedCitationNumbers } from '@/lib/citations'
import { createAI } from '@/lib/ai'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// Long AI generations must not hit the default serverless timeout (Vercel Hobby caps at 60 s).
export const maxDuration = 60

interface Cite {
  n: number
  label: string
  documentId?: string | null
  url?: string | null
  page?: number | null
  charStart?: number | null
}

// GET /api/copilot — the user's persisted copilot conversation
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const messages = await db.chatMessage.findMany({
      where: { userId: user.id, thread: 'copilot' },
      orderBy: { createdAt: 'asc' },
      take: 200,
    })
    return NextResponse.json({
      messages: messages.map((m) => ({ ...m, citations: m.citations ? JSON.parse(m.citations) : null })),
    })
  } catch (e) {
    console.error('GET /api/copilot error', e)
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  }
}

// POST /api/copilot — "Ask my second brain": cross-module grounded answer with citations
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const message: string = body?.message?.trim()
    if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 })

    const now = new Date()

    // Gather cross-module context in parallel (all scoped to this user)
    const [documents, notes, goals, tasks, plans, highlights, opportunities, news, flashcardsDue] = await Promise.all([
      db.document.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' }, take: 25, select: { id: true, title: true, summary: true, content: true, status: true, pageCount: true } }),
      db.note.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' }, take: 20 }),
      db.goal.findMany({ where: { userId: user.id, status: 'active' }, include: { milestones: true }, take: 15 }),
      db.task.findMany({ where: { userId: user.id, status: { not: 'done' } }, orderBy: [{ dueDate: 'asc' }], take: 15, include: { goal: { select: { title: true } } } }),
      db.plan.findMany({ where: { userId: user.id, done: false, timeframe: { not: 'template' } }, orderBy: { updatedAt: 'desc' }, take: 10 }),
      db.highlight.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 15, include: { document: { select: { title: true } } } }),
      db.opportunity.findMany({ where: { userId: user.id, status: { in: ['saved', 'applied', 'interview'] } }, take: 8 }),
      db.newsArticle.findMany({ where: { userId: user.id }, orderBy: { publishedAt: 'desc' }, take: 5 }),
      db.flashcard.count({ where: { userId: user.id, dueAt: { lte: now } } }),
    ])

    // Keyword search across doc content for RAG chunks
    const keywords = message
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 8)

    const chunks: { docId: string; docTitle: string; text: string; start: number; total: number; pageCount: number }[] = []
    for (const doc of documents) {
      if (!doc.content) continue
      // track each paragraph's char offset so citations can carry a page
      let cursor = 0
      for (const raw of doc.content.split(/\n{1,}/)) {
        const found = doc.content.indexOf(raw, cursor)
        if (found === -1) {
          cursor += raw.length + 1
          continue
        }
        cursor = found + raw.length
        const t = raw.trim()
        if (t.length <= 60) continue
        const lower = t.toLowerCase()
        const score = keywords.reduce((acc, k) => acc + (lower.includes(k) ? 1 : 0), 0)
        if (score > 0) {
          chunks.push({
            docId: doc.id,
            docTitle: doc.title,
            text: t,
            start: found + (raw.length - raw.trimStart().length),
            total: doc.content.length,
            pageCount: doc.pageCount ?? 0,
          })
        }
      }
    }
    chunks.sort((a, b) => b.text.length - a.text.length)
    const topChunks = chunks.slice(0, 6)

    const citations: Cite[] = topChunks.map((c, i) => ({
      n: i + 1,
      label: `${c.docTitle} — ${c.text.slice(0, 120)}…`,
      documentId: c.docId,
      url: null,
      // proportional estimate (char offset → page); the reader refines it
      // against the real PDF text layer when the citation is clicked
      page: c.pageCount > 0 && c.total > 0
        ? Math.min(c.pageCount, Math.max(1, Math.round((c.start / c.total) * c.pageCount)))
        : null,
      charStart: c.start,
    }))

    const contextParts = [
      `Documents in library (title — status):\n${documents.slice(0, 15).map((d) => `- ${d.title} (${d.status}${d.summary ? `, summary: ${d.summary.slice(0, 100)}` : ''})`).join('\n')}`,
      notes.length ? `Recent notes:\n${notes.slice(0, 10).map((n) => `- ${n.title ?? '(untitled)'}: ${n.content.slice(0, 150)}`).join('\n')}` : null,
      goals.length
        ? `Active goals with milestones:\n${goals
            .map((g) => {
              const done = g.milestones.filter((m) => m.done).length
              return `- ${g.title} [${done}/${g.milestones.length} milestones done]${g.deadline ? `, deadline ${g.deadline.toISOString().slice(0, 10)}` : ''}: ${g.milestones.slice(0, 5).map((m) => `${m.done ? '✓' : '○'} ${m.title}`).join('; ')}`
            })
            .join('\n')}`
        : null,
      tasks.length ? `Open tasks (soonest due first):\n${tasks.slice(0, 10).map((t) => `- ${t.title}${t.dueDate ? ` (due ${t.dueDate.toISOString().slice(0, 10)})` : ''}${t.goal ? ` [goal: ${t.goal.title}]` : ''}`).join('\n')}` : null,
      plans.length ? `Active plans:\n${plans.slice(0, 8).map((p) => `- [${p.timeframe}] ${p.title}`).join('\n')}` : null,
      highlights.length ? `Recent highlights:\n${highlights.slice(0, 8).map((h) => `- "${h.text.slice(0, 140)}" (${h.document.title})`).join('\n')}` : null,
      opportunities.length ? `Career pipeline:\n${opportunities.map((o) => `- ${o.company} — ${o.role} [${o.status}]${o.deadline ? `, deadline ${o.deadline.toISOString().slice(0, 10)}` : ''}`).join('\n')}` : null,
      news.length ? `Latest AI news headlines:\n${news.map((n) => `- ${n.title}`).join('\n')}` : null,
      `Flashcards due for review right now: ${flashcardsDue}`,
      topChunks.length
        ? `Most relevant passages from the user's library for this question (numbered — cite them as [1], [2]… after sentences that use them):\n${topChunks.map((c, i) => `(${i + 1}) From "${c.docTitle}": ${c.text.slice(0, 900)}`).join('\n\n')}`
        : null,
    ]

    const userMsg = await db.chatMessage.create({
      data: { userId: user.id, thread: 'copilot', role: 'user', content: message },
    })

    const history = await db.chatMessage.findMany({
      where: { userId: user.id, thread: 'copilot' },
      orderBy: { createdAt: 'asc' },
      take: 30,
    })

    const zai = await createAI()
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: [
            `You are Cortex Copilot, the user's cross-module "second brain" assistant. Today is ${now.toISOString().slice(0, 10)}.`,
            `You have live access to a snapshot of the user's workspace below: their documents, highlights, notes, goals, milestones, tasks, plans, career pipeline, news, and flashcard queue.`,
            `Answer questions concretely using this data. For "what did X say" questions, prefer the numbered library passages. For planning questions, reference open tasks and deadlines. Be concise and actionable (under 350 words). Use markdown.`,
            topChunks.length ? `Append citation markers like [1] or [2] right after sentences grounded in the numbered passages.` : null,
            `Snapshot of the user's workspace:\n\n${contextParts.filter(Boolean).join('\n\n')}`,
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
        ...history.slice(-10).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: message },
      ],
      thinking: { type: 'disabled' },
    })

    const reply = completion.choices[0]?.message?.content ?? 'Sorry, I could not generate an answer. Please try again.'

    const used = usedCitationNumbers(reply)
    const usedCitations = citations.filter((c) => used.has(c.n))

    const assistantMsg = await db.chatMessage.create({
      data: {
        userId: user.id,
        thread: 'copilot',
        role: 'assistant',
        content: reply,
        citations: usedCitations.length ? JSON.stringify(usedCitations) : null,
      },
    })

    return NextResponse.json({ userMessage: userMsg, assistantMessage: { ...assistantMsg, citations: usedCitations } })
  } catch (e) {
    console.error('POST /api/copilot error', e)
    return NextResponse.json({ error: 'AI request failed. Please try again.' }, { status: 500 })
  }
}

// DELETE /api/copilot — clear the user's copilot conversation
export async function DELETE() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    await db.chatMessage.deleteMany({ where: { userId: user.id, thread: 'copilot' } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/copilot error', e)
    return NextResponse.json({ error: 'Failed to clear conversation' }, { status: 500 })
  }
}
