// Probe round 3 — verify exact structures of the winning sources.
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
  console.log('===== a. Folio3 WP REST jobs =====')
  try {
    const res = await get('https://folio3.com/wp-json/wp/v2/jobs?per_page=5', { accept: 'application/json' })
    console.log(`[${res.status}]`)
    if (res.ok) {
      const jobs = await res.json()
      console.log(`count sample: ${jobs.length}`)
      console.log(JSON.stringify(jobs[0], null, 1).slice(0, 1200))
      const all = await get('https://folio3.com/wp-json/wp/v2/jobs?per_page=100', { accept: 'application/json' })
      console.log('total headers:', all.headers.get('x-wp-total'), 'pages:', all.headers.get('x-wp-totalpages'))
    }
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== b. PureLogics WP REST job-listings =====')
  try {
    const res = await get('https://purelogics.com/wp-json/wp/v2/job-listings?per_page=5', { accept: 'application/json' })
    console.log(`[${res.status}]`)
    if (res.ok) {
      const jobs = await res.json()
      console.log(JSON.stringify(jobs[0], null, 1).slice(0, 1400))
      const all = await get('https://purelogics.com/wp-json/wp/v2/job-listings?per_page=100', { accept: 'application/json' })
      console.log('total:', all.headers.get('x-wp-total'))
    }
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== c. NETSOL openings archive =====')
  try {
    const res = await get('https://careers.netsoltech.com/openings/')
    const text = await res.text()
    console.log(`[${res.status}] ${Math.round(text.length / 1024)}KB`)
    const links = [...new Set([...text.matchAll(/href="(https:\/\/careers\.netsoltech\.com\/openings\/[^"]+\/)"/gi)].map((m) => m[1]))]
    console.log(`openings links: ${links.length}`)
    console.log(links.slice(0, 8).join('\n'))
    // check for location info near links
    const idx = text.indexOf('/openings/')
    console.log('context:', text.slice(Math.max(0, idx - 300), idx + 200).replace(/\s+/g, ' ').slice(0, 400))
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== d. 10Pearls karachi page =====')
  try {
    const res = await get('https://10pearls.com/karachi-job-openings/')
    const text = await res.text()
    console.log(`[${res.status}] ${Math.round(text.length / 1024)}KB`)
    // job rows usually link out to apply or have detail pages
    const links = [...text.matchAll(/href="([^"]*(?:job|career|apply|greenhouse|workable|lever|ashby|smartrecruiters|bamboo)[^"]*)"/gi)].map((m) => m[1])
    console.log([...new Set(links)].slice(0, 15).join('\n'))
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== e. Techlogix lahore =====')
  try {
    const res = await get('https://www.techlogix.com/careers/lahore')
    const text = await res.text()
    console.log(`[${res.status}] ${Math.round(text.length / 1024)}KB`)
    const links = [...new Set([...text.matchAll(/href="([^"]*(?:job|career|apply|position|open)[^"]*)"/gi)].map((m) => m[1]))].slice(0, 15)
    console.log(links.join('\n'))
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== f. Nisum careers-pakistan =====')
  try {
    const res = await get('https://nisum.com/careers/careers-pakistan')
    const text = await res.text()
    console.log(`[${res.status}] ${Math.round(text.length / 1024)}KB`)
    // look for job entries: common patterns = links or cards with titles
    const links = [...new Set([...text.matchAll(/href="([^"]*(?:job|apply|position|opening)[^"]*)"/gi)].map((m) => m[1]))].slice(0, 15)
    console.log('links:', links.join(' | '))
    const hasJson = text.includes('__NEXT_DATA__') || text.includes('window.__')
    console.log('embedded JSON state:', hasJson)
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== g. Afiniti jobs =====')
  try {
    const res = await get('https://www.afiniti.com/jobs/')
    const text = await res.text()
    console.log(`[${res.status}] ${Math.round(text.length / 1024)}KB`)
    const links = [...new Set([...text.matchAll(/href="(\/job\/[^"]+)"/gi)].map((m) => m[1]))].slice(0, 15)
    console.log('/job/ links:', links.length ? links.join(' | ') : 'none')
    console.log('embedded JSON state:', text.includes('__NEXT_DATA__'))
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== h. i2c careers subdomain =====')
  try {
    const res = await get('https://careers.i2cinc.com/careers/')
    const text = await res.text()
    console.log(`[${res.status}] ${Math.round(text.length / 1024)}KB final=${res.url}`)
    for (const marker of ['workable', 'greenhouse', 'lever', 'ashby', 'smartrecruiters', 'jazz', 'api', 'wp-json', 'joblistings', 'eightfold', 'phenom', 'myworkday', ' recruitee']) {
      if (text.toLowerCase().includes(marker)) console.log(`marker: ${marker}`)
    }
    const links = [...new Set([...text.matchAll(/href="([^"]*(?:job|apply|position|career)[^"]*)"/gi)].map((m) => m[1]))].slice(0, 12)
    console.log(links.join(' | '))
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== i. Wateen careers inline =====')
  try {
    const res = await get('https://wateen.com/careers/')
    const text = await res.text()
    console.log(`[${res.status}] ${Math.round(text.length / 1024)}KB`)
    const links = [...new Set([...text.matchAll(/href="([^"]*(?:job|apply|vacanc|career|position)[^"]*)"/gi)].map((m) => m[1]))].slice(0, 12)
    console.log(links.join(' | ') || 'no job links')
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== j. JazzHR venturedive RSS body =====')
  try {
    const res = await get('https://venturedive.applytojob.com/apply/jobs/rss')
    const text = await res.text()
    console.log(`[${res.status}]`)
    console.log(text.slice(0, 800))
  } catch (e) { console.log('ERR', e.message) }
  try {
    const res = await get('https://venturedive.applytojob.com/apply/')
    const text = await res.text()
    console.log(`board HTML [${res.status}] ${Math.round(text.length / 1024)}KB`)
    const links = [...new Set([...text.matchAll(/href="(\/apply\/[^"]+)"/gi)].map((m) => m[1]))].slice(0, 10)
    console.log(links.join(' | '))
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== l. Devsinc workable slug =====')
  try {
    const res = await get('https://devsinc.com/career/')
    const text = await res.text()
    const m = [...new Set([...text.matchAll(/https:\/\/apply\.workable\.com\/[a-z0-9/._-]+/gi)].map((x) => x[0]))]
    console.log(m.slice(0, 5).join('\n') || 'no workable urls')
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== k. Bing lookups =====')
  for (const q of ['TRG Pakistan careers site trg', 'TCP Software Pakistan careers', 'DPL Lahore software house careers site', 'Adept Tech Solutions Pakistan jobs site', 'Strategic Systems International SSI Lahore site']) {
    try {
      const res = await get(`https://www.bing.com/search?q=${encodeURIComponent(q)}&count=10`, { accept: 'text/html' })
      const text = await res.text()
      const links = [...text.matchAll(/<h2><a href="(https?:\/\/[^"]+)"/gi)].slice(0, 5).map((m) => m[1])
      console.log(`Q: ${q}\n    ${links.join('\n    ') || '(no results parsed)'}`)
    } catch (e) { console.log(`ERR ${q}: ${e.message}`) }
    await sleep(700)
  }
}

main().catch((e) => { console.error('probe3 failed', e); process.exit(1) })
