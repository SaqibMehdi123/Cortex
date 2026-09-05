import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

export const maxDuration = 120

// POST /api/documents/pdf — multipart upload of a PDF.
// The ORIGINAL file is kept byte-for-byte on disk (uploads/) so the Reader
// can embed it in a native browser PDF viewer — no formatting loss, images
// intact. Text is additionally extracted (pdf-parse/pdf.js) to power
// highlighting, AI summaries and doc Q&A.
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }
    const name = file.name ?? 'document.pdf'
    if (!name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported right now' }, { status: 400 })
    }
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: 'PDF is larger than 100 MB — use the standard uploader, which streams files up to 200 MB' }, { status: 413 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // pdf-parse v2 is ESM-only and ships pdf.js — dynamic import keeps the
    // Next.js bundler away from it (also declared in serverExternalPackages).
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    let text = ''
    let pages = 0
    let metaTitle = ''
    try {
      const result = await parser.getText()
      text = result.text ?? ''
      pages = result.pages?.length ?? result.total ?? 0
      try {
        const info = await parser.getInfo()
        const rawTitle = (info.info as { Title?: string } | undefined)?.Title
        if (rawTitle && rawTitle.length > 3) metaTitle = rawTitle
      } catch {}
    } finally {
      await parser.destroy().catch(() => {})
    }

    // Clean up pdf.js artifacts: hyphenated line breaks, huge gaps, control chars
    const cleaned = text
      .replace(/\u0000/g, '')
      .replace(/(\w)-\n(\w)/g, '$1$2')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    if (cleaned.length < 40) {
      // Still accept the PDF — the original renders fine in the viewer — but
      // warn that AI features will be limited without extractable text.
      const doc = await createDocument(user.id, buffer, name, {
        title: ((form.get('title') as string | null)?.trim() || name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim()).slice(0, 300),
        author: (form.get('author') as string | null)?.trim() || null,
        tags: (form.get('tags') as string | null)?.trim() || null,
        content: null,
        pageCount: 0,
      })
      return NextResponse.json(
        { document: doc, pages: 0, chars: 0, warning: 'No extractable text (probably a scan) — the original PDF still opens in the viewer, but highlighting & AI Q&A need text.' },
        { status: 201 }
      )
    }

    const tags = (form.get('tags') as string | null)?.trim() || null
    const author = (form.get('author') as string | null)?.trim() || null
    const fallbackTitle = name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim()
    const title = ((form.get('title') as string | null)?.trim() || metaTitle || fallbackTitle).slice(0, 300)

    const document = await createDocument(user.id, buffer, name, {
      title,
      author,
      tags,
      content: cleaned.slice(0, 500000),
      pageCount: pages,
    })

    return NextResponse.json({ document, pages, chars: cleaned.length }, { status: 201 })
  } catch (e) {
    console.error('POST /api/documents/pdf error', e)
    return NextResponse.json({ error: 'PDF extraction failed' }, { status: 500 })
  }
}

// Store the original bytes + create the DB row. Files live in <project>/uploads
// keyed by document id, so they can be streamed back exactly as uploaded.
async function createDocument(
  userId: string,
  buffer: Buffer,
  fileName: string,
  opts: { title: string; author: string | null; tags: string | null; content: string | null; pageCount: number }
) {
  const uploadDir = path.join(process.cwd(), 'uploads')
  await fs.mkdir(uploadDir, { recursive: true })

  const document = await db.document.create({
    data: {
      userId,
      title: opts.title,
      author: opts.author,
      type: 'paper',
      source: null,
      content: opts.content,
      status: 'reading',
      tags: opts.tags ? `pdf,${opts.tags}` : 'pdf',
      pageCount: opts.pageCount || null,
    },
  })

  const safeName = `${document.id}.pdf`
  await fs.writeFile(path.join(uploadDir, safeName), buffer)
  await db.document.update({
    where: { id: document.id },
    data: { filePath: safeName, fileName, fileSize: buffer.length },
  })

  return { ...document, filePath: safeName, fileName, fileSize: buffer.length }
}
