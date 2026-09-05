import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// POST /api/opportunities/parse — paste raw email text, AI extracts structured opportunity
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const text = body?.text?.trim()

    if (!text) {
      return NextResponse.json({ error: 'Paste the email text first' }, { status: 400 })
    }

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: [
            'You extract structured internship/job information from raw emails.',
            'Return ONLY valid JSON (no markdown fences, no commentary) with exactly these keys:',
            '{"company": string, "role": string, "type": "internship"|"job"|"scholarship"|"event"|"referral", "sender": string, "deadline": string|null, "summary": string}',
            'Rules: deadline must be "YYYY-MM-DD" or null if not clearly stated. sender is the person/team who sent it ("" if unknown).',
            'summary is one short sentence about the offer/requirement. If the email is not about a job/internship opportunity, still extract best-effort values.',
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
    const result = {
      company: typeof parsed.company === 'string' ? parsed.company : '',
      role: typeof parsed.role === 'string' ? parsed.role : '',
      type: validTypes.includes(parsed.type) ? parsed.type : 'internship',
      sender: typeof parsed.sender === 'string' ? parsed.sender : '',
      deadline: typeof parsed.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.deadline) ? parsed.deadline : null,
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    }

    return NextResponse.json({ result })
  } catch (e) {
    console.error('POST /api/opportunities/parse error', e)
    return NextResponse.json({ error: 'AI extraction failed. Fill the form manually instead.' }, { status: 500 })
  }
}
