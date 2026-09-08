/**
 * Single source of truth for site identity — consumed by root metadata,
 * robots.ts, sitemap.ts, manifest.ts, JSON-LD and the OG image generator.
 *
 * NOTE: the URL is intentionally hard-coded to production (not derived from
 * VERCEL_URL) so preview deployments never emit preview URLs into canonical /
 * Open Graph tags — search engines must always see one stable origin.
 */
export const SITE_URL = 'https://cortexdot.scrutinies.dev'
export const SITE_NAME = 'Cortex'
export const SITE_TAGLINE = 'Knowledge work, without the chaos.'

export const SITE_DESCRIPTION =
  'Cortex is your AI second brain: reading, notes, plans and goals in one fast workspace — with an AI radar over 97+ sources, flashcards, mindmaps and a copilot.'

export const SITE_KEYWORDS = [
  'second brain app',
  'AI second brain',
  'personal knowledge management',
  'AI knowledge workspace',
  'chat with your notes',
  'AI PDF summarizer',
  'AI flashcard generator',
  'AI mind map generator',
  'research paper tracker',
  'AI news radar',
  'productivity workspace',
  'note taking app',
  'reading tracker',
  'Cortex app',
]

export const SITE_FEATURES = [
  'AI copilot that reads your entire library',
  'Live radar over news, papers, jobs and scholarships',
  'PDF library with full-text AI summaries',
  'Spaced-repetition flashcards (SM-2)',
  'AI-generated mind maps',
  'Goals, weekly plans and focus tracking',
]
