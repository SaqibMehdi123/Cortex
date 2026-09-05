import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import ZAI from 'z-ai-web-dev-sdk'

// POST /api/documents/[id]/summarize — AI summary + key takeaways
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const document = await db.document.findUnique({ where: { id } })
    if (!document) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const content = document.content?.slice(0, 18000)
    if (!content) {
      return NextResponse.json({ error: 'This document has no text content to summarize yet.' }, { status: 422 })
    }

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            'You summarize reading material for a personal knowledge hub. Return ONLY valid JSON with keys: ' +
            '{"summary": string (2-3 sentence overview), "takeaways": string[] (3-5 key takeaways, each one concrete sentence), "tags": string[] (2-4 short topical tags like "transformers", "productivity")}. No markdown fences.',
        },
        {
          role: 'user',
          content: `Title: ${document.title}\nAuthor: ${document.author ?? 'unknown'}\n\nContent:\n${content}`,
        },
      ],
      thinking: { type: 'disabled' },
    })

    let raw = (completion.choices[0]?.message?.content ?? '').replace(/```json|```/g, '').trim()
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end === -1) throw new Error('bad AI response')

    const parsed = JSON.parse(raw.slice(start, end + 1))
    const summary = typeof parsed.summary === 'string' ? parsed.summary : ''
    const takeaways = Array.isArray(parsed.takeaways) ? parsed.takeaways.slice(0, 6).map(String) : []
    const aiTags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 4).map(String) : []

    const mergedTags = Array.from(
      new Set([...(document.tags ? document.tags.split(',').map((t) => t.trim()).filter(Boolean) : []), ...aiTags])
    ).slice(0, 6)

    const documentUpdated = await db.document.update({
      where: { id },
      data: {
        summary,
        takeaways: JSON.stringify(takeaways),
        tags: mergedTags.join(', ') || null,
      },
    })

    return NextResponse.json({ document: documentUpdated })
  } catch (e) {
    console.error('POST /api/documents/[id]/summarize error', e)
    return NextResponse.json({ error: 'AI summary failed. Please try again.' }, { status: 500 })
  }
}
