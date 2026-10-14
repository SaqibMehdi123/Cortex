// Apply Agent — draft context helpers shared by the draft routes.

import { db } from '@/lib/db'
import { writeAgentMessage } from '@/lib/agent/threads'
import { detectAts } from '@/lib/agent/ats'
import type { ApplicationDraft, CandidateProfile, JobListing, Opportunity } from '@prisma/client'
import type { ChecklistCard, ApprovalCard, PackageCard, DraftAnswer } from '@/lib/agent/types'

export type DraftWithRefs = ApplicationDraft & {
  listing: JobListing | null
  opportunity: Opportunity | null
}

export async function getDraft(userId: string, draftId: string): Promise<DraftWithRefs | null> {
  return db.applicationDraft.findFirst({
    where: { id: draftId, userId },
    include: { listing: true, opportunity: true },
  })
}

/** company/role/url from whichever side of the draft has them. */
export function draftContext(draft: DraftWithRefs): { company: string; role: string; url: string | null } {
  if (draft.listing) {
    return { company: draft.listing.company, role: draft.listing.role, url: draft.listing.url }
  }
  if (draft.opportunity) {
    return { company: draft.opportunity.company, role: draft.opportunity.role, url: draft.opportunity.url }
  }
  return { company: 'Unknown company', role: 'Unknown role', url: null }
}

export function draftAnswers(draft: ApplicationDraft): DraftAnswer[] {
  return Array.isArray(draft.answers) ? (draft.answers as unknown as DraftAnswer[]) : []
}

export function draftMissing(draft: ApplicationDraft): string[] {
  return Array.isArray(draft.missingItems) ? (draft.missingItems as unknown as string[]) : []
}

export function checklistCard(draft: DraftWithRefs, atsSupported = false): ChecklistCard {
  const ctx = draftContext(draft)
  return {
    kind: 'checklist',
    draftId: draft.id,
    company: ctx.company,
    role: ctx.role,
    answered: draftAnswers(draft).map((a) => ({ question: a.question, answer: a.answer, source: a.source })),
    missing: draftMissing(draft),
    atsSupported,
  }
}

/** Direct-submission availability: ATS board + explicit user opt-in. */
export async function atsSupportedFor(userId: string, listing: JobListing | null): Promise<boolean> {
  if (!listing) return false
  const profile = await db.candidateProfile.findUnique({ where: { userId }, select: { prefs: true } })
  const prefs = (profile?.prefs ?? {}) as { atsOptIn?: boolean }
  return Boolean(prefs.atsOptIn && detectAts(listing))
}

export function approvalCard(draft: DraftWithRefs, resumeLabel: string): ApprovalCard {
  const ctx = draftContext(draft)
  return {
    kind: 'approval',
    draftId: draft.id,
    company: ctx.company,
    role: ctx.role,
    url: ctx.url,
    method: 'manual',
    atsSupported: false, // Phase 3 flips this for Greenhouse/Lever with opt-in
    coverLetter: Boolean(draft.coverLetter),
    answersCount: draftAnswers(draft).length,
    resumeLabel,
  }
}

export function packageCard(draft: DraftWithRefs, message: string, packageUrl: string | null): PackageCard {
  const ctx = draftContext(draft)
  return {
    kind: 'package',
    draftId: draft.id,
    company: ctx.company,
    role: ctx.role,
    status: draft.status,
    packageUrl,
    applyUrl: ctx.url,
    message,
  }
}

/** Post the current checklist state into the agent thread (each update is a NEW card — chat history stays truthful). */
export async function postChecklist(userId: string, draft: DraftWithRefs, intro: string) {
  const atsSupported = await atsSupportedFor(userId, draft.listing)
  return writeAgentMessage(userId, intro, checklistCard(draft, atsSupported))
}

export async function defaultResumeFor(userId: string, profile: CandidateProfile | null) {
  if (profile?.resumeId) {
    const byId = await db.resume.findFirst({ where: { id: profile.resumeId, userId } })
    if (byId) return byId
  }
  return db.resume.findFirst({ where: { userId, isDefault: true } }) ?? db.resume.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } })
}
