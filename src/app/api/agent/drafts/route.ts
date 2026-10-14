import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { guardUsage, isActivePro, limitMessage, usageFields } from '@/lib/entitlements'
import { buildIntake } from '@/lib/agent/intake'
import { defaultResumeFor, getDraft, postChecklist } from '@/lib/agent/draft-helpers'

export const runtime = 'nodejs'
export const maxDuration = 60

// GET /api/agent/drafts — the user's drafts (newest first)
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const drafts = await db.applicationDraft.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        listing: { select: { id: true, company: true, role: true, url: true, source: true, matchScore: true } },
        opportunity: { select: { id: true, company: true, role: true, url: true, status: true } },
      },
    })
    return NextResponse.json({ drafts })
  } catch (e) {
    console.error('GET /api/agent/drafts error', e)
    return NextResponse.json({ error: 'Failed to load drafts' }, { status: 500 })
  }
}

// POST /api/agent/drafts — start an application draft for a listing.
// Body: { listingId, opportunityId? }
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = (await req.json().catch(() => null)) as { listingId?: string; opportunityId?: string } | null
    if (!body?.listingId) return NextResponse.json({ error: 'listingId is required' }, { status: 400 })

    const listing = await db.jobListing.findFirst({ where: { id: body.listingId, userId: user.id } })
    if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })

    const profile = await db.candidateProfile.findUnique({ where: { userId: user.id } })
    const resume = await defaultResumeFor(user.id, profile)
    if (!resume || !profile) {
      return NextResponse.json({ error: 'Upload your CV first — the agent builds applications from it.' }, { status: 409 })
    }

    // one open draft per listing
    const existing = await db.applicationDraft.findFirst({
      where: { userId: user.id, listingId: listing.id, status: { in: ['collecting', 'ready', 'awaiting_approval', 'approved'] } },
    })
    if (existing) {
      return NextResponse.json({ error: 'A draft for this job already exists', draftId: existing.id }, { status: 409 })
    }

    const verdict = await guardUsage(user.id, 'agent', isActivePro(user))
    if (!verdict.allowed) {
      return NextResponse.json({ error: limitMessage('agent', verdict.limit), ...usageFields('agent', verdict) }, { status: 402 })
    }

    const intake = await buildIntake(listing, profile, user.name)

    // optional explicit link to an existing pipeline entry
    let opportunityId: string | undefined
    if (body.opportunityId) {
      const opp = await db.opportunity.findFirst({ where: { id: body.opportunityId, userId: user.id }, select: { id: true } })
      if (opp) opportunityId = opp.id
    }

    const draft = await db.applicationDraft.create({
      data: {
        userId: user.id,
        listingId: listing.id,
        opportunityId,
        resumeId: resume.id,
        status: intake.missing.length === 0 ? 'ready' : 'collecting',
        answers: JSON.parse(JSON.stringify([...intake.answered, ...intake.reusable])),
        missingItems: JSON.parse(JSON.stringify(intake.missing.map((m) => m.question))),
      },
    })

    const withRefs = await getDraft(user.id, draft.id)
    if (!withRefs) throw new Error('draft vanished after create')

    const missingNote =
      intake.missing.length === 0
        ? 'I have everything I need from your profile — the draft is ready for review.'
        : `I answered ${intake.answered.length + intake.reusable.length} of the form questions from your profile${intake.reusable.length ? ` (${intake.reusable.length} remembered from earlier applications)` : ''}. Still needed:`
    const msg = await postChecklist(
      user.id,
      withRefs,
      `Preparing your application for ${listing.role} at ${listing.company}. ${missingNote}`
    )

    return NextResponse.json({ draft: withRefs, messages: [msg] })
  } catch (e) {
    console.error('POST /api/agent/drafts error', e)
    return NextResponse.json({ error: 'Failed to create the draft' }, { status: 500 })
  }
}
