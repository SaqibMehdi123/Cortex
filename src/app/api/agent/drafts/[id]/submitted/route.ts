import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { draftAnswers, draftContext, getDraft } from '@/lib/agent/draft-helpers'
import { writeAgentMessage } from '@/lib/agent/threads'
import { closeOutSubmission } from '@/lib/agent/closeout'

export const runtime = 'nodejs'

// POST /api/agent/drafts/[id]/submitted — the user confirms they submitted the
// application on the board themselves (Tier A close-out). Same pipeline
// effects as a direct ATS submit: Opportunity → applied + follow-up task.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()
    const { id } = await params

    const draft = await getDraft(user.id, id)
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    if (['submitted', 'submitted_manually'].includes(draft.status)) {
      return NextResponse.json({ error: 'This draft was already submitted' }, { status: 409 })
    }
    if (!['approved', 'ready', 'failed'].includes(draft.status)) {
      return NextResponse.json({ error: `Confirm submission from an approved draft — this one is ${draft.status}` }, { status: 409 })
    }

    const ctx = draftContext(draft)
    const answers = draftAnswers(draft).length

    const opportunity = await closeOutSubmission(
      user.id,
      draft,
      ctx.company,
      ctx.role,
      `Submitted via Cortex Apply Agent (Tier A manual) — ${answers} form answers, CV: ${draft.resumeId}`,
      ctx.url
    )

    await db.applicationDraft.update({
      where: { id: draft.id },
      data: { status: 'submitted_manually', submittedAt: new Date(), method: 'manual', failureReason: null },
    })

    const withRefs = await getDraft(user.id, draft.id)
    if (!withRefs) throw new Error('draft vanished')

    const msg = await writeAgentMessage(
      user.id,
      `Marked as submitted — ${ctx.role} at ${ctx.company} moved to **Applied** on your pipeline, and I set a follow-up task for next week. I'll watch for interview or rejection updates from your Gmail imports. Good luck!`,
      { kind: 'package', draftId: draft.id, company: ctx.company, role: ctx.role, status: 'submitted_manually', packageUrl: null, applyUrl: ctx.url, message: 'Application submitted by you on the company board.' }
    )

    return NextResponse.json({ draft: withRefs, opportunity, messages: [msg] })
  } catch (e) {
    console.error('POST /api/agent/drafts/[id]/submitted error', e)
    return NextResponse.json({ error: 'Failed to record the submission' }, { status: 500 })
  }
}
