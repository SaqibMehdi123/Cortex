import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { analyzePaper } from '@/lib/paper-analysis'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { guardUsage, isActivePro, limitMessage, usageFields } from '@/lib/entitlements'

// POST /api/papers/[id]/analyze — on-demand AI breakdown of one of the user's papers
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    // Metered like every other AI action (one agent action per analysis).
    const verdict = await guardUsage(user.id, 'agent', isActivePro(user))
    if (!verdict.allowed) {
      return NextResponse.json({ error: limitMessage('agent', verdict.limit), ...usageFields('agent', verdict) }, { status: 402 })
    }

    const { id } = await params
    const owned = await db.paper.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!owned) return NextResponse.json({ error: 'Paper not found' }, { status: 404 })

    const updated = await analyzePaper(id)
    return NextResponse.json({ paper: updated })
  } catch (e) {
    console.error('POST /api/papers/[id]/analyze error', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Analysis failed' }, { status: 500 })
  }
}
