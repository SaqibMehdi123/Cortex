// Offline validation of parseLinkedInCards against real captured fragments
const fs = require('fs')

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}
function tagText(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}
function classify(t) {
  t = t.toLowerCase()
  if (/\bintern(ship)?s?\b|\bco-?op\b|\bworking student\b/.test(t)) return 'internship'
  if (/\b(research|residency|scientist|phd|post-?doc|fellow(ship)?)\b/.test(t)) return 'research'
  return 'job'
}
function parseLinkedInCards(html) {
  const out = []
  const anchors = [...html.matchAll(/href="(https:\/\/[a-z.]*linkedin\.com\/jobs\/view\/[^"]+)"/gi)]
  for (let i = 0; i < anchors.length; i++) {
    const start = anchors[i].index ?? 0
    const end = i + 1 < anchors.length ? anchors[i + 1].index ?? html.length : html.length
    const card = html.slice(start, end)
    const role = tagText(card.match(/base-search-card__title">([\s\S]*?)<\/h3>/)?.[1] ?? '')
    if (!role) continue
    const company = tagText(card.match(/base-search-card__subtitle">([\s\S]*?)<\/h4>/)?.[1] ?? '') || 'LinkedIn company'
    const location = tagText(card.match(/job-search-card__location">([\s\S]*?)<\/span>/)?.[1] ?? '') || null
    const dateRaw = card.match(/datetime="(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
    const logo = card.match(/data-delayed-url="(https:\/\/media\.licdn\.com\/dms\/image\/[^"]*company-logo[^"]*)"/)?.[1] ?? null
    const url = decodeEntities(anchors[i][1].split('?')[0])
    out.push({ company, role, type: classify(role), location, url, externalId: url.match(/-(\d+)\/?$/)?.[1] ?? null, logoUrl: logo ? decodeEntities(logo) : null, publishedAt: dateRaw })
  }
  return out
}

for (const f of ['t_li_guest.out', 't_li_p2.out', 't_li_intern.out']) {
  const html = fs.readFileSync(`/home/z/my-project/scripts/${f}`, 'utf8')
  const cards = parseLinkedInCards(html)
  console.log(`\n=== ${f}: ${cards.length} cards ===`)
  const noLogo = cards.filter((c) => !c.logoUrl).length
  const noDate = cards.filter((c) => !c.publishedAt).length
  const noLoc = cards.filter((c) => !c.location).length
  console.log(`no-logo: ${noLogo}, no-date: ${noDate}, no-location: ${noLoc}`)
  const dupUrls = cards.length - new Set(cards.map((c) => c.url)).size
  console.log(`dup urls within page: ${dupUrls}`)
  for (const c of cards.slice(0, 4)) {
    console.log(`- [${c.type}] ${c.role} @ ${c.company} | ${c.location} | ${c.publishedAt} | logo:${c.logoUrl ? 'Y' : 'N'} | id:${c.externalId}`)
  }
  const badUrl = cards.find((c) => c.url.includes('?') || !/\/jobs\/view\//.test(c.url))
  if (badUrl) console.log('BAD URL:', badUrl.url)
}
