import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { packageMarkdown } from '@/lib/agent/draft'
import { getDraft } from '@/lib/agent/draft-helpers'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// GET /api/agent/drafts/[id]/package — the Tier-A application bundle as a
// markdown download (CV reference + answers sheet + cover letter). Rendered
// on demand from current data — nothing stored, nothing stale.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()
    const { id } = await params

    const draft = await getDraft(user.id, id)
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    if (!draft.listing) return NextResponse.json({ error: 'This draft has no job listing context' }, { status: 409 })

    const [profile, resume] = await Promise.all([
      db.candidateProfile.findUnique({ where: { userId: user.id } }),
      db.resume.findFirst({ where: { id: draft.resumeId, userId: user.id } }),
    ])
    if (!profile || !resume) return NextResponse.json({ error: 'Profile or CV missing' }, { status: 409 })

    const md = packageMarkdown(draft, draft.listing, resume, profile)
    const fileName = `application-${draft.listing.company}-${draft.listing.role}`
      .replace(/[^\w.-]+/g, '-')
      .slice(0, 90) + '.md'

    return new NextResponse(md, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (e) {
    console.error('GET /api/agent/drafts/[id]/package error', e)
    return NextResponse.json({ error: 'Failed to build the package' }, { status: 500 })
  }
}
