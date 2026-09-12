// Quick verification of the security + storage changes. Run: bun run scripts/verify-fixes.ts
import { parseStorageRef, makeStorageKey, isBlobUrl, r2Configured, storageMode } from '../src/lib/storage'
import { safeFetch, SafeFetchError } from '../src/lib/safe-fetch'

let pass = 0
let fail = 0
function check(name: string, cond: boolean) {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ FAIL: ${name}`)
  }
}

console.log('— storage refs —')
const r = (s: string) => parseStorageRef(s).kind
check('r2:// normal key → r2', r('r2://pdf/user1/abc/book.pdf') === 'r2')
check('r2:// traversal → unknown', r('r2://pdf/../secret') === 'unknown')
check('r2:// with query tricks → unknown', r('r2://pdf/x?evil') === 'unknown')
check('blob URL → blob', r('https://abc123.public.blob.vercel-storage.com/x/book-xyz.pdf') === 'blob')
check('arbitrary https URL → unknown (SSRF-safe)', r('https://evil.example.com/x.pdf') === 'unknown')
check('http URL → unknown', r('http://169.254.169.254/x') === 'unknown')
check('disk name → disk', r('some-uuid.pdf') === 'disk')
check('disk traversal rejected', r('../../etc/passwd.pdf') === 'unknown')
check('isBlobUrl negative', !isBlobUrl('https://fake.public.blob.vercel-storage.com.evil.com/x.pdf'))

console.log('— key generation —')
const key = makeStorageKey('user1', '../../..\\weird name (1).pdf')
check('key has no traversal/specials', !key.includes('..') && !key.includes('\\') && !key.includes('(') && key.endsWith('.pdf'))
check('key namespaced per user', key.startsWith('pdf/user1/'))

console.log('— mode detection (no R2 env in this sandbox) —')
check('r2Configured false without env', r2Configured() === false)
check('mode falls back to blob/disk, never r2', storageMode() === 'blob' || storageMode() === 'disk')

console.log('— safeFetch SSRF guards —')
const blockedTargets = [
  'http://127.0.0.1/x',
  'http://localhost:3000/x',
  'http://169.254.169.254/latest/meta-data/',
  'http://169.254.169.254:80/x',
  'http://10.1.2.3/x',
  'http://192.168.1.1/x',
  'http://172.16.0.9/x',
  'http://100.64.0.1/x',
  'http://0x7f000001/x', // hex IPv4 literal for 127.0.0.1
  'http://2130706433/x', // decimal IPv4 literal for 127.0.0.1
  'http://[::1]/x',
  'http://[::ffff:127.0.0.1]/x',
  'http://[fe80::1]/x',
  'http://user:pass@example.com/x', // embedded credentials
  'file:///etc/passwd',
  'gopher://example.com/x',
  'http://metadata.google.internal/computeMetadata/v1/',
  'http://db.internal.local/x',
  'http://127.1/x', // shorthand loopback
]
for (const t of blockedTargets) {
  try {
    await safeFetch(t, { timeoutMs: 4000 })
    check(`blocked: ${t}`, false) // fetch "succeeded" — that's a failure for blocked targets
  } catch (e) {
    check(`blocked: ${t}`, e instanceof SafeFetchError)
  }
}

console.log('— safeFetch allows real public hosts —')
try {
  const res = await safeFetch('https://example.com/', { timeoutMs: 8000 })
  check('public https passes guards and fetches (status ' + res.status + ')', res.ok)
} catch (e) {
  // network sandbox may block egress; if it's a network error (not SafeFetchError) the guard passed
  check('public https passes guards (network error is acceptable in sandbox)', !(e instanceof SafeFetchError))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
