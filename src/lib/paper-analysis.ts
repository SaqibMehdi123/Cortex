import { createAI } from '@/lib/ai'
import { db } from '@/lib/db'

// Analyze one paper with the LLM: problem solved / innovation / key results /
// why it matters. Used by the auto-analysis in papers/fetch and the
// on-demand POST /api/papers/[id]/analyze route.
export async function analyzePaper(paperId: string) {
  const paper = await db.paper.findUnique({ where: { id: paperId } })
  if (!paper) throw new Error('Paper not found')
  const zai = await createAI()

  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content:
          'You analyze ML/AI research papers for a researcher audience. Given a title and abstract, return ONLY a JSON object: {"tldr": "1-2 sentence plain-English summary", "problem": "the specific problem the paper solves and why existing approaches fall short (2-3 sentences)", "innovation": "the key novel idea/method/technique introduced (2-3 sentences)", "results": ["short key result / claim", "..."], "whyItMatters": "who should care and what it enables (1-2 sentences)"}. The results array should contain 2-4 concrete findings or numbers if stated. No markdown fences, no extra keys.',
      },
      {
        role: 'user',
        content: `TITLE: ${paper.title}\nAUTHORS: ${paper.authors ?? 'unknown'}\nABSTRACT: ${paper.abstract ?? '(not available)'}`,
      },
    ],
    thinking: { type: 'disabled' },
  })

  const raw = (completion.choices[0]?.message?.content ?? '').replace(/```json|```/g, '').trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('Analysis response was not valid JSON')
  const parsed = JSON.parse(raw.slice(start, end + 1)) as {
    tldr?: string
    problem?: string
    innovation?: string
    results?: string[]
    whyItMatters?: string
  }

  const updated = await db.paper.update({
    where: { id: paperId },
    data: {
      tldr: parsed.tldr?.slice(0, 600) ?? null,
      problem: parsed.problem?.slice(0, 1200) ?? null,
      innovation: parsed.innovation?.slice(0, 1200) ?? null,
      results: JSON.stringify((parsed.results ?? []).slice(0, 4)),
      whyMatters: parsed.whyItMatters?.slice(0, 800) ?? null,
      analyzedAt: new Date(),
    },
  })
  return updated
}
