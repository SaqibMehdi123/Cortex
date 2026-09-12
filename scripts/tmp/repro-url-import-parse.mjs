// Reproduce createPdfDocument's parse path (documents/route.ts lines 256-272)
// on the REAL arXiv file, under Node — the same runtime Vercel functions use.
import { readFileSync } from 'node:fs'

const buffer = readFileSync(new URL('./arxiv-2304.10557.pdf', import.meta.url))
console.log('file bytes:', buffer.length, 'magic:', buffer.subarray(0, 5).toString('latin1'))

try {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const t0 = Date.now()
    const result = await parser.getText()
    console.log('getText OK in', Date.now() - t0, 'ms; pages:', result.pages?.length ?? result.total, 'chars:', (result.text ?? '').length)
    try {
      const info = await parser.getInfo()
      const rawTitle = info.info?.Title
      console.log('getInfo OK; metaTitle:', JSON.stringify(rawTitle ?? null))
    } catch (e) { console.log('getInfo threw (wrapped upstream):', e.message) }
  } finally {
    await parser.destroy().catch(() => {})
  }
  console.log('PARSE PATH: ALL OK')
} catch (e) {
  console.error('PARSE PATH THREW:', e.constructor.name, '-', e.message)
  process.exit(1)
}
