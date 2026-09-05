import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import ZAI from 'z-ai-web-dev-sdk'

// GET /api/chat?documentId= — conversation for a document (or general)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const documentId = searchParams.get('documentId')

    const messages = await db.chatMessage.findMany({
      where: documentId ? { documentId } : { documentId: null },
      orderBy: { createdAt: 'asc' },
      take: 200,
    })

    return NextResponse.json({ messages })
  } catch (e) {
    console.error('GET /api/chat error', e)
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  }
}

// POST /api/chat — ask AI about a document (or general study question)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { documentId, message } = body

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    let document = null
    if (documentId) {
      document = await db.document.findUnique({ where: { id: documentId } })
      if (!document) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }
    }

    const history = await db.chatMessage.findMany({
      where: documentId ? { documentId } : { documentId: null },
      orderBy: { createdAt: 'asc' },
      take: 30,
    })

    const userMsg = await db.chatMessage.create({
      data: { documentId: documentId ?? null, role: 'user', content: message.trim() },
    })

    const systemPrompt = document
      ? [
          `You are the user's personal reading companion inside their knowledge hub.`,
          `The user is currently reading the following material:`,
          `Title: ${document.title}`,
          document.author ? `Author: ${document.author}` : null,
          document.source ? `Source: ${document.source}` : null,
          document.content
            ? `Full content available for reference:\n"""\n${document.content.slice(0, 24000)}\n"""`
            : `The user has not pasted the full content, so rely on the title/topic, general knowledge, and ask clarifying questions when needed.`,
          document.notes ? `User's own notes: ${document.notes.slice(0, 4000)}` : null,
          `Answer questions about this material clearly and concretely. Explain difficult concepts with examples. Keep answers focused (under 350 words unless asked for depth). Use markdown when helpful.`,
        ]
          .filter(Boolean)
          .join('\n')
      : `You are the user's personal learning assistant inside their knowledge hub. They may ask about anything they are studying. Be clear, concrete, and practical. Keep answers under 350 words unless asked for depth. Use markdown when helpful.`

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        ...history.slice(-10).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: message.trim() },
      ],
      thinking: { type: 'disabled' },
    })

    const reply =
      completion.choices[0]?.message?.content ??
      'Sorry, I could not generate an answer. Please try again.'

    const assistantMsg = await db.chatMessage.create({
      data: { documentId: documentId ?? null, role: 'assistant', content: reply },
    })

    return NextResponse.json({ userMessage: userMsg, assistantMessage: assistantMsg })
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
    await db.chatMessage.deleteMany({
      where: documentId ? { documentId } : { documentId: null },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/chat error', e)
    return NextResponse.json({ error: 'Failed to clear conversation' }, { status: 500 })
  }
}
