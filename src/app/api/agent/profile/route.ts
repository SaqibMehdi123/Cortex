import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import type { Prisma } from '@prisma/client'
import type { ProfilePrefs, ReusableAnswer } from '@/lib/agent/types'

export const runtime = 'nodejs'

function publicProfile(p: {
  id: string
  headline: string | null
  summary: string | null
  skills: Prisma.JsonValue | null
  experience: Prisma.JsonValue | null
  education: Prisma.JsonValue | null
  links: Prisma.JsonValue | null
  phone: string | null
  location: string | null
  workAuth: string | null
  salaryTarget: string | null
  prefs: Prisma.JsonValue | null
  answers: Prisma.JsonValue | null
  resumeId: string | null
  updatedAt: Date
}) {
  return p
}

// GET /api/agent/profile — profile + stored CVs (labels only, never file bytes)
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const [profile, resumes] = await Promise.all([
      db.candidateProfile.findUnique({ where: { userId: user.id } }),
      db.resume.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, label: true, fileName: true, mimeType: true, sizeBytes: true, isDefault: true, createdAt: true },
      }),
    ])

    return NextResponse.json({ profile: profile ? publicProfile(profile) : null, resumes })
  } catch (e) {
    console.error('GET /api/agent/profile error', e)
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
  }
}

// PATCH /api/agent/profile — hand corrections from the confirmation card and
// the Settings agent card. Only whitelisted fields are touched; prefs/answers
// survive CV re-parses by never being touched here unless explicitly sent.
export async function PATCH(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = (await req.json().catch(() => null)) as {
      headline?: string
      summary?: string
      skills?: string[]
      phone?: string
      location?: string
      workAuth?: string
      salaryTarget?: string
      links?: { linkedin?: string; github?: string; portfolio?: string }
      prefs?: ProfilePrefs
      answers?: ReusableAnswer[]
      defaultResumeId?: string
    } | null
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const clamp = (v: unknown, max: number): string | undefined =>
      typeof v === 'string' ? v.trim().slice(0, max) || undefined : undefined

    const data: Record<string, unknown> = {}
    if (body.headline !== undefined) data.headline = clamp(body.headline, 140) ?? null
    if (body.summary !== undefined) data.summary = clamp(body.summary, 600) ?? null
    if (Array.isArray(body.skills)) {
      data.skills = JSON.parse(
        JSON.stringify(
          body.skills.map((s) => String(s).trim().slice(0, 60)).filter(Boolean).slice(0, 24)
        )
      )
    }
    if (body.phone !== undefined) data.phone = clamp(body.phone, 40) ?? null
    if (body.location !== undefined) data.location = clamp(body.location, 160) ?? null
    if (body.workAuth !== undefined) data.workAuth = clamp(body.workAuth, 200) ?? null
    if (body.salaryTarget !== undefined) data.salaryTarget = clamp(body.salaryTarget, 80) ?? null
    if (body.links && typeof body.links === 'object') {
      const clean = {
        linkedin: clamp(body.links.linkedin, 300) ?? null,
        github: clamp(body.links.github, 300) ?? null,
        portfolio: clamp(body.links.portfolio, 300) ?? null,
      }
      data.links = JSON.parse(JSON.stringify(clean))
    }
    if (body.prefs && typeof body.prefs === 'object') {
      // MERGE with stored prefs — the confirmation chips, Settings card and
      // ATS toggle all PATCH different slices; none may wipe the others.
      const existingRow = await db.candidateProfile.findUnique({ where: { userId: user.id }, select: { prefs: true } })
      const existing = (existingRow?.prefs ?? {}) as Record<string, unknown>
      const incoming = body.prefs as ProfilePrefs & { atsOptIn?: unknown }
      const merged: Record<string, unknown> = { ...existing }
      if (incoming.roleFamilies !== undefined) merged.roleFamilies = incoming.roleFamilies
      if (incoming.locations !== undefined) merged.locations = incoming.locations
      if (incoming.remote !== undefined) merged.remote = ['remote', 'hybrid_onsite', 'any'].includes(String(incoming.remote)) ? incoming.remote : undefined
      if (incoming.types !== undefined) merged.types = incoming.types
      if (incoming.keywords !== undefined) merged.keywords = incoming.keywords
      if (typeof incoming.atsOptIn === 'boolean') merged.atsOptIn = incoming.atsOptIn
      // sanitize the merged result
      const clean: Record<string, unknown> = {}
      if (Array.isArray(merged.roleFamilies)) clean.roleFamilies = merged.roleFamilies.map(String).slice(0, 8)
      if (Array.isArray(merged.locations)) clean.locations = merged.locations.map((s) => String(s).trim().slice(0, 80)).filter(Boolean).slice(0, 8)
      if (typeof merged.remote === 'string') clean.remote = merged.remote
      if (Array.isArray(merged.types)) clean.types = merged.types.map(String).filter((t) => ['job', 'internship'].includes(t))
      if (Array.isArray(merged.keywords)) clean.keywords = merged.keywords.map((s) => String(s).trim().slice(0, 60)).filter(Boolean).slice(0, 10)
      if (typeof merged.atsOptIn === 'boolean') clean.atsOptIn = merged.atsOptIn
      data.prefs = JSON.parse(JSON.stringify(clean))
    }
    if (Array.isArray(body.answers)) {
      const clean = body.answers
        .filter((a) => a && typeof a.question === 'string' && typeof a.answer === 'string' && a.question.trim() && a.answer.trim())
        .slice(0, 30)
        .map((a) => ({ question: a.question.trim().slice(0, 300), answer: a.answer.trim().slice(0, 1500) }))
      data.answers = JSON.parse(JSON.stringify(clean))
    }

    const profile = await db.candidateProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    })

    if (body.defaultResumeId) {
      const owned = await db.resume.findFirst({ where: { id: body.defaultResumeId, userId: user.id } })
      if (owned) {
        await db.resume.updateMany({ where: { userId: user.id, id: { not: owned.id } }, data: { isDefault: false } })
        await db.resume.update({ where: { id: owned.id }, data: { isDefault: true } })
        await db.candidateProfile.update({ where: { userId: user.id }, data: { resumeId: owned.id } })
      }
    }

    const fresh = await db.candidateProfile.findUnique({ where: { userId: user.id } })
    void profile
    return NextResponse.json({ profile: fresh ? publicProfile(fresh) : null })
  } catch (e) {
    console.error('PATCH /api/agent/profile error', e)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
