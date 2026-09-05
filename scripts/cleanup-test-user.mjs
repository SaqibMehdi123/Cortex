// Delete a test account (cascades to all owned rows). Usage:
//   node scripts/cleanup-test-user.mjs <email>
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const email = process.argv[2]
if (!email) { console.error('usage: node scripts/cleanup-test-user.mjs <email>'); process.exit(1) }
const user = await db.user.findUnique({ where: { email } })
if (user) {
  await db.user.delete({ where: { id: user.id } })
  console.log('deleted test user + cascaded rows:', user.id, email)
} else {
  console.log('no user found for', email)
}
await db.$disconnect()
