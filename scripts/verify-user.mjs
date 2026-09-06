// Test-only helper: verify the autofetch test user and (optionally) set
// lastNewsFetchAt to simulate staleness. Usage:
//   node scripts/verify-user.mjs <email> [--stale-hours N]
import { PrismaClient } from '@prisma/client'

const email = process.argv[2]
if (!email) {
  console.error('usage: node scripts/verify-user.mjs <email> [--stale-hours N]')
  process.exit(1)
}

const staleIdx = process.argv.indexOf('--stale-hours')
const staleHours = staleIdx !== -1 ? Number(process.argv[staleIdx + 1]) : null

const db = new PrismaClient()
const user = await db.user.findUnique({ where: { email } })
if (!user) {
  console.error('no such user:', email)
  process.exit(1)
}
const data = { emailVerified: true }
if (staleHours !== null) data.lastNewsFetchAt = new Date(Date.now() - staleHours * 3600_000)
await db.user.update({ where: { id: user.id }, data })
console.log('verified', email, staleHours !== null ? `lastNewsFetchAt=${data.lastNewsFetchAt.toISOString()}` : '(lastNewsFetchAt untouched)')
await db.$disconnect()
