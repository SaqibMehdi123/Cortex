// Server-side session helpers (Node runtime route handlers).
// Kept apart from auth.ts so edge middleware never pulls in the db client.
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

export async function getSessionUser(): Promise<
  { id: string; name: string; email: string; plan: string; planExpiresAt: Date | null } | null
> {
  const store = await cookies()
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value)
  if (!session) return null
  return db.user.findUnique({
    where: { id: session.userId },
    // plan/planExpiresAt feed the billing entitlements (src/lib/entitlements) —
    // every session-scoped route can resolve the plan with zero extra queries.
    select: { id: true, name: true, email: true, plan: true, planExpiresAt: true },
  })
}

// Standard 401 for API handlers called without a valid session. Middleware
// already blocks anonymous requests — this is the second line of defense so a
// route can never fall back to shared data.
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
}

