// Storage abstraction for document PDFs — three interchangeable backends,
// selected automatically from the environment (no config file, no restarts):
//
//   r2    Cloudflare R2 (S3 API). Active when all four R2_* vars are set.
//         Files live in a PRIVATE bucket: uploads go browser → presigned PUT,
//         reads go through presigned GETs issued by the auth-checked
//         /api/documents/[id]/file route. The flaky vercel.com upload gateway
//         and the 4.5 MB serverless request cap are both bypassed entirely.
//   blob  Vercel Blob. Active when only BLOB_READ_WRITE_TOKEN is set
//         (the original behaviour — direct client uploads via @vercel/blob).
//   disk  Local filesystem (uploads/). Local dev / VPS only, where the
//         serverless request cap does not exist.
//
// Storage references stored in Document.filePath distinguish the backend:
//   r2://<key>                          → Cloudflare R2 object
//   https://*.public.blob.vercel-...   → Vercel Blob URL
//   <documentId>.pdf                    → local uploads/ directory
// Anything else found in the column is treated as an unknown legacy ref and
// only ever surfaces as "no file", never as a fetch target (SSRF-safe).

import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export type StorageMode = 'r2' | 'blob' | 'disk'

/** The R2 object key behind an `r2://` storage reference. */
export type R2Ref = { kind: 'r2'; key: string }
export type BlobRef = { kind: 'blob'; url: string }
export type DiskRef = { kind: 'disk'; name: string }
export type StorageRef = R2Ref | BlobRef | DiskRef | { kind: 'unknown'; raw: string }

// ── Mode detection ───────────────────────────────────────────────────────

export function r2Configured(): boolean {
  return Boolean(
    (process.env.R2_ACCOUNT_ID || '').trim() &&
    (process.env.R2_ACCESS_KEY_ID || '').trim() &&
    (process.env.R2_SECRET_ACCESS_KEY || '').trim() &&
    (process.env.R2_BUCKET || '').trim()
  )
}

export function storageMode(): StorageMode {
  if (r2Configured()) return 'r2'
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'blob'
  return 'disk'
}

// ── Reference parsing ────────────────────────────────────────────────────

/** True when an https URL points at the app's own Vercel Blob store. */
export function isBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.public.blob.vercel-storage.com')
  } catch {
    return false
  }
}

/**
 * Parse a stored filePath into a typed storage reference. `r2://` refs are
 * strict: the key must be plain path characters (no `..`, no query strings),
 * because the key is handed to the S3 client verbatim.
 */
export function parseStorageRef(ref: string): StorageRef {
  if (ref.startsWith('r2://')) {
    const key = ref.slice(5)
    if (key && /^[A-Za-z0-9][A-Za-z0-9/._-]*$/.test(key) && !key.includes('..')) {
      return { kind: 'r2', key }
    }
    return { kind: 'unknown', raw: ref.slice(0, 40) }
  }
  if (ref.startsWith('https://')) {
    return isBlobUrl(ref) ? { kind: 'blob', url: ref } : { kind: 'unknown', raw: ref.slice(0, 40) }
  }
  if (/^[A-Za-z0-9._-]+\.pdf$/.test(ref)) return { kind: 'disk', name: ref }
  return { kind: 'unknown', raw: ref.slice(0, 40) }
}

// ── R2 client (lazy singleton) ───────────────────────────────────────────

let r3client: S3Client | null = null

function r2(): S3Client {
  if (!r2Configured()) throw new Error('R2 is not configured (missing R2_* environment variables)')
  if (!r3client) {
    r3client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID!.trim()}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(),
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim(),
      },
    })
  }
  return r3client
}

function r2Bucket(): string {
  return process.env.R2_BUCKET!.trim()
}

/** Build a new storage key for an incoming upload. Segments are slug-safe. */
export function makeStorageKey(userId: string, fileName: string): string {
  const safeName =
    fileName
      .normalize('NFKD')
      .replace(/[^\w.\- ]+/g, '')
      .replace(/\.{2,}/g, '.') // collapse dot runs — keys must never contain '..'
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^\.+/, '') // no leading dots on the file segment
      .slice(-120) || 'document.pdf'
  return `pdf/${userId}/${crypto.randomUUID()}/${safeName}`
}

/** Presigned browser → R2 PUT (1 hour). The bucket itself stays private. */
export async function presignR2Upload(key: string, contentType = 'application/pdf'): Promise<string> {
  const cmd = new PutObjectCommand({ Bucket: r2Bucket(), Key: key, ContentType: contentType })
  return getSignedUrl(r2(), cmd, { expiresIn: 3600 })
}

