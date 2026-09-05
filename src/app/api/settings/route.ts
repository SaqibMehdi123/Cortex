import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/settings — singleton settings
export async function GET() {
  try {
    let setting = await db.setting.findUnique({ where: { id: 'user' } })
    if (!setting) setting = await db.setting.create({ data: { id: 'user' } })
    return NextResponse.json({ setting })
  } catch (e) {
    console.error('GET /api/settings error', e)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

// PUT /api/settings — update
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if ('name' in body) data.name = String(body.name || 'there').slice(0, 60)
    if ('theme' in body && ['light', 'dark', 'system'].includes(body.theme)) data.theme = body.theme
    if ('digestTime' in body && /^\d{2}:\d{2}$/.test(body.digestTime)) data.digestTime = body.digestTime

    const setting = await db.setting.upsert({
      where: { id: 'user' },
      update: data,
      create: { id: 'user', ...data },
    })
    return NextResponse.json({ setting })
  } catch (e) {
    console.error('PUT /api/settings error', e)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
