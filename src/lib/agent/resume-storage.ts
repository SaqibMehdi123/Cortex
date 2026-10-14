// Storage helpers for agent Resume files. Deliberately separate from
// src/lib/storage.ts (which is shaped around Document.filePath — disk mode
// there is strictly `<id>.pdf`). Resumes need DOCX too and their own private
// subfolder, so they carry their own ref format:
//
//   r2://pdf/resumes/<userId>/<uuid>/<name>   → Cloudflare R2 (production)
//   https://*.public.blob.vercel-storage.com… → Vercel Blob
//   resumes/<name>                             → local disk uploads/resumes/
//
// Everything is private: reads go through getResumeBuffer() only from
// auth-checked routes, never from a public URL.

import { parseStorageRef, storageMode } from '@/lib/storage'

export const RESUME_MAX_BYTES = 10 * 1024 * 1024 // plan: v1 limit ~10 MB
export const RESUME_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] as const

export function resumeExtFor(mimeType: string, fileName: string): 'pdf' | 'docx' | null {
  const lower = fileName.toLowerCase()
  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf'
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  )
    return 'docx'
  return null
}

function safeName(fileName: string): string {
  return (
    fileName
      .normalize('NFKD')
      .replace(/[^\w.\- ]+/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(-100) || 'cv.pdf'
  )
}

/** Store resume bytes and return the private storage ref for Resume.fileRef. */
export async function putResumeFile(userId: string, resumeId: string, buffer: Buffer, ext: 'pdf' | 'docx', originalName: string): Promise<string> {
  const name = safeName(originalName)
  const contentType = ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  const mode = storageMode()
  if (mode === 'r2') {
    // storage.ts putBuffer's r2 branch writes to pdf/<userId>/<uuid>/<name> in
    // the private bucket — exactly right for CVs. The docId argument only
    // matters for its disk branch, which we never reach here.
    const { putBuffer } = await import('@/lib/storage')
    return putBuffer(userId, `resumes-${resumeId}`, buffer, name, contentType)
  }
  if (mode === 'blob') {
    const { put } = await import('@vercel/blob')
    const blob = await put(name, buffer, { access: 'public', addRandomSuffix: true, contentType })
    return blob.url
  }
  // disk — private uploads/resumes/ subfolder
  const { promises: fs } = await import('fs')
  const path = await import('path')
  const dir = path.join(process.cwd(), 'uploads', 'resumes')
  await fs.mkdir(dir, { recursive: true })
  const diskName = `${resumeId}.${ext}`
  await fs.writeFile(path.join(dir, diskName), buffer)
  return `resumes/${diskName}`
}

/**
 * Read resume bytes back from any resume storage ref (R2 / Blob / disk).
 * Returns null when the file is missing or the ref is not a resume ref.
 */
export async function getResumeBuffer(fileRef: string): Promise<Buffer | null> {
  const parsed = parseStorageRef(fileRef)
  if (parsed.kind === 'r2') {
    const { r2GetBuffer } = await import('@/lib/storage')
    return r2GetBuffer(parsed.key)
  }
  if (parsed.kind === 'blob') {
    try {
      const res = await fetch(parsed.url, { signal: AbortSignal.timeout(30_000) })
      if (!res.ok) return null
      return Buffer.from(await res.arrayBuffer())
    } catch {
      return null
    }
  }
  if (parsed.kind === 'disk' || fileRef.startsWith('resumes/')) {
    const { promises: fs } = await import('fs')
    const path = await import('path')
    const base = path.basename(fileRef)
    if (!/^[A-Za-z0-9._-]+$/.test(base)) return null
    try {
      return await fs.readFile(path.join(process.cwd(), 'uploads', 'resumes', base))
    } catch {
      return null
    }
  }
  return null
}

/** Best-effort delete behind a resume ref — never throws. */
export async function deleteResumeFile(fileRef: string): Promise<void> {
  try {
    const parsed = parseStorageRef(fileRef)
    if (parsed.kind === 'r2' || parsed.kind === 'blob') {
      const { deleteByRef } = await import('@/lib/storage')
      await deleteByRef(fileRef)
      return
    }
    if (fileRef.startsWith('resumes/')) {
      const { promises: fs } = await import('fs')
      const path = await import('path')
      const base = path.basename(fileRef)
      if (/^[A-Za-z0-9._-]+$/.test(base)) {
        await fs.unlink(path.join(process.cwd(), 'uploads', 'resumes', base)).catch(() => {})
      }
    }
  } catch (e) {
    console.warn('deleteResumeFile failed (ignored)', e)
  }
}

/** DOCX → plain text. A DOCX is a zip; word/document.xml holds the text runs. */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  const JSZip = (await import('jszip')) as unknown as {
    loadAsync: (b: Buffer) => Promise<{
      file: (name: string) => { async: (encoding: string) => Promise<string> } | null
    }>
  }
  const zip = await JSZip.loadAsync(buffer)
  const doc = zip.file('word/document.xml')
  if (!doc) throw new Error('Not a valid DOCX (word/document.xml missing)')
  const xml = await doc.async('string')
  return xml
    .replace(/<w:p[ >]/g, '\n<w:p ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
