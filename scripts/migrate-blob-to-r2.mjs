#!/usr/bin/env node
// migrate-blob-to-r2.mjs — one-time migration of existing Vercel Blob PDFs
// to Cloudflare R2. Run AFTER the R2_* env vars are configured (locally or
// on the deployment target). Safe to re-run: documents already stored as
// r2:// refs are skipped, and a failed download never mutates the row.
//
// Usage:
//   DATABASE_URL="postgresql://…" \
//   R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=… \
//   node scripts/migrate-blob-to-r2.mjs
//
// What it does per document (filePath = https://*.public.blob.vercel-storage.com/…):
//   1. download the bytes from Blob (server-side, full file)
//   2. PUT the object into R2 under pdf/<userId>/<uuid>/<fileName>
//   3. update Document.filePath to r2://<key>
// Vercel Blob originals are left in place until you verify the app, then you
// can delete the Blob store entirely (or keep it as a cold backup).

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { PrismaClient } from '@prisma/client'

const required = ['DATABASE_URL', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']
for (const v of required) {
  if (!process.env[v]) {
    console.error(`Missing env var: ${v}`)
    process.exit(1)
  }
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})
const BUCKET = process.env.R2_BUCKET
const prisma = new PrismaClient()

const CONCURRENCY = 3
const isBlobUrl = (u) => {
  try {
    const p = new URL(u)
    return p.protocol === 'https:' && p.hostname.endsWith('.public.blob.vercel-storage.com')
  } catch {
    return false
  }
}

async function migrateOne(doc) {
  if (!isBlobUrl(doc.filePath)) return { id: doc.id, title: doc.title, skipped: true, reason: 'not a blob URL' }
  try {
    const res = await fetch(doc.filePath)
    if (!res.ok) return { id: doc.id, title: doc.title, error: `blob fetch ${res.status}` }
    const buffer = Buffer.from(await res.arrayBuffer())

    const safeName =
      (doc.fileName || 'document.pdf')
        .normalize('NFKD')
        .replace(/[^\w.\- ]+/g, '')
        .replace(/\s+/g, '-')
        .slice(-120) || 'document.pdf'
    const key = `pdf/${doc.userId}/${crypto.randomUUID()}/${safeName}`

    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: 'application/pdf' }))
    await prisma.document.update({ where: { id: doc.id }, data: { filePath: `r2://${key}` } })
    return { id: doc.id, title: doc.title, ok: true, size: buffer.length }
  } catch (e) {
    return { id: doc.id, title: doc.title, error: e instanceof Error ? e.message.slice(0, 120) : String(e) }
  }
}

async function main() {
  const docs = await prisma.document.findMany({
    where: { filePath: { startsWith: 'https://' } },
    select: { id: true, title: true, userId: true, fileName: true, filePath: true },
  })
  const targets = docs.filter((d) => isBlobUrl(d.filePath))
  console.log(`Found ${targets.length} Blob-stored document(s) to migrate (of ${docs.length} cloud-stored).`)
  if (!targets.length) {
    console.log('Nothing to do.')
    return
  }

  let ok = 0
  let failed = 0
  const errors = []
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(migrateOne))
    for (const r of results) {
      if (r.error) {
        failed++
        errors.push(r)
        console.error(`  ✗ ${r.title} (${r.id}): ${r.error}`)
      } else if (r.ok) {
        ok++
        console.log(`  ✓ ${r.title} — ${(r.size / 1024 / 1024).toFixed(1)} MB`)
      }
    }
  }

  console.log(`\nDone: ${ok} migrated, ${failed} failed, ${targets.length - ok - failed} skipped.`)
  if (errors.length) {
    console.log('\nRe-run this script to retry the failures (already-migrated rows are skipped).')
    process.exitCode = 1
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
