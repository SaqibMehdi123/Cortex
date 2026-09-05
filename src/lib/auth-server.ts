// Server-side session helpers (Node runtime route handlers).
// Kept apart from auth.ts so edge middleware never pulls in the db client.
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

export async function getSessionUser(): Promise<{ id: string; name: string; email: string } | null> {
  const store = await cookies()
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value)
  if (!session) return null
  return db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true },
  })
}
