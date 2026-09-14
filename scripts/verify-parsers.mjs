// End-to-end verification of the new production parsers against live endpoints.
// Mirrors the exact regex/mapping logic in src/app/api/opportunities/fetch/route.ts.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) Cortex/1.0'
const TMO = 15000

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(TMO), cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
async function fetchHTML(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(TMO), cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}
function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
}
function tagText(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

async function verifyWorkable() {
  const data = await fetchJSON('https://apply.workable.com/api/v1/widget/accounts/devsinc-17?details=true')
  const jobs = data.jobs ?? []
  const pk = jobs.filter((j) => /pakistan/i.test(j.country ?? ''))
  console.log(`Workable Devsinc: ${jobs.length} jobs, ${pk.length} PK`)
  console.log('  sample:', JSON.stringify(pk.slice(0, 2).map((j) => ({ role: j.title, loc: [j.city, j.state, j.country].filter(Boolean).join(', '), url: `https://apply.workable.com/devsinc-17/j/${j.shortcode}`, pub: j.published_on }))))
}
async function verifyJazzHR(board, company) {
  const html = await fetchHTML(`https://${board}.applytojob.com/apply/`)
  const anchors = [...html.matchAll(/<a[^>]*href="(https:\/\/[a-z0-9-]+\.applytojob\.com\/apply\/[A-Za-z0-9]+\/[A-Za-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
  const seen = new Set()
  const out = []
  for (let i = 0; i < anchors.length; i++) {
    const url = decodeEntities(anchors[i][1])
    if (seen.has(url)) continue
    const start = anchors[i].index ?? 0
    const end = i + 1 < anchors.length ? anchors[i + 1].index ?? html.length : html.length
    const card = html.slice(start, end)
    const title = tagText(anchors[i][2])
    if (!title) continue
    seen.add(url)
    out.push({ role: title, loc: tagText(card.match(/resumator-job-location-column[^>]*>([\s\S]*?)<\//)?.[1] ?? '') || tagText(card.match(/fa-map-marker[^>]*><\/i>([^<]*)/)?.[1] ?? '') || null, url })
  }
  console.log(`JazzHR ${company}: ${out.length} jobs`)
  console.log('  sample:', JSON.stringify(out.slice(0, 3), null, 0))
}
async function verifyZoho() {
  const data = await fetchJSON('https://techlogix.zohorecruit.com/recruit/v2/public/Job_Openings?pagename=Careers')
  const rows = data.data ?? []
  console.log(`Zoho Techlogix: ${rows.length} jobs`)
  console.log('  sample:', JSON.stringify(rows.slice(0, 3).map((j) => ({ role: j.Posting_Title || j.Job_Opening_Name, loc: [j.City, j.Country].filter(Boolean).join(', '), url: (j.$url ?? '').split('?')[0] }))))
}
async function verifyWp(site, type, pages) {
  let all = 0
  for (let page = 1; page <= pages; page++) {
    const res = await fetch(`${site}/wp-json/wp/v2/${type}?per_page=100&page=${page}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(TMO), cache: 'no-store' })
    if (!res.ok) break
    const rows = await res.json()
    all += rows.length
    if (page === 1) {
      console.log(`WP ${site} (${type}): first page ${rows.length}`)
      console.log('  sample:', JSON.stringify(rows.slice(0, 2).map((r) => ({ role: decodeEntities(r.title?.rendered ?? '').trim(), url: r.link, date: r.date_gmt }))))
    }
    if (rows.length < 100) break
  }
  console.log(`WP ${site} (${type}): TOTAL ${all}`)
}
async function verifyNetsol() {
  const html = await fetchHTML('https://careers.netsoltech.com/openings/')
  const seen = new Set()
  const out = []
  for (const m of html.matchAll(/<a[^>]*href="(https:\/\/careers\.netsoltech\.com\/openings\/([a-z0-9-]+)\/)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const slug = m[2]
    if (seen.has(slug)) continue
    const role = tagText(m[3])
    if (!role || /^view job$/i.test(role)) continue
    seen.add(slug)
    out.push({ role, url: m[1] })
  }
  console.log(`NETSOL: ${out.length} jobs`)
  console.log('  sample:', JSON.stringify(out.slice(0, 3)))
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
    out.push({ role, company, location, dateRaw, logo: Boolean(logo), url })
  }
  return out
}
async function verifyLinkedInCompany(keywords, match) {
  const html = await fetchHTML(`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(keywords)}&location=Pakistan&start=0`)
  const cards = parseLinkedInCards(html)
  const kept = cards.filter((c) => match.test(c.company))
  console.log(`LinkedIn "${keywords}": ${cards.length} cards -> ${kept.length} kept`)
  console.log('  kept:', JSON.stringify(kept.slice(0, 3).map((c) => ({ role: c.role, company: c.company, loc: c.location }))))
}

;(async () => {
  try { await verifyWorkable() } catch (e) { console.log('Workable ERR', e.message) }
  try { await verifyJazzHR('venturedive', 'VentureDive') } catch (e) { console.log('JazzHR vd ERR', e.message) }
  try { await verifyJazzHR('10pearls', '10Pearls') } catch (e) { console.log('JazzHR 10p ERR', e.message) }
  try { await verifyZoho() } catch (e) { console.log('Zoho ERR', e.message) }
  try { await verifyWp('https://folio3.com', 'jobs', 2) } catch (e) { console.log('WP folio3 ERR', e.message) }
  try { await verifyWp('https://purelogics.com', 'job-listings', 1) } catch (e) { console.log('WP purelogics ERR', e.message) }
  try { await verifyNetsol() } catch (e) { console.log('NETSOL ERR', e.message) }
  try { await verifyLinkedInCompany('Systems Limited', /systems limited/i) } catch (e) { console.log('LI systems ERR', e.message) }
})()
