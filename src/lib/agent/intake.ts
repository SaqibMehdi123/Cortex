// Apply Agent — application intake: work out exactly what's needed for one
// job's application and what the profile can already answer. Mostly
// deterministic; one optional LLM call derives job-specific questions from
// the JD when we have its text.

import { aiChatCompletion } from '@/lib/ai'
import { extractJson } from '@/lib/agent/json'
import type { CandidateProfile, JobListing } from '@prisma/client'
import type { DraftAnswer, ReusableAnswer } from '@/lib/agent/types'

export interface IntakeQuestion {
  question: string
  /** why this question exists — shown in the checklist UI */
  reason: 'standard' | 'jd'
}

export interface IntakeResult {
  /** answered straight from the profile (source: profile) */
  answered: DraftAnswer[]
  /** reusable answers from previous applications (source: user) */
  reusable: DraftAnswer[]
  /** questions the user still needs to answer */
  missing: IntakeQuestion[]
}

// The standard screening set every application realistically needs — the
// agent answers as many as possible from the profile, and asks for the rest
// once. Answers are remembered on the profile for every later application.
const STANDARD_QUESTIONS: Array<IntakeQuestion & { profileAnswer: (p: CandidateProfile) => string | null }> = [
  {
    question: 'What is your full name?',
    reason: 'standard',
    profileAnswer: (p) => (p.headline ? null : null), // name comes from the user row, handled separately
  },
  {
    question: 'What is your phone number?',
    reason: 'standard',
    profileAnswer: (p) => p.phone ?? null,
  },
  {
    question: 'Where are you based?',
    reason: 'standard',
    profileAnswer: (p) => p.location ?? null,
  },
  {
    question: 'Are you legally authorized to work in this location, and do you need sponsorship?',
    reason: 'standard',
    profileAnswer: (p) => p.workAuth ?? null,
  },
  {
    question: 'What are your salary expectations?',
    reason: 'standard',
    profileAnswer: (p) => p.salaryTarget ?? null,
  },
  {
    question: 'Share a link to your LinkedIn, GitHub or portfolio.',
    reason: 'standard',
    profileAnswer: (p) => {
      const links = (p.links ?? {}) as { linkedin?: string | null; github?: string | null; portfolio?: string | null }
      return links.linkedin || links.github || links.portfolio || null
    },
  },
  {
    question: 'Why are a good fit for this role? (short pitch)',
    reason: 'standard',
    profileAnswer: (p) => {
      const skills = Array.isArray(p.skills) ? (p.skills as string[]).slice(0, 5).join(', ') : ''
      return skills && p.headline ? `${p.headline}. Strongest skills: ${skills}.` : null
    },
  },
]

// Question topics we can map free-text JD questions onto profile fields.
function profileAnswerForJdQuestion(profile: CandidateProfile, question: string): string | null {
  const q = question.toLowerCase()
  const links = (profile.links ?? {}) as { linkedin?: string | null; github?: string | null; portfolio?: string | null }
  if (q.includes('salary') || q.includes('compensation') || q.includes('ctc') || q.includes('expected pay')) return profile.salaryTarget ?? null
  if (q.includes('sponsor') || q.includes('authorized') || q.includes('authorised') || q.includes('work permit') || q.includes('visa')) return profile.workAuth ?? null
  if (q.includes('phone') || q.includes('mobile') || q.includes('whatsapp')) return profile.phone ?? null
  if (q.includes('location') || q.includes('based') || q.includes('city') || q.includes('relocate')) return profile.location ?? null
  if (q.includes('linkedin')) return links.linkedin ?? null
  if (q.includes('github')) return links.github ?? null
  if (q.includes('portfolio') || q.includes('website')) return links.portfolio ?? null
  return null
}

/** One optional LLM call: derive up to 6 job-specific questions from the JD. */
export async function jdQuestions(listing: JobListing): Promise<IntakeQuestion[]> {
  if (!listing.descriptionText) return []
  try {
    const completion = await aiChatCompletion({
      messages: [
        {
          role: 'system',
          content: `You prepare job applications. From the job description below, list the EXTRA screening questions this employer's application form would most likely ask — beyond the standard set (name, phone, location, work authorization, salary, links). Rules: at most 4 questions, only what the JD actually implies (tech stack depth, availability/start date, on-site vs remote confirmation, specific certifications). NEVER invent requirements. Output STRICT JSON: {"questions":["…","…"]}`,
        },
        {
          role: 'user',
          content: `${listing.role} @ ${listing.company} — ${listing.location ?? ''}\n\n${listing.descriptionText.slice(0, 4_000)}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 400,
    })
    const raw = completion.choices[0]?.message?.content ?? ''
    const parsed = extractJson<{ questions?: unknown }>(raw)
    if (!Array.isArray(parsed?.questions)) return []
    return parsed!.questions
      .filter((q): q is string => typeof q === 'string' && q.trim().length > 3)
      .slice(0, 4)
      .map((q) => ({ question: q.trim().slice(0, 300), reason: 'jd' as const }))
  } catch {
    return [] // LLM hiccup — the standard set still covers the application
  }
}

/**
 * Build the full intake for a job: what we can answer, what is reusable, what
 * is genuinely missing. Deterministic + at most one LLM call.
 */
export async function buildIntake(
  listing: JobListing,
  profile: CandidateProfile,
  userName: string
): Promise<IntakeResult> {
  const answered: DraftAnswer[] = []
  const missing: IntakeQuestion[] = []

  for (const q of STANDARD_QUESTIONS) {
    const answer = q.profileAnswer(profile)
    if (answer) answered.push({ question: q.question, answer, source: 'profile' })
    else missing.push({ question: q.question, reason: 'standard' })
  }
  // name always comes from the account — never missing
  if (!answered.some((a) => a.question.startsWith('What is your full name'))) {
    answered.unshift({ question: 'What is your full name?', answer: userName, source: 'profile' })
  }
  // drop the name entry from missing if the profileAnswer returned null
  const missingFiltered = missing.filter((m) => !m.question.startsWith('What is your full name'))

  // JD-specific questions — some may already be answerable from the profile
  const jdQs = await jdQuestions(listing)
  for (const q of jdQs) {
    const answer = profileAnswerForJdQuestion(profile, q.question)
    if (answer) answered.push({ question: q.question, answer, source: 'profile' })
    else missingFiltered.push(q)
  }

  const stored = Array.isArray(profile.answers) ? (profile.answers as unknown as ReusableAnswer[]) : []
  const reusable: DraftAnswer[] = stored
    .filter((a) => missingFiltered.some((m) => m.question.toLowerCase() === a.question.toLowerCase()))
    .map((a) => ({ question: a.question, answer: a.answer, source: 'user' }))
  const stillMissing = missingFiltered.filter((m) => !reusable.some((r) => r.question.toLowerCase() === m.question.toLowerCase()))

  return { answered, reusable, missing: stillMissing }
}
