import { NextResponse } from 'next/server'
import { mailConfigured } from '@/lib/mailer'

// GET /api/auth/mail-status — tells the client whether this server can actually
// deliver email. Exposes nothing sensitive (just true/false) but lets the code
// screens warn up-front ("no mail provider configured — the code won't arrive")
// instead of leaving the user waiting on an email that can never be sent.
export async function GET() {
  return NextResponse.json({ configured: mailConfigured() })
}
