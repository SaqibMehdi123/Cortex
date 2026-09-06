import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// GET /api/opportunities/listings?type=&source=&family=&q=&saved=1
// The signed-in user's fetched listings, with filters + counts for the Discover tab.
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')
    const source = searchParams.get('source')
    const family = searchParams.get('family')
    const q = searchParams.get('q')?.trim()
    const saved = searchParams.get('saved')

    const where: Record<string, unknown> = { userId: user.id }
    if (type && ['job', 'internship', 'research'].includes(type)) where.type = type
    if (source) where.source = source
    if (family) where.roleFamily = family
    if (saved === '1' || saved === '0') where.saved = saved === '1'
    if (q) {
      where.OR = [
        { role: { contains: q } },
        { company: { contains: q } },
        { location: { contains: q } },
      ]
    }

    const [listings, total, byType, sources, byFamily] = await Promise.all([
      db.jobListing.findMany({
        where,
        orderBy: [{ saved: 'desc' }, { publishedAt: 'desc' }, { fetchedAt: 'desc' }],
        take: 300,
      }),
      db.jobListing.count({ where: { userId: user.id } }),
      db.jobListing.groupBy({ by: ['type'], where: { userId: user.id }, _count: { _all: true } }),
      db.jobListing.groupBy({ by: ['source'], where: { userId: user.id }, _count: { _all: true } }),
      db.jobListing.groupBy({ by: ['roleFamily'], where: { userId: user.id }, _count: { _all: true } }),
    ])

    return NextResponse.json({
      listings,
      total,
      counts: Object.fromEntries(byType.map((r) => [r.type, r._count._all])),
      sources: sources
        .map((r) => ({ name: r.source, count: r._count._all }))
        .sort((a, b) => b.count - a.count),
      roleFamilies: byFamily
        .filter((r) => r.roleFamily)
        .map((r) => ({ family: r.roleFamily as string, count: r._count._all }))
        .sort((a, b) => b.count - a.count),
    })
  } catch (e) {
    console.error('GET /api/opportunities/listings error', e)
    return NextResponse.json({ error: 'Failed to load listings' }, { status: 500 })
  }
}
