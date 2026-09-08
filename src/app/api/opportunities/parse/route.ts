import { NextRequest, NextResponse } from 'next/server'
import { createAI } from '@/lib/ai'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

// Long AI generations must not hit the default serverless timeout (Vercel Hobby caps at 60 s).
export const maxDuration = 60

// POST /api/opportunities/parse — paste raw email, AI extracts + classifies
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const text = body?.text?.trim()

    if (!text) {
      return NextResponse.json({ error: 'Paste the email text first' }, { status: 400 })
    }

    const zai = await createAI()
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: [
            'You extract structured internship/job information from raw emails and classify them.',
            'Return ONLY valid JSON (no markdown fences) with exactly these keys:',
            '{"company": string, "role": string, "type": "internship"|"job"|"scholarship"|"event"|"referral", "classification": "opportunity"|"rejection"|"interview"|"offer"|"deadline", "sender": string, "deadline": string|null, "nextAction": string|null, "summary": string}',
            'Rules: deadline must be "YYYY-MM-DD" or null. classification: rejection if it declines; interview if interview invite; offer if offer; deadline if it warns about an approaching deadline; otherwise opportunity.',
            'nextAction is one short imperative sentence (e.g. "Submit application by Oct 1") or null.',
            'summary is one short sentence. If the email is not job-related, still best-effort extract.',
          ].join('\n'),
        },
        { role: 'user', content: text.slice(0, 12000) },
      ],
      thinking: { type: 'disabled' },
    })

    let raw = completion.choices[0]?.message?.content ?? ''
    raw = raw.replace(/```json|```/g, '').trim()

    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end === -1) {
      return NextResponse.json({ error: 'Could not parse this email. Fill the form manually instead.' }, { status: 422 })
    }

    const parsed = JSON.parse(raw.slice(start, end + 1))

    const validTypes = ['internship', 'job', 'scholarship', 'event', 'referral']
    const validClasses = ['opportunity', 'rejection', 'interview', 'offer', 'deadline']
    const result = {
      company: typeof parsed.company === 'string' ? parsed.company : '',
      role: typeof parsed.role === 'string' ? parsed.role : '',
      type: validTypes.includes(parsed.type) ? parsed.type : 'internship',
      classification: validClasses.includes(parsed.classification) ? parsed.classification : 'opportunity',
      sender: typeof parsed.sender === 'string' ? parsed.sender : '',
      deadline: typeof parsed.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.deadline) ? parsed.deadline : null,
      nextAction: typeof parsed.nextAction === 'string' ? parsed.nextAction : null,
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    }

    return NextResponse.json({ result })
  } catch (e) {
    console.error('POST /api/opportunities/parse error', e)
    return NextResponse.json({ error: 'AI extraction failed. Fill the form manually instead.' }, { status: 500 })
  }
}
