// Creates a 6-page sample PDF (reportlab) + inserts a Document row for the
// uitest account so the Reader can be tested on mobile. Idempotent: reuses
// the existing "Mobile PDF Test Edition" doc if present.
import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const db = new PrismaClient()
const USER_ID = 'cmtr4sboe006dp4z8vsq2kcx6' // uitest@cortex.dev
const JS_PARAS = [
  'Reading on a phone used to mean exporting the file and hunting for a viewer.',
  'With a canvas-based renderer the same page geometry reaches every device.',
]

const existing = await db.document.findFirst({
  where: { userId: USER_ID, title: 'Rendering Everywhere — Mobile PDF Test Edition' },
})
if (existing) {
  console.log('EXISTS', existing.id)
  process.exit(0)
}

execSync('python3 scripts/gen-test-pdf.py', { stdio: 'inherit', cwd: '/home/z/my-project' })

const buf = fs.readFileSync('/home/z/my-project/uploads/test-book.pdf')
const doc = await db.document.create({
  data: {
    userId: USER_ID,
    title: 'Rendering Everywhere — Mobile PDF Test Edition',
    author: 'A. Tester',
    type: 'paper',
    status: 'reading',
    tags: 'pdf',
    pageCount: 6,
    content: Array.from({ length: 6 }, (_, i) => `Chapter ${i + 1} — Rendering Everywhere. ` + JS_PARAS.join(' ')).join('\n\n'),
  },
})
fs.mkdirSync(path.join(process.cwd(), 'uploads'), { recursive: true })
fs.writeFileSync(path.join(process.cwd(), 'uploads', `${doc.id}.pdf`), buf)
await db.document.update({
  where: { id: doc.id },
  data: { filePath: `${doc.id}.pdf`, fileName: 'rendering-everywhere-sample.pdf', fileSize: buf.length },
})
console.log('CREATED', doc.id, buf.length, 'bytes')
