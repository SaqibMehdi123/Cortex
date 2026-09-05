import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import ZAI from 'z-ai-web-dev-sdk'

// GET /api/chat?documentId= — conversation for a document
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const documentId = searchParams.get('documentId')
    if (!documentId) return NextResponse.json({ messages: [] })

    const messages = await db.chatMessage.findMany({
      where: { thread: `doc:${documentId}` },
      orderBy: { createdAt: 'asc' },
      take: 200,
    })

    return NextResponse.json({
      messages: messages.map((m) => ({ ...m, citations: m.citations ? JSON.parse(m.citations) : null })),
    })
  } catch (e) {
    console.error('GET /api/chat error', e)
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  }
}

// POST /api/chat — ask AI about a document, with cited answers
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { documentId, message } = body

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const document = documentId ? await db.document.findUnique({ where: { id: documentId } }) : null
    if (documentId && !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const thread = document ? `doc:${document.id}` : 'copilot'

    const userMsg = await db.chatMessage.create({
      data: { documentId: document?.id ?? null, thread, role: 'user', content: message.trim() },
    })

    const highlights = document
      ? await db.highlight.findMany({ where: { documentId: document.id }, orderBy: { createdAt: 'desc' }, take: 20 })
      : []

    // Split content into paragraphs for citation targeting
    const paragraphs = document?.content
      ? document.content
          .split(/\n{1,}/)
          .map((p) => p.trim())
          .filter((p) => p.length > 60)
      : []

    const zai = await ZAI.create()

    // Step 1: pick the most relevant paragraph indexes to cite
    let citeHints: string[] = []
    if (paragraphs.length > 0) {
      const sample = paragraphs.slice(0, 400).map((p, i) => `[${i}] ${p.slice(0, 160)}`).join('\n')
      try {
        const pickCompletion = await zai.chat.completions.create({
          messages: [
            { role: 'system', content: 'You select which numbered paragraphs of a document are most relevant to a question. Return ONLY a JSON array of up to 3 numbers, e.g. [0,5,12]. No commentary.' },
            { role: 'user', content: `Question: ${message.trim()}\n\nParagraphs:\n${sample}` },
          ],
          thinking: { type: 'disabled' },
        })
        const arr = JSON.parse((pickCompletion.choices[0]?.message?.content ?? '[]').replace(/```json|```/g, '').trim())
        if (Array.isArray(arr)) citeHints = arr.slice(0, 3).map((n: unknown) => paragraphs[Number(n)] ?? '').filter(Boolean)
      } catch {
        citeHints = []
      }
    }

    // Step 2: answer with grounding + citations instruction
    const systemPrompt = [
      `You are the user's personal reading companion inside Cortex, a knowledge workspace.`,
      document ? `The user is reading: "${document.title}"${document.author ? ` by ${document.author}` : ''}.` : null,
      document?.content
        ? `Full content for reference:\n"""\n${document.content.slice(0, 22000)}\n"""`
        : `The user has not added the full text, so rely on the title/topic and general knowledge.`,
      citeHints.length
        ? `Most relevant passages for this question:\n${citeHints.map((p, i) => `(${i + 1}) ${p.slice(0, 1200)}`).join('\n')}`
        : null,
      highlights.length
        ? `User's highlights in this document:\n${highlights.slice(0, 10).map((h) => `- "${h.text.slice(0, 200)}"`).join('\n')}`
        : null,
      document?.notes ? `User's own notes: ${document.notes.slice(0, 3000)}` : null,
      `Answer clearly and concretely (under 350 words unless depth is requested). Use markdown.`,
      citeHints.length
        ? `When you ground a claim in one of the numbered relevant passages, append a citation marker like [1] or [2] right after the sentence that uses it.`
        : null,
    ]
      .filter(Boolean)
      .join('\n\n')

    const history = await db.chatMessage.findMany({
      where: { thread },
      orderBy: { createdAt: 'asc' },
      take: 30,
    })

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        ...history.slice(-10).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: message.trim() },
      ],
      thinking: { type: 'disabled' },
    })

    const reply = completion.choices[0]?.message?.content ?? 'Sorry, I could not generate an answer. Please try again.'

    // Build citation list from hints actually referenced
    const citations: { n: number; label: string; documentId: string | null; url: string | null }[] = []
    if (citeHints.length) {
      citeHints.forEach((p, i) => {
        if (reply.includes(`[${i + 1}]`)) {
          citations.push({
            n: i + 1,
            label: p.slice(0, 140) + (p.length > 140 ? '…' : ''),
            documentId: document?.id ?? null,
            url: null,
          })
        }
      })
    }

    const assistantMsg = await db.chatMessage.create({
      data: {
        documentId: document?.id ?? null,
        thread,
        role: 'assistant',
        content: reply,
        citations: citations.length ? JSON.stringify(citations) : null,
      },
    })

    return NextResponse.json({
      userMessage: userMsg,
      assistantMessage: { ...assistantMsg, citations },
    })
  } catch (e) {
    console.error('POST /api/chat error', e)
    return NextResponse.json({ error: 'AI request failed. Please try again.' }, { status: 500 })
  }
}

// DELETE /api/chat?documentId= — clear a conversation
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const documentId = searchParams.get('documentId')
    if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 })
    await db.chatMessage.deleteMany({ where: { thread: `doc:${documentId}` } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/chat error', e)
    return NextResponse.json({ error: 'Failed to clear conversation' }, { status: 500 })
  }
}
