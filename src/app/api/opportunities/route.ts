import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// GET /api/opportunities — the signed-in user's application pipeline
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const opportunities = await db.opportunity.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' } })
    return NextResponse.json({ opportunities })
  } catch (e) {
    console.error('GET /api/opportunities error', e)
    return NextResponse.json({ error: 'Failed to load opportunities' }, { status: 500 })
  }
}

// POST /api/opportunities — add application
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const { company, role, type, classification, sender, source, url, status, deadline, nextAction, resume, notes } = body
    if (!company?.trim() || !role?.trim()) {
      return NextResponse.json({ error: 'Company and role are required' }, { status: 400 })
    }
    const opportunity = await db.opportunity.create({
      data: {
        userId: user.id,
        company: company.trim(),
        role: role.trim(),
        type: type || 'internship',
        classification: classification || 'opportunity',
        sender: sender?.trim() || null,
        source: source || 'manual',
        url: url?.trim() || null,
        status: ['saved', 'applied', 'interview', 'offer', 'rejected', 'archived'].includes(status) ? status : 'saved',
        deadline: deadline ? new Date(deadline) : null,
        nextAction: nextAction?.trim() || null,
        resume: resume?.trim() || null,
        notes: notes?.trim() || null,
      },
    })
    return NextResponse.json({ opportunity }, { status: 201 })
  } catch (e) {
    console.error('POST /api/opportunities error', e)
    return NextResponse.json({ error: 'Failed to create opportunity' }, { status: 500 })
  }
}
