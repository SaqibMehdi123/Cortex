import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import type { ReadableStream as NodeWebReadableStream } from 'stream/web'
import { put } from '@vercel/blob'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import {
  STAGED_CHUNK_MAX_BYTES,
  STAGED_TOTAL_MAX_BYTES,
  USER_STAGING_CAP_BYTES,
  stagedPathname,
  isValidUploadId,
  userStagedBytes,
} from '@/lib/blob-staging'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/documents/blob/staged/chunk?uploadId=…&index=…&total=…
//
// Step 2 of 3 of the large-file upload flow: one raw ≤4 MB chunk of the file
// as the request body (this is why chunks exist at all — Vercel caps function
// request bodies at 4.5 MB). The chunk is parked in the same Blob store under
// staging/<userId>/<uploadId>/<index>; nothing is assembled here. The client
// may retry a chunk freely (allowOverwrite) and may send chunks in parallel —
// the final order is restored from the zero-padded index in the pathname.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// A session cannot declare more chunks than the largest allowed PDF needs —
// without this, `total=10000` would authorize parking ~42 GB under one id.
const MAX_TOTAL_CHUNKS = Math.ceil(STAGED_TOTAL_MAX_BYTES / STAGED_CHUNK_MAX_BYTES) + 1

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: 'Blob storage is not connected' }, { status: 503 })
    }

    const params = new URL(req.url).searchParams
    const uploadId = params.get('uploadId') || ''
    const index = Number.parseInt(params.get('index') || '', 10)
    const total = Number.parseInt(params.get('total') || '', 10)
    if (!UUID_RE.test(uploadId)) {
      return NextResponse.json({ error: 'Invalid upload session' }, { status: 400 })
    }
    if (!Number.isInteger(index) || index < 0 || index >= MAX_TOTAL_CHUNKS) {
      return NextResponse.json({ error: 'Invalid chunk index' }, { status: 400 })
    }
    if (!Number.isInteger(total) || total <= 0 || total > MAX_TOTAL_CHUNKS || index >= total) {
      return NextResponse.json({ error: 'Invalid chunk count' }, { status: 400 })
    }

    if (!req.body) {
      return NextResponse.json({ error: 'No chunk data' }, { status: 400 })
    }

    const chunks: Buffer[] = []
    let received = 0
    for await (const chunk of Readable.fromWeb(req.body as unknown as NodeWebReadableStream<Uint8Array>)) {
      const buf = chunk as Buffer
      received += buf.length
      if (received > STAGED_CHUNK_MAX_BYTES) {
        return NextResponse.json(
          { error: 'Chunk exceeds the per-request size limit' },
          { status: 413 }
        )
      }
      chunks.push(buf)
    }
    if (received === 0) {
      return NextResponse.json({ error: 'No chunk data' }, { status: 400 })
    }

    // Per-user cumulative staging budget — blocks the begin×N / flood-chunks
    // storage-cost DoS (each session is separately bounded by the chunk-count
    // cap; this bounds all of an account's sessions together).
    const stagedSoFar = await userStagedBytes(user.id).catch(() => 0)
    if (stagedSoFar + received > USER_STAGING_CAP_BYTES) {
      return NextResponse.json(
        { error: 'Too much staged upload data — finish or cancel an upload first' },
        { status: 429 }
      )
    }

    const blob = await put(stagedPathname(user.id, uploadId, index), Buffer.concat(chunks), {
      access: 'public',
      addRandomSuffix: false, // deterministic path — the index IS the ordering
      allowOverwrite: true, // client retries must succeed idempotently
      contentType: 'application/octet-stream',
    })

    return NextResponse.json({ index, size: received, url: blob.url })
  } catch (e) {
    console.error('POST /api/documents/blob/staged/chunk error', e)
    return NextResponse.json({ error: 'Chunk upload failed' }, { status: 500 })
  }
}
