import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { RECURRENCES } from '@/lib/reminder-span'

// The Reminder table is created by the build-time schema push. Until that has
// run (or if a push failed), Prisma throws P2021 "table does not exist" — the
// app must keep working, so reads return an empty list and writes say so.
function isTableMissing(e: unknown): boolean {
  return (e as { code?: string })?.code === 'P2021'
}

// GET /api/reminders — every reminder on the account (the client filters them
// per selected day; the list is small and recurrence math is done client-side
// with the shared reminder-span helpers).
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const reminders = await db.reminder.findMany({
      where: { userId: user.id },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
      take: 300,
    })
    return NextResponse.json({ reminders })
  } catch (e) {
    if (isTableMissing(e)) return NextResponse.json({ reminders: [] })
    console.error('GET /api/reminders error', e)
    return NextResponse.json({ error: 'Failed to load reminders' }, { status: 500 })
  }
}

// POST /api/reminders — { title, startDate: 'YYYY-MM-DD', recurrence?, showDays? }
// The anchor is a CALENDAR DAY (stored UTC midnight, same convention as plan
// dates); recurrence picks the cadence and showDays how many consecutive days
// each occurrence stays visible.
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const { title, startDate, recurrence, showDays } = body
    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    if (typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return NextResponse.json({ error: 'A valid start day (YYYY-MM-DD) is required' }, { status: 400 })
    }

    const rec = RECURRENCES.includes(recurrence) ? recurrence : 'once'
    const days = Math.max(1, Math.min(30, Number.parseInt(String(showDays ?? 1), 10) || 1))

    const reminder = await db.reminder.create({
      data: {
        userId: user.id,
        title: title.trim(),
        recurrence: rec,
        startDate: new Date(`${startDate}T00:00:00.000Z`),
        showDays: days,
      },
    })
    return NextResponse.json({ reminder }, { status: 201 })
  } catch (e) {
    if (isTableMissing(e)) {
      return NextResponse.json({ error: 'Reminders storage is not ready yet — try again in a minute' }, { status: 503 })
    }
    console.error('POST /api/reminders error', e)
    return NextResponse.json({ error: 'Failed to create reminder' }, { status: 500 })
  }
}
