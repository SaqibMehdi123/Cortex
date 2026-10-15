// Seed users + verification codes directly for the security E2E battery.
// Run: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/cortex bun scripts/seed-security-e2e.ts
import { PrismaClient } from '@prisma/client'
import { hashPassword, hashCode } from '../src/lib/auth'

const db = new PrismaClient()

async function main() {
  const passwordHash = await hashPassword('password-123')
  const user = await db.user.upsert({
    where: { email: 'sec-e2e@local.test' },
    update: { passwordHash, emailVerified: true, tokenVersion: 0 },
    create: { email: 'sec-e2e@local.test', name: 'Sec Tester', passwordHash, emailVerified: true },
  })

  // fresh password_reset code "654321" for the reset-flow test
  await db.verificationCode.deleteMany({ where: { userId: user.id, purpose: 'password_reset' } })
  await db.verificationCode.create({
    data: {
      userId: user.id,
      purpose: 'password_reset',
      codeHash: await hashCode('654321'),
      expiresAt: new Date(Date.now() + 10 * 60_000),
      attempts: 0,
    },
  })

  // a second, UNVERIFIED account with an email_verify code "111222" to prove
  // the corrected verify-email still mints a session on the CORRECT code
  const unverifiedHash = await hashPassword('password-123')
  const unverified = await db.user.upsert({
    where: { email: 'sec-e2e-unverified@local.test' },
    update: { passwordHash: unverifiedHash, emailVerified: false, tokenVersion: 0 },
    create: { email: 'sec-e2e-unverified@local.test', name: 'Unverified Tester', passwordHash: unverifiedHash, emailVerified: false },
  })
  await db.verificationCode.deleteMany({ where: { userId: unverified.id, purpose: 'email_verify' } })
  await db.verificationCode.create({
    data: {
      userId: unverified.id,
      purpose: 'email_verify',
      codeHash: await hashCode('111222'),
      expiresAt: new Date(Date.now() + 10 * 60_000),
      attempts: 0,
    },
  })

  console.log(JSON.stringify({ ok: true, userId: user.id, unverifiedId: unverified.id }))
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
