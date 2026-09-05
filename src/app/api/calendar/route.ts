import { NextResponse } from 'next/server'
import { googleGet } from '@/lib/google'

interface GEvent {
  id: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  htmlLink?: string
  location?: string
}

// GET /api/calendar — upcoming Google Calendar events (next 30 days).
export async function GET() {
  try {
    const timeMin = new Date().toISOString()
    const events = await googleGet<{ items?: GEvent[] }>(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&maxResults=20&singleEvents=true&orderBy=startTime`
    )
    if (events === null) {
      return NextResponse.json(
        { error: 'Google Calendar is not connected (or token expired). Reconnect in Settings.', needsReconnect: true },
        { status: 401 }
      )
    }
    return NextResponse.json({
      events: (events.items ?? []).map((e) => ({
        id: e.id,
        title: e.summary ?? '(untitled)',
        start: e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00` : null),
        end: e.end?.dateTime ?? null,
        link: e.htmlLink ?? null,
        location: e.location ?? null,
      })),
    })
  } catch (e) {
    console.error('GET /api/calendar error', e)
    return NextResponse.json({ error: 'Failed to load calendar events' }, { status: 500 })
  }
}
