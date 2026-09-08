// One-time migration: swap z-ai-web-dev-sdk for the OpenAI-compatible
// wrapper in src/lib/ai.ts across all 9 call sites. Mechanical, idempotent.
const fs = require('fs')
const path = require('path')
const ROOT = '/home/z/my-project'
const files = [
  'src/lib/paper-analysis.ts',
  'src/app/api/gmail/import/route.ts',
  'src/app/api/mindmaps/generate/route.ts',
  'src/app/api/chat/route.ts',
  'src/app/api/copilot/route.ts',
  'src/app/api/opportunities/parse/route.ts',
  'src/app/api/flashcards/route.ts',
  'src/app/api/news/fetch/route.ts',
  'src/app/api/documents/[id]/summarize/route.ts',
]

for (const rel of files) {
  const f = path.join(ROOT, rel)
  let s = fs.readFileSync(f, 'utf8')
  const before = s

  // 1) static import form -> named import
  s = s.replace(/import ZAI from 'z-ai-web-dev-sdk'\n/, "import { createAI } from '@/lib/ai'\n")

  // 2) dynamic form (two lines) -> single line, keeping the second line's indent
  s = s.replace(
    /\s*const ZAI = \(await import\('z-ai-web-dev-sdk'\)\)\.default\n(\s*)const zai = await ZAI\.create\(\)/,
    (_m, i2) => `${i2}const zai = await createAI()`
  )

  // 3) any remaining client creations
  s = s.replace(/await ZAI\.create\(\)/g, 'await createAI()')

  // 4) ensure the import exists (for the dynamic-form files it was never there)
  if (!s.includes("from '@/lib/ai'")) {
    s = "import { createAI } from '@/lib/ai'\n" + s
  }

  if (s !== before) {
    fs.writeFileSync(f, s)
    console.log('updated   ', rel)
  } else {
    console.log('NO CHANGE ', rel)
  }
}
