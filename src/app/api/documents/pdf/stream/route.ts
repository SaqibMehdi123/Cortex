import { NextRequest, NextResponse } from 'next/server'
import { createWriteStream, promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import type { ReadableStream as NodeWebReadableStream } from 'stream/web'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

export const maxDuration = 300

// 200 MB upload ceiling, enforced WHILE streaming (the request is aborted and
// the partial file deleted the moment it is exceeded — memory stays flat).
const MAX_BYTES = 200 * 1024 * 1024
// Text extraction is best-effort: beyond 100 MB the parse can take minutes and
// hog memory, so the PDF is stored as-is (the viewer works) without text.
const EXTRACT_LIMIT = 100 * 1024 * 1024
const LARGE_EXTRACT_BUDGET_MS = 120_000
const DEFAULT_EXTRACT_BUDGET_MS = 60_000

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
    let text = ''
    let pages = 0
    let metaTitle = ''
    let warning: string | undefined

    if (received > EXTRACT_LIMIT) {
      warning = 'This PDF is very large — it was stored as-is and opens in the viewer, but text extraction was skipped (no highlighting or AI Q&A for this one).'
      console.log(`Skipping text extraction for large upload (${(received / 1024 / 1024).toFixed(1)} MB)`)
    } else {
      const started = Date.now()
      try {
        // pdf-parse v2 is ESM-only and ships pdf.js — dynamic import keeps the
        // Next.js bundler away from it (also declared in serverExternalPackages).
        const { PDFParse } = await import('pdf-parse')
        const data = await fs.readFile(tmpPath)
        const parser = new PDFParse({ data: new Uint8Array(data) })
        const budgetMs = received > 30 * 1024 * 1024 ? LARGE_EXTRACT_BUDGET_MS : DEFAULT_EXTRACT_BUDGET_MS
        try {
          const extract = parser.getText()
          extract.catch(() => {}) // a timeout cancel must not become an unhandled rejection
          const result = await Promise.race([
            extract,
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error('TEXT_TIMEOUT')), budgetMs)),
          ])
          text = (result as { text?: string }).text ?? ''
          pages = (result as { pages?: unknown[]; total?: number }).pages?.length
            ?? (result as { total?: number }).total ?? 0
          try {
            const info = await parser.getInfo()
            const rawTitle = (info.info as { Title?: string } | undefined)?.Title
            if (rawTitle && rawTitle.length > 3) metaTitle = rawTitle
          } catch {}
        } finally {
          await parser.destroy().catch(() => {})
        }
      } catch (err) {
        const ms = Date.now() - started
        const timedOut = (err as Error).message === 'TEXT_TIMEOUT'
        console.warn(`Text extraction gave up after ${ms}ms (timeout=${timedOut}):`, (err as Error).message)
        // Still accept the PDF — the original renders fine in the viewer.
        warning = timedOut
          ? 'This PDF is very large, so text extraction was stopped to finish the upload — the file opens fine in the viewer, but highlighting & AI Q&A are unavailable for it.'
          : 'No extractable text (probably a scan) — the original PDF still opens in the viewer, but highlighting & AI Q&A need text.'
      }
    }

    // Clean up pdf.js artifacts: hyphenated line breaks, huge gaps, control chars
    const cleaned = text
      .replace(/\u0000/g, '')
      .replace(/(\w)-\n(\w)/g, '$1$2')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
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
