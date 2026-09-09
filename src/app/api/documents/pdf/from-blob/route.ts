import { NextRequest, NextResponse } from 'next/server'
import { head } from '@vercel/blob'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { cleanPdfText, extractPdfText } from '@/lib/pdf-extract'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 200 * 1024 * 1024

// POST /api/documents/pdf/from-blob
// Second half of the direct-to-Blob upload flow: the browser has already PUT
// the PDF to Vercel Blob (via /api/documents/upload-url), and this route now
// records the document — fetching the bytes back server-side once for text
// extraction. Auth is enforced here, and the blob URL never reaches other
// users: PDFs are always served through the auth-checked [id]/file route.
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

    const fallbackTitle = name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || name
    const title = (body?.title?.trim() || metaTitle || fallbackTitle).slice(0, 300)
    const author = body?.author?.trim() || null
    const tags = body?.tags?.trim() || null

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
