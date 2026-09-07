import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// PATCH /api/shelves/[id] — rename a shelf (ownership enforced).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const existing = await db.shelf.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return NextResponse.json({ error: 'Shelf name is required' }, { status: 400 })
    if (name.length > 60) return NextResponse.json({ error: 'Shelf name is too long (max 60)' }, { status: 400 })

    const shelf = await db.shelf.update({
      where: { id },
      data: { name },
      include: { _count: { select: { documents: true } } },
    })
    return NextResponse.json({ shelf })
  } catch (e) {
    console.error('PATCH /api/shelves/[id] error', e)
    return NextResponse.json({ error: 'Failed to update shelf' }, { status: 500 })
  }
}

// DELETE /api/shelves/[id] — remove the shelf only. Books that were on it
// stay in the library, unshelved (Document.shelfId is onDelete: SetNull).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const existing = await db.shelf.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await db.shelf.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/shelves/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete shelf' }, { status: 500 })
  }
}
