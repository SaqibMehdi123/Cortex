// ─── Apply Agent: shared card + profile types ──────────────────────────────
// Used by both the API routes (persisted into ChatMessage.payload) and the
// chat UI (rendering structured cards). Keep payloads small and self-describing
// — every card carries everything the UI needs to render + act.

// ── Structured profile extracted from a CV (one LLM call, hand-correctable) ──

export interface ExperienceBlock {
  company: string
  title: string
  start?: string | null
  end?: string | null
  current?: boolean
  location?: string | null
  bullets?: string[]
}

export interface EducationBlock {
  school: string
  degree?: string | null
  field?: string | null
  start?: string | null
  end?: string | null
  grade?: string | null
}

export interface ParsedCV {
  headline?: string | null
  summary?: string | null
  skills?: string[]
  experience?: ExperienceBlock[]
  education?: EducationBlock[]
  links?: { linkedin?: string | null; github?: string | null; portfolio?: string | null }
  phone?: string | null
  location?: string | null
  workAuth?: string | null
}

export interface ProfilePrefs {
  roleFamilies?: string[] // engineering | data | product | design | gtm | ops | research | other
  locations?: string[]
  remote?: 'remote' | 'hybrid_onsite' | 'any'
  types?: string[] // job | internship
  keywords?: string[] // extra want/avoid keywords (v1: want only)
}

export interface ReusableAnswer {
  question: string
  answer: string
}

// ── Chat payload cards (ChatMessage.payload JSON) ───────────────────────────

export interface ProfileConfirmationCard {
  kind: 'profile_confirmation'
  resumeId: string
  fileName: string
  headline?: string | null
  skills: string[]
  experience: { company: string; title: string; span: string }[]
  education: { school: string; degree: string }[]
  location?: string | null
  workAuth?: string | null
  links: { linkedin?: string | null; github?: string | null; portfolio?: string | null }
}

export interface PrefsPromptCard {
  kind: 'prefs_prompt'
  fields: { key: 'remote' | 'types' | 'salary'; label: string; options: { label: string; value: string }[] }[]
}

export interface ShortlistCard {
  kind: 'shortlist'
  items: {
    listingId: string
    company: string
    role: string
    url: string
    score: number
    why: string
    source: string
  }[]
  scoredCount: number
}

export interface ChecklistCard {
  kind: 'checklist'
  draftId: string
  company: string
  role: string
  answered: { question: string; answer: string; source: string }[]
  missing: string[]
  /** board supports direct ATS submission AND the user opted in */
  atsSupported?: boolean
}

export interface ApprovalCard {
  kind: 'approval'
  draftId: string
  company: string
  role: string
  url: string | null
  method: 'manual' | 'ats_greenhouse' | 'ats_lever'
  atsSupported: boolean
  coverLetter: boolean
  answersCount: number
  resumeLabel: string
}

export interface PackageCard {
  kind: 'package'
  draftId: string
  company: string
  role: string
  status: string
  packageUrl: string | null
  applyUrl: string | null
  message: string
}

export interface AgentFailureCard {
  kind: 'agent_error'
  draftId?: string
  message: string
}

export type AgentCard =
  | ProfileConfirmationCard
  | PrefsPromptCard
  | ShortlistCard
  | ChecklistCard
  | ApprovalCard
  | PackageCard
  | AgentFailureCard

// ── Draft answers sheet ────────────────────────────────────────────────────

export interface DraftAnswer {
  question: string
  answer: string
  source: 'profile' | 'user'
}
