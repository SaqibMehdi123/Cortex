import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// GET /api/search?q= — universal search across the signed-in user's documents, notes, tasks, goals, plans, news, opportunities
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim()
    if (!q) {
      return NextResponse.json({
        documents: [], notes: [], tasks: [], goals: [], plans: [], news: [], opportunities: [],
      })
    }

    const [documents, notes, tasks, goals, plans, news, opportunities] = await Promise.all([
      db.document.findMany({
        where: { userId: user.id, OR: [{ title: { contains: q } }, { tags: { contains: q } }, { summary: { contains: q } }, { content: { contains: q } }] },
        select: { id: true, title: true, status: true },
        take: 5,
      }),
      db.note.findMany({
        where: { userId: user.id, OR: [{ title: { contains: q } }, { content: { contains: q } }] },
        select: { id: true, title: true, content: true },
        take: 5,
      }),
      db.task.findMany({
        where: { userId: user.id, title: { contains: q } },
        select: { id: true, title: true, status: true, dueDate: true },
        take: 5,
      }),
      db.goal.findMany({
        where: { userId: user.id, OR: [{ title: { contains: q } }, { description: { contains: q } }] },
        select: { id: true, title: true, color: true },
        take: 5,
      }),
      db.plan.findMany({
        where: { userId: user.id, title: { contains: q }, timeframe: { not: 'template' } },
        select: { id: true, title: true, timeframe: true },
        take: 5,
      }),
      db.newsArticle.findMany({
        where: { userId: user.id, title: { contains: q } },
        select: { id: true, title: true, url: true },
        take: 5,
      }),
      db.opportunity.findMany({
        where: { userId: user.id, OR: [{ company: { contains: q } }, { role: { contains: q } }] },
        select: { id: true, company: true, role: true, status: true },
        take: 5,
      }),
    ])

    return NextResponse.json({ documents, notes, tasks, goals, plans, news, opportunities })
  } catch (e) {
    console.error('GET /api/search error', e)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
