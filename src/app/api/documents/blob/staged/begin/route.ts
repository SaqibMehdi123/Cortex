import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { STAGED_TOTAL_MAX_BYTES, sweepAbandonedStaging } from '@/lib/blob-staging'

export const runtime = 'nodejs'

// POST /api/documents/blob/staged/begin
//
// Step 1 of 3 of the large-file upload flow (> 4.2 MB): the client asks for a
// staging session before sending the file as ≤4 MB chunks. Validates the file
// up front (name, size, PDF magic from the first bytes) so bogus uploads fail
// fast instead of after dozens of chunk round-trips. Also runs the janitor
// that removes chunks abandoned by earlier interrupted uploads.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: 'Blob storage is not connected' }, { status: 503 })
    }

    const body = (await req.json().catch(() => null)) as {
      name?: string
      size?: number
      firstBytes?: string // base64 of the first 8 KB, for the magic check
    } | null

    const name = (body?.name || 'document.pdf').replace(/[\r\n"\\]/g, '').slice(0, 200) || 'document.pdf'
    if (!name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are supported right now' }, { status: 400 })
    }
    const size = Number(body?.size)
    if (!Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: 'Missing file size' }, { status: 400 })
    }
    if (size > STAGED_TOTAL_MAX_BYTES) {
      return NextResponse.json(
        { error: `PDF is larger than ${STAGED_TOTAL_MAX_BYTES / (1024 * 1024)} MB — that is the current limit` },
        { status: 413 }
      )
    }
    if (!body?.firstBytes || body.firstBytes.length > 24_000) {
      return NextResponse.json({ error: 'Missing file signature' }, { status: 400 })
    }
    const head = Buffer.from(body.firstBytes, 'base64')
    if (!head.subarray(0, 2048).toString('latin1').includes('%PDF-')) {
      return NextResponse.json({ error: 'That file does not look like a valid PDF' }, { status: 400 })
    }

    // Best-effort housekeeping; a failed sweep never blocks a new upload.
    await sweepAbandonedStaging()

    // The id is returned to the client and echoed on every chunk — it must be
    // unguessable, because whoever knows it can contribute chunks.
    const uploadId = crypto.randomUUID()
    if (!UUID_RE.test(uploadId)) {
      return NextResponse.json({ error: 'Could not start the upload' }, { status: 500 })
    }

    return NextResponse.json({ uploadId, chunkSize: 4 * 1024 * 1024 })
  } catch (e) {
    console.error('POST /api/documents/blob/staged/begin error', e)
    return NextResponse.json({ error: 'Could not start the upload' }, { status: 500 })
  }
}
