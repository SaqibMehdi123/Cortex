import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// GET /api/sources — the signed-in user's custom news sources
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const sources = await db.customSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } })
    return NextResponse.json({ sources })
  } catch (e) {
    console.error('GET /api/sources error', e)
    return NextResponse.json({ error: 'Failed to load sources' }, { status: 500 })
  }
}

// POST /api/sources — add custom source (blog / newsletter / X account)
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const { name, url, type } = body
    if (!name?.trim() || !url?.trim()) {
      return NextResponse.json({ error: 'Name and URL are required' }, { status: 400 })
    }
    const source = await db.customSource.create({
      data: {
        userId: user.id,
        name: name.trim(),
        url: url.trim(),
        type: ['blog', 'newsletter', 'x', 'company', 'lab'].includes(type) ? type : 'blog',
      },
    })
    return NextResponse.json({ source }, { status: 201 })
  } catch (e) {
    console.error('POST /api/sources error', e)
    return NextResponse.json({ error: 'Failed to add source' }, { status: 500 })
  }
}
