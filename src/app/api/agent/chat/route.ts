import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { guardUsage, isActivePro, limitMessage, peekUsage, usageFields } from '@/lib/entitlements'
import { aiChatCompletion, aiConfigured, isAiUpstreamError } from '@/lib/ai'
import { AGENT_THREAD, agentHistory, writeAgentMessage, writeAgentUserMessage } from '@/lib/agent/threads'
import type { PrefsPromptCard } from '@/lib/agent/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const PREFS_PROMPT: PrefsPromptCard = {
  kind: 'prefs_prompt',
  fields: [
    {
      key: 'remote',
      label: 'Work setting',
      options: [
        { label: 'Remote only', value: 'remote' },
        { label: 'Hybrid or onsite OK', value: 'hybrid_onsite' },
        { label: 'Any', value: 'any' },
      ],
    },
    {
      key: 'types',
      label: 'Looking for',
      options: [
        { label: 'Full-time jobs', value: 'job' },
        { label: 'Internships', value: 'internship' },
        { label: 'Both', value: 'job,internship' },
      ],
    },
  ],
}

/** Latest assistant card of a given kind in the agent thread (most recent first). */
async function latestCard(userId: string, kind: string) {
  const rows = await db.chatMessage.findMany({
    where: { userId, thread: AGENT_THREAD, role: 'assistant' },
    orderBy: { createdAt: 'desc' },
    take: 6,
  })
  return rows.find((r) => (r.payload as { kind?: string } | null)?.kind === kind) ?? null
}

/** One-line profile digest for the brain prompt. */
function profileDigest(p: {
  headline: string | null
  skills: unknown
  location: string | null
  workAuth: string | null
  salaryTarget: string | null
  prefs: unknown
} | null): string {
  if (!p) return 'No CV parsed yet.'
  const skills = Array.isArray(p.skills) ? (p.skills as string[]).slice(0, 12).join(', ') : ''
  const prefs = (p.prefs ?? {}) as { roleFamilies?: string[]; remote?: string; types?: string[] }
  return [
    `Headline: ${p.headline ?? '—'}`,
    `Skills: ${skills || '—'}`,
    `Location: ${p.location ?? '—'} · Work auth: ${p.workAuth ?? '—'} · Salary target: ${p.salaryTarget ?? 'not set'}`,
    `Preferences: roles=${prefs.roleFamilies?.join('/') || 'any'}, remote=${prefs.remote || 'any'}, types=${prefs.types?.join('/') || 'any'}`,
  ].join('\n')
}

// GET /api/agent/chat — agent thread + capability status for the dock
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const [messages, profile, resumeCount] = await Promise.all([
      db.chatMessage.findMany({ where: { userId: user.id, thread: AGENT_THREAD }, orderBy: { createdAt: 'asc' }, take: 200 }),
      db.candidateProfile.findUnique({ where: { userId: user.id } }),
      db.resume.count({ where: { userId: user.id } }),
    ])

    return NextResponse.json({
      messages,
      hasProfile: Boolean(profile),
      hasResume: resumeCount > 0,
      profileHeadline: profile?.headline ?? null,
      usage: await peekUsage(user.id, 'agent', isActivePro(user)),
    })
  } catch (e) {
    console.error('GET /api/agent/chat error', e)
    return NextResponse.json({ error: 'Failed to load agent messages' }, { status: 500 })
  }
}

