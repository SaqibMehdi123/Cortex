import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// POST /api/reading-sessions — log reading time for one of the user's documents
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const { documentId, minutes } = body
    if (!documentId || typeof minutes !== 'number' || minutes <= 0) {
      return NextResponse.json({ error: 'documentId and minutes required' }, { status: 400 })
    }
    const document = await db.document.findFirst({ where: { id: documentId, userId: user.id }, select: { id: true } })
    if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    const day = new Date()
    day.setHours(0, 0, 0, 0)

    const session = await db.readingSession.create({
      data: { userId: user.id, documentId, minutes: Math.round(minutes), day },
    })
    return NextResponse.json({ session }, { status: 201 })
  } catch (e) {
    console.error('POST /api/reading-sessions error', e)
    return NextResponse.json({ error: 'Failed to log reading session' }, { status: 500 })
  }
}
