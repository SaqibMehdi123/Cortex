import { NextRequest, NextResponse } from 'next/server'
import { createReadStream, promises as fs } from 'fs'
import path from 'path'
import { Readable } from 'stream'
import type { ReadableStream as NodeWebReadableStream } from 'stream/web'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { parseStorageRef, presignR2Download } from '@/lib/storage'

// GET /api/documents/[id]/file — stream the ORIGINAL uploaded PDF back to the
// browser so it can be rendered by the PDF viewer (pdf.js canvas renderer).
// Same-origin route, auth-checked — storage refs are never shared beyond the
// owner's own browser session.
//
// Per backend:
//   r2://…   → 302 to a short-lived (5 min) presigned GET on the private R2
//              bucket. The owner's browser downloads straight from R2, so a
//              100 MB book costs zero function time and Range seeking is
//              handled natively by S3. The bucket needs one CORS rule for the
//              app origin (see docs/R2-SETUP.md) because the viewer's fetch
//              follows the redirect cross-origin.
//   blob URL → proxy the bytes through this function (the public blob URL is
//              never revealed), forwarding Range headers so the viewer can
//              seek without re-downloading whole books.
//   disk     → stream from uploads/ (local dev / VPS).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { id } = await params
    const doc = await db.document.findFirst({
      where: { id, userId: user.id },
      select: { filePath: true, fileName: true, fileSize: true },
    })
    if (!doc?.filePath) {
      return NextResponse.json({ error: 'No file attached to this document' }, { status: 404 })
    }

    const ref = parseStorageRef(doc.filePath)
    const disposition = `inline; filename="${encodeURIComponent(doc.fileName ?? 'document.pdf')}"`

    // ── Cloudflare R2: redirect to a presigned download ──────────────────
    if (ref.kind === 'r2') {
      try {
        const signedUrl = await presignR2Download(ref.key, doc.fileName)
        return NextResponse.redirect(signedUrl, {
          status: 302,
          headers: { 'Cache-Control': 'private, no-store' },
        })
      } catch (e) {
        console.error('GET /api/documents/[id]/file r2 presign error', e)
        return NextResponse.json({ error: 'Could not open the stored file' }, { status: 502 })
      }
    }

    // ── Vercel Blob: proxy (Range-aware) ─────────────────────────────────
    if (ref.kind === 'blob') {
      const range = req.headers.get('range')
      const upstream = await fetch(ref.url, {
        ...(range ? { headers: { Range: range } } : {}),
      }).catch(() => null)
      if (!upstream || !upstream.ok || !upstream.body) {
        return NextResponse.json({ error: 'File not found in storage' }, { status: 404 })
      }
      return new NextResponse(upstream.body as unknown as BodyInit, {
        status: upstream.status,
        headers: {
          'Content-Type': 'application/pdf',
          ...(upstream.headers.get('content-length')
            ? { 'Content-Length': upstream.headers.get('content-length')! }
            : {}),
          ...(upstream.headers.get('content-range')
            ? { 'Content-Range': upstream.headers.get('content-range')! }
            : {}),
          'Accept-Ranges': 'bytes',
          'Content-Disposition': disposition,
          'Cache-Control': 'private, max-age=3600',
        },
      })
    }

    // ── Local disk (legacy / dev mode) ───────────────────────────────────
    if (ref.kind === 'disk') {
      const safeName = path.basename(ref.name)
      const abs = path.join(process.cwd(), 'uploads', safeName)
      const stat = await fs.stat(abs).catch(() => null)
      if (!stat?.isFile()) {
        return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
      }

      const nodeStream = createReadStream(abs)
      return new NextResponse(Readable.toWeb(nodeStream) as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(stat.size),
          'Content-Disposition': disposition,
          'Cache-Control': 'private, max-age=3600',
        },
      })
    }

    return NextResponse.json({ error: 'No readable file attached to this document' }, { status: 404 })
  } catch (e) {
    console.error('GET /api/documents/[id]/file error', e)
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
  }
}
