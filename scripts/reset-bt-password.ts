// reset bt@scrutinies.dev password for local browser verification
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth'

const db = new PrismaClient()
const hash = await hashPassword('Verify#2026!bt')
await db.user.update({ where: { email: 'bt@scrutinies.dev' }, data: { passwordHash: hash, emailVerified: true } })
console.log('password reset ok')
await db.$disconnect()
