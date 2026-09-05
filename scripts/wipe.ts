import { PrismaClient } from '@prisma/client'

// Wipes ALL data — the user wants a clean slate (no demo/dummy content).
const db = new PrismaClient()

async function main() {
  await db.reviewLog.deleteMany()
  await db.flashcard.deleteMany()
  await db.readingSession.deleteMany()
  await db.focusSession.deleteMany()
  await db.chatMessage.deleteMany()
  await db.highlight.deleteMany()
  await db.task.deleteMany()
  await db.plan.deleteMany()
  await db.milestone.deleteMany()
  await db.goal.deleteMany()
  await db.newsArticle.deleteMany()
  await db.customSource.deleteMany()
  await db.opportunity.deleteMany()
  await db.mindMap.deleteMany()
  await db.note.deleteMany()
  await db.document.deleteMany()
  await db.paper.deleteMany()
  await db.setting.deleteMany()
  await db.setting.create({ data: { id: 'user' } })
  const counts = {
    documents: await db.document.count(),
    news: await db.newsArticle.count(),
    goals: await db.goal.count(),
    papers: await db.paper.count(),
    opportunities: await db.opportunity.count(),
  }
  console.log('WIPED. remaining:', JSON.stringify(counts))
}

main().finally(() => db.$disconnect())
