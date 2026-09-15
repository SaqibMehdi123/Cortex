// Shared scholarship/exchange-programme feed pipeline.
//
// Two consumers:
//   • POST /api/scholarships/fetch  — per-user on-demand sync (hybrid
//     auto-sync contract, sync-guarded, inserts into ONE user's list)
//   • GET  /api/cron/feeds          — the daily feed pull that fans fresh
//     rows out to EVERY verified account, so the Career tab and the Exchanges
//     filter are stocked even for users who have not opened the app in days
//
// The feed fetch + classification is intentionally shared: one code path, one
// place to add sources or tune classifiers. "Exchange programmes" (cultural
// exchanges, summits, MUNs, hackathons) ride the same Scholarship model with
// kind='exchange' — see classifyScholarshipKind in scholarship-feeds.

import Parser from 'rss-parser'
import {
  SCHOLARSHIP_FEEDS,
  classifyScholarshipLevel,
  classifyScholarshipFunding,
  classifyScholarshipKind,
  extractScholarshipCountry,
  type ScholarshipLevel,
} from '@/lib/scholarship-feeds'

export const MAX_PER_SOURCE = 20
export const MAX_AGE_DAYS = 365 // scholarship cycles run for months — deadlines are often 1-2 years out

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; CortexScholarships/2.0; +https://cortex.scrutinies.dev)',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
})

// Feed housekeeping posts ("How to use …", site announcements) are not opportunities.
const SKIP_TITLE = /^how to use\b|^welcome to\b|^about\b/i

export interface ScholarshipRow {
  title: string
  url: string
  provider: string
  source: string
  level: ScholarshipLevel
  kind: string // scholarship | exchange
  funding: string | null
  country: string | null
  summary: string | null
}

export interface PerSourceResult {
  name: string
  ok: boolean
  count: number
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

/**
 * Pull every curated feed once and return classified, globally-deduped rows
 * (by URL) plus a per-source health report. Never throws for a single dead
 * feed — failures degrade to ok:false in perSource, like the original route.
 */
export async function fetchAllScholarshipRows(): Promise<{
  rows: ScholarshipRow[]
  perSource: PerSourceResult[]
}> {
  const results = await Promise.allSettled(
    SCHOLARSHIP_FEEDS.map(async (feed): Promise<ScholarshipRow[]> => {
      const out = await parser.parseURL(feed.url)
      const rows: ScholarshipRow[] = []
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
          kind: classifyScholarshipKind(title),
          funding: classifyScholarshipFunding(title),
          country: extractScholarshipCountry(title),
          summary: summary || null,
        })
        if (rows.length >= MAX_PER_SOURCE) break
      }
      return rows
    })
  )

  const perSource: PerSourceResult[] = SCHOLARSHIP_FEEDS.map((s, i) => ({
    name: s.name,
    ok: results[i].status === 'fulfilled',
    count: results[i].status === 'fulfilled' ? results[i].value.length : 0,
  }))

  // in-batch dedupe by URL — first source that surfaced a URL wins
  const byUrl = new Map<string, ScholarshipRow>()
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    for (const row of r.value) if (!byUrl.has(row.url)) byUrl.set(row.url, row)
  }
  return { rows: Array.from(byUrl.values()), perSource }
}
