import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/opportunities/listings?type=&source=&q=&saved=1
// Fetched listings from external sources, with filters + counts for the Discover tab.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')
    const source = searchParams.get('source')
    const q = searchParams.get('q')?.trim()
    const saved = searchParams.get('saved')

    const where: Record<string, unknown> = {}
    if (type && ['job', 'internship', 'research'].includes(type)) where.type = type
    if (source) where.source = source
    if (saved === '1' || saved === '0') where.saved = saved === '1'
    if (q) {
      where.OR = [
        { role: { contains: q } },
        { company: { contains: q } },
        { location: { contains: q } },
      ]
    }

    const [listings, total, byType, sources] = await Promise.all([
      db.jobListing.findMany({
        where,
        orderBy: [{ saved: 'desc' }, { publishedAt: 'desc' }, { fetchedAt: 'desc' }],
        take: 300,
      }),
      db.jobListing.count(),
      db.jobListing.groupBy({ by: ['type'], _count: { _all: true } }),
      db.jobListing.groupBy({ by: ['source'], _count: { _all: true } }),
    ])

    return NextResponse.json({
      listings,
      total,
      counts: Object.fromEntries(byType.map((r) => [r.type, r._count._all])),
      sources: sources
        .map((r) => ({ name: r.source, count: r._count._all }))
        .sort((a, b) => b.count - a.count),
    })
  } catch (e) {
    console.error('GET /api/opportunities/listings error', e)
    return NextResponse.json({ error: 'Failed to load listings' }, { status: 500 })
  }
}
