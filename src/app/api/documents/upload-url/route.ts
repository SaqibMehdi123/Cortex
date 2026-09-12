import { NextRequest, NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { makeStorageKey, presignR2Upload, r2Configured, storageMode } from '@/lib/storage'

export const runtime = 'nodejs'

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024

// GET /api/documents/upload-url
// Mode probe for the client uploader. The client picks its flow from this:
//   r2    → one presigned PUT straight to Cloudflare R2 (any file size, no
//           serverless request cap, no vercel.com upload gateway involved)
//   blob  → direct-to-Blob via @vercel/blob/client, with staged chunks and
//           the server relay as fallbacks
//   server→ stream through our own function (local dev / VPS with disk)
export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  return NextResponse.json({ mode: storageMode() })
}

// POST /api/documents/upload-url — issues the upload ticket.
//
// R2 mode: body is plain JSON {name, size}; the response is a presigned PUT
// URL the browser uses directly against the R2 S3 endpoint.
// Blob mode: handled by @vercel/blob (event protocol), exactly as before.
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    // ── Cloudflare R2: presign a direct browser → R2 upload ─────────────
    if (r2Configured()) {
      const body = (await req.json().catch(() => null)) as {
        name?: string
        size?: number
        contentType?: string
      } | null

      const name = (body?.name || 'document.pdf').replace(/[\r\n"\\]/g, '').slice(0, 200) || 'document.pdf'
      if (!name.toLowerCase().endsWith('.pdf')) {
        return NextResponse.json({ error: 'Only PDF files are supported right now' }, { status: 400 })
      }
      const size = Number(body?.size)
      if (!Number.isFinite(size) || size <= 0) {
        return NextResponse.json({ error: 'Missing file size' }, { status: 400 })
      }
      if (size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: `PDF is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB — that is the current limit` },
          { status: 413 }
        )
      }
      const contentType = body?.contentType === 'application/pdf' ? 'application/pdf' : 'application/pdf'

      const key = makeStorageKey(user.id, name)
      const uploadUrl = await presignR2Upload(key, contentType)
      // storageRef (NOT a public URL — the bucket stays private) is what the
      // import route records; download happens via presigned GETs later.
      return NextResponse.json({
        mode: 'r2',
        uploadUrl,
        storageRef: `r2://${key}`,
        key,
      })
    }

    // ── Vercel Blob mode (unchanged) ─────────────────────────────────────
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ mode: 'server' }, { status: 503 })
    }

    // @vercel/blob expects the event as a PARSED JSON object
    // (GenerateClientTokenEvent | UploadCompletedEvent) — NOT a stream. Passing
    // request.body raw made body.type undefined → "Invalid event type" → 500,
    // which the browser SDK surfaces as "Failed to retrieve the client token".
    const body = (await req.json().catch(() => null)) as HandleUploadBody | null
    if (!body || typeof body !== 'object' || !('type' in body)) {
      return NextResponse.json({ error: 'Invalid upload event' }, { status: 400 })
    }

    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['application/pdf'],
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
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
