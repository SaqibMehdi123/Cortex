import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { deleteResumeFile } from '@/lib/agent/resume-storage'
import { AGENT_THREAD } from '@/lib/agent/threads'
import { deleteByRef } from '@/lib/storage'

export const runtime = 'nodejs'

// DELETE /api/agent/data — one-click "delete my agent data" (Settings card).
// Removes, for the signed-in account only: every CV file (storage + rows),
// the candidate profile, every application draft (plus generated package
// files) and the whole agent chat thread. The pipeline (Opportunities) and
// tasks survive — only the agent's own working data is wiped.
export async function DELETE() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const [resumes, drafts] = await Promise.all([
      db.resume.findMany({ where: { userId: user.id }, select: { id: true, fileRef: true } }),
      db.applicationDraft.findMany({ where: { userId: user.id }, select: { id: true, packageRef: true } }),
    ])

    // Best-effort storage cleanup first (never blocks the DB delete).
    await Promise.all([
      ...resumes.map((r) => deleteResumeFile(r.fileRef)),
      ...drafts.map((d) => (d.packageRef ? deleteByRef(d.packageRef) : Promise.resolve())),
    ])

    await db.$transaction([
      db.applicationDraft.deleteMany({ where: { userId: user.id } }),
      db.candidateProfile.deleteMany({ where: { userId: user.id } }),
      db.resume.deleteMany({ where: { userId: user.id } }),
      db.chatMessage.deleteMany({ where: { userId: user.id, thread: AGENT_THREAD } }),
    ])

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/agent/data error', e)
    return NextResponse.json({ error: 'Failed to delete agent data' }, { status: 500 })
  }
}
