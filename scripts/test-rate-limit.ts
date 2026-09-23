// Quick sanity test for the in-memory rate limiter.
import { rateLimit } from '../src/lib/rate-limit'

async function main() {
  let pass = 0
  let fail = 0
  function expect(cond: boolean, msg: string) {
    if (cond) { pass++ ; console.log(`  ok  ${msg}`) } else { fail++; console.log(`FAIL  ${msg}`) }
  }

  // 1) 10 allowed, 11th blocked
  let last = { allowed: true, retryAfter: 0 }
  for (let i = 1; i <= 11; i++) last = rateLimit('test-a', { limit: 10, windowMs: 60_000 })
  expect(last.allowed === false, '11th call within window is blocked')
  expect(last.retryAfter > 0 && last.retryAfter <= 60, `retryAfter is sane (${last.retryAfter}s)`)

  // 2) different key unaffected
  const other = rateLimit('test-b', { limit: 10, windowMs: 60_000 })
  expect(other.allowed, 'a different key is unaffected')

  // 3) window expiry lets the request through again
  const expired = rateLimit('test-c', { limit: 1, windowMs: 5 })
  expect(expired.allowed, 'first call on fresh key allowed')
  const blocked = rateLimit('test-c', { limit: 1, windowMs: 5 })
  expect(!blocked.allowed, 'second call inside 5ms window blocked')
  await new Promise((r) => setTimeout(r, 20))
  const afterWindow = rateLimit('test-c', { limit: 1, windowMs: 5 })
  expect(afterWindow.allowed, 'call after window expiry allowed again')

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main()
