import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { cleanPdfText, EXTRACT_LIMIT, extractPdfText } from '@/lib/pdf-extract'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/documents/[id]/extract
// Background text extraction for LARGE cloud-stored PDFs. The import route
// (from-blob) records books above 30 MB immediately without parsing them, so
// a 300-page textbook can never fail (or time out) the upload itself. The
// client fires this route right after the import succeeds; it does the heavy
// work in its own 60-second budget and PATCHes the document when done.
//
// Idempotent: if the document already has extractable text it returns without
// re-parsing. A scan (no text layer) or a parse that gives up simply leaves
// the document viewer-only — exactly like the inline path's best-effort
// behaviour. Only the owner's own documents are reachable.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const doc = await db.document.findFirst({
      where: { id, userId: user.id },
      select: { filePath: true, fileName: true, content: true, pageCount: true },
    })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!doc.filePath) {
      return NextResponse.json({ error: 'No file attached to this document' }, { status: 400 })
    }
    if (!doc.filePath.startsWith('https://')) {
      return NextResponse.json(
        { error: 'Background extraction is only available for cloud-stored documents' },
        { status: 400 }
      )
    }

    // Already extracted on import — nothing to do.
    if ((doc.content ?? '').length >= 40) {
      return NextResponse.json({ ok: true, skipped: true, chars: doc.content!.length })
    }

    // Refuse to buffer anything beyond the extraction limit straight away.
    const probe = await fetch(doc.filePath, { method: 'GET', headers: { Range: 'bytes=0-2047' } }).catch(() => null)
    const totalRaw = probe?.headers.get('content-range') // "bytes 0-2047/123456789"
    const total = totalRaw ? Number(totalRaw.split('/')[1]) : NaN
    if (Number.isFinite(total) && total > EXTRACT_LIMIT) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        warning: 'This PDF is very large — it opens in the viewer, but text extraction was skipped (no highlighting or AI Q&A for this one).',
      })
    }

    const res = await fetch(doc.filePath).catch(() => null)
    if (!res || !res.ok) {
      return NextResponse.json({ error: 'Could not read the stored file' }, { status: 502 })
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.subarray(0, 2048).toString('latin1').includes('%PDF-')) {
      return NextResponse.json({ error: 'The stored file is not a valid PDF' }, { status: 400 })
    }

    const { text, pages, totalPages, warning, partial } = await extractPdfText(new Uint8Array(buf), buf.length)
    const cleaned = cleanPdfText(text)
    const hasText = cleaned.length >= 40

    await db.document.update({
      where: { id },
      data: {
        ...(hasText ? { content: cleaned.slice(0, 500000) } : {}),
        ...(!doc.pageCount && (totalPages || pages) ? { pageCount: totalPages || pages } : {}),
      },
    })

    return NextResponse.json({ ok: true, chars: cleaned.length, pages: totalPages || pages, partial, warning })
  } catch (e) {
    console.error('POST /api/documents/[id]/extract error', e)
    return NextResponse.json({ error: 'Text extraction failed' }, { status: 500 })
  }
}
