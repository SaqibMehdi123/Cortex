import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { approvalCard, draftAnswers, draftContext, getDraft } from '@/lib/agent/draft-helpers'
import { writeAgentMessage } from '@/lib/agent/threads'
import {
  detectAts,
  fetchAtsQuestions,
  submitAtsApplication,
  atsSubmissionsToday,
  ATS_DAILY_CAP,
  type AtsKind,
} from '@/lib/agent/ats'
import { getResumeBuffer } from '@/lib/agent/resume-storage'

export const runtime = 'nodejs'
// ATS submit can take a while (form fetch + multipart upload).
export const maxDuration = 60

// POST /api/agent/drafts/[id]/approve — THE approval gate. Every submission,
// manual or direct, runs through here; nothing is ever sent without this call.
// Body: { mode?: 'manual' | 'ats' } — mode 'ats' only acts when the board is
// ATS-supported AND the user opted in AND the daily cap allows it; otherwise it
// degrades to the manual package.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()
    const { id } = await params

    const body = (await req.json().catch(() => null)) as { mode?: 'manual' | 'ats' } | null
    const mode = body?.mode === 'ats' ? 'ats' : 'manual'

    const draft = await getDraft(user.id, id)
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    if (!['ready', 'failed'].includes(draft.status)) {
      return NextResponse.json(
        { error: draft.status === 'collecting' ? 'Answers are still missing — complete the checklist first' : `This draft is ${draft.status}` },
        { status: 409 }
      )
    }
    if (!draft.listing) return NextResponse.json({ error: 'This draft has no job listing context' }, { status: 409 })

    const ctx = draftContext(draft)
    const resume = await db.resume.findFirst({ where: { id: draft.resumeId, userId: user.id } })
    if (!resume) return NextResponse.json({ error: 'The CV attached to this draft is gone — re-upload it first' }, { status: 409 })

    const profile = await db.candidateProfile.findUnique({ where: { userId: user.id } })
    const prefs = (profile?.prefs ?? {}) as { atsOptIn?: boolean }
    const kind = detectAts(draft.listing)

    // ── Tier B: direct ATS submission (opt-in + cap gated) ──────────────
    if (mode === 'ats' && kind && prefs.atsOptIn) {
      const usedToday = await atsSubmissionsToday(user.id)
      if (usedToday >= ATS_DAILY_CAP) {
        await writeAgentMessage(
          user.id,
          `Direct submissions are capped at ${ATS_DAILY_CAP}/day to protect your accounts from spray-and-pray flags (${usedToday} used today). Approving as a manual package instead — or come back tomorrow.`,
          { ...approvalCard(draft, resume.label), method: 'manual', atsSupported: false }
        )
        // fall through to manual approval below — the user still gets a usable package
      } else {
        const bytes = await getResumeBuffer(resume.fileRef)
        if (!bytes) {
          return NextResponse.json({ error: 'Could not read the stored CV file' }, { status: 500 })
        }
        const questions = await fetchAtsQuestions(kind as AtsKind, draft.listing)
        const result = await submitAtsApplication(
          kind as AtsKind,
          draft.listing,
          {
            userName: user.name,
            email: user.email,
            phone: profile?.phone ?? null,
            location: profile?.location ?? null,
            answers: draftAnswers(draft),
            resumeBuffer: bytes,
            resumeFileName: resume.fileName,
            resumeContentType: resume.mimeType,
            coverLetterText: draft.coverLetter ?? null,
          },
          questions
        )

        if (result.ok) {
          // success → submitted, full audit snapshot
          const updated = await db.applicationDraft.update({
            where: { id: draft.id },
            data: {
              status: 'submitted',
              method: `ats_${kind}`,
              submittedAt: new Date(),
              approvedAt: draft.approvedAt ?? new Date(),
              audit: JSON.parse(
                JSON.stringify({
                  endpoint: kind,
                  sent: result.sent,
                  files: result.files,
                  responseStatus: result.status,
                  responseExcerpt: result.responseExcerpt,
                  answersSnapshot: draftAnswers(draft),
                  resume: { fileName: resume.fileName, ref: resume.fileRef },
                  approvedBy: user.email,
                })
              ),
            },
          })
          void updated
          // pipeline + follow-up (same close-out as manual submission)
          const { closeOutSubmission } = await import('@/lib/agent/closeout')
          const opportunity = await closeOutSubmission(user.id, draft, ctx.company, ctx.role, `ATS direct via ${kind}`)
          const fresh = await getDraft(user.id, draft.id)
          const msg = await writeAgentMessage(
            user.id,
            `Submitted directly to ${ctx.company} through their ${kind === 'greenhouse' ? 'Greenhouse' : 'Lever'} board (${result.status}). ${ctx.role} is now **Applied** on your pipeline with a follow-up task. Full audit snapshot saved.`,
            { kind: 'package', draftId: draft.id, company: ctx.company, role: ctx.role, status: 'submitted', packageUrl: null, applyUrl: ctx.url, message: `Direct submission via ${kind} — response ${result.status}.` }
          )
          return NextResponse.json({ draft: fresh, opportunity, messages: [msg], submitResult: { ok: true, status: result.status } })
        }

        // failure → honest fail + Tier A fallback offer
        await db.applicationDraft.update({
          where: { id: draft.id },
          data: {
            status: 'failed',
            method: `ats_${kind}`,
            failureReason: `Board responded ${result.status}${result.missingRequired?.length ? ` — unanswered required questions: ${result.missingRequired.slice(0, 3).join('; ')}` : ''}`,
            audit: JSON.parse(
              JSON.stringify({
                endpoint: kind,
                sent: result.sent,
                files: result.files,
                responseStatus: result.status,
                responseExcerpt: result.responseExcerpt,
                missingRequired: result.missingRequired ?? [],
                at: new Date().toISOString(),
              })
            ),
          },
        })
        const fresh = await getDraft(user.id, draft.id)
        const msg = await writeAgentMessage(
          user.id,
          `The ${kind} board rejected the direct submission (${result.status}${result.missingRequired?.length ? ` — needs: ${result.missingRequired.slice(0, 3).join('; ')}` : ''}). Nothing was sent partially — approve again as a manual package and submit on the board yourself.`,
          { ...approvalCard(fresh ?? draft, resume.label), method: 'manual', atsSupported: false }
        )
        return NextResponse.json({ draft: fresh, messages: [msg], submitResult: { ok: false, status: result.status } })
      }
    }

    // ── Tier A: manual package hand-over (default) ───────────────────────
    const updated = await db.applicationDraft.update({
      where: { id: draft.id },
      data: { status: 'approved', approvedAt: new Date(), method: 'manual' },
    })
    void updated

    const withRefs = await getDraft(user.id, draft.id)
    if (!withRefs) throw new Error('draft vanished')

    const msg = await writeAgentMessage(
      user.id,
      `Here is your complete application package for ${ctx.role} at ${ctx.company} — this is everything that would be sent. Download it, open the application, submit on the board, then tap "I submitted it" so I can move your pipeline and set a follow-up.`,
      { ...approvalCard(withRefs, resume.label), method: 'manual', atsSupported: false }
    )

    return NextResponse.json({ draft: withRefs, messages: [msg] })
  } catch (e) {
    console.error('POST /api/agent/drafts/[id]/approve error', e)
    return NextResponse.json({ error: 'Failed to approve the draft' }, { status: 500 })
  }
}
