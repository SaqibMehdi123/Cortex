// Curated scholarship/opportunity feeds + lightweight title classification.
// Deliberately AI-free: scholarship titles carry enough signal (level, funding,
// host country) that regex extraction is fast, free and predictable.

export interface ScholarshipFeed {
  key: string
  name: string
  url: string
}

export const SCHOLARSHIP_FEEDS: ScholarshipFeed[] = [
  { key: 'scholarshipscorner', name: 'Scholarships Corner', url: 'https://scholarshipscorner.website/feed/' },
  { key: 'fullyfundedscholarships', name: 'Fully Funded Scholarships', url: 'https://fullyfundedscholarships.org/?feed=rss2' },
  { key: 'opportunitydesk', name: 'Opportunity Desk', url: 'https://opportunitydesk.org/feed/' },
]

export type ScholarshipLevel = 'masters' | 'phd' | 'other'

export function classifyScholarshipLevel(title: string): ScholarshipLevel {
  const t = title.toLowerCase()
  if (/\b(phd|ph\.d|doctoral|doctorate|post-?doc(toral)?|dphil)\b/.test(t)) return 'phd'
  if (/\b(master'?s?|masters|m\.?s\.?c?\b|mba|m\.?phil|graduate (?:school|studies|program))/.test(t)) return 'masters'
  return 'other'
}

export function classifyScholarshipFunding(title: string): string | null {
  if (/fully[- ]funded|full[y]? (?:funded|financed)/i.test(title)) return 'Fully funded'
  const stipend = title.match(/\$[\d,.]+\s*[kK]?/)
  if (stipend) return `Stipend ${stipend[0].trim()}`
  if (/\bfunded\b/i.test(title)) return 'Funded'
  if (/\b(stipend|salary|allowance|monthly grant)\b/i.test(title)) return 'With stipend'
  return null
}

// Best-effort host-country extraction. "Purdue Scholarship 2027 in USA (Funded)"
// → USA. Only canonical country names are accepted so cities don't sneak in
// (except multi-part names like "Abu Dhabi, UAE" where the tail wins).
const COUNTRIES = new Set(
  [
    'USA', 'US', 'United States', 'UAE', 'UK', 'United Kingdom', 'England', 'Scotland', 'Wales', 'Canada', 'Australia',
    'New Zealand', 'China', 'Hong Kong', 'Japan', 'South Korea', 'Korea', 'Singapore', 'India', 'Pakistan', 'Bangladesh',
    'Turkey', 'Türkiye', 'Germany', 'France', 'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Sweden', 'Norway',
    'Denmark', 'Finland', 'Ireland', 'Italy', 'Spain', 'Portugal', 'Poland', 'Czech Republic', 'Hungary', 'Romania',
    'Russia', 'Ukraine', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Qatar', 'Bahrain', 'Oman', 'Egypt', 'Morocco', 'Nigeria',
    'Kenya', 'South Africa', 'Ghana', 'Ethiopia', 'Rwanda', 'Tanzania', 'Uganda', 'Brazil', 'Mexico', 'Argentina',
    'Chile', 'Colombia', 'Indonesia', 'Malaysia', 'Thailand', 'Vietnam', 'Philippines', 'Taiwan', 'Israel', 'Georgia',
    'Kazakhstan', 'Azerbaijan', 'Brunei', 'Iceland', 'Luxembourg', 'Estonia', 'Latvia', 'Lithuania', 'Slovenia',
    'Slovakia', 'Croatia', 'Serbia', 'Bulgaria', 'Greece', 'Cyprus', 'Malta', 'Monaco',
  ].map((c) => c.toLowerCase()),
)

const COUNTRY_ALIASES: Record<string, string> = { us: 'USA', usa: 'USA', 'united states': 'USA', uk: 'UK', 'united kingdom': 'UK', uae: 'UAE', korea: 'South Korea', türkiye: 'Turkey' }

export function extractScholarshipCountry(title: string): string | null {
  // Candidate phrases after "in", before a year/pipe/paren/dash/end.
  const matches = Array.from(title.matchAll(/\bin\s+([A-Z][A-Za-z.'-]+(?:[\s,]+(?:of\s+)?[A-Z][A-Za-z.'-]+)*)/g))
  for (const m of matches) {
    let phrase = m[1].replace(/\s*\d{4}.*$/, '').trim()
    // "Abu Dhabi, UAE" → prefer the segment after the comma
    const segments = phrase.split(',').map((s) => s.trim()).filter(Boolean)
    for (const seg of [segments[segments.length - 1], segments[0]]) {
      if (!seg) continue
      const key = seg.toLowerCase()
      if (COUNTRIES.has(key)) return COUNTRY_ALIASES[key] ?? seg
    }
  }
  // Fallback: trailing "…, UAE | Fully Funded" without a leading "in"
  const tail = title.match(/,\s*([A-Z]{2,4})\b/)
  if (tail && COUNTRIES.has(tail[1].toLowerCase())) return COUNTRY_ALIASES[tail[1].toLowerCase()] ?? tail[1]
  // Last resort: scan the whole title for a country name ("Hong Kong PhD
  // Fellowship Scheme…" mentions the host up front). Longest match wins.
  const lower = title.toLowerCase()
  let best: string | null = null
  for (const c of COUNTRIES) {
    if (!lower.includes(c)) continue
    if (!new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower)) continue
    if (!best || c.length > best.length) best = c
  }
  if (best) {
    // Return a nicely-cased alias if we have one, else title-case it
    const canonical = COUNTRY_ALIASES[best] ?? best.replace(/\b\w/g, (ch) => ch.toUpperCase())
    return canonical
  }
  return null
}
