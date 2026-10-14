import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { guardUsage, isActivePro, limitMessage, usageFields } from '@/lib/entitlements'
import { runShortlist } from '@/lib/agent/match'

export const runtime = 'nodejs'
// JD hydration + several scoring batches can take a while.
export const maxDuration = 60

// POST /api/agent/shortlist — score the Discover board against the profile,
// persist match badges, post the Top-5 card into the agent thread.
export async function POST() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const profile = await db.candidateProfile.findUnique({ where: { userId: user.id } })
    if (!profile) {
      return NextResponse.json({ error: 'Upload your CV first — the agent shortlists against your profile.' }, { status: 409 })
    }

    const verdict = await guardUsage(user.id, 'agent', isActivePro(user))
    if (!verdict.allowed) {
      return NextResponse.json({ error: limitMessage('agent', verdict.limit), ...usageFields('agent', verdict) }, { status: 402 })
    }

    const summary = await runShortlist(user.id)
    return NextResponse.json(summary)
  } catch (e) {
    const msg = (e as Error).message
    console.error('POST /api/agent/shortlist error', e)
    return NextResponse.json({ error: msg === 'NO_PROFILE' ? 'Upload your CV first.' : 'Shortlist run failed. Please try again.' }, { status: msg === 'NO_PROFILE' ? 409 : 500 })
  }
}
