import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { draftAnswers, draftMissing, draftContext, getDraft, postChecklist } from '@/lib/agent/draft-helpers'
import type { DraftAnswer } from '@/lib/agent/types'

export const runtime = 'nodejs'

// POST /api/agent/drafts/[id]/answer — user answers from the checklist card.
// Body: { answers: [{ question, answer }] }
// Every answer is saved back to the profile's reusable answers ("remember for
// next time" is the default — the plan's §3 bucket (b)).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()
    const { id } = await params

    const body = (await req.json().catch(() => null)) as { answers?: Array<{ question?: string; answer?: string }> } | null
    const incoming = (body?.answers ?? [])
      .filter((a) => typeof a?.question === 'string' && typeof a?.answer === 'string' && Boolean(a.question.trim()) && Boolean(a.answer.trim()))
      .map((a) => ({ question: (a.question as string).trim().slice(0, 300), answer: (a.answer as string).trim().slice(0, 1500) }))
    if (incoming.length === 0) return NextResponse.json({ error: 'answers[] is required' }, { status: 400 })

    const draft = await getDraft(user.id, id)
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    if (!['collecting', 'ready'].includes(draft.status)) {
      return NextResponse.json({ error: `This draft is ${draft.status} — answers can no longer be added` }, { status: 409 })
    }

    // merge answers (later user answers win over profile-sourced ones)
    const existing = draftAnswers(draft)
    for (const a of incoming) {
      const i = existing.findIndex((e) => e.question.toLowerCase() === a.question.toLowerCase())
      if (i >= 0) existing[i] = { question: existing[i].question, answer: a.answer, source: 'user' }
      else existing.push({ question: a.question, answer: a.answer, source: 'user' })
    }

    const stillMissing = draftMissing(draft).filter(
      (m) => !incoming.some((a) => a.question.toLowerCase() === m.toLowerCase())
    )
    const status = stillMissing.length === 0 ? 'ready' : 'collecting'

    const updated = await db.applicationDraft.update({
      where: { id: draft.id },
      data: {
        answers: JSON.parse(JSON.stringify(existing)),
        missingItems: JSON.parse(JSON.stringify(stillMissing)),
        status,
      },
    })

    // "remember for next time" — reusable answers land on the profile
    const profile = await db.candidateProfile.findUnique({ where: { userId: user.id } })
    if (profile) {
      const stored = Array.isArray(profile.answers) ? (profile.answers as Array<{ question: string; answer: string }>) : []
      for (const a of incoming) {
        const i = stored.findIndex((s) => s.question.toLowerCase() === a.question.toLowerCase())
        if (i >= 0) stored[i] = { question: stored[i].question, answer: a.answer }
        else stored.push({ question: a.question, answer: a.answer })
      }
      await db.candidateProfile.update({
        where: { userId: user.id },
        data: { answers: JSON.parse(JSON.stringify(stored.slice(0, 30))) },
      })
    }

    const withRefs = await getDraft(user.id, draft.id)
    void updated
    if (!withRefs) throw new Error('draft vanished')

    const ctx = draftContext(withRefs)
    const msg = await postChecklist(
      user.id,
      withRefs,
      stillMissing.length === 0
        ? `All set for ${ctx.role} at ${ctx.company} — nothing else needed. Review and approve when you're ready.`
        : `Noted. Still needed for ${ctx.role} at ${ctx.company}:`
    )

    return NextResponse.json({ draft: withRefs, messages: [msg] })
  } catch (e) {
    console.error('POST /api/agent/drafts/[id]/answer error', e)
    return NextResponse.json({ error: 'Failed to save answers' }, { status: 500 })
  }
}

export type { DraftAnswer }
