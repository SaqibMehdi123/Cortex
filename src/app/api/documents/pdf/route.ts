import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const maxDuration = 120

// POST /api/documents/pdf — multipart upload of a PDF; real text extraction
// with pdf-parse (pdf.js). The extracted text powers highlighting, AI
// summaries and doc Q&A in the Reader.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }
    const name = file.name ?? 'document.pdf'
    if (!name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported right now' }, { status: 400 })
    }
    if (file.size > 30 * 1024 * 1024) {
      return NextResponse.json({ error: 'PDF is larger than 30 MB' }, { status: 400 })
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
      return NextResponse.json(
        {
          error:
            'No extractable text found — this PDF is probably a scan of images. OCR is not supported yet; try a text-based PDF or paste the text manually.',
        },
        { status: 422 }
      )
    }

    const tags = (form.get('tags') as string | null)?.trim() || null
    const author = (form.get('author') as string | null)?.trim() || null
    const fallbackTitle = name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim()
    const title = ((form.get('title') as string | null)?.trim() || metaTitle || fallbackTitle).slice(0, 300)

    const document = await db.document.create({
      data: {
        title,
        author,
        type: 'paper',
        source: null,
        content: cleaned.slice(0, 500000),
        status: 'reading',
        tags: tags ? `pdf,${tags}` : 'pdf',
      },
    })

    return NextResponse.json({ document, pages, chars: cleaned.length }, { status: 201 })
  } catch (e) {
    console.error('POST /api/documents/pdf error', e)
    return NextResponse.json({ error: 'PDF extraction failed' }, { status: 500 })
  }
}
