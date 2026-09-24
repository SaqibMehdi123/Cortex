import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const [users, docs] = await Promise.all([
  db.user.findMany({ select: { id: true, email: true, emailVerified: true, createdAt: true, plan: true }, orderBy: { createdAt: 'desc' }, take: 10 }),
  db.document.findMany({
    select: { id: true, userId: true, title: true, type: true, filePath: true, fileName: true, fileSize: true, pageCount: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 15,
  }),
])

console.log('USERS:')
for (const u of users) console.log(` ${u.email} | verified=${u.emailVerified} | plan=${u.plan} | created=${u.createdAt.toISOString()} | id=${u.id}`)
console.log('\nDOCUMENTS (latest 15):')
for (const d of docs) {
  const fp = d.filePath ?? 'null'
  console.log(` ${d.createdAt.toISOString()} | ${fp.slice(0, 60)} | ${d.fileName ?? '-'} | ${(d.fileSize ?? 0)}b | pages=${d.pageCount ?? '-'} | type=${d.type}`)
}
await db.$disconnect()
