import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/flashcards/[id] — edit card
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if ('front' in body) data.front = body.front
    if ('back' in body) data.back = body.back
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
    const { id } = await params
    await db.flashcard.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/flashcards/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete flashcard' }, { status: 500 })
  }
}
