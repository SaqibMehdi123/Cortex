import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { beginSync, stampSync, abortSync } from '@/lib/sync-guard'
import { classifyRoleFamily } from '@/lib/job-families'

// POST /api/opportunities/fetch — pull jobs, internships and research positions
// from authentic, keyless public sources:
//   - Greenhouse boards (official ATS API): Anthropic, Together AI, Scale AI,
//     Databricks, Figure AI, Imbue — plus Pakistan-linked employers Careem
//     (Karachi/Lahore roles), Motive (Islamabad/Lahore/Karachi hubs) and Raft
//     (Pakistani-founded)
//   - Lever boards (official ATS API): Mistral AI — plus Educative (Lahore)
//   - Workable widget API: Devsinc (Lahore HQ, ~34 live roles)
//   - JazzHR public boards: VentureDive (Karachi/Lahore) and 10Pearls
//     (Karachi/Lahore/Islamabad + international)
//   - Zoho Recruit public careers API: Techlogix (Lahore/Karachi/Islamabad)
//   - WordPress REST job post types: Folio3 (Karachi/Lahore) and PureLogics
//     (Lahore) — their careers run on WP with a public jobs post type
//   - NETSOL Technologies (Lahore) — dedicated careers site openings archive
//   - NSTP (National Science & Technology Park at NUST, Islamabad) — the
//     park's own public jobs API serving its resident companies & startups
//   - LinkedIn Pakistan — the public guest jobs endpoint (jobs + internships,
//     real companies, permanent company-logo URLs), including rotating
//     per-company searches (Systems Limited, CureMD, Arbisoft, Tkxel, Daraz,
//     Contour Software, CodeNinja, Inbox, Nextbridge, …) that are filtered by
//     the company name on each card so only true matches land on the board
//   - RemoteOK public job API (AI/ML-relevant only)
//   - Remotive public job API (data category)
// Listings are de-duplicated per account by URL, so re-fetching is safe and
// every user keeps their own discover feed + saved state.
// (Rozee.pk / Bayt / Mustakbil / nstp.pk HTML pages / Confiz / Bykea were
// tested and block datacenter IPs via Cloudflare; Afiniti, i2c and Nisum run
// JS-only or auth-gated ATS frontends — not usable server-side. The boards
// above are the verified, reliable channels.)

const UA = 'Mozilla/5.0 (X11; Linux x86_64) Cortex/1.0'

const TIMEOUT_MS = 15000
const PER_SOURCE_CAP = 150

type Listing = {
  company: string
  role: string
  roleFamily: string
  type: 'job' | 'internship' | 'research'
  location: string | null
  source: string
  url: string
  externalId: string | null
  logoUrl: string | null
  publishedAt: Date | null
}

const GREENHOUSE_BOARDS: Array<{ board: string; company: string }> = [
  { board: 'anthropic', company: 'Anthropic' },
  { board: 'togetherai', company: 'Together AI' },
  { board: 'scaleai', company: 'Scale AI' },
  { board: 'databricks', company: 'Databricks' },
  { board: 'figureai', company: 'Figure AI' },
  { board: 'imbue', company: 'Imbue' },
  // Pakistan-linked employers — verified live ATS boards (curl-tested 2026-09)
  { board: 'careem', company: 'Careem' },
  { board: 'motive', company: 'Motive' },
  { board: 'raft', company: 'Raft' },
]

const LEVER_BOARDS: Array<{ board: string; company: string }> = [
  { board: 'mistral', company: 'Mistral AI' },
  { board: 'educative', company: 'Educative' },
]

// More verified keyless boards for Pakistani employers (curl-tested 2026-09).
// Workable serves its widget JSON account-wide; JazzHR public boards and Zoho
// Recruit career sites expose the openings list without auth too.
const WORKABLE_ACCOUNTS: Array<{ account: string; company: string }> = [
  { account: 'devsinc-17', company: 'Devsinc' },
]
const JAZZHR_BOARDS: Array<{ board: string; company: string }> = [
  { board: 'venturedive', company: 'VentureDive' },
  { board: '10pearls', company: '10Pearls' },
]
const ZOHO_RECRUIT_SITES: Array<{ host: string; company: string }> = [
  { host: 'techlogix.zohorecruit.com', company: 'Techlogix' },
]
// WordPress careers with a public jobs post type (wp-json/wp/v2/<type>).
const WP_JOB_SITES: Array<{ site: string; type: string; company: string; pages: number }> = [
  { site: 'https://folio3.com', type: 'jobs', company: 'Folio3', pages: 2 },
  { site: 'https://purelogics.com', type: 'job-listings', company: 'PureLogics', pages: 1 },
]

