import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { draftContext, getDraft } from '@/lib/agent/draft-helpers'
import { writeAgentMessage } from '@/lib/agent/threads'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// POST /api/agent/drafts/[id]/skip — drop this application. The draft stays
// in history as 'skipped' (audit trail) and blocks nothing.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()
    const { id } = await params

    const draft = await getDraft(user.id, id)
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    if (['submitted', 'submitted_manually'].includes(draft.status)) {
      return NextResponse.json({ error: 'Already submitted — it cannot be skipped' }, { status: 409 })
    }

    await db.applicationDraft.update({ where: { id: draft.id }, data: { status: 'skipped' } })

    const withRefs = await getDraft(user.id, draft.id)
    const ctx = draftContext(draft)
    const msg = await writeAgentMessage(user.id, `Skipped ${ctx.role} at ${ctx.company}. It stays in your history in case you change your mind.`)

    return NextResponse.json({ draft: withRefs, messages: [msg] })
  } catch (e) {
    console.error('POST /api/agent/drafts/[id]/skip error', e)
    return NextResponse.json({ error: 'Failed to skip the draft' }, { status: 500 })
  }
}
