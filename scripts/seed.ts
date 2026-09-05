/**
 * Cortex seed — intentionally EMPTY of demo data.
 *
 * The user asked for a clean slate: no dummy goals, documents, news or
 * opportunities. All content in Cortex is now either created by you
 * (Library imports, goals, plans, applications) or fetched live from real
 * sources (News Radar RSS feeds, Hugging Face Daily Papers, arXiv).
 *
 * Run: bun scripts/seed.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  // Ensure the settings singleton exists — nothing else.
  await db.setting.upsert({
    where: { id: 'user' },
    update: {},
    create: { id: 'user' },
  })
  console.log('Seed complete — no demo data (by design). Pull real news/papers from the News Radar tab.')
}

main().finally(() => db.$disconnect())
