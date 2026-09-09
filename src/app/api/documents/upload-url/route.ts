import { NextRequest, NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

export const runtime = 'nodejs'

// GET /api/documents/upload-url
// Mode probe for the client uploader: when a Blob store is connected (Vercel
// injects BLOB_READ_WRITE_TOKEN) the browser uploads the PDF directly to Blob
// storage — bytes never pass through the serverless function, so Vercel's
// 4.5 MB request-body cap does not apply. Without a token (local dev, VPS)
// the client falls back to the streaming upload route, which writes to disk.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  return NextResponse.json({ mode: process.env.BLOB_READ_WRITE_TOKEN ? 'blob' : 'server' })
}

// POST /api/documents/upload-url — handled by @vercel/blob/client. It issues
// a short-lived upload token after we get to veto the request here (auth +
// content-type + size). The browser then PUTs the PDF straight to Blob.
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ mode: 'server' }, { status: 503 })
    }

    // @vercel/blob expects the event as a PARSED JSON object
    // (GenerateClientTokenEvent | UploadCompletedEvent) — NOT a stream. Passing
    // request.body raw made body.type undefined → "Invalid event type" → 500,
    // which the browser SDK surfaces as "Failed to retrieve the client token".
    const body = (await request.json().catch(() => null)) as HandleUploadBody | null
    if (!body || typeof body !== 'object' || !('type' in body)) {
      return NextResponse.json({ error: 'Invalid upload event' }, { status: 400 })
    }

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['application/pdf'],
        maximumSizeInBytes: 200 * 1024 * 1024,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ userId: user.id }),
      }),
    })

    return NextResponse.json(jsonResponse)
  } catch (e) {
    console.error('POST /api/documents/upload-url error', e)
    return NextResponse.json({ error: 'Could not start the upload' }, { status: 500 })
  }
}
