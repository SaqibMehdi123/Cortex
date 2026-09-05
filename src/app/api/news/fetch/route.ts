import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import ZAI from 'z-ai-web-dev-sdk'

// POST /api/news/fetch — aggregate fresh AI news from famous labs, researchers & newsletters
export async function POST() {
  try {
    const zai = await ZAI.create()
    const customSources = await db.customSource.findMany({ where: { enabled: true } })

    const queries: { query: string; category: string }[] = [
      { query: 'OpenAI announcement news this week', category: 'company' },
      { query: 'Anthropic Claude announcement research news', category: 'company' },
      { query: 'Google DeepMind research announcement', category: 'lab' },
      { query: 'Meta AI FAIR research news', category: 'lab' },
      { query: 'Mistral AI news release', category: 'company' },
      { query: 'Microsoft Research AI news', category: 'lab' },
      { query: 'NVIDIA AI announcement news', category: 'company' },
      { query: 'Hugging Face news release blog', category: 'company' },
      { query: 'arXiv cs.AI cs.CL cs.LG notable new papers', category: 'research' },
      { query: 'The Batch deeplearning.ai newsletter latest issue', category: 'newsletter' },
      { query: 'Import AI newsletter latest issue', category: 'newsletter' },
      { query: 'TLDR AI newsletter latest', category: 'newsletter' },
      { query: 'Ahead of AI Sebastian Raschka newsletter latest', category: 'newsletter' },
    ]

    for (const src of customSources) {
      queries.push({ query: `${src.name} ${src.type} latest news ${src.url}`, category: src.type })
    }

    let totalNew = 0
    const collected: { title: string; url: string; source: string | null; snippet: string | null; category: string; publishedAt: Date | null }[] = []

    for (const { query, category } of queries) {
      try {
        const results = (await zai.functions.invoke('web_search', {
          query,
          num: 8,
          recency_days: 10,
        })) as Array<{
          url?: string
          name?: string
          title?: string
          snippet?: string
          host_name?: string
          publish_date?: string
        }>

        for (const r of results || []) {
          const url = r.url?.trim()
          const title = (r.title || r.name || '')?.trim()
          if (!url || !title || !url.startsWith('http')) continue
          if (collected.some((c) => c.url === url)) continue
          collected.push({
            title: title.slice(0, 400),
            url,
            source: r.host_name?.trim() || null,
            snippet: r.snippet?.trim()?.slice(0, 800) || null,
            category,
            publishedAt: r.publish_date ? new Date(r.publish_date) : null,
          })
        }
      } catch (searchErr) {
        console.error(`news search failed for "${query}"`, searchErr)
      }
    }

    // Dedupe against DB
    const fresh = []
    for (const c of collected) {
      const exists = await db.newsArticle.findUnique({ where: { url: c.url } })
      if (!exists) fresh.push(c)
    }

    // Batch-generate 3-line summaries for up to 25 fresh articles in one LLM call
    const summaries = new Map<string, string>()
    if (fresh.length > 0) {
      try {
        const listInput = fresh
          .slice(0, 25)
          .map((a, i) => `${i}. TITLE: ${a.title}\n   SNIPPET: ${a.snippet ?? '(none)'}`)
          .join('\n')

        const completion = await zai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content:
                'You write exactly-3-line news digests for an AI news radar. For EACH numbered item return one entry. Return ONLY a JSON array like [{"n":1,"summary":"3 short lines separated by \\n covering: what happened / why it matters / who is affected"}]. Keep each line under 90 chars. No markdown fences.',
            },
            { role: 'user', content: listInput },
          ],
          thinking: { type: 'disabled' },
        })

        const raw = (completion.choices[0]?.message?.content ?? '').replace(/```json|```/g, '').trim()
        const start = raw.indexOf('[')
        const end = raw.lastIndexOf(']')
        if (start !== -1 && end !== -1) {
          const arr = JSON.parse(raw.slice(start, end + 1)) as { n: number; summary: string }[]
          for (const item of arr) {
            const target = fresh[Number(item.n) - 1]
            if (target && typeof item.summary === 'string') summaries.set(target.url, item.summary.slice(0, 700))
          }
        }
      } catch (sumErr) {
        console.error('news summary batch failed', sumErr)
      }
    }

    for (const a of fresh) {
      await db.newsArticle.create({
        data: {
          title: a.title,
          url: a.url,
          source: a.source,
          summary: summaries.get(a.url) ?? a.snippet,
          category: a.category,
          publishedAt: a.publishedAt,
        },
      })
      totalNew++
    }

    const unreadCount = await db.newsArticle.count({ where: { read: false } })
    return NextResponse.json({ ok: true, totalNew, unreadCount })
  } catch (e) {
    console.error('POST /api/news/fetch error', e)
    return NextResponse.json({ error: 'Failed to fetch news. Try again.' }, { status: 500 })
  }
}
