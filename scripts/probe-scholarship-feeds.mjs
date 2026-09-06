// Probe candidate scholarship RSS feeds (hard per-feed timeout, parallel).
// Usage: node scripts/probe-scholarship-feeds.mjs
import Parser from 'rss-parser'

const FEEDS = [
  { name: 'ScholarshipsCorner', url: 'https://scholarshipscorner.website/feed/' },
  { name: 'ScholarshipsAlerts', url: 'https://scholarshipsalerts.com/feed/' },
  { name: 'OpportunitiesForYouth', url: 'https://opportunitiesforyouth.org/feed/' },
  { name: 'FullyFundedScholarships', url: 'https://fullyfundedscholarships.org/?feed=rss2' },
  { name: 'ScholarshipRoar', url: 'https://scholarshiproar.com/feed/' },
  { name: 'OpportunityDesk', url: 'https://opportunitydesk.org/feed/' },
  { name: 'Scholarships360', url: 'https://scholarships360.org/feed/' },
  { name: 'ArmAcademy', url: 'https://armacad.info/rss' },
]

const parser = new Parser({
  timeout: 12000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CortexScholarships/1.0)', Accept: 'application/rss+xml, application/xml, text/xml, */*' },
})

async function probe(f) {
  try {
    const feed = await Promise.race([
      parser.parseURL(f.url),
      new Promise((_, rej) => setTimeout(() => rej(new Error('hard timeout')), 13000)),
    ])
    const items = (feed.items ?? []).slice(0, 6).map((it) => it.title?.slice(0, 95))
    return `=== ${f.name} — OK ${feed.items?.length ?? 0} items\n${items.map((t) => `  · ${t}`).join('\n')}`
  } catch (e) {
    return `=== ${f.name} — FAIL: ${String(e).slice(0, 80)}`
  }
}

const results = await Promise.all(FEEDS.map(probe))
console.log(results.join('\n'))
process.exit(0)
