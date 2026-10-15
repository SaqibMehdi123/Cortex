import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Query logging is a dev tool: in production it would funnel every
    // user's emails, code hashes and token rows into the platform logs —
    // an unnecessary data-expansion surface. Enable locally with
    // DEBUG_QUERIES=1 when hunting a query bug.
    log:
      process.env.NODE_ENV === 'production'
        ? ['error']
        : process.env.DEBUG_QUERIES === '1'
          ? ['query', 'error']
          : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
