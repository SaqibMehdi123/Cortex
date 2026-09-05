import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAccessToken, googleGet } from '@/lib/google'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

export const maxDuration = 120

interface GmailListResponse {
  messages?: { id: string; threadId: string }[]
  resultSizeEstimate?: number
}

interface GmailMessage {
  id: string
  snippet?: string
  internalDate?: string
  payload?: {
    headers?: { name: string; value: string }[]
  }
}

// POST /api/gmail/import — read recent emails via Gmail API for the signed-in
// user's connected Google account, let the AI classify the career-related ones
// (opportunity / rejection / interview / offer / deadline) and upsert them as
// Opportunities. Re-importing is safe: Gmail message ids are stored per user.
export async function POST() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const token = await getAccessToken(user.id)
    if (!token) {
      return NextResponse.json(
        { error: 'Gmail is not connected (or the token expired). Reconnect your Google account in Settings.', needsReconnect: true },
        { status: 401 }
      )
    }

    // 1) List the last 25 inbox messages from the past 60 days
    const list = await googleGet<GmailListResponse>(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=in%3Ainbox%20newer_than%3A60d',
      user.id
    )
    const ids = list?.messages?.map((m) => m.id) ?? []
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, scanned: 0, imported: 0, skipped: 0, message: 'No inbox messages found.' })
    }

    // 2) Fetch metadata for each
    const messages = await Promise.all(
      ids.map((id) =>
        googleGet<GmailMessage>(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          user.id
        )
      )
    )

    const emails = messages
      .filter((m): m is GmailMessage => Boolean(m))
      .map((m) => {
        const header = (h: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === h.toLowerCase())?.value ?? null
        return {
          id: m.id,
          from: header('From'),
          subject: header('Subject') ?? '(no subject)',
          date: m.internalDate ? new Date(Number(m.internalDate)) : null,
          snippet: (m.snippet ?? '').slice(0, 300),
        }
      })
      .filter((e) => e.from)

    // Skip anything this user already imported (by gmailId)
    const existing = await db.opportunity.findMany({
      where: { userId: user.id, gmailId: { in: emails.map((e) => e.id) } },
      select: { gmailId: true },
    })
    const existingSet = new Set(existing.map((e) => e.gmailId))
    const candidates = emails.filter((e) => !existingSet.has(e.id))
    if (candidates.length === 0) {
      return NextResponse.json({ ok: true, scanned: emails.length, imported: 0, skipped: 0, message: 'All recent emails were already imported.' })
    }

    // 3) AI classification in one batched call
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const listInput = candidates
      .map((e, i) => `${i}. FROM: ${e.from}\n   SUBJECT: ${e.subject}\n   SNIPPET: ${e.snippet}`)
      .join('\n')

    let classified: {
      n: number
      relevant: boolean
      company: string
      role: string
      classification: 'opportunity' | 'rejection' | 'interview' | 'offer' | 'deadline'
      type: string
      nextAction: string
    }[] = []

    try {
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content:
              'You triage a personal inbox for job/internship applications. For EACH numbered email decide if it is career-relevant (recruiting, applications, interview invites, offers, rejections, deadlines, hiring events). Return ONLY a JSON array: [{"n":1,"relevant":true,"company":"Acme","role":"SWE Intern","classification":"opportunity|rejection|interview|offer|deadline","type":"internship|job|scholarship|event|referral","nextAction":"short next step or empty"}]. If not career-relevant set relevant=false and omit the other fields. No markdown fences.',
          },
          { role: 'user', content: listInput },
        ],
        thinking: { type: 'disabled' },
      })
      const raw = (completion.choices[0]?.message?.content ?? '').replace(/```json|```/g, '').trim()
      const start = raw.indexOf('[')
      const end = raw.lastIndexOf(']')
      if (start !== -1 && end !== -1) classified = JSON.parse(raw.slice(start, end + 1))
    } catch (aiErr) {
      console.error('gmail AI classification failed', aiErr)
      return NextResponse.json({ error: 'AI classification failed — try again.' }, { status: 500 })
    }

    // 4) Persist relevant ones
    let imported = 0
    for (const c of classified) {
      if (!c?.relevant) continue
      const email = candidates[Number(c.n) - 1]
      if (!email) continue
      const prior = await db.opportunity.findFirst({ where: { userId: user.id, gmailId: email.id } })
      if (prior) {
        await db.opportunity.update({
          where: { id: prior.id },
          data: { classification: c.classification ?? 'opportunity', nextAction: c.nextAction || null },
        })
      } else {
        await db.opportunity.create({
          data: {
            userId: user.id,
            company: (c.company || email.from || 'Unknown').slice(0, 120),
            role: (c.role || email.subject).slice(0, 160),
            type: c.type || 'job',
            classification: c.classification || 'opportunity',
            sender: email.from,
            source: 'gmail',
            url: null,
            status: c.classification === 'interview' ? 'interview' : c.classification === 'offer' ? 'offer' : c.classification === 'rejection' ? 'rejected' : 'saved',
            nextAction: c.nextAction || null,
            gmailId: email.id,
          },
        })
      }
      imported++
    }

    return NextResponse.json({ ok: true, scanned: emails.length, imported, skipped: emails.length - imported })
  } catch (e) {
    console.error('POST /api/gmail/import error', e)
    return NextResponse.json({ error: 'Gmail import failed — try again.' }, { status: 500 })
  }
}
