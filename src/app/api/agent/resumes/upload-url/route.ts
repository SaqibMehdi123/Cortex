import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { makeStorageKey, presignR2Upload, r2Configured, storageMode } from '@/lib/storage'

export const runtime = 'nodejs'

// GET /api/agent/resumes/upload-url — mode probe for the client uploader.
//   r2   → client POSTs here for a presigned PUT, then calls parse-cv with JSON
//   else → client sends multipart FormData straight to parse-cv
export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  return NextResponse.json({ mode: storageMode() })
}

// POST /api/agent/resumes/upload-url — presign a browser → R2 PUT (r2 mode).
// Mirrors /api/documents/upload-url's r2 branch; private bucket, 1h PUT.
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    if (!r2Configured()) {
      return NextResponse.json({ error: 'Presigned uploads are only available in r2 mode' }, { status: 400 })
    }

    const body = (await req.json().catch(() => null)) as { name?: string; size?: number; contentType?: string } | null
    const name = (body?.name || 'cv.pdf').replace(/[\r\n"\\]/g, '').slice(0, 200) || 'cv.pdf'
    if (!/\.(pdf|docx)$/i.test(name)) {
      return NextResponse.json({ error: 'Only PDF and DOCX CVs are supported right now' }, { status: 400 })
    }
    const size = Number(body?.size)
    if (!Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: 'Missing file size' }, { status: 400 })
    }
    const MAX = 10 * 1024 * 1024
    if (size > MAX) {
      return NextResponse.json({ error: `CV is larger than ${MAX / (1024 * 1024)} MB — that is the current limit` }, { status: 413 })
    }

    const key = makeStorageKey(user.id, name)
    const contentType = /\.docx$/i.test(name)
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/pdf'
    const uploadUrl = await presignR2Upload(key, contentType)

    return NextResponse.json({ key, uploadUrl, fileRef: `r2://${key}`, contentType })
  } catch (e) {
    console.error('POST /api/agent/resumes/upload-url error', e)
    return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 })
  }
}
