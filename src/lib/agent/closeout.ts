// Apply Agent — submission close-out shared by both paths: manual "I
// submitted it" confirmations and Tier-B direct ATS submissions. Creates (or
// reuses) the pipeline Opportunity, flips it to applied, and sets the
// follow-up task — so both paths land in the exact same pipeline state.

import { db } from '@/lib/db'
import type { ApplicationDraft, JobListing, Opportunity } from '@prisma/client'

export async function closeOutSubmission(
  userId: string,
  draft: ApplicationDraft & { listing?: JobListing | null },
  company: string,
  role: string,
  note: string,
  url: string | null = draft.listing?.url ?? null
): Promise<Opportunity> {
  let opportunity = draft.opportunityId
    ? await db.opportunity.findFirst({ where: { id: draft.opportunityId, userId } })
    : null

  if (!opportunity) {
    opportunity = await db.opportunity.create({
      data: {
        userId,
        company,
        role,
        type: draft.listing?.type === 'internship' ? 'internship' : 'job',
        classification: 'opportunity',
        source: draft.listing?.source ?? 'Apply Agent',
        url,
        location: draft.listing?.location ?? null,
        status: 'applied',
        resumeId: draft.resumeId,
        nextAction: 'Follow up in a week if there is no reply',
        notes: note,
      },
    })
    await db.applicationDraft.update({ where: { id: draft.id }, data: { opportunityId: opportunity.id } })
  } else {
    opportunity = await db.opportunity.update({
      where: { id: opportunity.id },
      data: { status: 'applied', resumeId: draft.resumeId },
    })
  }

  const due = new Date(Date.now() + 7 * 86_400_000)
  const existingTask = await db.task.findFirst({
    where: { userId, opportunityId: opportunity.id, title: { startsWith: `Follow up with ${company}` }, status: { not: 'done' } },
    select: { id: true },
  })
  if (!existingTask) {
    await db.task.create({
      data: {
        userId,
        title: `Follow up with ${company} — ${role}`,
        status: 'todo',
        priority: 'med',
        dueDate: due,
        opportunityId: opportunity.id,
      },
    })
  }

  return opportunity
}
