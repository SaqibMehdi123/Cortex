// Exercises the batched PDF text extractor (src/lib/pdf-extract.ts) with the
// REAL pdf-parse stack: full extraction of a generated multi-page book, and
// partial extraction under an artificially tiny budget — the behavior that
// keeps large uploads alive on Vercel's 60 s function window.
//
// Run: python3 scripts/make_test_pdf.py 60 /tmp/cortex-batch-test.pdf
//      bun scripts/pdf_extract_batch_test.mjs /tmp/cortex-batch-test.pdf
import fs from 'fs'
import { cleanPdfText, extractPdfText } from '../src/lib/pdf-extract.ts'

const PDF = process.argv[2] || '/tmp/cortex-batch-test.pdf'

let failures = 0
function ok(name, cond, extra = '') {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!cond) failures++
}

console.log(`PDF: ${PDF} (${(fs.statSync(PDF).size / 1024).toFixed(0)} KB)`)

// ── Case 1: the whole book fits inside the budget ──────────────────────────
console.log('\nCase 1: full extraction (default budget)')
{
  const buf = fs.readFileSync(PDF)
  const t0 = Date.now()
  const r = await extractPdfText(new Uint8Array(buf), buf.length)
  const ms = Date.now() - t0
  ok('totalPages == 60', r.totalPages === 60, `got ${r.totalPages}`)
  ok('pages == totalPages', r.pages === r.totalPages, `${r.pages} vs ${r.totalPages}`)
  ok('not flagged partial', !r.partial)
  ok('no warning', !r.warning, r.warning || '')
  ok(
    'text covers first AND last page',
    r.text.includes('Page 1 line 1') && r.text.includes(`Page 60 line 1`)
  )
  ok('metaTitle empty (none embedded)', r.metaTitle === '')
  console.log(`  (${ms}ms, ${r.text.length} chars)`)
}

// ── Case 2: budget deliberately too small → partial text, upload survives ──
console.log('\nCase 2: partial extraction (budgetMs=1500)')
{
  // Fresh buffer per case — pdf.js transfers (neuters) the input ArrayBuffer
  // during parsing, so a reused buffer would detach and fail instantly.
  const buf = fs.readFileSync(PDF)
  const t0 = Date.now()
  const r = await extractPdfText(new Uint8Array(buf), buf.length, { budgetMs: 1500 })
  const ms = Date.now() - t0
  ok('flagged partial', r.partial === true)
  ok('some pages extracted', r.pages >= 1, `${r.pages}`)
  ok('pages < totalPages', r.pages < r.totalPages, `${r.pages}/${r.totalPages}`)
  ok('totalPages still reported', r.totalPages === 60, `got ${r.totalPages}`)
  ok('text non-empty', r.text.length > 100, `${r.text.length} chars`)
  ok('warning names the coverage', /first \d+ of 60 pages/.test(r.warning || ''), r.warning || '')
  console.log(`  (${ms}ms, stopped after ${r.pages} pages)`)
}

// ── Case 3: cleaner behavior ────────────────────────────────────────────────
console.log('\nCase 3: cleanPdfText')
{
  ok('dehyphenates line breaks', cleanPdfText('read-\ning') === 'reading')
  ok('strips NUL bytes', cleanPdfText('a\u0000b') === 'ab')
  ok('collapses 3+ newlines', cleanPdfText('a\n\n\n\nb') === 'a\n\nb')
  ok('trims', cleanPdfText('  hi  ') === 'hi')
}

console.log(failures ? `\nFAILED: ${failures} assertion(s)` : '\nALL PASS')
process.exit(failures ? 1 : 0)
