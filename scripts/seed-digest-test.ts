// Seed a throwaway e2e test account into the sandbox embedded postgres and
// mint a session cookie for browser verification. Run:
//   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/cortex" bun scripts/seed-digest-test.ts
import { PrismaClient } from '@prisma/client'

const enc = new TextEncoder()
function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const byte of b) s += String.fromCharCode(byte)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode('cortex-local-dev-secret-change-me'), {
    name: 'HMAC', hash: 'SHA-256',
  }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return b64url(sig)
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 210_000 }, km, 256)
  return `pbkdf2$210000$${b64url(salt)}$${b64url(bits)}`
}

const db = new PrismaClient()
const email = 'digest-test@example.com'

const user = await db.user.upsert({
  where: { email },
  update: { emailVerified: true },
  create: {
    email,
    name: 'Digest Tester',
    passwordHash: await hashPassword('test-pass-123'),
    emailVerified: true,
    setting: { create: { name: 'Digest Tester', digestTime: '09:00', tzOffset: -300 } },
  },
  include: { setting: true },
})

// a couple of open tasks so the briefing has content
const dueToday = new Date(Date.now() + 2 * 3600_000)
const existing = await db.task.count({ where: { userId: user.id } })
if (existing === 0) {
  await db.task.createMany({
    data: [
      { userId: user.id, title: 'Submit scholarship form', priority: 'high', dueDate: dueToday },
      { userId: user.id, title: 'Overdue: library book return', priority: 'low', dueDate: new Date(Date.now() - 26 * 3600_000) },
    ],
  })
}

const exp = Date.now() + 30 * 24 * 3600_000
const token = `${user.id}.${exp}.${await hmac(`${user.id}.${exp}`)}`
console.log('USER_ID=' + user.id)
console.log('COOKIE=' + token)
await db.$disconnect()
