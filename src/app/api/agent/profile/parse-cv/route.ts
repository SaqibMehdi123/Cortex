import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { guardUsage, isActivePro, limitMessage, usageFields } from '@/lib/entitlements'
import { aiConfigured, isAiUpstreamError } from '@/lib/ai'
import { extractPdfText } from '@/lib/pdf-extract'
import { parseCvText, CvParseError } from '@/lib/agent/profile'
import { extractDocxText, getResumeBuffer, putResumeFile, resumeExtFor, RESUME_MAX_BYTES } from '@/lib/agent/resume-storage'
import { writeAgentMessage, writeAgentUserMessage } from '@/lib/agent/threads'
import type { ProfileConfirmationCard, ParsedCV } from '@/lib/agent/types'

export const runtime = 'nodejs'
// PDF extraction + LLM parse can take a while — stay inside the Vercel window.
export const maxDuration = 60

function span(e: { start?: string | null; end?: string | null; current?: boolean }): string {
  const start = e.start || ''
  const end = e.current ? 'Present' : e.end || ''
  return [start, end].filter(Boolean).join(' – ')
}

function confirmationCard(resumeId: string, fileName: string, cv: ParsedCV): ProfileConfirmationCard {
  return {
    kind: 'profile_confirmation',
    resumeId,
    fileName,
    headline: cv.headline ?? null,
    skills: cv.skills ?? [],
    experience: (cv.experience ?? []).slice(0, 5).map((e) => ({ company: e.company, title: e.title, span: span(e) })),
    education: (cv.education ?? []).slice(0, 3).map((e) => ({ school: e.school, degree: [e.degree, e.field].filter(Boolean).join(' ') || 'Degree' })),
    location: cv.location ?? null,
    workAuth: cv.workAuth ?? null,
    links: cv.links ?? {},
  }
}

function readableError(e: unknown): { status: number; message: string } {
  if (e instanceof CvParseError) return { status: 422, message: e.message }
  if (isAiUpstreamError(e)) return { status: 502, message: e.message }
  return { status: 500, message: 'Failed to process the CV. Please try again.' }
}

