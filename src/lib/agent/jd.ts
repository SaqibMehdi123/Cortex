// Apply Agent — job description text hydration.
// Greenhouse and Lever expose public content endpoints per posting; both are
// already our richest Discover sources. Listings from other boards keep
// scoring on metadata (title/location) with lower confidence — that's honest
// and cheap. SSRF-safe via safeFetch (these are user-scoped data but the URLs
// originate from fetchers, not user input — still, policy holds).

import { db } from '@/lib/db'
import type { JobListing } from '@prisma/client'
import { safeFetch } from '@/lib/safe-fetch'

const MAX_DESC_CHARS = 6_000

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Board token from a hosted Greenhouse/Lever posting URL. */
export function boardTokenFromUrl(url: string, source: 'greenhouse' | 'lever'): string | null {
  try {
    const u = new URL(url)
    if (source === 'greenhouse') {
      // boards.greenhouse.io/<board>/jobs/<id> (also job-boards.greenhouse.io)
      if (!u.hostname.includes('greenhouse.io')) return null
      const seg = u.pathname.split('/').filter(Boolean)
      const ji = seg.indexOf('jobs')
      return ji > 0 ? seg[ji - 1] : seg[0] ?? null
    }
    // jobs.lever.co/<board>/<id>
    if (!u.hostname.includes('lever.co')) return null
    const seg = u.pathname.split('/').filter(Boolean)
    return seg[0] ?? null
  } catch {
    return null
  }
}

/** Fetch the JD text for one listing. Returns null when the board doesn't expose it. */
export async function fetchJdText(listing: Pick<JobListing, 'url' | 'source' | 'externalId'>): Promise<string | null> {
  const isGreenhouse = /greenhouse/i.test(listing.source) || listing.url.includes('greenhouse.io')
  const isLever = /lever/i.test(listing.source) || listing.url.includes('lever.co')
  try {
    if (isGreenhouse) {
      const board = boardTokenFromUrl(listing.url, 'greenhouse')
      if (!board || !listing.externalId) return null
      const res = await safeFetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${encodeURIComponent(listing.externalId)}?questions=false`, { timeoutMs: 10_000 })
      if (!res.ok) return null
      const data = (await res.json()) as { content?: string }
      return data.content ? stripHtml(data.content).slice(0, MAX_DESC_CHARS) || null : null
    }
    if (isLever) {
      const board = boardTokenFromUrl(listing.url, 'lever')
      if (!board || !listing.externalId) return null
      const res = await safeFetch(`https://api.lever.co/v0/postings/${encodeURIComponent(board)}/${encodeURIComponent(listing.externalId)}?mode=json`, { timeoutMs: 10_000 })
      if (!res.ok) return null
      const data = (await res.json()) as { descriptionPlain?: string; descriptionHTML?: string }
      const text = data.descriptionPlain || (data.descriptionHTML ? stripHtml(data.descriptionHTML) : '')
      return text ? text.slice(0, MAX_DESC_CHARS) : null
    }
  } catch {
    return null // board down / blocked — metadata scoring still applies
  }
  return null
}

/**
 * Hydrate descriptionText for the given listings (bounded). Only Greenhouse /
 * Lever content endpoints are used — everything else is left to metadata.
 * Returns how many listings gained text.
 */
export async function hydrateDescriptions(listings: JobListing[], budget = 10): Promise<number> {
  let filled = 0
  for (const listing of listings) {
    if (filled >= budget) break
    if (listing.descriptionText) continue
    const text = await fetchJdText(listing)
    if (text) {
      await db.jobListing.update({
        where: { id: listing.id },
        data: { descriptionText: text, descriptionFetchedAt: new Date() },
      })
      listing.descriptionText = text
      filled++
    }
  }
  return filled
}
