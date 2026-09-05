import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

export const maxDuration = 120

// GET /api/documents?q=&status=&tag= — the signed-in user's library
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim()
    const status = searchParams.get('status')?.trim()
    const tag = searchParams.get('tag')?.trim()

    const where: Record<string, unknown> = { userId: user.id }
    if (status && status !== 'all') where.status = status
    if (tag) where.tags = { contains: tag }
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { author: { contains: q } },
        { tags: { contains: q } },
        { summary: { contains: q } },
      ]
    }

    const documents = await db.document.findMany({
      where,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      select: {
        id: true, title: true, author: true, type: true, source: true,
        status: true, progress: true, tags: true, summary: true,
        filePath: true, fileName: true, fileSize: true, pageCount: true,
        lastReadAt: true, createdAt: true, updatedAt: true,
      },
    })

    return NextResponse.json({ documents })
  } catch (e) {
    console.error('GET /api/documents error', e)
    return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 })
  }
}

// POST /api/documents — create (manual, paste, or URL with server-side extraction).
// A URL that serves a PDF (e.g. https://arxiv.org/pdf/1706.03762) is downloaded
// and stored byte-for-byte so the Reader opens it in the embedded native PDF
// viewer — original layout, figures and fonts intact. Text is additionally
// extracted (pdf-parse) to power highlights, summaries and doc Q&A.
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const { title, author, type, source, notes, content, status, progress, tags, autoExtract } = body

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    // ── Remote PDF import ────────────────────────────────────────────
    if (autoExtract && source && /^https?:\/\//.test(source) && !content) {
      const pdf = await tryDownloadPdfFromUrl(source.trim())
      if (pdf) {
        const document = await createPdfDocument(user.id, pdf.buffer, pdf.fileName, {
          requestedTitle: title.trim() !== source.trim() ? title.trim() : null,
          author: author?.trim() || null,
          tags: tags?.trim() || null,
          sourceUrl: source.trim(),
        })
        return NextResponse.json({ document, pages: document.pageCount ?? 0, warning: document.pageCount ? undefined : 'No extractable text (probably a scan) — the original PDF still opens in the viewer.' }, { status: 201 })
      }
    }

    // ── Web article extraction ───────────────────────────────────────
    let extracted: { title?: string; content?: string } = {}
    if (autoExtract && source && /^https?:\/\//.test(source) && !content) {
      try {
        const res = await fetch(source, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CortexReader/1.0)' },
          signal: AbortSignal.timeout(12000),
        })
        const html = await res.text()
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
        const bodyText = html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
          .replace(/<header[\s\S]*?<\/header>/gi, ' ')
          .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, ' ')
          .trim()
        if (bodyText.length > 400) extracted.content = bodyText.slice(0, 200000)
        if ((!title || title === source) && titleMatch?.[1]) {
          extracted.title = titleMatch[1].replace(/\s+/g, ' ').trim().slice(0, 300)
        }
      } catch (err) {
        console.error('URL extraction failed', err)
      }
    }

    const document = await db.document.create({
      data: {
        userId: user.id,
        title: (extracted.title || title).trim(),
        author: author?.trim() || null,
        type: type || (source ? 'url' : 'text'),
        source: source?.trim() || null,
        notes: notes || null,
        content: content || extracted.content || null,
        status: status || 'reading',
        progress: typeof progress === 'number' ? Math.min(100, Math.max(0, Math.round(progress))) : 0,
        tags: tags?.trim() || null,
      },
    })

    return NextResponse.json({ document }, { status: 201 })
  } catch (e) {
    console.error('POST /api/documents error', e)
    return NextResponse.json({ error: 'Failed to create document' }, { status: 500 })
  }
}

// ─── Remote PDF helpers ────────────────────────────────────────────────

// Candidate URLs to try for a PDF download. arXiv "abs" links are promoted to
// their /pdf/ equivalent so both /abs/1706.03762 and /pdf/1706.03762 work.
function pdfCandidateUrls(rawUrl: string): string[] {
  try {
    const url = new URL(rawUrl)
    const host = url.hostname.replace(/^www\./, '')
    if (host === 'arxiv.org' || host === 'export.arxiv.org') {
      const m = url.pathname.match(/\/(?:abs|pdf)\/(.+?)(?:\.pdf)?\/?$/)
      if (m?.[1]) return [`${url.origin}/pdf/${m[1]}`, rawUrl]
    }
  } catch {}
  return [rawUrl]
}

