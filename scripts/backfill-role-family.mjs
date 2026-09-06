// One-off: backfill JobListing.roleFamily for rows created before the column
// existed. Classifications are memoized per role string. Idempotent.
// Usage: node scripts/backfill-role-family.mjs
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const RULES = [
  [/\b(data|analyst|analytics|machine learning|deep learning|mlops)\b/, 'data'],
  [/\b(research|scientist|phd|post-?doc|residency|researcher)\b/, 'research'],
  [/\b(engineer|engineering|developer|software|swe|backend|front-?end|full-?stack|sre|devops|infrastructure|platform|mobile|android|ios|architect)\b/, 'engineering'],
  [/\b(product)\b/, 'product'],
  [/\b(designer|design|ux|ui\/?ux|creative)\b/, 'design'],
  [/\b(sales|marketing|growth|business development|partnerships?|customer success|account executive|communications?)\b/, 'gtm'],
  [/\b(operations?|finance|financial|people|hr|talent|recruit|legal|program manager|project manager|chief of staff)\b/, 'ops'],
]
function classify(role) {
  const t = role.toLowerCase()
  for (const [re, fam] of RULES) if (re.test(t)) return fam
  return 'other'
}

const rows = await db.jobListing.findMany({ where: { roleFamily: null }, select: { id: true, role: true } })
console.log('rows to backfill:', rows.length)
const memo = new Map()
let updated = 0
for (const r of rows) {
  if (!memo.has(r.role)) memo.set(r.role, classify(r.role))
  await db.jobListing.update({ where: { id: r.id }, data: { roleFamily: memo.get(r.role) } })
  updated++
}
console.log('updated:', updated)
await db.$disconnect()
