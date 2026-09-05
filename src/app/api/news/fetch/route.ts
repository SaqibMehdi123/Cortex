import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import ZAI from 'z-ai-web-dev-sdk'

// POST /api/news/fetch — search the live web for fresh AI news and store deduped results
export async function POST() {
  try {
    const zai = await ZAI.create()

    const queries = [
      { query: 'latest AI news announcement OpenAI Anthropic Google DeepMind', category: 'company' },
      { query: 'new AI research paper breakthrough this week', category: 'research' },
      { query: 'AI lab research blog post Meta FAIR Hugging Face Mistral', category: 'lab' },
    ]

    const created: number[] = [0, 0, 0]
    let totalNew = 0

    for (let i = 0; i < queries.length; i++) {
      const { query, category } = queries[i]
      try {
        const results = (await zai.functions.invoke('web_search', {
          query,
          num: 10,
          recency_days: 14,
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

          const exists = await db.newsArticle.findUnique({ where: { url } })
          if (exists) continue

          await db.newsArticle.create({
            data: {
              title: title.slice(0, 400),
              url,
              source: r.host_name?.trim() || null,
              summary: r.snippet?.trim()?.slice(0, 600) || null,
              category,
              publishedAt: r.publish_date ? new Date(r.publish_date) : null,
            },
          })
          created[i]++
          totalNew++
        }
      } catch (searchErr) {
        console.error(`news search failed for "${query}"`, searchErr)
      }
    }

    const unreadCount = await db.newsArticle.count({ where: { read: false } })
    return NextResponse.json({ ok: true, totalNew, unreadCount })
  } catch (e) {
    console.error('POST /api/news/fetch error', e)
    return NextResponse.json({ error: 'Failed to fetch news. Try again.' }, { status: 500 })
  }
}
