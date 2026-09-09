// Shared plumbing for the staged-chunk upload flow (large PDFs, > 4.2 MB).
//
// Why this exists: the @vercel/blob client uploads browser files through the
// vercel.com/api/blob gateway, which some networks/WAFs block outright, and
// Vercel serverless functions cap request bodies at 4.5 MB — so the working
// server-relay path could only take small files. Staging splits the file into
// ≤4 MB chunks that each pass through a function (the path proven to work),
// parks them in the same Blob store, and assembles them server-side with a
// multipart upload — which has no size limit and never touches the gateway.
//
// Layout inside the store: staging/<userId>/<uploadId>/<zero-padded index>.
// The userId segment ties staged chunks to their owner, and the janitor
// removes chunks abandoned mid-upload after 24 h.

import { del, list } from '@vercel/blob'

export const STAGED_CHUNK_MAX_BYTES = 4.2 * 1024 * 1024 // under Vercel's 4.5 MB request cap
export const STAGED_TOTAL_MAX_BYTES = 200 * 1024 * 1024 // same cap as the import route
const STAGED_GRACE_MS = 24 * 60 * 60 * 1000 // abandoned staged chunks live 24 h
const SWEEP_MAX_DELETE = 2_000 // safety valve for the opportunistic janitor

export function stagingPrefix(userId: string, uploadId: string): string {
  return `staging/${userId}/${uploadId}/`
}

export function stagedPathname(userId: string, uploadId: string, index: number): string {
  return `${stagingPrefix(userId, uploadId)}${String(index).padStart(6, '0')}`
}

/** Returns the numeric chunk index, or null when the pathname is not a staged chunk. */
export function stagedIndex(pathname: string, prefix: string): number | null {
  if (!pathname.startsWith(prefix)) return null
  const rest = pathname.slice(prefix.length)
  if (!/^\d{6}$/.test(rest)) return null
  return Number.parseInt(rest, 10)
}

export function isValidUploadId(uploadId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploadId)
}

export async function deleteStagedBlobs(urls: string[]): Promise<void> {
  if (!urls.length) return
  try {
    await del(urls)
  } catch (e) {
    // Orphans are not fatal — the janitor sweeps them within 24 h.
    console.warn('Failed to delete staged chunks (janitor will retry)', e)
  }
}

/** Opportunistic cleanup of staged chunks abandoned mid-upload (> 24 h old). */
export async function sweepAbandonedStaging(): Promise<void> {
  try {
    const stale: string[] = []
    let cursor: string | undefined
    do {
      const page = await list({ prefix: 'staging/', limit: 1000, cursor })
      for (const blob of page.blobs) {
        if (Date.now() - blob.uploadedAt.getTime() > STAGED_GRACE_MS) stale.push(blob.url)
        if (stale.length >= SWEEP_MAX_DELETE) break
      }
      cursor = page.hasMore ? page.cursor : undefined
    } while (cursor && stale.length < SWEEP_MAX_DELETE)
    if (stale.length) {
      await del(stale)
      console.log(`Staging janitor removed ${stale.length} abandoned chunk(s)`)
    }
  } catch (e) {
    console.warn('Staging sweep failed (non-fatal)', e)
  }
}
