import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { schedule, type Grade } from '@/lib/sm2'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// POST /api/flashcards/review — grade one of the user's cards with SM-2 scheduling
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const { flashcardId, grade } = body
    if (!flashcardId || !['again', 'hard', 'good', 'easy'].includes(grade)) {
      return NextResponse.json({ error: 'flashcardId and valid grade required' }, { status: 400 })
    }

    const card = await db.flashcard.findFirst({ where: { id: flashcardId, userId: user.id } })
    if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

    const next = schedule(
      { ease: card.ease, interval: card.interval, repetitions: card.repetitions, lapses: card.lapses },
      grade as Grade
    )

    const [updated] = await Promise.all([
      db.flashcard.update({
        where: { id: flashcardId },
        data: {
          ease: next.ease,
          interval: next.interval,
          repetitions: next.repetitions,
          lapses: next.lapses,
          dueAt: next.dueAt,
          lastReviewedAt: next.lastReviewedAt,
        },
      }),
      db.reviewLog.create({ data: { userId: user.id, flashcardId, grade } }),
    ])

    return NextResponse.json({ card: updated })
  } catch (e) {
    console.error('POST /api/flashcards/review error', e)
    return NextResponse.json({ error: 'Failed to record review' }, { status: 500 })
  }
}
