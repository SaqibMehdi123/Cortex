// Probe candidate job sources for the Pakistani companies the user listed.
// Output: which sources are live (200 + counts), which block, which ATS each
// careers page links to. Runs with gentle concurrency from a datacenter IP —
// same environment as the Vercel functions that will use the winners.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const TMO = 12000
const CONC = 10

async function pLimitAll(items, worker, conc = CONC) {
  const out = new Array(items.length)
  let i = 0
  async function lane() {
    while (i < items.length) {
      const idx = i++
      try { out[idx] = await worker(items[idx], idx) } catch (e) { out[idx] = { error: String(e?.message ?? e) } }
    }
  }
  await Promise.all(Array.from({ length: conc }, lane))
  return out
}

async function get(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': opts.ua ?? UA, Accept: opts.accept ?? 'application/json, text/html;q=0.8,*/*;q=0.5', ...(opts.headers ?? {}) },
    signal: AbortSignal.timeout(TMO),
    redirect: 'follow',
    cache: 'no-store',
  })
  return res
}

const PK = /(karachi|lahore|islamabad|rawalpindi|pakistan|faisalabad|multan|sialkot|hyderabad.*sind)/i

// ---------- ATS probes ----------
async function probeGreenhouse(slug) {
  const res = await get(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`)
  if (!res.ok) return { slug, status: res.status }
  const data = await res.json()
  const jobs = data.jobs ?? []
  const pk = jobs.filter((j) => PK.test(j.location?.name ?? '')).length
  return { slug, status: 200, total: jobs.length, pk, sample: jobs.slice(0, 3).map((j) => `${j.title} @ ${j.location?.name ?? '?'}`) }
}
async function probeLever(slug) {
  const res = await get(`https://api.lever.co/v0/postings/${slug}?mode=json`)
  if (!res.ok) return { slug, status: res.status }
  const jobs = await res.json()
  const pk = jobs.filter((j) => PK.test(j.categories?.location ?? '')).length
  return { slug, status: 200, total: jobs.length, pk, sample: jobs.slice(0, 3).map((j) => `${j.text} @ ${j.categories?.location ?? '?'}`) }
}
async function probeSmart(id) {
  const res = await get(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(id)}/postings?limit=100`)
  if (!res.ok) return { id, status: res.status }
  const data = await res.json()
  const jobs = data.content ?? []
  const pk = jobs.filter((j) => PK.test(j.location?.city ?? '') || (j.location?.country ?? '') === 'pk').length
  return { id, status: 200, total: data.totalFound ?? jobs.length, pk, sample: jobs.slice(0, 3).map((j) => `${j.name} @ ${j.location?.city ?? '?'},${j.location?.country ?? '?'}`) }
}
async function probeWorkday(tenant, site) {
  const res = await fetch(`https://${tenant}.wd1.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`, {
    method: 'POST',
    headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: '' }),
    signal: AbortSignal.timeout(TMO),
  })
  if (!res.ok) return { tenant, site, status: res.status }
  const data = await res.json()
  const total = data.total ?? (data.jobPostings?.length ?? 0)
  const pk = (data.jobPostings ?? []).filter((j) => PK.test(j.locationsText ?? '') || PK.test(j.title ?? '')).length
  return { tenant, site, status: 200, total, pk, sample: (data.jobPostings ?? []).slice(0, 3).map((j) => `${j.title} @ ${j.locationsText ?? '?'}`) }
}

const GH_SLUGS = ['i2c', 'i2cinc', 'afiniti', 'nisum', 'vroozi', 'calibermind', 'folio3', 'foliothree', 'addoai', 'addo',
  'sastaticket', 'sastaticketpk', 'priceoye', 'thepriceoye', 'daraz', 'bykea', 'bazaar', 'bazaartech', 'trgpakistan', 'trg', 'trgpk',
  'contoursoftware', 'contour', 'confiz', 'devsinc', 'cubix', 'getcubix', 'cubixco', 'curemd', 'techlogix', 'avanza', 'avanzasolutions',
  'netsol', 'netsoltech', 'systemsltd', 'systems-limited', 'tezeract', 'visionx', 'purelogics', 'purelogicspk', 'dpl', 'dplagency',
  'inbox', 'inboxbiz', 'nextbridge', 'codeninja', 'codeninjapk', 'wateen', 'wateentelecom', 'ssi', 'ssil', 'ssipk', 'vyro', 'markaz',
  'patari', 'airlift', 'adept', 'adepttech', 'securiti', 'emumba', '10pearls', 'tenpearls', 'arbisoft']
const LEVER_SLUGS = ['arbisoft', 'afiniti', 'calibermind', 'tezeract', 'priceoye', 'sastaticket', 'folio3', 'devsinc', 'cubix',
  'purelogics', 'addoai', 'visionx', 'nisum', 'vroozi', 'confiz', 'contoursoftware', 'curemd', 'venture-dive', 'securiti', 'codeninja',
  'techlogix', 'netsol', 'systemsltd', 'bazaar', 'bykea', 'i2c', 'i2cinc', 'avanza', 'vyro', 'markaz', 'tkxel', '10pearls', 'dpl', 'patari', 'airlift']
const SR_IDS = ['10Pearls', 'SystemsLimited', 'Nisum', 'CureMD', 'Confiz', 'ContourSoftware', 'Techlogix', 'AvanzaSolutions',
  'Devsinc', 'Folio3', 'i2c', 'Nextbridge', 'Inbox', 'PureLogics', 'Tkxel', 'VentureDive', 'CodeNinja']
const WORKDAY = [
  ['spglobal', 'SPGlobalCareers'], ['spglobal', 'External'], ['spglobal', 'spglobal'],
  ['i2cinc', 'i2c'], ['i2cinc', 'External'], ['i2cinc', 'Careers'],
]

// ---------- careers-page probes (detect which ATS / CMS they use) ----------
const MARKERS = /(boards\.greenhouse\.io|job-boards\.greenhouse\.io|api\.lever\.co|jobs\.lever\.co|apply\.workable\.com|careers\.smartrecruiters|api\.smartrecruiters|jobs\.ashbyhq\.com|jobs\.recruitee\.com|myworkdayjobs\.com|teamtailor|jazzhr|bamboohr|breezy\.hr|darwinbox|recruit\.zoho|wp-json|wp job manager|wpjobmanager|careerfy|jobify|jobmonster|recruitery|hiring\.cafe)/gi
const CAREERS = [
  ['Systems Limited', 'https://www.systemsltd.com/careers'],
  ['Systems Limited alt', 'https://systemsltd.com/careers'],
  ['NETSOL', 'https://www.netsoltech.com/careers'],
  ['NETSOL alt', 'https://www.netsoltech.com/career'],
  ['10Pearls', 'https://www.10pearls.com/careers/'],
  ['10Pearls PK', 'https://10pearls.pk/careers/'],
  ['Arbisoft', 'https://arbisoft.com/careers/'],
  ['Arbisoft jobs', 'https://arbisoft.com/jobs/'],
  ['TRG', 'https://www.trg.pk/careers'],
  ['TRG alt', 'https://trg.pk/'],
  ['Contour', 'https://www.contoursoftware.com/careers'],
  ['Contour alt', 'https://contoursoftware.com/job-openings'],
  ['Confiz', 'https://www.confiz.com/careers/'],
  ['Tkxel', 'https://tkxel.com/careers/'],
  ['Techlogix', 'https://www.techlogix.com/careers'],
  ['Avanza', 'https://www.avanzasolutions.com/careers'],
  ['Afiniti', 'https://afiniti.com/careers'],
  ['Devsinc', 'https://devsinc.com/careers/'],
  ['Devsinc alt', 'https://devsinc.com/company/careers/'],
  ['Folio3', 'https://www.folio3.com/careers/'],
  ['CureMD', 'https://www.curemd.com/careers.asp'],
  ['CureMD alt', 'https://www.curemd.com/careers'],
  ['Inbox', 'https://www.inboxbiz.com/careers'],
  ['Inbox alt', 'https://www.inboxbiz.com/career'],
  ['Nextbridge', 'https://www.nextbridge.com/careers'],
  ['Nextbridge alt', 'https://nextbridge.pk/'],
  ['i2c', 'https://www.i2cinc.com/careers/'],
  ['CodeNinja', 'https://codeninja.pk/careers/'],
  ['CodeNinja alt', 'https://codeninja.ai/careers/'],
  ['Wateen', 'https://www.wateen.com/careers'],
  ['SSI', 'https://www.ssil.com.pk/careers'],
  ['SSI alt', 'https://ssil.com.pk/'],
  ['VisionX', 'https://visionx.pk/careers/'],
  ['VisionX alt', 'https://visionx.io/'],
  ['Addo AI', 'https://addo.ai/careers/'],
  ['Cubix', 'https://cubix.co/careers'],
  ['Tezeract', 'https://tezeract.ai/careers/'],
  ['VentureDive', 'https://www.venturedive.com/careers'],
  ['VentureDive alt', 'https://venturedive.com/careers/'],
  ['PureLogics', 'https://purelogics.com/careers/'],
  ['PureLogics alt', 'https://purelogics.pk/'],
  ['Vroozi', 'https://www.vroozi.com/careers'],
  ['DPL', 'https://dpl.pk/'],
  ['DPL alt', 'https://dpl.com.pk/'],
  ['CaliberMind', 'https://www.calibermind.com/careers/'],
  ['Nisum', 'https://nisum.com/careers/'],
  ['Daraz', 'https://www.daraz.com/careers'],
  ['Daraz alt', 'https://www.daraz.pk/careers'],
  ['Bykea', 'https://bykea.com/careers/'],
  ['Bazaar', 'https://bazaar.com.pk/careers/'],
  ['Bazaar alt', 'https://getbazaar.com/careers'],
  ['Sastaticket', 'https://www.sastaticket.pk/careers'],
  ['PriceOye', 'https://priceoye.pk/careers'],
  ['Patari', 'https://patari.com.pk/careers'],
  ['Vyro', 'https://vyro.pk/'],
  ['Vyro alt', 'https://vyro.money/'],
  ['Airlift (defunct?)', 'https://www.airlift.com.pk/'],
  ['Adept alt', 'https://adepttechsolutions.com/'],
]

// ---------- aggregators ----------
const AGGREGATORS = [
  ['jobz.pk', 'https://jobz.pk/jobs-in-pakistan/'],
  ['jobsalert.pk', 'https://jobsalert.pk/'],
  ['brightspyre', 'https://www.brightspyre.com/jobs'],
  ['techjuice jobs', 'https://techjuice.pk/jobs/'],
  ['indeed pk', 'https://pk.indeed.com/jobs?q=software+engineer&l=Pakistan'],
  ['hiring.cafe api', 'https://api.hiring.cafe/search-jobs?keyword=software%20engineer'],
  ['wellfound', 'https://wellfound.com/jobs'],
]

// ---------- LinkedIn company-keyword search ----------
function parseLinkedInCards(html) {
  const out = []
  const anchors = [...html.matchAll(/href="(https:\/\/[a-z.]*linkedin\.com\/jobs\/view\/[^"]+)"/gi)]
  for (let i = 0; i < anchors.length; i++) {
    const start = anchors[i].index ?? 0
    const end = i + 1 < anchors.length ? anchors[i + 1].index ?? html.length : html.length
    const card = html.slice(start, end)
    const role = (card.match(/base-search-card__title">([\s\S]*?)<\/h3>/)?.[1] ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    const company = (card.match(/base-search-card__subtitle">([\s\S]*?)<\/h4>/)?.[1] ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    if (role) out.push({ role, company })
  }
  return out
}
async function probeLinkedInKeywords(kw) {
  const res = await get(`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(kw)}&location=Pakistan&start=0`, { accept: 'text/html' })
  if (!res.ok) return { kw, status: res.status }
  const cards = parseLinkedInCards(await res.text())
  const companies = [...new Set(cards.map((c) => c.company))].slice(0, 12)
  return { kw, status: 200, cards: cards.length, companies }
}

// ---------- run ----------
function fmt(x) { return JSON.stringify(x) }

async function main() {
  const section = (t) => console.log(`\n========== ${t} ==========`)

  section('GREENHOUSE')
  const gh = await pLimitAll(GH_SLUGS, (s) => probeGreenhouse(s))
  gh.filter((r) => r && r.status === 200).forEach((r) => console.log(`OK  ${r.slug}: ${r.total} jobs (${r.pk} PK) | ${fmt(r.sample)}`))
  gh.filter((r) => r && r.status && r.status !== 200).forEach((r) => console.log(`--  ${r.slug}: HTTP ${r.status}`))

  section('LEVER')
  const lv = await pLimitAll(LEVER_SLUGS, (s) => probeLever(s))
  lv.filter((r) => r && r.status === 200).forEach((r) => console.log(`OK  ${r.slug}: ${r.total} jobs (${r.pk} PK) | ${fmt(r.sample)}`))
  lv.filter((r) => r && r.status && r.status !== 200).forEach((r) => console.log(`--  ${r.slug}: HTTP ${r.status}`))

  section('SMARTRECRUITERS')
  const sr = await pLimitAll(SR_IDS, (s) => probeSmart(s))
  sr.filter((r) => r && r.status === 200).forEach((r) => console.log(`OK  ${r.id}: ${r.total} jobs (${r.pk} PK) | ${fmt(r.sample)}`))
  sr.filter((r) => r && r.status && r.status !== 200).forEach((r) => console.log(`--  ${r.id}: HTTP ${r.status}`))

  section('WORKDAY')
  const wd = await pLimitAll(WORKDAY, ([t, s]) => probeWorkday(t, s))
  wd.forEach((r) => console.log(fmt(r)))

  section('CAREERS PAGES (status + ATS/CMS markers)')
  const cp = await pLimitAll(CAREERS, async ([name, url]) => {
    const res = await get(url, { accept: 'text/html' })
    const text = await res.text()
    const marks = [...new Set([...text.matchAll(MARKERS)].map((m) => m[0]))].slice(0, 6)
    const bytes = text.length
    return { name, url, final: res.url, status: res.status, bytes, marks }
  }, 8)
  cp.forEach((r) => console.log(`${r.status === 200 ? 'OK ' : '-- '} ${r.name} [${r.status}] ${r.bytes}b -> ${r.final}${r.marks?.length ? ' | ' + r.marks.join(', ') : ''}${r.error ? ' | ' + r.error : ''}`))

  section('AGGREGATORS')
  const ag = await pLimitAll(AGGREGATORS, async ([name, url]) => {
    const res = await get(url, { accept: 'text/html' })
    const text = await res.text()
    const marks = [...new Set([...text.matchAll(MARKERS)].map((m) => m[0]))].slice(0, 6)
    return { name, status: res.status, bytes: text.length, marks }
  }, 6)
  ag.forEach((r) => console.log(`${r.status === 200 ? 'OK ' : '-- '} ${r.name} [${r.status}] ${r.bytes}b${r.marks?.length ? ' | ' + r.marks.join(', ') : ''}${r.error ? ' | ' + r.error : ''}`))

  section('LINKEDIN company-keyword searches')
  for (const kw of ['NETSOL', 'Systems Limited', 'Arbisoft', 'CureMD', 'Confiz']) {
    try {
      const r = await probeLinkedInKeywords(kw)
      console.log(fmt(r))
      await new Promise((res2) => setTimeout(res2, 900))
    } catch (e) { console.log(`${kw}: ERROR ${e.message}`) }
  }
}

main().catch((e) => { console.error('probe failed', e); process.exit(1) })
