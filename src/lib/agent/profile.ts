// Apply Agent — CV text → structured CandidateProfile fields (1 LLM call).
// Grounding rule: the parser may ONLY extract what the CV says. It never
// invents employers, dates or skills; fields it cannot find stay null.

import { aiChatCompletion } from '@/lib/ai'
import { extractJson } from '@/lib/agent/json'
import type { ParsedCV } from '@/lib/agent/types'

const MAX_CV_CHARS = 24_000 // ~6k tokens of CV text — far more than any real CV

export class CvParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CvParseError'
  }
}

/** Parse extracted CV text into a structured profile. Throws CvParseError on unusable input or malformed model output. */
export async function parseCvText(rawText: string): Promise<ParsedCV> {
  const text = rawText.replace(/\u0000/g, '').trim()
  if (text.length < 80) {
    throw new CvParseError('Could not read enough text from this file — if it is a scan, export a text-based PDF and try again.')
  }
  const clipped = text.length > MAX_CV_CHARS ? text.slice(0, MAX_CV_CHARS) : text

  const completion = await aiChatCompletion({
    messages: [
      {
        role: 'system',
        content: `You are a precise CV/resume parser. Extract ONLY what the CV explicitly states — never invent or guess. Output STRICT JSON, no prose, matching this TypeScript type:
{
  "headline": string | null,          // ≤12 words, e.g. "Final-year CS student — full-stack developer"
  "summary": string | null,           // ≤2 sentences
  "skills": string[],                 // concrete tools/languages/frameworks, max 24, most relevant first
  "experience": [{ "company": string, "title": string, "start": string|null, "end": string|null, "current": boolean, "location": string|null, "bullets": string[] }],  // max 6 roles, bullets ≤3 each, verbatim-ish
  "education": [{ "school": string, "degree": string|null, "field": string|null, "start": string|null, "end": string|null, "grade": string|null }],
  "links": { "linkedin": string|null, "github": string|null, "portfolio": string|null },
  "phone": string | null,
  "location": string | null,          // current city/country
  "workAuth": string | null           // only if stated (citizenship / sponsorship note)
}
Dates: keep the CV's own format ("2024-06", "Jun 2024", "2024"). Use null for anything absent. Output the JSON object only.`,
      },
      { role: 'user', content: `CV text:\n\n${clipped}` },
    ],
    temperature: 0.1,
    max_tokens: 2000,
  })

  const raw = completion.choices[0]?.message?.content ?? ''
  const parsed = extractJson<ParsedCV>(raw)
  if (!parsed || typeof parsed !== 'object') {
    throw new CvParseError('The parser returned an unreadable result — please try again.')
  }
  return sanitizeParsedCv(parsed)
}

/** Defensive normalization: strings capped, arrays de-duplicated, no >500-char junk. */
export function sanitizeParsedCv(input: ParsedCV): ParsedCV {
  const str = (v: unknown, max = 300): string | null => {
    if (typeof v !== 'string') return null
    const t = v.trim()
    return t ? t.slice(0, max) : null
  }
  const strArr = (v: unknown, max: number, cap = 120): string[] => {
    if (!Array.isArray(v)) return []
    const out: string[] = []
    for (const item of v) {
      if (typeof item !== 'string') continue
      const t = item.trim().slice(0, cap)
      if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t)
      if (out.length >= max) break
    }
    return out
  }

  const experience = Array.isArray(input.experience)
    ? input.experience.slice(0, 8).map((e) => ({
        company: str(e?.company, 160) ?? 'Unknown company',
        title: str(e?.title, 160) ?? 'Unknown title',
        start: str(e?.start, 40),
        end: str(e?.end, 40),
        current: Boolean(e?.current),
        location: str(e?.location, 160),
        bullets: strArr(e?.bullets, 3, 300),
      }))
    : []

  const education = Array.isArray(input.education)
    ? input.education.slice(0, 6).map((e) => ({
        school: str(e?.school, 200) ?? 'Unknown school',
        degree: str(e?.degree, 120),
        field: str(e?.field, 160),
        start: str(e?.start, 40),
        end: str(e?.end, 40),
        grade: str(e?.grade, 60),
      }))
    : []

  return {
    headline: str(input.headline, 140),
    summary: str(input.summary, 600),
    skills: strArr(input.skills, 24, 60),
    experience,
    education,
    links: {
      linkedin: str(input.links?.linkedin, 300),
      github: str(input.links?.github, 300),
      portfolio: str(input.links?.portfolio, 300),
    },
    phone: str(input.phone, 40),
    location: str(input.location, 160),
    workAuth: str(input.workAuth, 200),
  }
}