// POST /api/agent/profile/parse-cv
// Two upload transports (client picks via GET /api/agent/resumes/upload-url):
//   r2 mode  → JSON { fileRef, fileName, mimeType, size } (browser PUT the
//              bytes straight to R2 with a presigned URL; we pull them back
//              server-side — no serverless request-cap exposure)
//   otherwise→ multipart/form-data with a `file` field (local disk mode)
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    if (!aiConfigured()) {
      return NextResponse.json(
        { error: 'AI is not configured on this deployment — set OPENAI_API_KEY (and OPENAI_BASE_URL for non-OpenAI providers), then redeploy' },
        { status: 503 }
      )
    }

    // One metered agent action per parse.
    const verdict = await guardUsage(user.id, 'agent', isActivePro(user))
    if (!verdict.allowed) {
      return NextResponse.json({ error: limitMessage('agent', verdict.limit), ...usageFields('agent', verdict) }, { status: 402 })
    }

    // ── Ingest the file (multipart or already-uploaded ref) ──────────────
    const contentType = req.headers.get('content-type') || ''
    let bytes: Buffer
    let fileName: string
    let mimeType: string
    let existingFileRef: string | null = null

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file')
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Attach a file in the `file` field' }, { status: 400 })
      }
      fileName = file.name || 'cv.pdf'
      mimeType = file.type || 'application/pdf'
      if (file.size > RESUME_MAX_BYTES) {
        return NextResponse.json({ error: `CV is larger than ${RESUME_MAX_BYTES / (1024 * 1024)} MB — that is the current limit` }, { status: 413 })
      }
      bytes = Buffer.from(await file.arrayBuffer())
    } else {
      const body = (await req.json().catch(() => null)) as { fileRef?: string; fileName?: string; mimeType?: string; size?: number } | null
      if (!body?.fileRef) return NextResponse.json({ error: 'fileRef is required' }, { status: 400 })
      fileName = (body.fileName || 'cv.pdf').replace(/[\r\n"\\]/g, '').slice(0, 200)
      mimeType = body.mimeType || 'application/pdf'
      if (typeof body.size === 'number' && body.size > RESUME_MAX_BYTES) {
        return NextResponse.json({ error: `CV is larger than ${RESUME_MAX_BYTES / (1024 * 1024)} MB — that is the current limit` }, { status: 413 })
      }
      const pulled = await getResumeBuffer(body.fileRef)
      if (!pulled) return NextResponse.json({ error: 'Could not read the uploaded file — please try again' }, { status: 400 })
      bytes = pulled
      existingFileRef = body.fileRef
    }

    const ext = resumeExtFor(mimeType, fileName)
    if (!ext) {
      return NextResponse.json({ error: 'Only PDF and DOCX CVs are supported right now' }, { status: 400 })
    }

    // ── Extract text ─────────────────────────────────────────────────────
    let rawText = ''
    let extractWarning: string | null = null
    if (ext === 'pdf') {
      const result = await extractPdfText(new Uint8Array(bytes), bytes.length, { budgetMs: 40_000 })
      rawText = result.text
      extractWarning = result.warning ?? null
      if (!rawText && !extractWarning) extractWarning = 'No extractable text found in the PDF.'
    } else {
      try {
        rawText = await extractDocxText(bytes)
      } catch {
        return NextResponse.json({ error: 'Could not read this DOCX — try exporting it as PDF and uploading again' }, { status: 422 })
      }
    }

    // ── LLM parse (grounded — never invents) ─────────────────────────────
    const cv = await parseCvText(rawText)

    // ── Store file + persist Resume ──────────────────────────────────────
    const existingCount = await db.resume.count({ where: { userId: user.id } })
    const isDefault = existingCount === 0
    const resume = await db.resume.create({
      data: {
        userId: user.id,
        label: fileName.replace(/\.[^.]+$/, '').slice(0, 120) || 'CV',
        fileName: fileName.slice(0, 200),
        mimeType: ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: bytes.length,
        rawText: rawText.slice(0, 400_000),
        parsed: JSON.parse(JSON.stringify(cv)),
        isDefault,
        fileRef: existingFileRef ?? '', // filled right after for disk mode
      },
    })
    if (!existingFileRef) {
      const ref = await putResumeFile(user.id, resume.id, bytes, ext, fileName)
      await db.resume.update({ where: { id: resume.id }, data: { fileRef: ref } })
      resume.fileRef = ref
    }
    if (isDefault) {
      // exactly one default
      await db.resume.updateMany({ where: { userId: user.id, id: { not: resume.id } }, data: { isDefault: false } })
    }

    // ── Upsert CandidateProfile (parsed fields refreshed, user fields kept) ──
    const profileData = {
      headline: cv.headline,
      summary: cv.summary,
      skills: JSON.parse(JSON.stringify(cv.skills ?? [])),
      experience: JSON.parse(JSON.stringify(cv.experience ?? [])),
      education: JSON.parse(JSON.stringify(cv.education ?? [])),
      links: JSON.parse(JSON.stringify(cv.links ?? {})),
      phone: cv.phone,
      location: cv.location,
      workAuth: cv.workAuth,
      resumeId: resume.id,
    }
    const profile = await db.candidateProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...profileData },
      update: profileData,
    })

    // ── Chat trail: user upload + assistant confirmation card ────────────
    const userMsg = await writeAgentUserMessage(user.id, `Uploaded CV: ${fileName}`, { ref: resume.fileRef, name: fileName })
    const card = confirmationCard(resume.id, fileName, cv)
    const assistantMsg = await writeAgentMessage(
      user.id,
      `I read your CV. Here is what I found — every answer I give from now on is grounded in this profile. Check it and tell me if anything is off.`,
      card
    )

    return NextResponse.json({
      resumeId: resume.id,
      isDefault,
      profile,
      card,
      messages: [userMsg, assistantMsg],
      warning: extractWarning,
    })
  } catch (e) {
    console.error('POST /api/agent/profile/parse-cv error', e)
    const { status, message } = readableError(e)
    return NextResponse.json({ error: message }, { status })
  }
}
