// Probe round 5 — last endpoint checks before implementation.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const TMO = 12000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function get(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': opts.ua ?? UA, Accept: opts.accept ?? 'text/html,*/*;q=0.5', ...(opts.headers ?? {}) },
    signal: AbortSignal.timeout(TMO), redirect: 'follow', cache: 'no-store',
  })
  return res
}

async function main() {
  console.log('===== a. Zoho Recruit embed endpoint =====')
  try {
    const res = await get('https://static.zohocdn.com/recruit/embed_careers_site/javascript/v1.1/embed_jobs.js', { accept: '*/*' })
    const js = await res.text()
    console.log(`[${res.status}] ${Math.round(js.length / 1024)}KB`)
    const urls = [...new Set([...js.matchAll(/["'](https?:\/\/[^"']*|[a-z]+\.[a-z]{3,4}\/[^"']*)["']/gi)].map((m) => m[1]))].filter((u) => /job|feed|open|recruit|json|list/i.test(u)).slice(0, 12)
    console.log('endpoints:', urls.join('\n  '))
    const paths = [...new Set([...js.matchAll(/["'](\/[^"']{4,80})["']/gi)].map((m) => m[1]))].filter((u) => /job|feed|open|json|list/i.test(u)).slice(0, 12)
    console.log('paths:', paths.join('\n  '))
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== b. techlogix.zohorecruit.com careers page =====')
  try {
    const res = await get('https://techlogix.zohorecruit.com/jobs/Careers')
    const text = await res.text()
    console.log(`[${res.status}] ${Math.round(text.length / 1024)}KB final=${res.url}`)
    const jobs = [...text.matchAll(/(?:jobOpeningId|jobId)["':\s]+([A-Za-z0-9]+)/gi)].slice(0, 5)
    console.log('job ids:', jobs.map((m) => m[1]).join(', ') || 'none')
    const titles = [...new Set([...text.matchAll(/<a[^>]*>([^<]*(?:Engineer|Developer|Manager|Analyst|Lead)[^<]*)<\/a>/gi)].map((m) => m[1]))].slice(0, 10)
    console.log('titles:', titles.join(' | ') || 'none')
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== c. Afiniti WP types =====')
  try {
    const res = await get('https://www.afiniti.com/wp-json/wp/v2/types', { accept: 'application/json' })
    if (res.ok) {
      const types = await res.json()
      console.log(Object.keys(types).join(', '))
      console.log(JSON.stringify(Object.entries(types).filter(([k]) => /job|career|open/i.test(k)).map(([k, v]) => [k, v.rest_base])))
    } else console.log(`[${res.status}]`)
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== d. Ceipal widget endpoints =====')
  try {
    const res = await get('https://jobsapi.ceipal.com/APISource/widget.js', { accept: '*/*' })
    const js = await res.text()
    console.log(`[${res.status}] ${Math.round(js.length / 1024)}KB`)
    const eps = [...new Set([...js.matchAll(/["'](\/[A-Za-z0-9_/.-]{3,80})["']/gi)].map((m) => m[1]))].filter((u) => /job|search|list|get|api/i.test(u)).slice(0, 15)
    console.log('paths:', eps.join('\n  '))
    const hosts = [...new Set([...js.matchAll(/["'](https?:\/\/[^"']{6,100})["']/gi)].map((m) => m[1]))].slice(0, 10)
    console.log('urls:', hosts.join('\n  '))
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== e. i2c careers XHR =====')
  try {
    const res = await get('https://careers.i2cinc.com/careers/')
    const text = await res.text()
    const xhr = [...new Set([...text.matchAll(/(?:url|action|fetch\()\s*[:=(\s]*["']([^"']{4,90})["']/gi)].map((m) => m[1]))].filter((u) => !/\.(css|js|png|jpg|svg|woff)/i.test(u)).slice(0, 15)
    console.log('xhr candidates:', xhr.join('\n  '))
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== f. JazzHR XHR / absolute links =====')
  try {
    const res = await get('https://venturedive.applytojob.com/apply/')
    const text = await res.text()
    const abs = [...new Set([...text.matchAll(/href="(https?:\/\/venturedive\.applytojob\.com\/apply\/[^"]+)"/gi)].map((m) => m[1]))].slice(0, 8)
    console.log('absolute apply links:', abs.length ? abs.join('\n  ') : 'none')
    const xhr = [...new Set([...text.matchAll(/["'](\/apply\/[A-Za-z0-9_/.-]{2,60})["']/gi)].map((m) => m[1]))].slice(0, 10)
    console.log('in-JS apply paths:', xhr.join('\n  ') || 'none')
    const json = [...new Set([...text.matchAll(/["']([^"']*(?:json|api|search|feed)[^"']*)["']/gi)].map((m) => m[1]))].filter((u) => u.length < 90).slice(0, 10)
    console.log('json-ish:', json.join('\n  ') || 'none')
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== g. Workable v1 full job shape =====')
  try {
    const res = await get('https://apply.workable.com/api/v1/widget/accounts/devsinc-17?details=true', { accept: 'application/json' })
    const data = await res.json()
    console.log('jobs:', data.jobs?.length)
    console.log(JSON.stringify(data.jobs?.[0], null, 1).slice(0, 700))
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== h. LinkedIn extra keywords =====')
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
  for (const kw of ['i2c inc', 'Avanza', 'Systems Ltd', '10P']) {
    try {
      const res = await get(`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(kw)}&location=Pakistan&start=0`)
      if (!res.ok) { console.log(`[${res.status}] ${kw}`); await sleep(1500); continue }
      const cards = parseLinkedInCards(await res.text())
      console.log(`${kw}: ${cards.length} cards | ${[...new Set(cards.map((c) => c.company))].slice(0, 6).join(' / ')}`)
    } catch (e) { console.log(`ERR ${kw}: ${e.message}`) }
    await sleep(1500)
  }
}

main().catch((e) => { console.error('probe5 failed', e); process.exit(1) })
