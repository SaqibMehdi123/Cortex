// Probe round 4 — final structure checks for the implementation.
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
  console.log('===== 1. JazzHR board HTML rows (venturedive + 10pearls) =====')
  for (const board of ['venturedive', '10pearls']) {
    try {
      const res = await get(`https://${board}.applytojob.com/apply/`)
      const text = await res.text()
      console.log(`[${res.status}] ${board}: ${Math.round(text.length / 1024)}KB`)
      const links = [...text.matchAll(/href="(\/apply\/[^"]+)"/gi)].map((m) => m[1])
      console.log(`apply links: ${links.length}, first 6: ${[...new Set(links)].slice(0, 6).join(' , ')}`)
      // context around first job link to see title/location markup
      const first = links.find((l) => /^\/apply\/[A-Za-z0-9]+\/[^/]+\/?$/.test(l))
      if (first) {
        const idx = text.indexOf(first)
        console.log('context:', text.slice(Math.max(0, idx - 400), idx + 150).replace(/\s+/g, ' ').slice(0, 500))
      }
    } catch (e) { console.log(`ERR ${board}: ${e.message}`) }
    await sleep(500)
  }

  console.log('\n===== 2. SmartRecruiters Devsinc full object =====')
  try {
    const res = await get('https://api.smartrecruiters.com/v1/companies/Devsinc/postings?limit=2', { accept: 'application/json' })
    const data = await res.json()
    console.log(JSON.stringify(data.content?.[0], null, 1).slice(0, 1500))
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== 3. Workable devsinc-17 =====')
  try {
    const res = await fetch('https://apply.workable.com/api/v2/accounts/devsinc-17/jobs', {
      method: 'POST',
      headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 50, offset: 0 }),
      signal: AbortSignal.timeout(TMO),
    })
    console.log(`POST v2 [${res.status}]`)
    if (res.ok) {
      const data = await res.json()
      console.log(JSON.stringify(data).slice(0, 600))
    }
  } catch (e) { console.log('ERR post', e.message) }
  try {
    const res = await get('https://apply.workable.com/api/v1/widget/accounts/devsinc-17?details=true', { accept: 'application/json' })
    console.log(`GET v1 widget [${res.status}]`)
    if (res.ok) console.log(JSON.stringify(await res.json()).slice(0, 500))
  } catch (e) { console.log('ERR v1', e.message) }

  console.log('\n===== 4. i2c careers rows =====')
  try {
    const res = await get('https://careers.i2cinc.com/careers/')
    const text = await res.text()
    console.log(`[${res.status}] ${Math.round(text.length / 1024)}KB`)
    // look for job-ish anchors and api endpoints
    const anchors = [...new Set([...text.matchAll(/href="([^"]*(?:p=job|jobDetail|jobs\/|position)[^"]*)"/gi)].map((m) => m[1]))].slice(0, 10)
    console.log('anchors:', anchors.join(' | ') || 'none')
    const api = [...new Set([...text.matchAll(/["'](\/[^"']*(?:api|listing|jobs)[^"']*)["']/gi)].map((m) => m[1]))].slice(0, 10)
    console.log('api paths:', api.join(' | ') || 'none')
    // maybe jobs are rendered server-side in tables/divs; check text for common roles
    const m = text.match(/(?:Software|Senior|Lead|Manager|Engineer)[^<]{0,60}/g)
    console.log('title-ish strings:', [...new Set(m ?? [])].slice(0, 12).join(' | '))
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== 5. Techlogix zoho embed =====')
  try {
    const res = await get('https://www.techlogix.com/careers/lahore')
    const text = await res.text()
    const iframes = [...new Set([...text.matchAll(/(?:iframe[^>]*src=|src=)["']([^"']*(?:zoho|recruit)[^"']*)["']/gi)].map((m) => m[1]))].slice(0, 5)
    const zoho = [...new Set([...text.matchAll(/https?:\/\/[a-z0-9.-]*zoho[a-z0-9.-]*[^\s"'<>]*/gi)].map((m) => m[0]))].slice(0, 8)
    console.log('iframes:', iframes.join(' | ') || 'none')
    console.log('zoho urls:', zoho.join(' | ') || 'none')
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== 6. Afiniti jobs api =====')
  try {
    const res = await get('https://www.afiniti.com/jobs/')
    const text = await res.text()
    const api = [...new Set([...text.matchAll(/["'](https?:\/\/[^"']*(?:api|jobs|greenhouse|lever)[^"']*)["']/gi)].map((m) => m[1]))].slice(0, 8)
    const scripts = [...new Set([...text.matchAll(/src="(\/[^"]+\.js[^"]*)"/gi)].map((m) => m[1]))].slice(0, 8)
    console.log('api urls:', api.join(' | ') || 'none')
    console.log('scripts:', scripts.join(' | ') || 'none')
  } catch (e) { console.log('ERR', e.message) }

  console.log('\n===== 7. Nisum PK page data =====')
  try {
    const res = await get('https://nisum.com/careers/careers-pakistan')
    const text = await res.text()
    const api = [...new Set([...text.matchAll(/["'](https?:\/\/[^"']*(?:api|jobs|greenhouse|lever|bamboo|workable)[^"']*)["']/gi)].map((m) => m[1]))].slice(0, 8)
    console.log('api urls:', api.join(' | ') || 'none')
    const titles = text.match(/(?:engineer|developer|analyst|manager|consultant|specialist)[^<>{}"]{0,50}/gi)
    console.log('title-ish:', [...new Set(titles ?? [])].slice(0, 10).join(' | '))
  } catch (e) { console.log('ERR', e.message) }
}

main().catch((e) => { console.error('probe4 failed', e); process.exit(1) })
