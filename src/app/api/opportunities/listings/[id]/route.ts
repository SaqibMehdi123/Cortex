import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/opportunities/listings/[id] — save a listing into the pipeline
// (creates an Opportunity card) or un-save it. Body: { saved: boolean }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const saved = Boolean(body.saved)

    const listing = await db.jobListing.findUnique({ where: { id } })
    if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })

    if (saved) {
      // avoid duplicates in the pipeline when the same listing is saved twice
      const existing = await db.opportunity.findFirst({
        where: { url: listing.url, status: { notIn: ['rejected', 'archived'] } },
      })
      if (!existing) {
        await db.opportunity.create({
          data: {
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

// DELETE /api/opportunities/listings/[id] — dismiss a listing
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.jobListing.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/opportunities/listings/[id] error', e)
    return NextResponse.json({ error: 'Failed to delete listing' }, { status: 500 })
  }
}
