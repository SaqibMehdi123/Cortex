// Quick verification of the retry + failover ladder in src/lib/ai.ts.
// Run: GROQ_API_KEY=fake scripts/test-ai-retry.ts
export {}

let call = 0
let primaryAlwaysFail = false
const log: string[] = []
// @ts-expect-error – stub the global fetch for the test
globalThis.fetch = async (url: string, init: RequestInit) => {
  call++
  const body = JSON.parse(init.body as string)
  const auth = (init.headers as Record<string, string>).Authorization
  if (String(url).includes('generativelanguage')) {
    // primary: fail fast with 503 on attempt 1, succeed on attempt 2
    if (primaryAlwaysFail || call <= 1) return new Response(JSON.stringify({ error: { code: 503, message: 'high demand' } }), { status: 503 })
    return new Response(JSON.stringify({ choices: [{ message: { content: 'primary-ok' } }] }), { status: 200 })
  }
  if (String(url).includes('api.groq.com')) {
    return new Response(JSON.stringify({ choices: [{ message: { content: `failover-ok model=${body.model} auth=${auth?.slice(7, 11)}` } }] }), { status: 200 })
  }
  return new Response('unexpected target', { status: 500 })
}

const { aiChatCompletion } = await import('../src/lib/ai')

// Case 1: primary recovers on retry #2 → no failover needed
call = 0
const r1 = await aiChatCompletion({ messages: [{ role: 'user', content: 'hi' }] })
console.log('case1 (retry recovers):', r1.choices[0]?.message?.content, '| attempts:', call)
if (r1.choices[0]?.message?.content !== 'primary-ok') throw new Error('case1 failed')

// Case 2: primary keeps 503ing → groq failover answers
primaryAlwaysFail = true
const realFetch = globalThis.fetch
globalThis.fetch = (async (url: string, init: RequestInit) => {
  if (String(url).includes('generativelanguage')) return new Response(JSON.stringify({ error: { code: 503, message: 'high demand' } }), { status: 503 })
  return realFetch(url, init)
}) as typeof fetch
const t0 = Date.now()
const r2 = await aiChatCompletion({ messages: [{ role: 'user', content: 'hi' }] })
console.log('case2 (failover):', r2.choices[0]?.message?.content, '| took', Date.now() - t0, 'ms')
if (!String(r2.choices[0]?.message?.content).includes('failover-ok')) throw new Error('case2 failed')

// Case 3: everything fails → combined transparent error
globalThis.fetch = (async () => new Response(JSON.stringify({ error: { code: 503, message: 'down' } }), { status: 503 })) as typeof fetch
const t1 = Date.now()
try {
  await aiChatCompletion({ messages: [{ role: 'user', content: 'hi' }] })
  throw new Error('case3 should have thrown')
} catch (e) {
  const msg = (e as Error).message
  console.log('case3 (all fail):', msg.slice(0, 160), '| took', Date.now() - t1, 'ms')
  if (!msg.includes('gemini 503') || !msg.includes('groq 503')) throw new Error('case3 message missing provider trail')
}
console.log('ALL AI RETRY CASES PASSED')
