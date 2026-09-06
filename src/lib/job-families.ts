// Classifies a free-text job title into a small set of role families so the
// Discover board can offer a "role" filter (Engineering, Research, Data, …).
// Ordered: earlier rules win, so put the most specific vocabulary first.
const RULES: Array<[RegExp, string]> = [
  // "Data Scientist", "Data Engineer", "Analyst", "ML/AI specialist"
  [/\b(data|analyst|analytics|machine learning|deep learning|mlops)\b/, 'data'],
  // "Research Scientist", "Research Engineer", "PhD", "Postdoc", "AI Residency"
  [/\b(research|scientist|phd|post-?doc|residency|researcher)\b/, 'research'],
  // "Software Engineer", "Backend", "Full-stack", "SRE", "iOS"
  [
    /\b(engineer|engineering|developer|software|swe|backend|front-?end|full-?stack|sre|devops|infrastructure|platform|mobile|android|ios|architect)\b/,
    'engineering',
  ],
  [/\b(product)\b/, 'product'],
  [/\b(designer|design|ux|ui\/?ux|creative)\b/, 'design'],
  [/\b(sales|marketing|growth|business development|partnerships?|customer success|account executive|communications?)\b/, 'gtm'],
  [/\b(operations?|finance|financial|people|hr|talent|recruit|legal|program manager|project manager|chief of staff)\b/, 'ops'],
]

export const ROLE_FAMILIES = ['research', 'engineering', 'data', 'product', 'design', 'gtm', 'ops', 'other'] as const
export type RoleFamily = (typeof ROLE_FAMILIES)[number]

export function classifyRoleFamily(role: string): RoleFamily {
  const t = role.toLowerCase()
  for (const [re, family] of RULES) if (re.test(t)) return family as RoleFamily
  return 'other'
}
