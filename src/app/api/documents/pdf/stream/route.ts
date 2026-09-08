import { NextRequest, NextResponse } from 'next/server'
import { createWriteStream, promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import type { ReadableStream as NodeWebReadableStream } from 'stream/web'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { EXTRACT_LIMIT, cleanPdfText, extractPdfText } from '@/lib/pdf-extract'

export const maxDuration = 300

// 200 MB upload ceiling, enforced WHILE streaming (the request is aborted and
// the partial file deleted the moment it is exceeded — memory stays flat).
const MAX_BYTES = 200 * 1024 * 1024

// POST /api/documents/pdf/stream?name=&title=&author=&tags=
// The request BODY is the raw PDF (Content-Type: application/pdf). It is
// piped chunk-by-chunk to disk, so 100 MB+ files upload with flat memory
// usage — unlike multipart form-data parsing, which buffers everything.
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { searchParams } = new URL(req.url)
    const name = (searchParams.get('name') || 'document.pdf').replace(/[\r\n"\\]/g, '').slice(0, 200) || 'document.pdf'
    const titleParam = searchParams.get('title')?.trim() || null
    const author = searchParams.get('author')?.trim() || null
    const tags = searchParams.get('tags')?.trim() || null

    if (!name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are supported right now' }, { status: 400 })
    }
    if (!req.body) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const uploadDir = path.join(process.cwd(), 'uploads')
    await fs.mkdir(uploadDir, { recursive: true })
    const tmpPath = path.join(uploadDir, `incoming-${randomUUID()}.part`)

    // ── Stream body → disk, one small chunk at a time ───────────────────
    // A guard transform tracks the byte count (to enforce the cap) and peeks
    // at the first bytes (to verify the %PDF- magic number).
    let received = 0
    let magicOk = false
    const guard = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        received += chunk.length
        if (received > MAX_BYTES) {
          cb(new Error('FILE_TOO_LARGE'))
          return
        }
        if (!magicOk) magicOk = chunk.subarray(0, 2048).toString('latin1').includes('%PDF-')
        cb(null, chunk)
      },
    })

    try {
      await pipeline(
        Readable.fromWeb(req.body as NodeWebReadableStream<Uint8Array>),
        guard,
        createWriteStream(tmpPath)
      )
    } catch (err) {
      await fs.unlink(tmpPath).catch(() => {})
      if ((err as Error).message === 'FILE_TOO_LARGE') {
        return NextResponse.json(
          { error: `PDF is larger than ${MAX_BYTES / (1024 * 1024)} MB — that is the current limit` },
          { status: 413 }
        )
      }
      if ((err as Error).name === 'AbortError') {
        return NextResponse.json({ error: 'Upload aborted' }, { status: 400 })
      }
      throw err
    }

    if (!magicOk) {
      await fs.unlink(tmpPath).catch(() => {})
      return NextResponse.json({ error: 'That file does not look like a valid PDF' }, { status: 400 })
    }

    // ── Best-effort text extraction (powers highlights & doc Q&A) ───────
    const { text, pages, metaTitle, warning } =
      received > EXTRACT_LIMIT
        ? {
            text: '',
            pages: 0,
            metaTitle: '',
            warning:
              'This PDF is very large — it was stored as-is and opens in the viewer, but text extraction was skipped (no highlighting or AI Q&A for this one).',
          }
        : await extractPdfText(new Uint8Array(await fs.readFile(tmpPath)), received)

    const cleaned = cleanPdfText(text)
    const hasText = cleaned.length >= 40

    const fallbackTitle = name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || name
    const title = (titleParam || metaTitle || fallbackTitle).slice(0, 300)

    const document = await db.document.create({
      data: {
        userId: user.id,
        title,
        author,
        type: 'paper',
        source: null,
        content: hasText ? cleaned.slice(0, 500000) : null,
        status: 'reading',
        tags: tags ? `pdf,${tags}` : 'pdf',
        pageCount: pages || null,
      },
    })

    // Move the streamed temp file to its final id-keyed name, then record it.
    const safeName = `${document.id}.pdf`
    await fs.rename(tmpPath, path.join(uploadDir, safeName))
    await db.document.update({
      where: { id: document.id },
      data: { filePath: safeName, fileName: name, fileSize: received },
    })

    return NextResponse.json(
      {
        document: { ...document, filePath: safeName, fileName: name, fileSize: received },
        pages,
        chars: cleaned.length,
        warning,
      },
      { status: 201 }
    )
  } catch (e) {
    console.error('POST /api/documents/pdf/stream error', e)
    return NextResponse.json({ error: 'PDF upload failed' }, { status: 500 })
  }
}
