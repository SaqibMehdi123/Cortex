import { NextRequest, NextResponse } from 'next/server'
import Parser from 'rss-parser'
import { db } from '@/lib/db'
import { createAI } from '@/lib/ai'
import { CURATED_FEEDS, stripHtml, type FeedSource } from '@/lib/feeds'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

export const maxDuration = 120

// Auto-refresh guardrails: one fetch per user at a time, and auto (non-forced)
// calls are rate-limited so a stuck interval or multiple tabs can't hammer the
// RSS feeds or burn AI summary tokens. Manual clicks always send force:true.
const AUTO_COOLDOWN_MS = 5 * 60_000
const runningFetches = new Set<string>()

const parser = new Parser({
  timeout: 20000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; CortexNewsRadar/2.0; +https://cortex.app)',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
  customFields: { item: [['content:encoded', 'contentEncoded'], ['dc:creator', 'creator']] },
})

interface RawItem {
  title: string
  url: string
  source: string
  category: string
  snippet: string | null
  publishedAt: Date | null
}

const MAX_PER_SOURCE = 12
const MAX_AGE_DAYS = 90

// POST /api/news/fetch — pull REAL stories from curated RSS feeds + the user's
// custom sources. Every account gets its own feed copy so read/saved state and
// dedupe stay personal.
// Body (optional): { force?: boolean } — manual button sends force:true to skip
// the auto-refresh cooldown; automatic refreshes omit it.
export async function POST(req: NextRequest) {
  let userId: string | null = null
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()
    userId = user.id

    let force = false
    try {
      const body = (await req.json()) as { force?: boolean }
      force = body?.force === true
    } catch {} // empty body = auto refresh

    // Slim session shape → grab the fetch timestamp separately (one indexed row).
    const { lastNewsFetchAt } = (await db.user.findUnique({
      where: { id: user.id },
      select: { lastNewsFetchAt: true },
    })) ?? { lastNewsFetchAt: null }

    if (runningFetches.has(user.id)) {
      return NextResponse.json({ ok: true, skipped: 'in_progress', totalNew: 0, lastFetchedAt: lastNewsFetchAt })
    }
    if (!force && lastNewsFetchAt && Date.now() - lastNewsFetchAt.getTime() < AUTO_COOLDOWN_MS) {
      return NextResponse.json({ ok: true, skipped: 'cooldown', totalNew: 0, lastFetchedAt: lastNewsFetchAt })
    }
    runningFetches.add(user.id)

    const customSources = await db.customSource.findMany({ where: { userId: user.id, enabled: true } })

    const sources: FeedSource[] = [
      ...CURATED_FEEDS,
      ...customSources.map((s) => ({ name: s.name, url: s.url, homepage: s.url, category: s.type })),
    ]

    // Fetch all feeds in parallel — one failure must not break the rest.
    const results = await Promise.allSettled(
      sources.map(async (src): Promise<RawItem[]> => {
        const feed = await parser.parseURL(src.url)
        const items: RawItem[] = []
        const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000
        for (const item of feed.items ?? []) {
          const link = item.link?.trim()
          const title = item.title?.trim()
          if (!link || !title || !/^https?:\/\//.test(link)) continue
          const ts = item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : null
          if (ts && ts.getTime() < cutoff) continue
          const rawContent: string =
            (item as { contentEncoded?: string }).contentEncoded || item['content:encoded'] || item.content || item.summary || ''
          const text = stripHtml(String(rawContent)).slice(0, 900)
          items.push({
            title: title.slice(0, 400),
            url: link.split('?utm_')[0].split('&utm_')[0],
            source: src.name,
            category: src.category,
            snippet: text || null,
            publishedAt: ts && !isNaN(ts.getTime()) ? ts : null,
          })
          if (items.length >= MAX_PER_SOURCE) break
        }
        return items
      })
    )

    const perSource = sources.map((s, i) => {
      const r = results[i]
      return {
        name: s.name,
        ok: r.status === 'fulfilled',
        count: r.status === 'fulfilled' ? r.value.length : 0,
        error: r.status === 'rejected' ? String(r.reason).slice(0, 120) : null,
      }
    })

    // Collect + in-batch dedupe by URL
    const byUrl = new Map<string, RawItem>()
    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      for (const item of r.value) {
        if (!byUrl.has(item.url)) byUrl.set(item.url, item)
      }
    }
    const collected = Array.from(byUrl.values())
    if (collected.length === 0) {
      const lastFetchedAt = new Date()
      await db.user.update({ where: { id: user.id }, data: { lastNewsFetchAt: lastFetchedAt } })
      return NextResponse.json({ ok: true, totalNew: 0, perSource, lastFetchedAt, message: 'No new stories found in any feed.' })
    }

    // Dedupe against this user's existing feed in one query
    const existing = await db.newsArticle.findMany({
      where: { userId: user.id, url: { in: collected.map((c) => c.url) } },
      select: { url: true },
    })
    const existingSet = new Set(existing.map((e) => e.url))
    const fresh = collected.filter((c) => !existingSet.has(c.url))

    // Sort newest first so AI summary budget goes to freshest items
    fresh.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))

    // Batch-generate 3-line AI digests for the newest ~15 items in one LLM call
    const summaries = new Map<string, string>()
    if (fresh.length > 0) {
      try {
        const zai = await createAI()
        const batch = fresh.slice(0, 15)
        const listInput = batch
          .map((a, i) => `${i}. TITLE: ${a.title}\n   SOURCE: ${a.source}\n   CONTENT: ${a.snippet?.slice(0, 350) ?? '(none)'}`)
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
            const target = batch[Number(item.n) - 1]
            if (target && typeof item.summary === 'string') summaries.set(target.url, item.summary.slice(0, 700))
          }
        }
      } catch (sumErr) {
        console.error('news AI summary batch failed (falling back to RSS snippets)', sumErr)
      }
    }

    for (const a of fresh) {
      await db.newsArticle.create({
        data: {
          userId: user.id,
          title: a.title,
          url: a.url,
          source: a.source,
          summary: summaries.get(a.url) ?? a.snippet?.slice(0, 500) ?? null,
          category: a.category,
          publishedAt: a.publishedAt,
        },
      })
    }

    const unreadCount = await db.newsArticle.count({ where: { userId: user.id, read: false } })
    const lastFetchedAt = new Date()
    await db.user.update({ where: { id: user.id }, data: { lastNewsFetchAt: lastFetchedAt } })
    return NextResponse.json({ ok: true, totalNew: fresh.length, perSource, unreadCount, lastFetchedAt })
  } catch (e) {
    console.error('POST /api/news/fetch error', e)
    return NextResponse.json({ error: 'Failed to fetch news. Try again.' }, { status: 500 })
  } finally {
    if (userId) runningFetches.delete(userId)
  }
}