// Download the bytes behind a URL if it serves a real PDF.
// Detection: content-type, .pdf path, known /pdf/ patterns — then the %PDF-
// magic number is verified so HTML error pages never slip through.
async function tryDownloadPdfFromUrl(rawUrl: string): Promise<{ buffer: Buffer; fileName: string } | null> {
  for (const candidate of pdfCandidateUrls(rawUrl)) {
    try {
      let pathname = ''
      try { pathname = new URL(candidate).pathname } catch {}
      const looksPdf = /\.pdf(?:$|[?#])/i.test(candidate) || /\/pdf\//i.test(candidate)
      const res = await fetch(candidate, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          Accept: 'application/pdf,text/html,*/*',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(90000),
      })
      if (!res.ok) continue
      const ctype = (res.headers.get('content-type') || '').toLowerCase()
      if (!ctype.includes('pdf') && !looksPdf) continue
      const buffer = Buffer.from(await res.arrayBuffer())
      if (buffer.length < 100 || buffer.length > 100 * 1024 * 1024) continue
      if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') continue
      const fileName = fileNameFromUrl(candidate, pathname)
      return { buffer, fileName }
    } catch {
      // try next candidate / fall back to HTML extraction
    }
  }
  return null
}

function fileNameFromUrl(candidate: string, pathname: string): string {
  try {
    const last = decodeURIComponent((pathname || new URL(candidate).pathname).split('/').filter(Boolean).pop() || '')
    const base = (last || 'document').replace(/\.pdf$/i, '')
    return `${base.slice(0, 80) || 'document'}.pdf`
  } catch {
    return 'document.pdf'
  }
}

function prettyTitleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').replace(/v\d+$/i, '').trim()
  return (base || fileName).slice(0, 300)
}

// Ask the arXiv Atom API for the paper's real title (arXiv PDFs themselves
// usually have no Title metadata and begin with copyright boilerplate).
async function fetchArxivTitle(arxivId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`, {
      headers: { 'User-Agent': 'CortexReader/1.0 (personal knowledge manager)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const xml = await res.text()
    const entryStart = xml.indexOf('<entry>')
    const scoped = entryStart >= 0 ? xml.slice(entryStart) : xml
    const m = scoped.match(/<title>([\s\S]*?)<\/title>/i)
    if (!m) return null
    const title = m[1].replace(/\s+/g, ' ').trim()
    return title.length >= 4 ? title.slice(0, 300) : null
  } catch {
    return null
  }
}

// Store the original bytes + create the DB row (same pipeline as the
// /api/documents/pdf upload route, so URL imports get the embedded viewer).
async function createPdfDocument(
  userId: string,
  buffer: Buffer,
  fileName: string,
  opts: { requestedTitle: string | null; author: string | null; tags: string | null; sourceUrl: string | null }
) {
  // pdf-parse v2 is ESM-only — dynamic import keeps it out of the bundler
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

  const cleaned = text
    .replace(/\u0000/g, '')
    .replace(/(\w)-\n(\w)/g, '$1$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // arXiv ids make a decent fallback title when metadata is missing
  let fallbackTitle = prettyTitleFromFileName(fileName)
  const arxivMatch = opts.sourceUrl?.match(/arxiv\.org\/(?:abs|pdf)\/(.+?)(?:\.pdf)?(?:[?#].*)?$/i)
  if (arxivMatch?.[1]) fallbackTitle = `arXiv: ${arxivMatch[1]}`

  // arXiv PDFs usually carry no Title metadata and start with copyright
  // boilerplate — get the real title from the arXiv Atom API instead.
  let arxivTitle: string | null = null
  if (!opts.requestedTitle && !metaTitle && arxivMatch?.[1]) {
    arxivTitle = await fetchArxivTitle(arxivMatch[1])
  }

  const title = (opts.requestedTitle || metaTitle || arxivTitle || fallbackTitle).slice(0, 300)
  const hasText = cleaned.length >= 40

  const uploadDir = path.join(process.cwd(), 'uploads')
  await fs.mkdir(uploadDir, { recursive: true })

  const document = await db.document.create({
    data: {
      userId,
      title,
      author: opts.author,
      type: 'paper',
      source: opts.sourceUrl,
      content: hasText ? cleaned.slice(0, 500000) : null,
      status: 'reading',
      tags: opts.tags ? `pdf,${opts.tags}` : 'pdf',
      pageCount: pages || null,
    },
  })

  const safeName = `${document.id}.pdf`
  await fs.writeFile(path.join(uploadDir, safeName), buffer)
  await db.document.update({
    where: { id: document.id },
    data: { filePath: safeName, fileName, fileSize: buffer.length },
  })

  return { ...document, filePath: safeName, fileName, fileSize: buffer.length, pageCount: pages || null }
}
