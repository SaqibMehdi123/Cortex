// Apply Agent — draft preparation: cover letter generation (grounded in CV +
// JD only) and the Tier-A application package (markdown bundle: CV reference,
// answers sheet, profile links). The package is rendered on demand by the
// download route — nothing is stored, so there is no stale-package failure
// mode; ApplicationDraft.packageRef stays reserved for later phases.

import { aiChatCompletion } from '@/lib/ai'
import type { ApplicationDraft, CandidateProfile, JobListing, Resume } from '@prisma/client'
import type { DraftAnswer } from '@/lib/agent/types'

const COVER_MAX_WORDS = 350

export function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

/** Generate a cover letter grounded strictly in the CV text + JD. */
export async function generateCoverLetter(
  listing: JobListing,
  profile: CandidateProfile,
  resume: Resume,
  userName: string
): Promise<string> {
  const cvText = (resume.rawText ?? '').slice(0, 8_000)
  const skills = Array.isArray(profile.skills) ? (profile.skills as string[]).slice(0, 10).join(', ') : ''

  const completion = await aiChatCompletion({
    messages: [
      {
        role: 'system',
        content: `You write honest, specific cover letters. Rules: at most ${COVER_MAX_WORDS} words; grounded ONLY in the CV text and job description given — never invent experience, metrics or employers; concrete and plain (no "I am thrilled", no clichés); markdown-free plain text; sign off with the candidate's name. Address "Dear Hiring Team".`,
      },
      {
        role: 'user',
        content: `Candidate: ${userName}${profile.headline ? ` — ${profile.headline}` : ''}${skills ? ` (key skills: ${skills})` : ''}

CV text:
${cvText || '(CV text unavailable — rely on the profile summary only)'}

Job: ${listing.role} @ ${listing.company} (${listing.location ?? 'location n/a'})
Job description:
${(listing.descriptionText ?? '').slice(0, 4_000) || '(JD not available — keep the letter about the candidate)'}

Write the cover letter now.`,
      },
    ],
    temperature: 0.4,
    max_tokens: 700,
  })

  const letter = (completion.choices[0]?.message?.content ?? '').trim()
  if (!letter) throw new Error('Cover letter generation returned nothing')
  return letter.slice(0, 3_500)
}

/** One line per answer for the package's answers sheet. */
export function answersSheet(answers: DraftAnswer[]): string {
  if (answers.length === 0) return '(no form answers recorded)'
  return answers.map((a) => `Q: ${a.question}\nA: ${a.answer}\n(source: ${a.source})`).join('\n\n')
}

/** The full Tier-A package as a markdown document. */
export function packageMarkdown(
  draft: ApplicationDraft,
  listing: JobListing,
  resume: Pick<Resume, 'label' | 'fileName'>,
  profile: Pick<CandidateProfile, 'headline' | 'links'>
): string {
  const links = (profile.links ?? {}) as Record<string, string | null>
  const linkLines = Object.entries(links)
    .filter(([, v]) => Boolean(v))
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n')

  return `# Application package — ${listing.role} @ ${listing.company}

Prepared by the Cortex Apply Agent on ${new Date().toISOString().slice(0, 10)}.
Submit at: ${listing.url}

## CV
File: ${resume.fileName} (label: ${resume.label})

## Answers sheet
${answersSheet(Array.isArray(draft.answers) ? (draft.answers as unknown as DraftAnswer[]) : [])}
${draft.coverLetter ? `\n## Cover letter\n\n${draft.coverLetter}\n` : ''}
## Profile links
${linkLines || '(none on file)'}

---
Everything above is what the agent knows about you. Nothing was invented —
answers marked "profile" come from your parsed CV, "user" from what you typed.
`
}
