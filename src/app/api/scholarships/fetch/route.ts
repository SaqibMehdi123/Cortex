import { NextRequest, NextResponse } from 'next/server'
import Parser from 'rss-parser'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { beginSync, stampSync, abortSync } from '@/lib/sync-guard'
import { SCHOLARSHIP_FEEDS, classifyScholarshipLevel, classifyScholarshipFunding, extractScholarshipCountry, type ScholarshipLevel } from '@/lib/scholarship-feeds'

export const maxDuration = 60

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; CortexScholarships/2.0; +https://cortex.app)',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
})

const MAX_PER_SOURCE = 20
const MAX_AGE_DAYS = 365 // scholarship cycles run for months — deadlines are often 1-2 years out

// Feed housekeeping posts ("How to use …", site announcements) are not opportunities.
const SKIP_TITLE = /^how to use\b|^welcome to\b|^about\b/i

interface Row {
  title: string
  url: string
  provider: string
  source: string
  level: ScholarshipLevel
  funding: string | null
  country: string | null
  summary: string | null
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

// POST /api/scholarships/fetch — pull masters/PhD scholarships & fully-funded
// opportunities from curated feeds into the account's own list. Per-user
// dedupe by URL, same hybrid auto-sync contract as news/papers/jobs.
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
    } catch {} // empty body = auto sync

    const guard = await beginSync(user.id, 'scholarships', force)
    if (guard.skip) {
      return NextResponse.json({ ok: true, skipped: guard.reason, added: 0, total: 0, perSource: [], lastFetchedAt: guard.lastFetchedAt })
    }

    const results = await Promise.allSettled(
      SCHOLARSHIP_FEEDS.map(async (feed): Promise<Row[]> => {
        const out = await parser.parseURL(feed.url)
        const rows: Row[] = []
        const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000
        for (const item of out.items ?? []) {
          const link = item.link?.trim()
          const title = item.title?.trim()
          if (!link || !title || !/^https?:\/\//.test(link)) continue
          if (SKIP_TITLE.test(title)) continue
          const ts = item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : null
          if (ts && !isNaN(ts.getTime()) && ts.getTime() < cutoff) continue
          const raw = String((item as { contentEncoded?: string }).contentEncoded || item['content:encoded'] || item.content || item.summary || '')
          const summary = stripHtml(raw).slice(0, 400)
          rows.push({
            title: title.slice(0, 300),
            url: link.split('?utm_')[0].split('&utm_')[0],
            provider: feed.name,
            source: feed.key,
            level: classifyScholarshipLevel(title),
            funding: classifyScholarshipFunding(title),
            country: extractScholarshipCountry(title),
            summary: summary || null,
          })
          if (rows.length >= MAX_PER_SOURCE) break
        }
        return rows
      })
    )

    const perSource = SCHOLARSHIP_FEEDS.map((s, i) => ({
      name: s.name,
      ok: results[i].status === 'fulfilled',
      count: results[i].status === 'fulfilled' ? results[i].value.length : 0,
    }))

    // in-batch dedupe by URL
    const byUrl = new Map<string, Row>()
    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      for (const row of r.value) if (!byUrl.has(row.url)) byUrl.set(row.url, row)
    }
    const collected = Array.from(byUrl.values())

    let added = 0
    if (collected.length > 0) {
      const existing = await db.scholarship.findMany({
        where: { userId: user.id, url: { in: collected.map((c) => c.url) } },
        select: { url: true },
      })
      const seen = new Set(existing.map((e) => e.url))
      const fresh = collected.filter((c) => !seen.has(c.url))
      if (fresh.length > 0) {
        const res = await db.scholarship.createMany({
          data: fresh.map((r) => ({
            userId: user.id,
            title: r.title,
            provider: r.provider,
            url: r.url,
            level: r.level,
            funding: r.funding,
            country: r.country,
            summary: r.summary,
            source: r.source,
          })),
        })
        added = res.count
      }
    }

    const total = await db.scholarship.count({ where: { userId: user.id } })
    const lastFetchedAt = await stampSync(user.id, 'scholarships')
    return NextResponse.json({ ok: true, added, total, perSource, lastFetchedAt })
  } catch (e) {
    console.error('POST /api/scholarships/fetch error', e)
    return NextResponse.json({ error: 'Failed to fetch scholarships. Try again.' }, { status: 500 })
  } finally {
    // Error path never stamps — always release the lock (no-op if stamped).
    if (userId) abortSync(userId, 'scholarships')
  }
}
