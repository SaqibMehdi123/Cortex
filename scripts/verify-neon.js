// Verify the Neon pooled connection works for real Prisma queries the way
// the app runs them (create → query → update → delete round-trip).
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const email = `deploy-verify-${Date.now()}@cortex.dev`
  const user = await db.user.create({
    data: { email, name: 'Deploy Verify', passwordHash: 'pbkdf2$1$salt$hash' },
  })
  console.log('created user:', user.id)

  const shelf = await db.shelf.create({ data: { userId: user.id, name: 'Verify Shelf' } })
  console.log('created shelf:', shelf.id, shelf.name)

  const doc = await db.document.create({
    data: { userId: user.id, title: 'Verify Doc', type: 'paper', content: 'x'.repeat(50), shelfId: shelf.id },
  })
  const found = await db.document.findFirst({
    where: { id: doc.id, userId: user.id },
    include: { shelf: true },
  })
  console.log('doc with shelf relation:', found.title, '→', found.shelf.name)

  await db.document.delete({ where: { id: doc.id } })
  await db.shelf.delete({ where: { id: shelf.id } })
  await db.user.delete({ where: { id: user.id } })
  console.log('cleanup done — round-trip OK on pooled connection')
}

main().catch((e) => { console.error('VERIFY FAILED:', e.message); process.exit(1) }).finally(() => db.$disconnect())
