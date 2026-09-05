import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// GET /api/notes — the signed-in user's quick-capture notes
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const notes = await db.note.findMany({
      where: { userId: user.id },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    })
    return NextResponse.json({ notes })
  } catch (e) {
    console.error('GET /api/notes error', e)
    return NextResponse.json({ error: 'Failed to load notes' }, { status: 500 })
  }
}

// POST /api/notes
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const { title, content, source, pinned } = body
    if (!content?.trim()) return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    const note = await db.note.create({
      data: {
        userId: user.id,
        title: title?.trim() || null,
        content: content.trim().slice(0, 20000),
        source: ['typed', 'voice', 'url', 'capture'].includes(source) ? source : 'typed',
        pinned: Boolean(pinned),
      },
    })
    return NextResponse.json({ note }, { status: 201 })
  } catch (e) {
    console.error('POST /api/notes error', e)
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })
  }
}
