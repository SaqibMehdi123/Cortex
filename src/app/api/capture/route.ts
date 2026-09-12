import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { safeFetch } from '@/lib/safe-fetch'

// POST /api/capture — quick capture router: note | voice | url | task
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const type: string = body?.type
    const content: string = body?.content?.trim()
    const title: string | undefined = body?.title
    const dueDate: string | undefined = body?.dueDate

    if (!content) return NextResponse.json({ error: 'Content is required' }, { status: 400 })

    if (type === 'task') {
      const task = await db.task.create({
        data: {
          userId: user.id,
          title: content.slice(0, 300),
          dueDate: dueDate ? new Date(dueDate) : null,
          priority: 'med',
        },
      })
      return NextResponse.json({ ok: true, kind: 'task', task }, { status: 201 })
    }

    if (type === 'url') {
      let url = content
      if (!/^https?:\/\//.test(url)) url = `https://${url}`
      let extractedTitle = title?.trim() || url.replace(/^https?:\/\//, '').split('/')[0]
      let extractedContent: string | null = null
      try {
        // safeFetch: SSRF-guarded — the URL is user-supplied, so internal /
        // private hosts are unreachable and redirects are re-validated.
        const res = await safeFetch(url, { timeoutMs: 12000 })
        const html = await res.text()
        const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
        if (t) extractedTitle = t.replace(/\s+/g, ' ').trim().slice(0, 300)
        const bodyText = html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (bodyText.length > 400) extractedContent = bodyText.slice(0, 200000)
      } catch {
        // offline / blocked — still queue it
      }
      const document = await db.document.create({
        data: {
          userId: user.id,
          title: extractedTitle,
          type: 'url',
          source: url,
          status: 'queued',
          content: extractedContent,
        },
      })
      return NextResponse.json({ ok: true, kind: 'document', document }, { status: 201 })
    }

    // note | voice
    const note = await db.note.create({
      data: {
        userId: user.id,
        title: title?.trim() || null,
        content: content.slice(0, 20000),
        source: type === 'voice' ? 'voice' : 'capture',
      },
    })
    return NextResponse.json({ ok: true, kind: 'note', note }, { status: 201 })
  } catch (e) {
    console.error('POST /api/capture error', e)
    return NextResponse.json({ error: 'Failed to capture' }, { status: 500 })
  }
}
