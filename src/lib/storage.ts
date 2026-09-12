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

import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
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

/**
 * Normalise whatever was pasted into R2_ACCOUNT_ID down to the bare 32-hex
 * account id. People paste the full endpoint URL (the setup doc used to
 * invite this) — `https://<id>.r2.cloudflarestorage.com` would otherwise
 * build the nonsense endpoint `https://https://…` whose parsed hostname
 * (`https`) fails DNS with ENOTFOUND. Also tolerates the host-with-scheme
 * form and jurisdiction endpoints (`<id>.eu.r2.cloudflarestorage.com`).
 */
export function r2AccountId(): string {
  const raw = (process.env.R2_ACCOUNT_ID || '').trim()
  let v = raw
  if (/^[a-z]+:\/\//i.test(v)) v = v.slice(v.indexOf('://') + 3)
  v = v.split('/')[0] // drop any path
  v = v.replace(/\.(?:eu|fedramp)?\.?r2\.cloudflarestorage\.com.*$/i, '')
  return v.trim()
}

function r2(): S3Client {
  if (!r2Configured()) throw new Error('R2 is not configured (missing R2_* environment variables)')
  if (!r3client) {
    r3client = new S3Client({
      region: 'auto',
      endpoint: `https://${r2AccountId()}.r2.cloudflarestorage.com`,
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

/**
 * One-shot verification for the ops health check. Uses ListObjectsV2
 * (MaxKeys 1 — read-only, side-effect-free, works on empty buckets) instead
 * of a HEAD probe, because HEAD returns 404 for BOTH "key missing" (healthy)
 * and "bucket missing" (broken) — which masked a mistyped R2_BUCKET as ok.
 *
 * Returns the S3 error code verbatim (codes are protocol constants, safe to
 * show; error MESSAGES are NOT — they can echo the access key id/signature).
 */
export type R2ConnectionResult = {
  ok: boolean
  /** S3/SDK error code, or 'OK' / 'NOT_CONFIGURED'. */
  code: string
  /** Operator-facing hint naming the env var to fix. No secrets. */
  hint: string
}

export async function r2ConnectionCheck(): Promise<R2ConnectionResult> {
  if (!r2Configured()) {
    return { ok: false, code: 'NOT_CONFIGURED', hint: 'one or more R2_* environment variables are missing' }
  }
  try {
    await r2().send(new ListObjectsV2Command({ Bucket: r2Bucket(), MaxKeys: 1 }))
    return { ok: true, code: 'OK', hint: 'credentials work against the bucket' }
  } catch (e) {
    const err = e as {
      name?: string
      code?: string
      $metadata?: { httpStatusCode?: number }
    }
    const status = err?.$metadata?.httpStatusCode
    const code = err?.code || err?.name || 'UNKNOWN'

    if (code === 'SignatureDoesNotMatch') {
      return {
        ok: false,
        code,
        hint:
          'R2_SECRET_ACCESS_KEY is wrong — re-copy the "Secret Access Key" shown at token creation (NOT the long eyJ… "Token value"; the secret is only shown once)',
      }
    }
    if (code === 'InvalidAccessKeyId') {
      return {
        ok: false,
        code,
        hint: 'R2_ACCESS_KEY_ID does not exist for this account — re-copy the S3-style "Access Key ID" from Manage R2 API Tokens',
      }
    }
    if (code === 'AccessDenied' || status === 403) {
      return {
        ok: false,
        code,
        hint: 'token valid but denied on this bucket — the API token needs "Object Read & Write" scoped to (at least) this bucket',
      }
    }
    if (code === 'NoSuchBucket' || status === 404) {
      return {
        ok: false,
        code,
        hint: 'R2_BUCKET does not match an existing bucket — check exact name and case (bucket ids and account ids are not bucket names)',
      }
    }
    if (
      code === 'NetworkingError' ||
      code === 'ENOTFOUND' ||
      code === 'EAI_AGAIN' ||
      code === 'ERR_INVALID_URL' ||
      code === 'InvalidEndpoint' ||
      code === 'TypeError' ||
      status === 400
    ) {
      return {
        ok: false,
        code,
        hint:
          'endpoint does not resolve — R2_ACCOUNT_ID must be the 32-hex Account ID (dash.cloudflare.com → R2 → Account details), not the endpoint URL and not the bucket id',
      }
    }
    return { ok: false, code, hint: `unexpected S3 error — verify all four R2_* values (status ${status ?? 'n/a'})` }
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
