// One-time: add `export const maxDuration = 60` (Vercel Hobby max) after the
// import block of generation-heavy routes, so long AI/extract calls are not
// killed by the default function timeout on serverless.
const fs = require('fs')
const path = require('path')
const ROOT = '/home/z/my-project'
const files = [
  'src/app/api/chat/route.ts',
  'src/app/api/copilot/route.ts',
  'src/app/api/mindmaps/generate/route.ts',
  'src/app/api/flashcards/route.ts',
  'src/app/api/news/fetch/route.ts',
  'src/app/api/opportunities/parse/route.ts',
  'src/app/api/gmail/import/route.ts',
  'src/app/api/documents/[id]/summarize/route.ts',
]

for (const rel of files) {
  const f = path.join(ROOT, rel)
  let s = fs.readFileSync(f, 'utf8')
  if (s.includes('maxDuration')) {
    console.log('already has maxDuration:', rel)
    continue
  }
  const lines = s.split('\n')
  let lastImport = -1
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (/^import /.test(t) || /^} from /.test(t) || /^import$/.test(t)) lastImport = i
  }
  if (lastImport === -1) {
    console.log('NO IMPORT FOUND:', rel)
    continue
  }
  lines.splice(lastImport + 1, 0, '', '// Long AI generations must not hit the default serverless timeout (Vercel Hobby caps at 60 s).', 'export const maxDuration = 60')
  fs.writeFileSync(f, lines.join('\n'))
  console.log('updated   ', rel)
}
