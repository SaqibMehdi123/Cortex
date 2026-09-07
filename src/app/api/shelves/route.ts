import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// GET /api/shelves — the signed-in user's shelves in bookcase order,
// each with its book count for the strip badges.
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const shelves = await db.shelf.findMany({
      where: { userId: user.id },
      orderBy: { position: 'asc' },
      include: { _count: { select: { documents: true } } },
    })

    return NextResponse.json({ shelves })
  } catch (e) {
    console.error('GET /api/shelves error', e)
    return NextResponse.json({ error: 'Failed to load shelves' }, { status: 500 })
  }
}

// POST /api/shelves — create a shelf. Position appends to the right end of
// the bookcase so existing shelves never shift around.
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return NextResponse.json({ error: 'Shelf name is required' }, { status: 400 })
    if (name.length > 60) return NextResponse.json({ error: 'Shelf name is too long (max 60)' }, { status: 400 })

    const last = await db.shelf.findFirst({
      where: { userId: user.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    })

    const shelf = await db.shelf.create({
      data: { userId: user.id, name, position: (last?.position ?? -1) + 1 },
      include: { _count: { select: { documents: true } } },
    })

    return NextResponse.json({ shelf }, { status: 201 })
  } catch (e) {
    console.error('POST /api/shelves error', e)
    return NextResponse.json({ error: 'Failed to create shelf' }, { status: 500 })
  }
}
