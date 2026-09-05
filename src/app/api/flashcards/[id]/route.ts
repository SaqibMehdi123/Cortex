import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// PATCH /api/flashcards/[id] — edit one of the user's cards
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if ('front' in body) data.front = body.front
    if ('back' in body) data.back = body.back

    const existing = await db.flashcard.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const card = await db.flashcard.update({ where: { id }, data })
    return NextResponse.json({ card })
  } catch (e) {
    console.error('PATCH /api/flashcards/[id] error', e)
    return NextResponse.json({ error: 'Failed to update flashcard' }, { status: 500 })
  }
}

// DELETE /api/flashcards/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const existing = await db.flashcard.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await db.flashcard.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/flashcards/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete flashcard' }, { status: 500 })
  }
}
