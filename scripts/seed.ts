/**
 * Cortex seed — intentionally EMPTY of demo data.
 *
 * The user asked for a clean slate: no dummy goals, documents, news or
 * opportunities. All content in Cortex is now either created by you
 * (Library imports, goals, plans, applications) or fetched live from real
 * sources (News Radar RSS feeds, Hugging Face Daily Papers, arXiv).
 *
 * Each account owns its own workspace, so seeding just makes sure every
 * existing account has a settings row. Nothing else.
 *
 * Run: bun scripts/seed.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  // Every account gets a private settings row — no shared workspace anymore.
  const users = await db.user.findMany({ select: { id: true } })
  for (const user of users) {
    await db.setting.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    })
  }
  console.log(`Seed complete — settings ensured for ${users.length} account(s). No demo data (by design).`)
}

main().finally(() => db.$disconnect())
