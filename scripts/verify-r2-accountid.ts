// Offline checks for r2AccountId() — the self-healing normaliser for
// R2_ACCOUNT_ID pastes (full endpoint URL, host, jurisdiction host, bare id).

import { r2AccountId } from '../src/lib/storage'

function withEnv(v: string): string {
  process.env.R2_ACCOUNT_ID = v
  return r2AccountId()
}

const cases: Array<[string, string, string]> = [
  ['bare 32-hex id (correct paste)', 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'],
  ['full endpoint URL', 'https://a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6.r2.cloudflarestorage.com', 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'],
  ['host without scheme', 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6.r2.cloudflarestorage.com', 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'],
  ['jurisdiction endpoint URL', 'https://a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6.eu.r2.cloudflarestorage.com', 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'],
  ['endpoint URL with trailing slash+path', 'https://a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6.r2.cloudflarestorage.com/bucket/key', 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'],
  ['padded whitespace', '  a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6\n', 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'],
]

let passed = 0
for (const [name, input, want] of cases) {
  const got = withEnv(input)
  if (got === want) {
    console.log(`  ✓ ${name}`)
    passed++
  } else {
    console.log(`  ✗ ${name}: got "${got}", want "${want}"`)
  }
}
console.log(`\n${passed}/${cases.length} passed`)
process.exit(passed === cases.length ? 0 : 1)
