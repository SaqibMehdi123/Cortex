import { NextRequest, NextResponse } from 'next/server'
import { getSetting, googleConfigured, googleRedirectUri } from '@/lib/google'

// GET /api/auth/google/status — what the Settings UI needs to render the
// Google account card: are credentials present, is an account connected,
// and which redirect URI must be registered in Google Cloud Console.
export async function GET(req: NextRequest) {
  try {
    const setting = await getSetting()
    const configured = googleConfigured()
    const connected = Boolean(setting.googleAuth)
    return NextResponse.json({
      configured,
      connected,
      email: setting.googleEmail,
      clientId: process.env.GOOGLE_CLIENT_ID ? `${process.env.GOOGLE_CLIENT_ID.slice(0, 12)}…apps.googleusercontent.com` : null,
      redirectUri: googleRedirectUri(req), // always derived — needed during setup, before credentials exist
    })
  } catch (e) {
    console.error('GET /api/auth/google/status error', e)
    return NextResponse.json({ error: 'Failed to read Google status' }, { status: 500 })
  }
}
