import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { db } from '@/lib/db'

// GET /api/documents/[id]/file — stream the ORIGINAL uploaded PDF back to the
// browser so it can be rendered by the native PDF viewer inside an iframe
// (exact layout, fonts and images — nothing re-flowed). Same-origin, so the
// viewer renders without any CORS or X-Frame-Options trouble.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const doc = await db.document.findUnique({ where: { id }, select: { filePath: true, fileName: true, fileSize: true } })
    if (!doc?.filePath) {
      return NextResponse.json({ error: 'No file attached to this document' }, { status: 404 })
    }
    // filePath is server-generated (<id>.pdf) — strip anything path-like anyway
    const safeName = path.basename(doc.filePath)
    const abs = path.join(process.cwd(), 'uploads', safeName)
    const data = await fs.readFile(abs)

    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(data.length),
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc.fileName ?? 'document.pdf')}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (e) {
    console.error('GET /api/documents/[id]/file error', e)
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
  }
}