/** Presigned GET (5 min) for serving a stored PDF to its owner's viewer. */
export async function presignR2Download(key: string, fileName?: string | null): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: r2Bucket(),
    Key: key,
    ...(fileName
      ? { ResponseContentDisposition: `inline; filename="${fileName.replace(/[^\w.\- ]+/g, '_').slice(0, 120)}"` }
      : {}),
  })
  return getSignedUrl(r2(), cmd, { expiresIn: 300 })
}

/** HEAD one R2 object — existence + size, without downloading anything. */
export async function r2Head(key: string): Promise<{ exists: boolean; size: number | null }> {
  try {
    const res = await r2().send(new HeadObjectCommand({ Bucket: r2Bucket(), Key: key }))
    return { exists: true, size: res.ContentLength ?? null }
  } catch (e) {
    const status = (e as { name?: string; $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode
    if (status === 404 || (e as { name?: string })?.name === 'NotFound') return { exists: false, size: null }
    throw e
  }
}

/** Read a byte range of an R2 object (magic-number checks, probes). */
export async function r2GetRange(key: string, start: number, end: number): Promise<Buffer | null> {
  try {
    const res = await r2().send(new GetObjectCommand({ Bucket: r2Bucket(), Key: key, Range: `bytes=${start}-${end}` }))
    if (!res.Body) return null
    return Buffer.from(await res.Body.transformToByteArray())
  } catch {
    return null
  }
}

/** Read a whole R2 object into memory (inline extraction path, ≤ 30 MB). */
export async function r2GetBuffer(key: string): Promise<Buffer | null> {
  try {
    const res = await r2().send(new GetObjectCommand({ Bucket: r2Bucket(), Key: key }))
    if (!res.Body) return null
    return Buffer.from(await res.Body.transformToByteArray())
  } catch {
    return null
  }
}

/** One-shot verification for the ops health check (credentials + bucket). */
export async function r2ConnectionOk(): Promise<boolean> {
  try {
    await r2().send(new HeadObjectCommand({ Bucket: r2Bucket(), Key: 'health-probe-nonexistent' }))
    return true // 200 would mean someone stored a probe object; either way auth works
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode
    // 404 = credentials + bucket fine, object just absent (the expected case)
    return status === 404 || (e as { name?: string })?.name === 'NotFound'
  }
}

// ── Backend-agnostic helpers ─────────────────────────────────────────────

/**
 * Store a fully-buffered PDF (URL-import path) in the active backend and
 * return the storage reference for Document.filePath. Disk mode keeps the
 * legacy `<documentId>.pdf` naming so the [id]/file route finds it.
 */
export async function putBuffer(
  userId: string,
  documentId: string,
  buffer: Buffer,
  fileName: string,
  contentType = 'application/pdf'
): Promise<string> {
  const mode = storageMode()
  if (mode === 'r2') {
    const key = makeStorageKey(userId, fileName)
    await r2().send(new PutObjectCommand({ Bucket: r2Bucket(), Key: key, Body: buffer, ContentType: contentType }))
    return `r2://${key}`
  }
  if (mode === 'blob') {
    const { put } = await import('@vercel/blob')
    const blob = await put(fileName, buffer, { access: 'public', addRandomSuffix: true, contentType })
    return blob.url
  }
  // disk — legacy layout: uploads/<documentId>.pdf
  const { promises: fs } = await import('fs')
  const path = await import('path')
  const uploadDir = path.join(process.cwd(), 'uploads')
  await fs.mkdir(uploadDir, { recursive: true })
  const safeName = `${documentId}.pdf`
  await fs.writeFile(path.join(uploadDir, safeName), buffer)
  return safeName
}

/**
 * Delete a stored file behind any storage reference. Failures never throw —
 * a storage outage must not block a document delete (the DB row is the
 * source of truth; orphaned bytes are tolerable, stuck UI is not).
 */
export async function deleteByRef(ref: string): Promise<void> {
  const parsed = parseStorageRef(ref)
  try {
    if (parsed.kind === 'r2') {
      await r2().send(new DeleteObjectCommand({ Bucket: r2Bucket(), Key: parsed.key }))
    } else if (parsed.kind === 'blob') {
      const { del } = await import('@vercel/blob')
      await del(parsed.url)
    } else if (parsed.kind === 'disk') {
      const { unlink } = await import('fs/promises')
      const path = await import('path')
      await unlink(path.join(process.cwd(), 'uploads', path.basename(parsed.name)))
    }
  } catch (e) {
    console.warn('storage.deleteByRef failed (ignored)', e)
  }
}
