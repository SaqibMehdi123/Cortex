// Shared PDF text extraction used by both upload paths (streamed-to-disk and
// direct-to-blob). Best-effort by design: a PDF that yields no text (scan) or
// runs out of its time budget mid-parse is still stored and opens in the
// viewer — highlighting and AI Q&A simply cover whatever was extracted.
//
// Large books used to be all-or-nothing: one getText() call raced a single
// timeout that (for >30 MB files) exceeded the function's own 60 s window, so
// Vercel killed the import outright and NO document was created. Extraction
// is now batched page-by-page against a deadline that always fits the
// function window — whatever was parsed before the deadline is kept, the
// document is always recorded, and the viewer still renders the original PDF.

export const EXTRACT_LIMIT = 100 * 1024 * 1024

// ── pdf.js node globals ────────────────────────────────────────────────────
// pdf-parse bundles pdfjs-dist 5.x, which expects a handful of browser
// globals. It normally gets them from its native @napi-rs/canvas dependency —
// but that binary does not survive Vercel's serverless module tracing, so in
// production the module fails to even LOAD: "ReferenceError: DOMMatrix is not
// defined" (verified live via /api/ops/url-import-probe). Text extraction is
// pure JS — canvas is only needed for rendering, which we never do server-side
// — so minimal guarded stubs are enough. They only fill what's missing and
// never override real implementations (browsers, full Node installs).
type PdfJsGlobal = Record<string, unknown>

class StubDOMMatrix {
  a = 1
  b = 0
  c = 0
  d = 1
  e = 0
  f = 0
  constructor(init?: number[] | string) {
    if (Array.isArray(init) && init.length >= 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init as number[]
    }
  }
  get is2D() {
    return true
  }
  get isIdentity() {
    return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0
  }
  multiply() { return this }
  multiplySelf() { return this }
  preMultiplySelf() { return this }
  translate() { return this }
  translateSelf() { return this }
  scale() { return this }
  scaleSelf() { return this }
  scaleNonUniform() { return this }
  rotate() { return this }
  rotateSelf() { return this }
  rotateFromVector() { return this }
  skewX() { return this }
  skewY() { return this }
  invertSelf() { return this }
  inverse() { return this }
  flipX() { return this }
  flipY() { return this }
  setMatrixValue() { return this }
  transformPoint(p?: { x?: number; y?: number; z?: number }) {
    return { x: p?.x ?? 0, y: p?.y ?? 0, z: p?.z ?? 0, w: 1 }
  }
  toFloat32Array() {
    return new Float32Array([this.a, this.b, this.c, this.d, this.e, this.f])
  }
  toFloat64Array() {
    return new Float64Array([this.a, this.b, this.c, this.d, this.e, this.f])
  }
  static fromFloat32Array() {
    return new StubDOMMatrix()
  }
  static fromFloat64Array() {
    return new StubDOMMatrix()
  }
  static fromMatrix(m?: { a?: number; b?: number; c?: number; d?: number; e?: number; f?: number }) {
    return new StubDOMMatrix([m?.a ?? 1, m?.b ?? 0, m?.c ?? 0, m?.d ?? 1, m?.e ?? 0, m?.f ?? 0])
  }
}

class StubPath2D {
  constructor(_init?: unknown) {}
  addPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  arc() {}
  arcTo() {}
  ellipse() {}
  rect() {}
}

class StubImageData {
  width: number
  height: number
  data: Uint8ClampedArray
  colorSpace = 'srgb'
  constructor(init: number | Uint8ClampedArray, height?: number, _settings?: { colorSpace?: string }) {
    if (typeof init === 'number') {
      this.width = init
      this.height = height ?? 0
      this.data = new Uint8ClampedArray(this.width * this.height * 4)
    } else {
      this.data = init
      this.width = init.length / 4
      this.height = height ?? this.width
    }
  }
}

export function ensurePdfJsNodeGlobals(): void {
  const g = globalThis as unknown as PdfJsGlobal
  if (!g.DOMMatrix) g.DOMMatrix = StubDOMMatrix
  if (!g.Path2D) g.Path2D = StubPath2D
  if (!g.ImageData) g.ImageData = StubImageData
}
// Above this size, PDFs are stored + recorded immediately and their text
// extraction is deferred to /api/documents/[id]/extract — parsing inline
// (URL import, upload relay) risks the function's memory/time window and
// killed the whole import before the deferred pipeline existed.
export const INLINE_EXTRACT_MAX_BYTES = 30 * 1024 * 1024
// Must fit inside the routes' maxDuration (60 s on Vercel) with headroom for
// fetching the file from Blob, metadata and the DB write.
export const DEFAULT_EXTRACT_BUDGET_MS = 50_000
// Pages parsed per getText() call — small enough to check the deadline often,
// large enough to keep per-call overhead negligible.
const PAGE_BATCH = 10
// Never start another batch when less than this remains of the budget.
const MIN_BATCH_HEADROOM_MS = 5_000

