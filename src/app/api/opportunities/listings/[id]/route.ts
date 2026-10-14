import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// PATCH /api/opportunities/listings/[id] — save one of the user's listings into
// their pipeline (creates an Opportunity card), un-save it, or mark it "not
// interested" (persisted agent signal: matchScore = -1 keeps it out of every
// future shortlist). Body: { saved?: boolean, notInterested?: boolean }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const body = (await req.json().catch(() => ({}))) as { saved?: boolean; notInterested?: boolean }

    const listing = await db.jobListing.findFirst({ where: { id, userId: user.id } })
    if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })

    if (typeof body.notInterested === 'boolean') {
      const updated = await db.jobListing.update({
        where: { id },
        data: {
          matchScore: body.notInterested ? -1 : null,
          matchWhy: body.notInterested ? 'Marked not interested' : null,
          matchGaps: null,
        },
      })
      return NextResponse.json({ listing: updated })
    }

    const saved = Boolean(body.saved)

    if (saved) {
      // avoid duplicates in the pipeline when the same listing is saved twice
      const existing = await db.opportunity.findFirst({
        where: { userId: user.id, url: listing.url, status: { notIn: ['rejected', 'archived'] } },
      })
      if (!existing) {
        await db.opportunity.create({
          data: {
            userId: user.id,
            company: listing.company,
            role: listing.role,
            type: listing.type,
            source: listing.source,
            url: listing.url,
            location: listing.location,
            status: 'saved',
            classification: 'opportunity',
          },
        })
      }
    }

    const updated = await db.jobListing.update({ where: { id }, data: { saved } })
    return NextResponse.json({ listing: updated })
  } catch (e) {
    console.error('PATCH /api/opportunities/listings/[id] error', e)
    return NextResponse.json({ error: 'Failed to update listing' }, { status: 500 })
  }
}

// DELETE /api/opportunities/listings/[id] — dismiss one of the user's listings
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const existing = await db.jobListing.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await db.jobListing.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/opportunities/listings/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete listing' }, { status: 500 })
  }
}