// POST /api/agent/chat — one agent turn (deterministic handlers first, LLM fallback)
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = (await req.json().catch(() => null)) as { message?: string } | null
    const message: string = body?.message?.trim() ?? ''
    if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 })

    if (!aiConfigured()) {
      return NextResponse.json(
        { error: 'AI is not configured on this deployment — set OPENAI_API_KEY (and OPENAI_BASE_URL for non-OpenAI providers), then redeploy' },
        { status: 503 }
      )
    }

    const verdict = await guardUsage(user.id, 'agent', isActivePro(user))
    if (!verdict.allowed) {
      return NextResponse.json({ error: limitMessage('agent', verdict.limit), ...usageFields('agent', verdict) }, { status: 402 })
    }

    const profile = await db.candidateProfile.findUnique({ where: { userId: user.id } })
    const userMsg = await writeAgentUserMessage(user.id, message)

    // ── Deterministic intake: shortlist trigger ──────────────────────────
    if (/\b(shortlist|match|top jobs|find (me )?jobs|score)\b/i.test(message) && profile) {
      const { runShortlist } = await import('@/lib/agent/match')
      try {
        const summary = await runShortlist(user.id)
        const cardMsg = await db.chatMessage.findFirst({
          where: { userId: user.id, thread: AGENT_THREAD, role: 'assistant' },
          orderBy: { createdAt: 'desc' },
        })
        const messages = summary.scored === 0
          ? [userMsg, await writeAgentMessage(user.id, 'Nothing on your board scored above the bar right now — either no fresh listings match your preferences, or the board needs a refresh on the Discover tab. Check back after the next fetch.')]
          : [userMsg, cardMsg].filter(Boolean)
        return NextResponse.json({
          userMessage: userMsg,
          assistantMessage: messages[messages.length - 1]!,
          usage: await peekUsage(user.id, 'agent', isActivePro(user)),
        })
      } catch (err) {
        console.error('agent shortlist trigger failed', err)
        const assistantMsg = await writeAgentMessage(user.id, 'The shortlist run failed — try again in a moment, or use the Discover tab refresh first.')
        return NextResponse.json({ userMessage: userMsg, assistantMessage: assistantMsg, usage: await peekUsage(user.id, 'agent', isActivePro(user)) })
      }
    }

    // ── Deterministic intake: profile confirmation ───────────────────────
    // "Looks right" on the confirmation card lands here — no LLM call needed;
    // we save the ack and immediately hand over the preference prompt chips.
    const looksRight = /^(looks? (right|good)|all (right|good|correct)|correct|yes(,? (it'?s|that'?s)? ?(correct|right))?|✓+|confirmed?)\b/i
    if (looksRight.test(message) && profile) {
      const latestConfirmation = await latestCard(user.id, 'profile_confirmation')
      if (latestConfirmation) {
        const assistantMsg = await writeAgentMessage(
          user.id,
          'Profile saved. Two quick preferences and I can shortlist with far better accuracy — tap what fits (or skip):',
          PREFS_PROMPT
        )
        return NextResponse.json({ userMessage: userMsg, assistantMessage: assistantMsg, usage: await peekUsage(user.id, 'agent', isActivePro(user)) })
      }
    }

    // ── Deterministic intake: preference chips & free-text answers ────────
    // The prefs card's chips PATCH the profile directly from the UI; free-text
    // salary replies land here. Cheap regex — no NLU pretense.
    const pendingPrefs = await latestCard(user.id, 'prefs_prompt')
    const salaryMatch = message.match(/(\d{2,6})(?:[.,]\d+)?\s*(k|lac|lakh)?\s*(pkr|rs|rupees)?/i)
    if (pendingPrefs && salaryMatch && /\b(salary|expect|ctc|pay|pkr|rs)\b|^\s*\d/i.test(message)) {
      let value = `${salaryMatch[1]}${salaryMatch[2] ? salaryMatch[2].toLowerCase() : ''}`
      if (salaryMatch[3] || /pkr|rs/i.test(message)) value += ' PKR'
      await db.candidateProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, salaryTarget: value },
        update: { salaryTarget: value },
      })
      const assistantMsg = await writeAgentMessage(user.id, `Noted — salary expectation saved as ${value}. You can change it anytime in Settings → Apply Agent. Want me to shortlist jobs against your profile now? Just say "shortlist".`)
      return NextResponse.json({ userMessage: userMsg, assistantMessage: assistantMsg, usage: await peekUsage(user.id, 'agent', isActivePro(user)) })
    }

    // ── Agent brain: grounded small-talk / status / guidance ─────────────
    const history = await agentHistory(user.id, 20)
    const completion = await aiChatCompletion({
      messages: [
        {
          role: 'system',
          content: `You are Cortex's Apply Agent. You help the user apply to jobs: you parsed their CV, you shortlist the Discover board against it, and you prepare application drafts they approve. Rules: never fabricate experience; never promise to submit anything without their explicit approval of a preview; keep replies under 120 words; use markdown.

Profile on file:
${profileDigest(profile)}

Capabilities you can mention (exact triggers the UI handles):
- Upload or re-upload a CV with the paperclip (PDF/DOCX, ≤10 MB).
- Say "shortlist" to score the Discover board and get top matches.
- Preferences (remote, job/internship, salary) can be set here or in Settings → Apply Agent.`,
        },
        ...history.slice(-12).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ],
      temperature: 0.4,
      max_tokens: 400,
    })
    const reply = completion.choices[0]?.message?.content ?? 'Sorry — I hit an error. Please try again.'
    const assistantMsg = await writeAgentMessage(user.id, reply)

    return NextResponse.json({ userMessage: userMsg, assistantMessage: assistantMsg, usage: await peekUsage(user.id, 'agent', isActivePro(user)) })
  } catch (e) {
    console.error('POST /api/agent/chat error', e)
    if (isAiUpstreamError(e)) {
      return NextResponse.json({ error: e.message }, { status: 502 })
    }
    return NextResponse.json({ error: 'Agent request failed. Please try again.' }, { status: 500 })
  }
}

// DELETE /api/agent/chat — clear the agent conversation
export async function DELETE() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()
    await db.chatMessage.deleteMany({ where: { userId: user.id, thread: AGENT_THREAD } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/agent/chat error', e)
    return NextResponse.json({ error: 'Failed to clear conversation' }, { status: 500 })
  }
}
