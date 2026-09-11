import { NextRequest, NextResponse } from 'next/server'
import { head } from '@vercel/blob'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { cleanPdfText, extractPdfText } from '@/lib/pdf-extract'

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
// Second half of the direct-to-Blob upload flow: the browser has already PUT
// the PDF to Vercel Blob (via /api/documents/upload-url), and this route now
// records the document. Auth is enforced here, and the blob URL never reaches
// other users: PDFs are always served through the auth-checked [id]/file route.
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
      name?: string
      title?: string
      author?: string
      tags?: string
    } | null

    const blobUrl = body?.blobUrl
    const name = (body?.name || 'document.pdf').replace(/[\r\n"\\]/g, '').slice(0, 200) || 'document.pdf'
    if (!blobUrl || typeof blobUrl !== 'string') {
      return NextResponse.json({ error: 'Missing blobUrl' }, { status: 400 })
    }

    // Only accept URLs on the Vercel Blob public host — never fetch arbitrary
    // URLs server-side (SSRF guard).
    let parsed: URL
    try {
      parsed = new URL(blobUrl)
    } catch {
      return NextResponse.json({ error: 'Invalid blobUrl' }, { status: 400 })
    }
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.public.blob.vercel-storage.com')) {
      return NextResponse.json({ error: 'Not a Vercel Blob URL' }, { status: 400 })
    }

    const meta = await head(blobUrl).catch(() => null)
    if (!meta) {
      return NextResponse.json({ error: 'Uploaded file not found in Blob storage' }, { status: 404 })
    }
    if (meta.size > MAX_BYTES) {
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
    if (meta.size > INLINE_EXTRACT_MAX_BYTES) {
      const headRes = await fetch(blobUrl, { headers: { Range: 'bytes=0-2047' } }).catch(() => null)
      const head1k = headRes?.ok ? Buffer.from(await headRes.arrayBuffer()).toString('latin1') : ''
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
          filePath: blobUrl,
          fileName: name,
          fileSize: meta.size,
        },
      })

      return NextResponse.json(
        { document, pages: 0, chars: 0, warning: PENDING_WARNING, extractPending: true },
        { status: 201 }
      )
    }

    // ── Small/medium PDFs: the original inline path ──────────────────────
    const res = await fetch(blobUrl)
    if (!res.ok) {
      return NextResponse.json({ error: 'Could not read the uploaded file' }, { status: 400 })
    }
    const buf = Buffer.from(await res.arrayBuffer())
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
        filePath: blobUrl,
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