const RELEVANT =
  /(machine learning|deep learning|artificial intelligence|[^a-z]ai[^a-z]|[^a-z]ml[^a-z]|llm|nlp|natural language|data scien|computer vision|research|residency|mlops|robotics|data engineer|data analyst|generative)/i

async function fetchJSON(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': UA, Accept: 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function classify(title: string): Listing['type'] {
  const t = title.toLowerCase()
  if (/\bintern(ship)?s?\b|\bco-?op\b|\bworking student\b/.test(t)) return 'internship'
  if (/\b(research|residency|scientist|phd|post-?doc|fellow(ship)?)\b/.test(t)) return 'research'
  return 'job'
}

function asDate(value: unknown): Date | null {
  if (!value) return null
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d
}

async function fetchGreenhouse(board: string, company: string): Promise<Listing[]> {
  const data = (await fetchJSON(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs`)) as {
    jobs?: Array<{
      id: number | string
      title: string
      absolute_url: string
      updated_at?: string
      location?: { name?: string }
    }>
  }
  const jobs = data.jobs ?? []
  return jobs.slice(0, PER_SOURCE_CAP).map((j) => ({
    company,
    role: j.title.trim(),
    roleFamily: classifyRoleFamily(j.title),
    type: classify(j.title),
    location: j.location?.name?.trim() || null,
    source: `${company} (Greenhouse)`,
    url: j.absolute_url,
    externalId: String(j.id),
    logoUrl: null,
    publishedAt: asDate(j.updated_at),
  }))
}

async function fetchLever(board: string, company: string): Promise<Listing[]> {
  const data = (await fetchJSON(`https://api.lever.co/v0/postings/${board}?mode=json`)) as Array<{
    id: string
    text: string
    hostedUrl: string
    createdAt?: number
    categories?: { location?: string; commitment?: string }
  }>
  return (data ?? []).slice(0, PER_SOURCE_CAP).map((j) => ({
    company,
    role: j.text.trim(),
    roleFamily: classifyRoleFamily(j.text),
    type: classify(j.text),
    location: j.categories?.location?.trim() || null,
    source: `${company} (Lever)`,
    url: j.hostedUrl,
    externalId: j.id,
    logoUrl: null,
    publishedAt: j.createdAt ? new Date(j.createdAt) : null,
  }))
}

// Workable public widget API — account-level board JSON, no key. Verified
// live 2026-09: devsinc-17 serves ~34 jobs with Pakistan city/country.
async function fetchWorkable(account: string, company: string): Promise<Listing[]> {
  const data = (await fetchJSON(`https://apply.workable.com/api/v1/widget/accounts/${account}?details=true`)) as {
    jobs?: Array<{
      title: string
      shortcode: string
      city?: string
      state?: string
      country?: string
      published_on?: string
      created_at?: string
    }>
  }
  return (data.jobs ?? []).slice(0, PER_SOURCE_CAP).map((j) => ({
    company,
    role: j.title.trim(),
    roleFamily: classifyRoleFamily(j.title),
    type: classify(j.title),
    location: [j.city, j.state, j.country].filter(Boolean).join(', ') || null,
    source: `${company} (Workable)`,
    // keep the account slug in the URL so the company logo can be derived
    url: `https://apply.workable.com/${account}/j/${j.shortcode}`,
    externalId: j.shortcode,
    logoUrl: null,
    publishedAt: asDate(j.published_on ?? j.created_at),
  }))
}

// JazzHR (resumator) public board — the /apply/ page lists every opening as
// a title anchor followed by a location cell; slice each card from its
// anchor to the next one. Verified live 2026-09 (venturedive, 10pearls).
async function fetchJazzHR(board: string, company: string): Promise<Listing[]> {
  const res = await fetch(`https://${board}.applytojob.com/apply/`, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  // Boards ship two JazzHR templates: rows with a resumator-job-title-link
  // class and location cell, or list-group items with the title as the plain
  // anchor text and the location in a fa-map-marker item. Using the anchor's
  // own inner text for the title covers both.
  const anchors = [...html.matchAll(/<a[^>]*href="(https:\/\/[a-z0-9-]+\.applytojob\.com\/apply\/[A-Za-z0-9]+\/[A-Za-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
  const seen = new Set<string>()
  const out: Listing[] = []
  for (let i = 0; i < anchors.length; i++) {
    const url = decodeEntities(anchors[i][1])
    if (seen.has(url)) continue
    const start = anchors[i].index ?? 0
    const end = i + 1 < anchors.length ? anchors[i + 1].index ?? html.length : html.length
    const card = html.slice(start, end)
    const title = tagText(anchors[i][2])
    if (!title) continue
    seen.add(url)
    out.push({
      company,
      role: title,
      roleFamily: classifyRoleFamily(title),
      type: classify(title),
      location:
        tagText(card.match(/resumator-job-location-column[^>]*>([\s\S]*?)<\//)?.[1] ?? '') ||
        tagText(card.match(/fa-map-marker[^>]*><\/i>([^<]*)/)?.[1] ?? '') ||
        null,
      source: `${company} (JazzHR)`,
      url,
      externalId: url.match(/\/apply\/([A-Za-z0-9]+)\//)?.[1] ?? null,
      logoUrl: null,
      publishedAt: null,
    })
  }
  return out.slice(0, PER_SOURCE_CAP)
}

// Zoho Recruit public careers API — keyless JSON of published openings.
// Verified live 2026-09: techlogix.zohorecruit.com returns names, cities
// and self URLs for its Lahore/Karachi/Islamabad roles.
async function fetchZohoRecruit(host: string, company: string): Promise<Listing[]> {
  const data = (await fetchJSON(`https://${host}/recruit/v2/public/Job_Openings?pagename=Careers`)) as {
    data?: Array<{
      id: string
      Job_Opening_Name?: string
      Posting_Title?: string
      City?: string
      Country?: string
      Job_Type?: string
      '$url'?: string
    }>
  }
  return (data.data ?? []).slice(0, PER_SOURCE_CAP).map((j) => {
    const role = (j.Posting_Title || j.Job_Opening_Name || '').trim()
    return {
      company,
      role,
      roleFamily: classifyRoleFamily(role),
      type: `${j.Job_Type ?? ''} ${role}`.toLowerCase().includes('intern') ? 'internship' as const : classify(role),
      location: [j.City, j.Country].filter(Boolean).join(', ') || null,
      source: `${company} (Zoho Recruit)`,
      url: (j.$url ?? '').split('?')[0] || `https://${host}/jobs/Careers`,
      externalId: j.id,
      logoUrl: null,
      publishedAt: null,
    }
  })
}

// WordPress REST job post types — several Pakistani companies run careers
// on WordPress with a public jobs post type; wp-json serves them keyless.
async function fetchWpJobs(site: string, postType: string, company: string, pages = 1): Promise<Listing[]> {
  const out: Listing[] = []
  for (let page = 1; page <= pages; page++) {
    const res = await fetch(`${site}/wp-json/wp/v2/${postType}?per_page=100&page=${page}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!res.ok) break // out-of-range page or protected REST — keep what we have
    const rows = (await res.json()) as Array<{ id: number; link?: string; title?: { rendered?: string }; date_gmt?: string }>
    for (const r of rows) {
      const role = decodeEntities(r.title?.rendered ?? '').trim()
      if (!role || !r.link) continue
      out.push({
        company,
        role,
        roleFamily: classifyRoleFamily(role),
        type: classify(role),
        location: null,
        source: `${company} (site)`,
        url: r.link,
        externalId: String(r.id),
        logoUrl: null,
        publishedAt: asDate(r.date_gmt),
      })
    }
    if (rows.length < 100) break
  }
  return out.slice(0, PER_SOURCE_CAP)
}

// NETSOL Technologies (Lahore) — dedicated WordPress careers site; the
// openings archive lists every current opening with its title in the
// anchor text (plus a duplicate "View Job" anchor to skip).
async function fetchNetsol(): Promise<Listing[]> {
  const res = await fetch('https://careers.netsoltech.com/openings/', {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  const seen = new Set<string>()
  const out: Listing[] = []
  for (const m of html.matchAll(/<a[^>]*href="(https:\/\/careers\.netsoltech\.com\/openings\/([a-z0-9-]+)\/)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const slug = m[2]
    if (seen.has(slug)) continue
    const role = tagText(m[3])
    if (!role || /^view job$/i.test(role)) continue
    seen.add(slug)
    out.push({
      company: 'NETSOL Technologies',
      role,
      roleFamily: classifyRoleFamily(role),
      type: classify(role),
      location: 'Lahore, Pakistan', // NETSOL careers openings run through its Lahore HQ
      source: 'NETSOL (careers site)',
      url: m[1],
      externalId: slug,
      logoUrl: null,
      publishedAt: null,
    })
  }
  return out.slice(0, PER_SOURCE_CAP)
}

async function fetchRemoteOK(): Promise<Listing[]> {
  const data = (await fetchJSON('https://remoteok.com/api')) as Array<Record<string, unknown>>
  const rows = data.filter((r) => r && r.position && r.url) // first element is a legal notice
  const out: Listing[] = []
  for (const r of rows) {
    const role = String(r.position).trim()
    const tags = Array.isArray(r.tags) ? r.tags.join(' ') : ''
    if (!RELEVANT.test(role) && !RELEVANT.test(tags)) continue
    out.push({
      company: String(r.company ?? 'Unknown').trim(),
      role,
      roleFamily: classifyRoleFamily(role),
      type: classify(role),
      location: (String(r.location ?? '').trim() || 'Remote') || null,
      source: 'RemoteOK',
      url: String(r.url),
      externalId: r.id ? String(r.id) : null,
      logoUrl: null,
      publishedAt: asDate(r.date),
    })
    if (out.length >= PER_SOURCE_CAP) break
  }
  return out
}

async function fetchRemotive(): Promise<Listing[]> {
  const data = (await fetchJSON('https://remotive.com/api/remote-jobs?category=data&limit=100')) as {
    jobs?: Array<{
      id: number
      url: string
      title: string
      company_name: string
      candidate_required_location?: string
      publication_date?: string
    }>
  }
  const out: Listing[] = []
  for (const j of data.jobs ?? []) {
    const role = j.title.trim()
    if (!RELEVANT.test(role)) continue
    out.push({
      company: j.company_name.trim(),
      role,
      roleFamily: classifyRoleFamily(role),
      type: classify(role),
      location: j.candidate_required_location?.trim() || 'Remote',
      source: 'Remotive',
      url: j.url,
      externalId: String(j.id),
      logoUrl: null,
      publishedAt: asDate(j.publication_date),
    })
    if (out.length >= PER_SOURCE_CAP) break
  }
  return out
}

// NSTP (National Science & Technology Park at NUST, Islamabad) — the park's
// own public JSON API serving jobs from its resident companies & startups
// (HATO Pakistan, ApnaFarm, Victreat, Rapidev, Telerelation, United
// Refrigeration, Skylift, ...). Verified keyless, 2026-09. The park's HTML
// pages sit behind a Cloudflare challenge but /api/common/jobs does not.
// Detail view is a modal on nstp.pk/jobs, so each listing anchors its job id
// to keep URLs (and dedupe) unique. Company logos come tokenized from the
// park portal and can expire — the Discover card falls back to favicons then.
async function fetchNSTP(): Promise<Listing[]> {
  const data = (await fetchJSON('https://nstp.pk/api/common/jobs?page=1&limit=100')) as {
    jobs?: Array<{
      _id: string
      title: string
      employment_type?: string
      location?: string
      createdAt?: string
      company?: { name?: string; logo?: string }
    }>
  }
  return (data.jobs ?? []).slice(0, PER_SOURCE_CAP).map((j) => ({
    company: j.company?.name?.trim() || 'NSTP resident company',
    role: j.title.trim(),
    roleFamily: classifyRoleFamily(j.title),
    // employment_type is authoritative but not always filled correctly —
    // "Data Engineer Intern" ships as "Full-time" — so the title counts too
    type: `${j.employment_type ?? ''} ${j.title}`.toLowerCase().includes('intern') ? 'internship' : 'job',
    location: j.location?.trim() || 'NSTP, NUST H-12, Islamabad',
    source: 'NSTP (NUST park)',
    url: `https://nstp.pk/jobs#${j._id}`,
    externalId: j._id,
    logoUrl: j.company?.logo || null,
    publishedAt: asDate(j.createdAt),
  }))
}

// LinkedIn — public "guest" jobs endpoint: the server-rendered search
// fragment the website itself loads without login. Verified live 2026-09
// from a datacenter IP. Returns ~10 cards per page; three gentle sequential
// queries cover software jobs + internships across Pakistan. Cards carry
// permanent licdn company-logo URLs, stored so Discover cards show real
// logos like the news/papers tabs. If LinkedIn throttles the IP, the source
// simply reports failed for that run — same graceful handling as any feed.
const LINKEDIN_QUERIES = [
  { keywords: 'software engineer', start: 0 },
  { keywords: 'software engineer', start: 10 },
  { keywords: 'internship', start: 0 },
]

// Per-company guest searches: the keyword is the company name, so most
// returned cards belong to that employer; each card's company field is then
// checked against the expected name and only true matches are kept, so
// name-alike noise (agencies, similar firms) never reaches the board.
// Verified 2026-09: Systems Limited, CureMD, 10Pearls, Devsinc, Daraz and
// Contour Software all return their own jobs; misses simply return 0.
const LINKEDIN_COMPANY_QUERIES: Array<{ keywords: string; match: RegExp; company: string }> = [
  { keywords: 'Systems Limited', match: /systems limited/i, company: 'Systems Limited' },
  { keywords: 'CureMD', match: /curemd/i, company: 'CureMD' },
  { keywords: 'NETSOL', match: /netsol/i, company: 'NETSOL Technologies' },
  { keywords: 'Arbisoft', match: /arbisoft/i, company: 'Arbisoft' },
  { keywords: '10Pearls', match: /10pearls/i, company: '10Pearls' },
  { keywords: 'Devsinc', match: /devsinc/i, company: 'Devsinc' },
  { keywords: 'Tkxel', match: /tkxel/i, company: 'Tkxel' },
  { keywords: 'CodeNinja', match: /codeninja/i, company: 'CodeNinja' },
  { keywords: 'Daraz', match: /daraz/i, company: 'Daraz' },
  { keywords: 'Contour Software', match: /contour software/i, company: 'Contour Software' },
  { keywords: 'Inbox Business Technologies', match: /inbox business/i, company: 'Inbox Business Technologies' },
  { keywords: 'Nextbridge', match: /nextbridge/i, company: 'Nextbridge' },
  { keywords: 'VentureDive', match: /venturedive/i, company: 'VentureDive' },
]
// The guest endpoint throttles hammering clients, so each sync runs a
// rotating window of 7 company searches (3h rotation) — a day of refreshes
// covers all of them without firing every query in one run.
const LINKEDIN_COMPANY_PER_RUN = 7

type LinkedInRun = { keywords: string; start: number; match?: RegExp; company?: string }

async function fetchLinkedInQuery(q: LinkedInRun): Promise<Listing[]> {
  const res = await fetch(
    `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(q.keywords)}&location=Pakistan&start=${q.start}`,
    { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' },
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const cards = parseLinkedInCards(await res.text())
  const picked = q.match ? cards.filter((c) => q.match!.test(c.company)) : cards
  return picked.map((c) => ({ ...c, company: q.company ?? c.company })).slice(0, PER_SOURCE_CAP)
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function tagText(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function parseLinkedInCards(html: string): Listing[] {
  const out: Listing[] = []
  // Every card starts with its full-card overlay anchor ("jobs/view" link);
  // slicing card i from anchor i to anchor i+1 keeps each card's fields
  // (logo → title → company → location → date) inside its own chunk.
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
    // ghost cards (no logo) use data-ghost-url — only real company logos match "company-logo"
    const logo = card.match(/data-delayed-url="(https:\/\/media\.licdn\.com\/dms\/image\/[^"]*company-logo[^"]*)"/)?.[1] ?? null
    const url = decodeEntities(anchors[i][1].split('?')[0])
    out.push({
      company,
      role,
      roleFamily: classifyRoleFamily(role),
      type: classify(role),
      location,
      source: 'LinkedIn Pakistan',
      url,
      externalId: url.match(/-(\d+)\/?$/)?.[1] ?? null,
      logoUrl: logo ? decodeEntities(logo) : null,
      publishedAt: asDate(dateRaw),
    })
  }
  return out
}

async function fetchLinkedInPakistan(): Promise<Listing[]> {
  const out: Listing[] = []
  const window3h = Math.floor(Date.now() / (3 * 60 * 60 * 1000))
  const from = window3h % LINKEDIN_COMPANY_QUERIES.length
  const companyPicks = Array.from(
    { length: Math.min(LINKEDIN_COMPANY_PER_RUN, LINKEDIN_COMPANY_QUERIES.length) },
    (_, i) => LINKEDIN_COMPANY_QUERIES[(from + i) % LINKEDIN_COMPANY_QUERIES.length],
  )
  const runs: LinkedInRun[] = [
    ...LINKEDIN_QUERIES.map((q) => ({ keywords: q.keywords, start: q.start })),
    ...companyPicks.map((c) => ({ keywords: c.keywords, start: 0, match: c.match, company: c.company })),
  ]
  for (const q of runs) {
    try {
      out.push(...(await fetchLinkedInQuery(q)))
      // gentle pacing — the guest endpoint throttles hammering clients
      await new Promise((r) => setTimeout(r, 700))
    } catch (e) {
      console.error('opportunities/fetch LinkedIn query failed:', e instanceof Error ? e.message : e)
    }
    if (out.length >= PER_SOURCE_CAP) break
  }
  return out.slice(0, PER_SOURCE_CAP)
}

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

    // Auto-sync guardrails: 5-min cooldown for automatic calls, one run at a
    // time per account. Manual clicks send force:true and skip the cooldown.
    const guard = await beginSync(user.id, 'jobs', force)
    if (guard.skip) {
      return NextResponse.json({ added: 0, skipped: guard.reason, total: 0, sources: [], lastFetchedAt: guard.lastFetchedAt })
    }

    const tasks: Array<{ name: string; run: () => Promise<Listing[]> }> = [
      ...GREENHOUSE_BOARDS.map((b) => ({ name: b.company, run: () => fetchGreenhouse(b.board, b.company) })),
      ...LEVER_BOARDS.map((b) => ({ name: b.company, run: () => fetchLever(b.board, b.company) })),
      ...WORKABLE_ACCOUNTS.map((b) => ({ name: b.company, run: () => fetchWorkable(b.account, b.company) })),
      ...JAZZHR_BOARDS.map((b) => ({ name: b.company, run: () => fetchJazzHR(b.board, b.company) })),
      ...ZOHO_RECRUIT_SITES.map((b) => ({ name: b.company, run: () => fetchZohoRecruit(b.host, b.company) })),
      ...WP_JOB_SITES.map((b) => ({ name: b.company, run: () => fetchWpJobs(b.site, b.type, b.company, b.pages) })),
      { name: 'NETSOL Technologies', run: fetchNetsol },
      { name: 'NSTP (NUST park)', run: fetchNSTP },
      { name: 'LinkedIn Pakistan', run: fetchLinkedInPakistan },
      { name: 'RemoteOK', run: fetchRemoteOK },
      { name: 'Remotive', run: fetchRemotive },
    ]

    const settled = await Promise.allSettled(tasks.map((t) => t.run()))
    const sources: Array<{ name: string; ok: boolean; count: number }> = []
    const all: Listing[] = []

    settled.forEach((r, i) => {
      const name = tasks[i].name
      if (r.status === 'fulfilled') {
        sources.push({ name, ok: true, count: r.value.length })
        all.push(...r.value)
      } else {
        sources.push({ name, ok: false, count: 0 })
        console.error(`opportunities/fetch ${name} failed:`, r.reason instanceof Error ? r.reason.message : r.reason)
      }
    })

    let added = 0
    if (all.length > 0) {
      // SQLite createMany has no skipDuplicates — dedupe here instead:
      // first within the batch, then against this user's stored listings.
      const batch = new Map<string, Listing>()
      for (const l of all) {
        if (l.url && !batch.has(l.url)) batch.set(l.url, l)
      }
      const existing = await db.jobListing.findMany({
        where: { userId: user.id, url: { in: [...batch.keys()] } },
        select: { url: true },
      })
      const seen = new Set(existing.map((r) => r.url))
      const fresh = [...batch.values()].filter((l) => !seen.has(l.url))
      if (fresh.length > 0) {
        const res = await db.jobListing.createMany({
          data: fresh.map((l) => ({
            userId: user.id,
            company: l.company,
            role: l.role,
            roleFamily: l.roleFamily,
            type: l.type,
            location: l.location,
            source: l.source,
            url: l.url,
            externalId: l.externalId,
            logoUrl: l.logoUrl,
            publishedAt: l.publishedAt,
          })),
        })
        added = res.count
      }
    }

    const total = await db.jobListing.count({ where: { userId: user.id } })
    const lastFetchedAt = await stampSync(user.id, 'jobs')
    return NextResponse.json({ added, total, sources, lastFetchedAt })
  } catch (e) {
    console.error('POST /api/opportunities/fetch error', e)
    return NextResponse.json({ error: 'Failed to fetch opportunities' }, { status: 500 })
  } finally {
    // Error path never stamps — always make sure the lock is released.
    // (No-op if stampSync already released it.)
    if (userId) abortSync(userId, 'jobs')
  }
}
