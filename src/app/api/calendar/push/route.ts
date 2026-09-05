import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAccessToken } from '@/lib/google'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// POST /api/calendar/push — create Google Calendar events for the signed-in
// user's open tasks that have a due date. Skips tasks whose title already
// matches an event in the next 60 days, so pressing the button twice never
// duplicates.
export async function POST() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const token = await getAccessToken(user.id)
    if (!token) {
      return NextResponse.json(
        { error: 'Google Calendar is not connected. Reconnect your account in Settings.', needsReconnect: true },
        { status: 401 }
      )
    }

    const tasks = await db.task.findMany({
      where: { userId: user.id, dueDate: { not: null }, status: { not: 'done' } },
      orderBy: { dueDate: 'asc' },
      take: 25,
      include: { goal: { select: { title: true } } },
    })
    if (tasks.length === 0) {
      return NextResponse.json({ ok: true, pushed: 0, message: 'No open tasks with due dates to schedule.' })
    }

    // Read existing upcoming events once for dedupe
    const timeMin = new Date().toISOString()
    const timeMax = new Date(Date.now() + 60 * 86_400_000).toISOString()
    let existingTitles: string[] = []
    try {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=200&singleEvents=true`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) }
      )
      if (res.ok) {
        const data = (await res.json()) as { items?: { summary?: string }[] }
        existingTitles = (data.items ?? []).map((i) => i.summary ?? '')
      }
    } catch {}

    let pushed = 0
    let skipped = 0
    for (const task of tasks) {
      const title = `[Cortex] ${task.title}`
      if (existingTitles.some((t) => t === title)) {
        skipped++
        continue
      }
      const start = new Date(task.dueDate!)
      start.setHours(9, 0, 0, 0)
      const end = new Date(start.getTime() + Math.max(30, task.estimate) * 60_000)
      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: title,
          description: `Scheduled from Cortex.${task.goal ? ` Goal: ${task.goal.title}` : ''}`,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          reminders: { useDefault: true },
        }),
        signal: AbortSignal.timeout(20000),
      })
      if (res.ok) pushed++
      else skipped++
    }

    return NextResponse.json({ ok: true, pushed, skipped })
  } catch (e) {
    console.error('POST /api/calendar/push error', e)
    return NextResponse.json({ error: 'Failed to push tasks to Calendar' }, { status: 500 })
  }
}
