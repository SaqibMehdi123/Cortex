// Seed a verified test user directly into the local pg-embed database for
// agent E2E tests. Run: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/cortex bun scripts/seed-agent-test-user.ts
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth'

const db = new PrismaClient()
const EMAIL = 'agent-test@local.test'
const PASSWORD = 'agent-test-1234'

async function main() {
  const passwordHash = await hashPassword(PASSWORD)
  const user = await db.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, emailVerified: true },
    create: { email: EMAIL, name: 'Agent Tester', passwordHash, emailVerified: true },
  })
  // clean agent data from previous runs
  await db.chatMessage.deleteMany({ where: { userId: user.id, thread: { startsWith: 'agent' } } })
  await db.applicationDraft.deleteMany({ where: { userId: user.id } })
  await db.candidateProfile.deleteMany({ where: { userId: user.id } })
  await db.resume.deleteMany({ where: { userId: user.id } })
  await db.jobListing.deleteMany({ where: { userId: user.id } })
  await db.opportunity.deleteMany({ where: { userId: user.id } })
  console.log(JSON.stringify({ id: user.id, email: user.email }))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
