import { NextRequest, NextResponse } from 'next/server'
import { createReadStream, promises as fs } from 'fs'
import path from 'path'
import { Readable } from 'stream'
import type { ReadableStream as NodeWebReadableStream } from 'stream/web'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// GET /api/documents/[id]/file — stream the ORIGINAL uploaded PDF back to the
// browser so it can be rendered by the native PDF viewer inside an iframe
// (exact layout, fonts and images — nothing re-flowed). Same-origin, so the
// viewer renders without any CORS or X-Frame-Options trouble.
// The file is piped from disk in chunks (never fully loaded into memory), so
// even 100 MB+ PDFs open without a memory spike.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    // filePath is server-generated (<id>.pdf) — strip anything path-like anyway
    const safeName = path.basename(doc.filePath)
    const abs = path.join(process.cwd(), 'uploads', safeName)
    const stat = await fs.stat(abs).catch(() => null)
    if (!stat?.isFile()) {
      return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
    }

    const nodeStream = createReadStream(abs)
    return new NextResponse(Readable.toWeb(nodeStream) as NodeWebReadableStream<Uint8Array>, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(stat.size),
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc.fileName ?? 'document.pdf')}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (e) {
    console.error('GET /api/documents/[id]/file error', e)
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
  }
}
