// Probe round 2 — targeted follow-ups from round-1 findings.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const TMO = 12000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': opts.ua ?? UA, Accept: opts.accept ?? 'text/html,application/xhtml+xml,*/*;q=0.5', ...(opts.headers ?? {}) },
    signal: AbortSignal.timeout(TMO),
    redirect: 'follow',
    cache: 'no-store',
  })
  return res
}
const PK = /(karachi|lahore|islamabad|rawalpindi|pakistan)/i

// A. extract ATS + job-ish links from careers pages
const ATS_RE = /(boards\.greenhouse\.io|job-boards\.greenhouse\.io|jobs\.lever\.co|apply\.workable\.com|careers\.smartrecruiters|jobs\.ashbyhq\.com|jobs\.recruitee\.com|myworkdayjobs\.com|applytojob\.com|bamboohr\.com|jobvite\.com|freshteam|recruit\.zoho|teamtailor|taleo|successfactors)/i
const JOBISH = /(job|career|position|opening|vacanc)/i
function extractLinks(html, base) {
  const out = new Set()
  for (const m of html.matchAll(/href="([^"#]+)"/gi)) {
    let href = m[1]
    try { href = new URL(href, base).href } catch { continue }
    if (ATS_RE.test(href)) out.add('ATS: ' + href.split('?')[0])
    else if (JOBISH.test(href) && new URL(href).hostname.includes(new URL(base).hostname.replace(/^www\./, '').split('.').slice(-2).join('.'))) {
      out.add(href.split('?')[0])
    }
    if (out.size > 24) break
  }
  return [...out].slice(0, 20)
}

const CAREERS_2 = [
  ['Systems Limited', 'https://www.systemsltd.com/careers'],
  ['Arbisoft', 'https://arbisoft.com/careers'],
  ['10Pearls', 'https://10pearls.com/join-our-team/'],
  ['Folio3', 'https://folio3.com/careers/'],
  ['Techlogix', 'https://www.techlogix.com/careers/'],
  ['Wateen', 'https://wateen.com/careers/'],
  ['i2c', 'https://www.i2cinc.com/who-we-are/supercharge-your-career/'],
  ['Nisum', 'https://nisum.com/careers'],
  ['Afiniti', 'https://www.afiniti.com/careers/'],
  ['Cubix', 'https://www.cubix.co/careers/'],
  ['PriceOye', 'https://priceoye.pk/careers'],
  ['Vyro', 'https://vyro.pk/'],
  ['Daraz', 'https://www.daraz.pk/careers/'],
  ['Avanza', 'https://www.avanzasolutions.com/careers'],
  ['CaliberMind', 'https://www.calibermind.com/careers/'],
  ['Tezeract', 'https://tezeract.ai/careers/'],
  ['PureLogics', 'https://purelogics.com/careers/'],
  ['NETSOL careers site', 'https://careers.netsoltech.com/'],
]

// B. WP REST job post types
const WP_SITES = ['https://careers.netsoltech.com', 'https://10pearls.com', 'https://www.techlogix.com', 'https://folio3.com', 'https://wateen.com', 'https://purelogics.com', 'https://tezeract.ai', 'https://visionx.io']

// C. JazzHR RSS
const JAZZ = ['venturedive', 'curemd', 'confiz', 'contoursoftware', 'tcpsoftware', 'wateen', 'inboxbiz', 'nextbridge', 'sastaticket', 'patari', 'techlogix', 'netsol']

// D. Workable retry (browser UA + no /widget path)
async function probeWorkable(account) {
  const res = await get(`https://apply.workable.com/api/v2/accounts/${account}/jobs?limit=50`, { ua: UA })
  if (!res.ok) return { account, status: res.status }
  const data = await res.json()
  const jobs = data.jobs ?? data.postings ?? []
  const pk = jobs.filter((j) => PK.test(JSON.stringify(j.location ?? j))).length
  return { account, status: 200, total: jobs.length, pk, sample: jobs.slice(0, 2).map((j) => `${j.title} @ ${JSON.stringify(j.location ?? {}).slice(0, 60)}`) }
}

// E. BambooHR public careers list
async function probeBamboo(sub) {
  const res = await get(`https://${sub}.bamboohr.com/careers/list`)
  if (!res.ok) return { sub, status: res.status }
  const data = await res.json()
  const groups = data.result ?? []
  const total = groups.reduce((n, g) => n + (g.jobs?.length ?? 0), 0)
  return { sub, status: 200, total, sample: groups.flatMap((g) => g.jobs ?? []).slice(0, 2).map((j) => j.jobOpeningName) }
}

// F. LinkedIn company keywords round 2
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
const LI_QUERIES = [
  '10Pearls', 'Devsinc', 'i2c', 'VentureDive', 'Tkxel', 'Cubix', 'Folio3', 'Techlogix',
  'Avanza Solutions', 'Nisum', 'Wateen', 'CodeNinja', 'VisionX', 'Addo AI', 'Tezeract',
  'PureLogics', 'Vroozi', 'CaliberMind', 'Bykea', 'Daraz', 'Bazaar Technologies',
  'Sastaticket', 'PriceOye', 'Patari', 'Vyro', 'TRG Pakistan', 'Contour Software',
  'Inbox Business Technologies', 'Nextbridge', 'Afiniti',
]

// H. DuckDuckGo html search for unclear company sites
const DDG = [
  'TRG Pakistan software company careers site',
  'Contour Software Pakistan careers site',
  'TCP Software Pakistan careers',
  'DPL software house Lahore careers',
  'Adept Tech Solutions Pakistan careers',
  'Strategic Systems International SSI Lahore careers',
]

async function main() {
  console.log('===== A. careers-page links =====')
  for (const [name, url] of CAREERS_2) {
    try {
      const res = await get(url)
      const text = await res.text()
      const links = extractLinks(text, url)
      const pkMention = PK.test(text.slice(0, 4000))
      console.log(`[${res.status}] ${name} (${Math.round(text.length / 1024)}KB${pkMention ? ', PK mention' : ''})`)
      links.forEach((l) => console.log('    ' + l))
      await sleep(400)
    } catch (e) { console.log(`[ERR] ${name}: ${e.message}`) }
  }

  console.log('\n===== B. WP REST job post types =====')
  for (const site of WP_SITES) {
    try {
      const res = await get(site + '/wp-json/wp/v2/types', { accept: 'application/json' })
      if (!res.ok) { console.log(`[${res.status}] ${site}`); continue }
      const types = await res.json()
      const names = Object.entries(types).filter(([k, v]) => /job|career|vacan|open/i.test(k) || /job|career|vacan/i.test(String(v?.rest_base ?? '')))
        .map(([k, v]) => `${k}(${v.rest_base})`)
      console.log(`OK ${site}: ${names.join(', ') || 'no job-like types'}`)
    } catch (e) { console.log(`[ERR] ${site}: ${e.message}`) }
    await sleep(300)
  }

  console.log('\n===== C. JazzHR RSS =====')
  for (const sub of JAZZ) {
    try {
      const res = await get(`https://${sub}.applytojob.com/apply/jobs/rss`)
      console.log(`[${res.status}] ${sub}: ${(await res.text()).length} bytes`)
    } catch (e) { console.log(`[ERR] ${sub}: ${e.message}`) }
    await sleep(300)
  }

  console.log('\n===== D. Workable retry =====')
  for (const acc of ['devsinc', 'i2c', 'arbisoft']) {
    try { console.log(JSON.stringify(await probeWorkable(acc))) } catch (e) { console.log(`[ERR] ${acc}: ${e.message}`) }
    await sleep(500)
  }

  console.log('\n===== E. BambooHR =====')
  for (const sub of ['arbisoft', 'folio3', 'curemd', 'securiti', 'emumba']) {
    try { console.log(JSON.stringify(await probeBamboo(sub))) } catch (e) { console.log(`[ERR] ${sub}: ${e.message}`) }
    await sleep(400)
  }

  console.log('\n===== F. LinkedIn company keywords x2 =====')
  for (const kw of LI_QUERIES) {
    try {
      const res = await get(`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(kw)}&location=Pakistan&start=0`)
      if (!res.ok) { console.log(`[${res.status}] ${kw}`); await sleep(1400); continue }
      const cards = parseLinkedInCards(await res.text())
      const uniq = [...new Set(cards.map((c) => c.company))]
      console.log(`OK ${kw}: ${cards.length} cards | companies: ${uniq.slice(0, 8).join(' / ')}`)
    } catch (e) { console.log(`[ERR] ${kw}: ${e.message}`) }
    await sleep(1400)
  }

  console.log('\n===== H. DDG site lookups =====')
  for (const q of DDG) {
    try {
      const res = await get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`)
      const text = await res.text()
      const links = [...text.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"/gi)].slice(0, 4).map((m) => {
        let u = m[1]
        if (u.includes('uddg=')) u = decodeURIComponent(u.split('uddg=')[1].split('&')[0])
        return u
      })
      console.log(`${q}\n    ${links.join('\n    ')}`)
    } catch (e) { console.log(`[ERR] ${q}: ${e.message}`) }
    await sleep(800)
  }
}

main().catch((e) => { console.error('probe2 failed', e); process.exit(1) })
