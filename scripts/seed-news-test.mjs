// Test-only helper: verify a test user by email and seed fake news rows with
// \n-separated summaries (same shape the AI digest produces) for UI checks.
// Usage: node scripts/seed-news-test.mjs <email>
import { PrismaClient } from '@prisma/client'

const email = process.argv[2]
if (!email) {
  console.error('usage: node scripts/seed-news-test.mjs <email>')
  process.exit(1)
}

const db = new PrismaClient()

const user = await db.user.findUnique({ where: { email } })
if (!user) {
  console.error('no such user:', email)
  process.exit(1)
}
await db.user.update({ where: { id: user.id }, data: { emailVerified: true } })

const items = [
  {
    title: 'Research acceleration: The view inside OpenAI',
    source: 'OpenAI',
    category: 'company',
    summary: "OpenAI's coding agents are reshaping AI research\nEarly data shows increased experiment velocity\nResearch acceleration impacts task complexity",
  },
  {
    title: 'Seattle Times and Newsday are the latest publications to sue OpenAI',
    source: 'TechCrunch',
    category: 'blog',
    summary: 'Seattle Times and Newsday sue OpenAI and Microsoft\nAlleged use of journalism to train AI\nNews organizations join legal action',
  },
  {
    title: 'Hikers rescued after using Google Gemini for planning',
    source: 'TechCrunch',
    category: 'blog',
    summary: 'Hikers rescued after following Google Gemini advice\nGemini recommended insufficient food and water\nSheriff\u2019s office issued safety warning',
  },
]

for (const it of items) {
  await db.newsArticle.upsert({
    where: { userId_url: { userId: user.id, url: `https://example.test/${encodeURIComponent(it.title)}` } },
    create: { userId: user.id, url: `https://example.test/${encodeURIComponent(it.title)}`, publishedAt: new Date(), ...it },
    update: { summary: it.summary },
  })
}
console.log('verified user + seeded', items.length, 'news rows for', email)
await db.$disconnect()
