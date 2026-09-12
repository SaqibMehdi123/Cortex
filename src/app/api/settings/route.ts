import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// Fields safe to return to the browser. googleAuth is DELIBERATELY excluded:
// it holds the user's live Google OAuth access + refresh tokens, which no
// client code ever needs (connection status comes from /api/auth/google/status).
const PUBLIC_SETTING_SELECT = {
  id: true,
  userId: true,
  name: true,
  theme: true,
  digestTime: true,
  googleEmail: true,
  updatedAt: true,
} as const

// GET /api/settings — the signed-in user's workspace settings
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    let setting = await db.setting.findUnique({
      where: { userId: user.id },
      select: PUBLIC_SETTING_SELECT,
    })
    if (!setting) {
      setting = await db.setting.create({
        data: { userId: user.id },
        select: PUBLIC_SETTING_SELECT,
      })
    }
    return NextResponse.json(
      { setting },
      { headers: { 'Cache-Control': 'no-store' } } // per-user data — never cached
    )
  } catch (e) {
    console.error('GET /api/settings error', e)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

// PUT /api/settings — update the signed-in user's settings
export async function PUT(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const data: Record<string, unknown> = {}
    if ('name' in body) data.name = String(body.name || 'there').slice(0, 60)
    if ('theme' in body && ['light', 'dark', 'system'].includes(body.theme)) data.theme = body.theme
    if ('digestTime' in body && /^\d{2}:\d{2}$/.test(body.digestTime)) data.digestTime = body.digestTime

    const setting = await db.setting.upsert({
      where: { userId: user.id },
      update: data,
      create: { userId: user.id, ...data },
      select: PUBLIC_SETTING_SELECT,
    })
    return NextResponse.json(
      { setting },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e) {
    console.error('PUT /api/settings error', e)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
