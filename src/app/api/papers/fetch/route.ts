import { NextResponse } from 'next/server'
import Parser from 'rss-parser'
import { db } from '@/lib/db'
import { analyzePaper } from '@/lib/paper-analysis'
import { getSessionUser, unauthorized } from '@/lib/auth-server'

export const maxDuration = 60

interface HfPaper {
  id: string
  title: string
  summary?: string
  authors?: { name?: string }[]
  publishedAt?: string
  upvotes?: number
  projectPage?: string
}

const MAX_AGE_DAYS = 30

// POST /api/papers/fetch — pull REAL research papers from Hugging Face Daily
// Papers + the arXiv announcement API (paperswithcode.com was sunset in 2025
// and redirects to Hugging Face, which now hosts the paper+code index).
// Each account keeps its own paper feed (per-user dedupe + saved state).
export async function POST() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const collected = new Map<string, {
      arxivId: string
      title: string
      authors: string | null
      abstract: string | null
      url: string
      pdfUrl: string
      source: string
      upvotes: number
      publishedAt: Date | null
    }>()

    // ── Source 1: Hugging Face Daily Papers (JSON API, community-upvoted) ──
    try {
      const res = await fetch('https://huggingface.co/api/daily_papers', {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CortexPapers/1.0)' },
        signal: AbortSignal.timeout(25000),
      })
      if (res.ok) {
        const data = (await res.json()) as { paper?: HfPaper }[]
        for (const entry of data.slice(0, 60)) {
          const p = entry.paper
          if (!p?.id || !p.title) continue
          const arxivId = p.id.trim()
          if (collected.has(arxivId)) continue
          const ts = p.publishedAt ? new Date(p.publishedAt) : null
          collected.set(arxivId, {
            arxivId,
            title: p.title.replace(/\s+/g, ' ').trim().slice(0, 400),
            authors: (p.authors ?? []).map((a) => a.name).filter(Boolean).slice(0, 12).join(', ') || null,
            abstract: p.summary?.replace(/\s+/g, ' ').trim().slice(0, 4000) ?? null,
            url: `https://huggingface.co/papers/${arxivId}`,
            pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
            source: 'huggingface',
            upvotes: p.upvotes ?? 0,
            publishedAt: ts && !isNaN(ts.getTime()) ? ts : null,
          })
        }
      }
    } catch (hfErr) {
      console.error('HF daily papers fetch failed', hfErr)
    }

    // ── Source 2: arXiv API (latest cs.AI / cs.CL / cs.LG / cs.CV submissions) ──
    try {
      const query = encodeURIComponent('(cat:cs.AI OR cat:cs.CL OR cat:cs.LG OR cat:cs.CV)')
      const res = await fetch(
        `https://export.arxiv.org/api/query?search_query=${query}&sortBy=submittedDate&sortOrder=descending&max_results=40`,
        { headers: { 'User-Agent': 'CortexPapers/1.0 (research tracking)' }, signal: AbortSignal.timeout(25000) }
      )
      if (res.ok) {
        const xml = await res.text()
        const entries = xml.split('<entry>').slice(1)
        for (const raw of entries) {
          const idMatch = raw.match(/<id>http:\/\/arxiv\.org\/abs\/([^<v]+?)(v\d+)?<\/id>/)
          const title = raw.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/\s+/g, ' ').trim()
          if (!idMatch || !title) continue
          const arxivId = idMatch[1].trim()
          const abstract = raw.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.replace(/\s+/g, ' ').trim()
          const published = raw.match(/<published>([\s\S]*?)<\/published>/)?.[1]
          const authors = Array.from(raw.matchAll(/<name>([\s\S]*?)<\/name>/g))
            .map((m) => m[1].trim())
            .slice(0, 12)
          const ts = published ? new Date(published) : null
          if (ts && !isNaN(ts.getTime()) && ts.getTime() < Date.now() - MAX_AGE_DAYS * 86_400_000) continue
          if (collected.has(arxivId)) {
            // arXiv metadata wins for freshness (HF dates are often the daily-show date)
            const prev = collected.get(arxivId)!
            prev.publishedAt = ts ?? prev.publishedAt
            continue
          }
          collected.set(arxivId, {
            arxivId,
            title: title.slice(0, 400),
            authors: authors.join(', ') || null,
            abstract: abstract?.slice(0, 4000) ?? null,
            url: `https://arxiv.org/abs/${arxivId}`,
            pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
            source: 'arxiv',
            upvotes: 0,
            publishedAt: ts && !isNaN(ts.getTime()) ? ts : null,
          })
        }
      }
    } catch (axErr) {
      console.error('arXiv API fetch failed', axErr)
    }

    if (collected.size === 0) {
      return NextResponse.json({ ok: true, totalNew: 0, message: 'No papers returned from Hugging Face or arXiv right now.' })
    }

    // Dedupe against this user's existing feed
    const existing = await db.paper.findMany({
      where: { userId: user.id, arxivId: { in: Array.from(collected.keys()) } },
      select: { arxivId: true },
    })
    const existingSet = new Set(existing.map((e) => e.arxivId))
    const fresh = Array.from(collected.values()).filter((p) => !existingSet.has(p.arxivId))

    // Sort by upvotes desc (HF) so we can auto-analyze the community favorites
    fresh.sort((a, b) => b.upvotes - a.upvotes)

    for (const p of fresh) {
      await db.paper.create({ data: { ...p, userId: user.id } })
    }

    // Auto-analyze top 3 papers so the "what problem / what innovation" cards
    // are populated without the user doing anything. Failures are non-fatal.
    let analyzed = 0
    for (const p of fresh.slice(0, 3)) {
      try {
        const stored = await db.paper.findFirst({ where: { userId: user.id, arxivId: p.arxivId } })
        if (stored) {
          await analyzePaper(stored.id)
          analyzed++
        }
      } catch (e) {
        console.error(`auto-analyze failed for ${p.arxivId}`, e)
      }
    }

    return NextResponse.json({ ok: true, totalNew: fresh.length, analyzed })
  } catch (e) {
    console.error('POST /api/papers/fetch error', e)
    return NextResponse.json({ error: 'Failed to fetch papers. Try again.' }, { status: 500 })
  }
}
