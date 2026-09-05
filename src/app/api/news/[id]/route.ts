import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// PATCH /api/news/[id] — mark read / saved (per-user feed state)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if ('read' in body) data.read = Boolean(body.read)
    if ('saved' in body) data.saved = Boolean(body.saved)

    const existing = await db.newsArticle.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const article = await db.newsArticle.update({ where: { id }, data })
    return NextResponse.json({ article })
  } catch (e) {
    console.error('PATCH /api/news/[id] error', e)
    return NextResponse.json({ error: 'Failed to update article' }, { status: 500 })
  }
}

// DELETE /api/news/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const existing = await db.newsArticle.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await db.newsArticle.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/news/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete article' }, { status: 500 })
  }
}
