import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { guardUsage, isActivePro, limitMessage, usageFields } from '@/lib/entitlements'
import { generateCoverLetter, countWords } from '@/lib/agent/draft'
import { draftContext, getDraft, postChecklist } from '@/lib/agent/draft-helpers'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/agent/drafts/[id]/cover-letter — opt-in per job (decision #3).
// Generates a ≤350-word letter grounded strictly in CV text + JD.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()
    const { id } = await params

    const draft = await getDraft(user.id, id)
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    if (!['collecting', 'ready'].includes(draft.status)) {
      return NextResponse.json({ error: `This draft is ${draft.status}` }, { status: 409 })
    }
    if (!draft.listing) return NextResponse.json({ error: 'This draft has no job listing context' }, { status: 409 })

    const verdict = await guardUsage(user.id, 'agent', isActivePro(user))
    if (!verdict.allowed) {
      return NextResponse.json({ error: limitMessage('agent', verdict.limit), ...usageFields('agent', verdict) }, { status: 402 })
    }

    const profile = await db.candidateProfile.findUnique({ where: { userId: user.id } })
    const resume = await db.resume.findFirst({ where: { id: draft.resumeId, userId: user.id } })
    if (!profile || !resume) return NextResponse.json({ error: 'Profile or CV missing — re-upload your CV first' }, { status: 409 })

    const letter = await generateCoverLetter(draft.listing, profile, resume, user.name)
    const updated = await db.applicationDraft.update({
      where: { id: draft.id },
      data: { coverLetter: letter },
    })
    void updated

    const withRefs = await getDraft(user.id, draft.id)
    if (!withRefs) throw new Error('draft vanished')
    const ctx = draftContext(withRefs)
    const msg = await postChecklist(
      user.id,
      withRefs,
      `Cover letter drafted (${countWords(letter)} words) for ${ctx.role} at ${ctx.company} — grounded only in your CV and the job description. It will be part of the package you approve.`
    )

    return NextResponse.json({ draft: withRefs, messages: [msg], coverLetter: letter })
  } catch (e) {
    console.error('POST /api/agent/drafts/[id]/cover-letter error', e)
    return NextResponse.json({ error: 'Cover letter generation failed — try again' }, { status: 500 })
  }
}
