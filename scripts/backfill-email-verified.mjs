// One-time backfill: existing accounts predate email verification, so they are
// trusted as verified. Only NEW signups go through the 6-digit code flow.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const r = await db.user.updateMany({ where: { emailVerified: false }, data: { emailVerified: true } })
console.log(`marked ${r.count} existing user(s) as emailVerified`)
await db.$disconnect()
