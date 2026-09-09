import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { list, put } from '@vercel/blob'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import {
  STAGED_TOTAL_MAX_BYTES,
  deleteStagedBlobs,
  isValidUploadId,
  stagingPrefix,
  stagedIndex,
} from '@/lib/blob-staging'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/documents/blob/staged/complete
//
// Step 3 of 3 of the large-file upload flow: all ≤4 MB chunks are parked in
// the store — this route stitches them into the final PDF. Chunks are read
// back through a lazy concatenating stream (only ~8 MB is ever buffered) and
// handed to put({ multipart: true }), which splits the stream into ≥5 MB
// parts server-side — so files of any size pass through a 4.5-MB-capped
// function without ever touching the flaky vercel.com gateway, and without
// the whole file sitting in memory.

/** Lazily streams every staged chunk back in order — nothing is buffered whole. */
async function* stagedBytes(urls: string[]): AsyncGenerator<Uint8Array> {
  for (const url of urls) {
    const res = await fetch(url)
    if (!res.ok || !res.body) {
      throw new Error(`A staged chunk became unavailable (${res.status})`)
    }
    const body = res.body as unknown as AsyncIterable<Uint8Array>
    for await (const chunk of body) yield chunk
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: 'Blob storage is not connected' }, { status: 503 })
    }

    const body = (await req.json().catch(() => null)) as {
      uploadId?: string
      name?: string
    } | null

    const uploadId = body?.uploadId || ''
    if (!isValidUploadId(uploadId)) {
      return NextResponse.json({ error: 'Invalid upload session' }, { status: 400 })
    }
    const name = (body?.name || 'document.pdf').replace(/[\r\n"\\]/g, '').slice(0, 200) || 'document.pdf'
    if (!name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are supported right now' }, { status: 400 })
    }

    // Collect every staged chunk for THIS user + upload session.
    const prefix = stagingPrefix(user.id, uploadId)
    const found: { index: number; url: string; size: number }[] = []
    let cursor: string | undefined
    let totalSize = 0
    do {
      const page = await list({ prefix, limit: 1000, cursor })
      for (const blob of page.blobs) {
        const index = stagedIndex(blob.pathname, prefix)
        if (index === null) continue
        found.push({ index, url: blob.url, size: blob.size })
        totalSize += blob.size
      }
      cursor = page.hasMore ? page.cursor : undefined
    } while (cursor)

    if (!found.length) {
      return NextResponse.json({ error: 'No staged chunks found — please retry the upload' }, { status: 404 })
    }
    if (totalSize > STAGED_TOTAL_MAX_BYTES) {
      await deleteStagedBlobs(found.map((f) => f.url))
      return NextResponse.json(
        { error: `PDF is larger than ${STAGED_TOTAL_MAX_BYTES / (1024 * 1024)} MB — that is the current limit` },
        { status: 413 }
      )
    }

    // Chunks may arrive out of order (parallel client uploads) — restore the
    // file order from the zero-padded index and make sure none is missing.
    found.sort((a, b) => a.index - b.index)
    for (let i = 0; i < found.length; i++) {
      if (found[i].index !== i) {
        return NextResponse.json(
          { error: "Some parts of the file didn't arrive — please retry the upload" },
          { status: 409 }
        )
      }
    }

    const finalBlob = await put(name, Readable.toWeb(Readable.from(stagedBytes(found.map((f) => f.url)))) as unknown as ReadableStream<Uint8Array>, {
      access: 'public',
      addRandomSuffix: true,
      contentType: 'application/pdf',
      multipart: true,
    })

    // The final PDF is in — staged chunks have served their purpose.
    await deleteStagedBlobs(found.map((f) => f.url))

    return NextResponse.json({ url: finalBlob.url, pathname: finalBlob.pathname, size: totalSize })
  } catch (e) {
    console.error('POST /api/documents/blob/staged/complete error', e)
    return NextResponse.json({ error: 'Could not finish the upload — please retry' }, { status: 500 })
  }
}