// Clean up pdf.js artifacts: control chars, hyphenated line breaks, huge gaps
export function cleanPdfText(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/(\w)-\n(\w)/g, '$1$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export type ExtractResult = {
  text: string
  /** pages whose text was actually extracted */
  pages: number
  /** real page count of the document (0 when it could not be determined) */
  totalPages: number
  metaTitle: string
  partial?: boolean
  warning?: string
}

export async function extractPdfText(
  data: Uint8Array,
  sizeBytes: number,
  opts?: { budgetMs?: number }
): Promise<ExtractResult> {
  if (sizeBytes > EXTRACT_LIMIT) {
    return {
      text: '',
      pages: 0,
      totalPages: 0,
      metaTitle: '',
      warning:
        'This PDF is very large — it was stored as-is and opens in the viewer, but text extraction was skipped (no highlighting or AI Q&A for this one).',
    }
  }

  const started = Date.now()
  const budgetMs = opts?.budgetMs ?? DEFAULT_EXTRACT_BUDGET_MS
  const deadline = started + budgetMs

  try {
    // pdf-parse v2 is ESM-only and ships pdf.js — dynamic import keeps the
    // Next.js bundler away from it (also declared in serverExternalPackages).
    // The globals shim must land BEFORE the import: without it the module
    // fails to load on Vercel (DOMMatrix is not defined).
    ensurePdfJsNodeGlobals()
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data })

    const textParts: string[] = []
    const metaTitle = { value: '' }
    let totalPages = 0
    let parsedPages = 0
    let timedOut = false
    let parseError: string | null = null

    try {
      // The document is loaded once and cached inside the parser, so each
      // getText({ partial }) call only parses the pages it is given. The
      // first batch additionally discovers the real page count
      // (TextResult.total). A per-batch race keeps one pathological page from
      // eating the whole budget, and every raced promise gets a catch so a
      // timeout cancel never becomes an unhandled rejection.
      for (let cursor = 1; ; cursor += PAGE_BATCH) {
        if (totalPages && cursor > totalPages) break
        const remaining = deadline - Date.now()
        if (cursor !== 1 && remaining < MIN_BATCH_HEADROOM_MS) {
          timedOut = true
          break
        }

        const end = totalPages ? Math.min(cursor + PAGE_BATCH - 1, totalPages) : cursor + PAGE_BATCH - 1
        const batch: number[] = []
        for (let p = cursor; p <= end; p++) batch.push(p)

        try {
          const extract = parser.getText({ partial: batch })
          extract.catch(() => {})
          const result = (await Promise.race([
            extract,
            new Promise<never>((_, rej) =>
              setTimeout(() => rej(new Error('TEXT_TIMEOUT')), Math.max(remaining, 1_000))
            ),
          ])) as { text?: string; pages?: { num: number; text: string }[]; total?: number }

          textParts.push(result.text ?? '')
          const batchPages = result.pages?.length ?? 0
          parsedPages += batchPages
          if (!totalPages) {
            totalPages = result.total ?? batchPages
            if (!totalPages) break // scan/failed load — nothing more to ask for
          }
        } catch (err) {
          if ((err as Error).message === 'TEXT_TIMEOUT') {
            timedOut = true
          } else if (parsedPages === 0) {
            parseError = (err as Error).message
          }
          break
        }
      }
    } finally {
      // Metadata is document-level (no page parsing) but still raced — a
      // corrupt file must never push the import past the function window.
      try {
        const infoPromise = parser.getInfo()
        infoPromise.catch(() => {})
        const info = (await Promise.race([
          infoPromise,
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('INFO_TIMEOUT')), 5_000)),
        ])) as { info?: { Title?: string } }
        const rawTitle = info.info?.Title
        if (rawTitle && rawTitle.length > 3) metaTitle.value = rawTitle
      } catch {}
      await parser.destroy().catch(() => {})
    }

    const text = textParts.join('')
    const partial = timedOut && totalPages > parsedPages
    let warning: string | undefined
    if (timedOut && parsedPages === 0) {
      warning =
        'This PDF is very large, so text extraction was stopped to finish the upload — the file opens fine in the viewer, but highlighting & AI Q&A are unavailable for it.'
    } else if (partial) {
      warning = `Large book: text extraction covered the first ${parsedPages} of ${totalPages} pages so the upload could finish in time — the full PDF opens in the viewer, and highlights & AI Q&A work for the extracted part.`
    } else if (parseError && parsedPages === 0) {
      warning =
        'No extractable text (probably a scan) — the original PDF still opens in the viewer, but highlighting & AI Q&A need text.'
    }

    return {
      text,
      pages: parsedPages,
      totalPages,
      metaTitle: metaTitle.value,
      ...(partial ? { partial: true } : {}),
      ...(warning ? { warning } : {}),
    }
  } catch (err) {
    const ms = Date.now() - started
    console.warn(`Text extraction gave up after ${ms}ms:`, (err as Error).message)
    // Still accept the PDF — the original renders fine in the viewer.
    return {
      text: '',
      pages: 0,
      totalPages: 0,
      metaTitle: '',
      warning:
        'No extractable text (probably a scan) — the original PDF still opens in the viewer, but highlighting & AI Q&A need text.',
    }
  }
}
