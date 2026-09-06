import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// GET /api/scholarships?level=&saved=1&q=&source= — the user's scholarship list
// with filters + counts for the Career → Scholarships section.
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { searchParams } = new URL(req.url)
    const level = searchParams.get('level')
    const saved = searchParams.get('saved')
    const q = searchParams.get('q')?.trim()
    const source = searchParams.get('source')

    const where: Record<string, unknown> = { userId: user.id }
    if (level && ['masters', 'phd', 'other'].includes(level)) where.level = level
    if (saved === '1' || saved === '0') where.saved = saved === '1'
    if (source && source !== 'all') where.source = source
    if (q) where.title = { contains: q }

    const [items, total, byLevel, sources] = await Promise.all([
      db.scholarship.findMany({
        where,
        orderBy: [{ saved: 'desc' }, { createdAt: 'desc' }],
        take: 200,
      }),
      db.scholarship.count({ where: { userId: user.id } }),
      db.scholarship.groupBy({ by: ['level'], where: { userId: user.id }, _count: { _all: true } }),
      db.scholarship.groupBy({ by: ['source'], where: { userId: user.id }, _count: { _all: true } }),
    ])

    return NextResponse.json({
      items,
      total,
      counts: Object.fromEntries(byLevel.map((r) => [r.level, r._count._all])),
      sources: sources
        .map((r) => ({ name: r.source, count: r._count._all }))
        .sort((a, b) => b.count - a.count),
    })
  } catch (e) {
    console.error('GET /api/scholarships error', e)
    return NextResponse.json({ error: 'Failed to load scholarships' }, { status: 500 })
  }
}
