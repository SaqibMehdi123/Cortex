import { NextResponse } from 'next/server'
import { safeFetch } from '@/lib/safe-fetch'
import { putBuffer, deleteByRef, storageMode } from '@/lib/storage'
import { loadPdfParse } from '@/lib/pdf-extract'

// GET /api/ops/url-import-probe — end-to-end check of the exact pipeline the
// Library "Import from URL" runs, executed in the LIVE runtime (Vercel
// function, real network, real R2). Answers "which step fails in production?"
// without needing dashboard access or an authenticated session.
//
// Public by design (middleware allow-list), mirroring /api/ops/health:
//  - the target URL is FIXED (the arXiv paper from the operator's failure
//    report) — there is NO user input, so there is no SSRF / abuse surface
//    beyond one self-inflicted fetch of a public paper;
//  - the response carries booleans, timings, byte counts and capped error
//    MESSAGES only — never keys, tokens or user data;
//  - in-memory rate limit: one probe per 60 s (extra calls get a "busy"
//    answer instead of re-running the pipeline).
//
// Steps mirror src/app/api/documents/route.ts POST (autoExtract PDF path):
//   fetch → content-type/magic/size → dynamic import('pdf-parse') → getText()
//   → putBuffer (R2 PutObject with the REAL bytes) → deleteByRef (cleanup).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const PROBE_URL = 'https://arxiv.org/pdf/2304.10557'
const noStore = { 'Cache-Control': 'no-store' }

let lastRunAt = 0
const RATE_LIMIT_MS = 60_000

/** Public-safe detail: strip anything that smells like a key/signature, cap length. */
function safeDetail(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw
    .replace(/[\w-]{24,}/g, '[redacted]')
    .replace(/(https?:\/\/\S+?)(\?|$)/g, '$1')
    .slice(0, 220)
}

export async function GET() {
  const now = Date.now()
  if (now - lastRunAt < RATE_LIMIT_MS) {
    return NextResponse.json(
      { ok: false, busy: true, retryInMs: RATE_LIMIT_MS - (now - lastRunAt), note: 'probe ran recently — try again in a minute' },
      { status: 429, headers: noStore },
    )
  }
  lastRunAt = now

  const steps: Record<string, unknown>[] = []
  const t = (name: string, started: number, extra: Record<string, unknown> = {}) =>
    steps.push({ step: name, ms: Date.now() - started, ok: true, ...extra })

  const overallStart = Date.now()
  try {
    // 1 ── egress fetch (same guard + params as the import route)
    const s1 = Date.now()
    const res = await safeFetch(PROBE_URL, { headers: { Accept: 'application/pdf,text/html,*/*' }, timeoutMs: 90_000 })
    const ctype = (res.headers.get('content-type') || '').toLowerCase()
    if (!res.ok) {
      return NextResponse.json({ ok: false, at: 'fetch', status: res.status, contentType: ctype, steps }, { headers: noStore })
    }
    t('fetch', s1, { status: res.status, contentType: ctype })

    // 2 ── bytes + PDF magic (same checks as tryDownloadPdfFromUrl)
    const s2 = Date.now()
    const buffer = Buffer.from(await res.arrayBuffer())
    const magic = buffer.subarray(0, 5).toString('latin1')
    const magicOk = buffer.length >= 100 && buffer.length <= 100 * 1024 * 1024 && magic === '%PDF-'
    t('download', s2, { bytes: buffer.length, magic, magicOk })
    if (!magicOk) {
      return NextResponse.json({ ok: false, at: 'magic', bytes: buffer.length, magic, steps }, { headers: noStore })
    }

    // 3 ── pdf-parse + pdf.js worker load in THIS runtime
    const s3 = Date.now()
    try {
      const mod = await loadPdfParse()
      const loaded = typeof mod.PDFParse === 'function'
      t('import-pdf-parse', s3, { loaded, workerHook: typeof (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker })
      if (!loaded) {
        return NextResponse.json({ ok: false, at: 'import-pdf-parse', steps }, { headers: noStore })
      }
    } catch (e) {
      steps.push({ step: 'import-pdf-parse', ok: false, error: safeDetail(e) })
      return NextResponse.json({ ok: false, at: 'import-pdf-parse', steps }, { headers: noStore })
    }

    // 4 ── text extraction (same call the import route makes)
    const s4 = Date.now()
    let chars = 0
    let pages = 0
    try {
      const { PDFParse } = await loadPdfParse()
      const parser = new PDFParse({ data: new Uint8Array(buffer) })
      try {
        const result = await parser.getText()
        chars = (result.text ?? '').length
        pages = result.pages?.length ?? result.total ?? 0
        t('extract-text', s4, { pages, chars })
      } finally {
        await parser.destroy().catch(() => {})
      }
    } catch (e) {
      steps.push({ step: 'extract-text', ok: false, error: safeDetail(e) })
      return NextResponse.json({ ok: false, at: 'extract-text', steps }, { headers: noStore })
    }

    // 5 ── storage write + delete with the REAL payload (not a tiny probe)
    const s5 = Date.now()
    try {
      const ref = await putBuffer('ops-diagnostic', 'url-import-probe', buffer, 'url-import-probe.pdf')
      t('storage-put', s5, { mode: storageMode(), refPrefix: ref.slice(0, 5) })
      const s6 = Date.now()
      await deleteByRef(ref)
      t('storage-delete', s6)
    } catch (e) {
      steps.push({ step: 'storage', ok: false, mode: storageMode(), error: safeDetail(e) })
      return NextResponse.json({ ok: false, at: 'storage', steps }, { headers: noStore })
    }

    return NextResponse.json(
      { ok: true, url: PROBE_URL, totalMs: Date.now() - overallStart, steps },
      { headers: noStore },
    )
  } catch (e) {
    return NextResponse.json(
      { ok: false, at: 'unexpected', totalMs: Date.now() - overallStart, steps, error: safeDetail(e) },
      { headers: noStore },
    )
  }
}
