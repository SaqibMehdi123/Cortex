// Shared PDF text extraction used by both upload paths (streamed-to-disk and
// direct-to-blob). Best-effort by design: a PDF that yields no text (scan) or
// times out mid-parse is still stored and opens in the viewer — highlighting
// and AI Q&A simply stay unavailable for it.

export const EXTRACT_LIMIT = 100 * 1024 * 1024
export const LARGE_EXTRACT_BUDGET_MS = 120_000
export const DEFAULT_EXTRACT_BUDGET_MS = 60_000

// Clean up pdf.js artifacts: control chars, hyphenated line breaks, huge gaps
export function cleanPdfText(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/(\w)-\n(\w)/g, '$1$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function extractPdfText(
  data: Uint8Array,
  sizeBytes: number
): Promise<{ text: string; pages: number; metaTitle: string; warning?: string }> {
  if (sizeBytes > EXTRACT_LIMIT) {
    return {
      text: '',
      pages: 0,
      metaTitle: '',
      warning:
        'This PDF is very large — it was stored as-is and opens in the viewer, but text extraction was skipped (no highlighting or AI Q&A for this one).',
    }
  }

  const started = Date.now()
  try {
    // pdf-parse v2 is ESM-only and ships pdf.js — dynamic import keeps the
    // Next.js bundler away from it (also declared in serverExternalPackages).
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data })
    const budgetMs = sizeBytes > 30 * 1024 * 1024 ? LARGE_EXTRACT_BUDGET_MS : DEFAULT_EXTRACT_BUDGET_MS
    try {
      const extract = parser.getText()
      extract.catch(() => {}) // a timeout cancel must not become an unhandled rejection
      const result = await Promise.race([
        extract,
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('TEXT_TIMEOUT')), budgetMs)),
      ])
      const text = (result as { text?: string }).text ?? ''
      const pages =
        (result as { pages?: unknown[]; total?: number }).pages?.length ??
        (result as { total?: number }).total ??
        0
      let metaTitle = ''
      try {
        const info = await parser.getInfo()
        const rawTitle = (info.info as { Title?: string } | undefined)?.Title
        if (rawTitle && rawTitle.length > 3) metaTitle = rawTitle
      } catch {}
      return { text, pages, metaTitle }
    } finally {
      await parser.destroy().catch(() => {})
    }
  } catch (err) {
    const ms = Date.now() - started
    const timedOut = (err as Error).message === 'TEXT_TIMEOUT'
    console.warn(`Text extraction gave up after ${ms}ms (timeout=${timedOut}):`, (err as Error).message)
    // Still accept the PDF — the original renders fine in the viewer.
    return {
      text: '',
      pages: 0,
      metaTitle: '',
      warning: timedOut
        ? 'This PDF is very large, so text extraction was stopped to finish the upload — the file opens fine in the viewer, but highlighting & AI Q&A are unavailable for it.'
        : 'No extractable text (probably a scan) — the original PDF still opens in the viewer, but highlighting & AI Q&A need text.',
    }
  }
}
