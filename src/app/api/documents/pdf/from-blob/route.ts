import { NextRequest, NextResponse } from 'next/server'
import { head } from '@vercel/blob'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { cleanPdfText, extractPdfText } from '@/lib/pdf-extract'
import { parseStorageRef, r2GetBuffer, r2GetRange, r2Head } from '@/lib/storage'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 200 * 1024 * 1024
// Books bigger than this skip text extraction on the import critical path.
// Rationale: a 100+ MB textbook can blow both the 60s serverless budget and
// the memory limit when parsed inline — and a failed import means the document
// never lands at all. Instead the row is created immediately (viewer works off
// the stored file) and extraction is finished by POST /api/documents/[id]/extract.
const INLINE_EXTRACT_MAX_BYTES = 30 * 1024 * 1024

const PENDING_WARNING =
  'This is a large book — it was stored and opens in the viewer right away. Text extraction for highlights & AI continues in the background.'

// POST /api/documents/pdf/from-blob
// Second half of the direct-to-storage upload flow: the browser has already
// PUT the PDF to Vercel Blob (upload-url token flow) or Cloudflare R2
// (presigned PUT), and this route records the document. Auth is enforced
// here, and storage refs never reach other users: PDFs are always served
// through the auth-checked [id]/file route.
//
// The client sends one of:
//   { blobUrl }    — a Vercel Blob URL (*.public.blob.vercel-storage.com)
//   { storageRef } — an r2://<key> reference issued by upload-url (R2 mode)
// A stray absolute URL in storageRef is rejected — object keys are never
// fetched as URLs (SSRF-safe by construction).
//
// Sized for large books: nothing above 30 MB is ever fully downloaded here.
// Small/medium PDFs are extracted inline (unchanged behaviour); big ones are
// recorded instantly — magic bytes verified via a 2 KB Range request — and
// their text extraction is picked up by the dedicated /extract route.
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json().catch(() => null) as {
      blobUrl?: string
      storageRef?: string
      name?: string
      title?: string
      author?: string
      tags?: string
    } | null

    const rawRef = body?.storageRef || body?.blobUrl
    const name = (body?.name || 'document.pdf').replace(/[\r\n"\\]/g, '').slice(0, 200) || 'document.pdf'
    if (!rawRef || typeof rawRef !== 'string') {
      return NextResponse.json({ error: 'Missing storage reference' }, { status: 400 })
    }
    const parsedRef = parseStorageRef(rawRef)

    // Existence + size, per backend — without downloading the file.
    let size: number | null = null
    if (parsedRef.kind === 'blob') {
      const meta = await head(parsedRef.url).catch(() => null)
      if (!meta) {
        return NextResponse.json({ error: 'Uploaded file not found in Blob storage' }, { status: 404 })
      }
      size = meta.size
    } else if (parsedRef.kind === 'r2') {
      const meta = await r2Head(parsedRef.key).catch(() => null)
      if (!meta?.exists) {
        return NextResponse.json({ error: 'Uploaded file not found in storage' }, { status: 404 })
      }
      size = meta.size
    } else {
      return NextResponse.json({ error: 'Unrecognised storage reference' }, { status: 400 })
    }

    if (size === null || size > MAX_BYTES) {
      return NextResponse.json(
        { error: `PDF is larger than ${MAX_BYTES / (1024 * 1024)} MB — that is the current limit` },
        { status: 413 }
      )
    }

    const fallbackTitle = name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || name
    const title = (body?.title?.trim() || fallbackTitle).slice(0, 300)
    const author = body?.author?.trim() || null
    const tags = body?.tags?.trim() || null

    // ── Large books: record now, extract later (never buffer the bytes) ──
    if (size > INLINE_EXTRACT_MAX_BYTES) {
      // 2 KB probe for the %PDF- magic number — per backend.
      let head1k = ''
      if (parsedRef.kind === 'blob') {
        const headRes = await fetch(parsedRef.url, { headers: { Range: 'bytes=0-2047' } }).catch(() => null)
        head1k = headRes?.ok ? Buffer.from(await headRes.arrayBuffer()).toString('latin1') : ''
      } else {
        const range = await r2GetRange(parsedRef.key, 0, 2047).catch(() => null)
        head1k = range ? range.toString('latin1') : ''
      }
      if (!head1k.includes('%PDF-')) {
        return NextResponse.json({ error: 'That file does not look like a valid PDF' }, { status: 400 })
      }

      const document = await db.document.create({
        data: {
          userId: user.id,
          title,
          author,
          type: 'paper',
          source: null,
          content: null,
          status: 'reading',
          tags: tags ? `pdf,${tags}` : 'pdf',
          pageCount: null,
          filePath: rawRef,
          fileName: name,
          fileSize: size,
        },
      })

      return NextResponse.json(
        { document, pages: 0, chars: 0, warning: PENDING_WARNING, extractPending: true },
        { status: 201 }
      )
    }

    // ── Small/medium PDFs: the original inline path ──────────────────────
    let buf: Buffer | null = null
    if (parsedRef.kind === 'blob') {
      const res = await fetch(parsedRef.url).catch(() => null)
      if (!res || !res.ok) {
        return NextResponse.json({ error: 'Could not read the uploaded file' }, { status: 400 })
      }
      buf = Buffer.from(await res.arrayBuffer())
    } else {
      buf = await r2GetBuffer(parsedRef.key).catch(() => null)
      if (!buf) {
        return NextResponse.json({ error: 'Could not read the uploaded file' }, { status: 400 })
      }
    }
    if (!buf.subarray(0, 2048).toString('latin1').includes('%PDF-')) {
      return NextResponse.json({ error: 'That file does not look like a valid PDF' }, { status: 400 })
    }

    // ── Best-effort text extraction (powers highlights & doc Q&A) ───────
    // Batched page-by-page with a deadline — large books keep whatever was
    // extracted in time (partial: true) instead of the whole import dying.
    const { text, pages, totalPages, metaTitle, warning, partial } = await extractPdfText(
      new Uint8Array(buf),
      buf.length
    )
    const cleaned = cleanPdfText(text)
    const hasText = cleaned.length >= 40

    const finalTitle = (body?.title?.trim() || metaTitle || fallbackTitle).slice(0, 300)

    const document = await db.document.create({
      data: {
        userId: user.id,
        title: finalTitle,
        author,
        type: 'paper',
        source: null,
        content: hasText ? cleaned.slice(0, 500000) : null,
        status: 'reading',
        tags: tags ? `pdf,${tags}` : 'pdf',
        pageCount: totalPages || pages || null,
        filePath: rawRef,
        fileName: name,
        fileSize: buf.length,
      },
    })

    return NextResponse.json(
      { document, pages: totalPages || pages, chars: cleaned.length, warning, partial },
      { status: 201 }
    )
  } catch (e) {
    console.error('POST /api/documents/pdf/from-blob error', e)
    return NextResponse.json({ error: 'PDF import failed' }, { status: 500 })
  }
}
