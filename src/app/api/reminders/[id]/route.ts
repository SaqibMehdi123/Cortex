import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { RECURRENCES } from '@/lib/reminder-span'

function isTableMissing(e: unknown): boolean {
  return (e as { code?: string })?.code === 'P2021'
}

// PATCH /api/reminders/[id] — edit the anchor day, cadence, duration, title,
// or mark the CURRENT occurrence done (done: true → lastDoneAt = now, which
// hides only the occurrence it belongs to; done: false → cleared).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const existing = await db.reminder.findFirst({ where: { id, userId: user.id } })
    if (!existing) return NextResponse.json({ error: 'Reminder not found' }, { status: 404 })

    const body = await req.json()
    const data: Record<string, unknown> = {}

    if ('title' in body) {
      if (!String(body.title ?? '').trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
      data.title = String(body.title).trim()
    }
    if ('recurrence' in body && RECURRENCES.includes(body.recurrence)) data.recurrence = body.recurrence
    if ('showDays' in body) data.showDays = Math.max(1, Math.min(30, Number.parseInt(String(body.showDays), 10) || 1))
    if ('startDate' in body) {
      if (typeof body.startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate)) {
        return NextResponse.json({ error: 'Invalid start day' }, { status: 400 })
      }
      data.startDate = new Date(`${body.startDate}T00:00:00.000Z`)
    }
    if ('done' in body) data.lastDoneAt = body.done ? new Date() : null

    const reminder = await db.reminder.update({ where: { id: existing.id }, data })
    return NextResponse.json({ reminder })
  } catch (e) {
    if (isTableMissing(e)) {
      return NextResponse.json({ error: 'Reminders storage is not ready yet — try again in a minute' }, { status: 503 })
    }
    console.error('PATCH /api/reminders/[id] error', e)
    return NextResponse.json({ error: 'Failed to update reminder' }, { status: 500 })
  }
}

// DELETE /api/reminders/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const existing = await db.reminder.findFirst({ where: { id, userId: user.id } })
    if (!existing) return NextResponse.json({ error: 'Reminder not found' }, { status: 404 })

    await db.reminder.delete({ where: { id: existing.id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (isTableMissing(e)) {
      return NextResponse.json({ error: 'Reminders storage is not ready yet — try again in a minute' }, { status: 503 })
    }
    console.error('DELETE /api/reminders/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete reminder' }, { status: 500 })
  }
}
