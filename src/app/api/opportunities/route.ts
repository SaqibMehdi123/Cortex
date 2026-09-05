import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/opportunities
export async function GET() {
  try {
    const opportunities = await db.opportunity.findMany({
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    })
    return NextResponse.json({ opportunities })
  } catch (e) {
    console.error('GET /api/opportunities error', e)
    return NextResponse.json({ error: 'Failed to load opportunities' }, { status: 500 })
  }
}

// POST /api/opportunities
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { company, role, type, sender, source, url, status, deadline, notes } = body

    if (!company?.trim() || !role?.trim()) {
      return NextResponse.json({ error: 'Company and role are required' }, { status: 400 })
    }

    const opportunity = await db.opportunity.create({
      data: {
        company: company.trim(),
        role: role.trim(),
        type: type || 'internship',
        sender: sender?.trim() || null,
        source: source?.trim() || null,
        url: url?.trim() || null,
        status: status || 'new',
        deadline: deadline ? new Date(deadline) : null,
        notes: notes?.trim() || null,
      },
    })

    return NextResponse.json({ opportunity }, { status: 201 })
  } catch (e) {
    console.error('POST /api/opportunities error', e)
    return NextResponse.json({ error: 'Failed to create opportunity' }, { status: 500 })
  }
}
