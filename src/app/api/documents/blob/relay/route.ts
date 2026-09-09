import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import type { ReadableStream as NodeWebReadableStream } from 'stream/web'
import { put } from '@vercel/blob'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/documents/blob/relay?name=invoice.pdf
//
// BACKUP upload path for when the browser → Vercel Blob gateway direct
// upload fails (the @vercel/blob client PUTs files to vercel.com/api/blob,
// which is subject to network/WAF interference that the serverless→gateway
// path is not). The browser sends the raw PDF as the request body — this is
// only possible within Vercel's 4.5 MB function request cap, so the client
// only uses this route for small files and as a fallback.
//
// The bytes land in the SAME Blob store the direct flow would have used, so
// the caller then continues with the normal /api/documents/pdf/from-blob
// import exactly as if the direct upload had succeeded.

const MAX_BYTES = 4.2 * 1024 * 1024 // comfortably under Vercel's 4.5 MB cap

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: 'Blob storage is not connected' }, { status: 503 })
    }

    const name = (new URL(req.url).searchParams.get('name') || 'document.pdf')
      .replace(/[\r\n"\\]/g, '')
      .slice(0, 200)
      || 'document.pdf'
    if (!name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are supported right now' }, { status: 400 })
    }
    if (!req.body) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    // Buffer the small body while enforcing the cap and peeking at the first
    // bytes for the %PDF- magic number (same guards as the streaming route).
    const chunks: Buffer[] = []
    let received = 0
    let magicOk = false
    for await (const chunk of Readable.fromWeb(req.body as unknown as NodeWebReadableStream<Uint8Array>)) {
      const buf = chunk as Buffer
      received += buf.length
      if (received > MAX_BYTES) {
        return NextResponse.json(
          { error: `File too large for the backup upload path (${(MAX_BYTES / 1024 / 1024).toFixed(1)} MB)` },
          { status: 413 }
        )
      }
      if (!magicOk) magicOk = buf.subarray(0, 2048).toString('latin1').includes('%PDF-')
      chunks.push(buf)
    }
    if (!magicOk) {
      return NextResponse.json({ error: 'That file does not look like a valid PDF' }, { status: 400 })
    }

    const blob = await put(name, Buffer.concat(chunks), {
      access: 'public',
      addRandomSuffix: true,
      contentType: 'application/pdf',
    })

    return NextResponse.json({ url: blob.url, pathname: blob.pathname, size: received })
  } catch (e) {
    console.error('POST /api/documents/blob/relay error', e)
    return NextResponse.json({ error: 'Backup upload failed' }, { status: 500 })
  }
}
