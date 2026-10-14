import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { getDraft } from '@/lib/agent/draft-helpers'

export const runtime = 'nodejs'

// GET /api/agent/drafts/[id] — one draft with its listing/opportunity context
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()
    const { id } = await params

    const draft = await getDraft(user.id, id)
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

    return NextResponse.json({ draft })
  } catch (e) {
    console.error('GET /api/agent/drafts/[id] error', e)
    return NextResponse.json({ error: 'Failed to load the draft' }, { status: 500 })
  }
}
