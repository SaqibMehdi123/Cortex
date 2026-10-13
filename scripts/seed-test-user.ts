// One-off seed for local browser verification of the Plans week pager.
// Creates a verified throwaway user plus tasks on LAST SUNDAY (one done,
// one open) so the past-week review flow has real data to show.
// Run with: bun scripts/seed-test-user.ts   (local SQLite db/custom.db only)
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth'

const db = new PrismaClient()
const EMAIL = 'plans-test@local.test'
const PASSWORD = 'plans-test-1234'

// most recent Sunday strictly before today (UTC calendar)
function lastSunday(): Date {
  const now = new Date()
  const daysSinceSunday = now.getUTCDay() === 0 ? 7 : now.getUTCDay()
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
      daysSinceSunday * 86_400_000,
  )
}

async function main() {
  const passwordHash = await hashPassword(PASSWORD)
  const user = await db.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, emailVerified: new Date() },
    create: { email: EMAIL, name: 'Plans Tester', passwordHash, emailVerified: new Date() },
  })

  const sun = lastSunday()
  const iso = (h: number) => new Date(sun.getTime() + h * 3_600_000)
  const todayStart = new Date()
  todayStart.setUTCHours(10, 0, 0, 0)

  // clean previous seed runs, then re-create
  await db.task.deleteMany({ where: { userId: user.id, title: { startsWith: 'Plan seed —' } } })
  await db.task.createMany({
    data: [
      {
        userId: user.id,
        title: 'Plan seed — last Sunday, completed',
        status: 'done',
        priority: 'med',
        estimate: 25,
        dueDate: iso(15),
        completedAt: iso(15),
      },
      {
        userId: user.id,
        title: 'Plan seed — last Sunday, still open',
        status: 'todo',
        priority: 'med',
        estimate: 25,
        dueDate: iso(10),
      },
      {
        userId: user.id,
        title: 'Plan seed — today, sanity item',
        status: 'todo',
        priority: 'med',
        estimate: 25,
        dueDate: todayStart,
      },
    ],
  })

  console.log(`seeded ${EMAIL} / ${PASSWORD}`)
  console.log(`last Sunday = ${sun.toISOString().slice(0, 10)} (3 tasks created)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
