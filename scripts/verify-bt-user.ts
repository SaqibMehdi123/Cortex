import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const u = await db.user.findUnique({ where: { email: 'bt@scrutinies.dev' }, select: { id: true, emailVerified: true } })
console.log('before:', u)
await db.user.update({ where: { email: 'bt@scrutinies.dev' }, data: { emailVerified: true } })
const u2 = await db.user.findUnique({ where: { email: 'bt@scrutinies.dev' }, select: { emailVerified: true } })
console.log('after:', u2)
await db.$disconnect()
