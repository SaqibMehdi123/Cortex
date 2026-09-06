import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// PATCH /api/scholarships/[id] — toggle saved (per-user state)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if ('saved' in body) data.saved = Boolean(body.saved)

    const existing = await db.scholarship.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const scholarship = await db.scholarship.update({ where: { id }, data })
    return NextResponse.json({ scholarship })
  } catch (e) {
    console.error('PATCH /api/scholarships/[id] error', e)
    return NextResponse.json({ error: 'Failed to update scholarship' }, { status: 500 })
  }
}
