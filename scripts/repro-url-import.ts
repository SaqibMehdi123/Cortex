// Reproduce the URL-import pipeline stages locally against real websites —
// the exact code paths POST /api/documents uses (safeFetch → magic check →
// pdf-parse), to find which stage breaks. No DB involved.

import { safeFetch } from '../src/lib/safe-fetch'

async function main() {
  const targets = [
    ['plain article', 'https://www.bbc.com/future/story/20140901-the-worst-place-on-earth'],
    ['wikipedia', 'https://en.wikipedia.org/wiki/Knowledge_management'],
    ['redirecting shortlink', 'https://youtu.be/dQw4w9WgXcQ'],
    ['small PDF (arxiv)', 'https://arxiv.org/pdf/1706.03762'],
  ]
  for (const [name, url] of targets) {
    try {
      const t0 = Date.now()
      const res = await safeFetch(url, { timeoutMs: 20000, headers: { Accept: 'application/pdf,text/html,*/*' } })
      const ctype = res.headers.get('content-type')
      const buf = Buffer.from(await res.arrayBuffer())
      console.log(`OK  ${name}: status=${res.status} type=${ctype} bytes=${buf.length} ${Date.now() - t0}ms`)
      if (/pdf|\/pdf\//.test(url) || ctype?.includes('pdf')) {
        if (buf.subarray(0, 5).toString('latin1') === '%PDF-') {
          console.log(`    magic %PDF- ok — running pdf-parse (same as createPdfDocument)…`)
          const { PDFParse } = await import('pdf-parse')
          const parser = new PDFParse({ data: new Uint8Array(buf) })
          try {
            const result = await parser.getText()
            console.log(`    pdf-parse: pages=${result.pages?.length ?? result.total} chars=${result.text?.length}`)
            const info = await parser.getInfo().catch(() => null)
            const t = (info?.info as { Title?: string } | undefined)?.Title
            console.log(`    metaTitle=${JSON.stringify(t ?? '')}`)
          } finally {
            await parser.destroy().catch(() => {})
          }
        } else {
          console.log(`    NOT a PDF body (magic mismatch) — would fall through to article extraction`)
        }
      }
    } catch (e) {
      console.log(`ERR ${name}: ${(e as Error).name}: ${(e as Error).message}`)
    }
  }
}
main()
