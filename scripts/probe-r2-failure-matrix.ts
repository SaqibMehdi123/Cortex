// Local failure-mode matrix: feed synthetic R2_ACCOUNT_ID values into the
// SAME probe the production health endpoint uses, and record which S3/SDK
// error code each produces. Goal: match production's literal `ENOTFOUND`
// to the specific kind of bad paste, WITHOUT needing the user's values.
// No real credentials are used — valid-host cases get 403 from the edge
// (auth failure), which still proves DNS + TLS + request path work.

import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'

const HEX = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'
const JWT =
  'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ0b29sb25nLWZpcnN0LWxhYmVsLXRlc3QtYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd3eHl6In0.sig'

// Mirrors src/lib/storage.ts r2AccountId()
function r2AccountId(raw: string): string {
  let v = raw.trim()
  if (/^[a-z]+:\/\//i.test(v)) v = v.slice(v.indexOf('://') + 3)
  v = v.split('/')[0]
  v = v.replace(/\.(?:eu|fedramp)?\.?r2\.cloudflarestorage\.com.*$/i, '')
  return v.trim()
}

function client(accountId: string): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: 'AKIAFAKEFAKEFAKEFAKE', secretAccessKey: 'not-a-real-secret-0000000000000000' },
  })
}

const cases: Array<[string, string]> = [
  ['correct bare 32-hex (baseline)', HEX],
  ['full endpoint URL paste (pre-sanitizer value)', `https://${HEX}.r2.cloudflarestorage.com`],
  ['double-scheme https://https://… (URL paste reaching old code)', `https://https://${HEX}.r2.cloudflarestorage.com`],
  ['wrapped in double quotes', `"${HEX}"`],
  ['wrapped in single quotes', `'${HEX}'`],
  ['internal space', `${HEX.slice(0, 16)} ${HEX.slice(16)}`],
  ['bucket name instead of account id', 'cortex-pdfs'],
  ['64-char secret as id', 'x'.repeat(64)],
  ['JWT token value as id', JWT],
  ['only the suffix .r2.cloudflarestorage.com', '.r2.cloudflarestorage.com'],
  ['empty after scheme strip', 'https://'],
  ['angle brackets <id>', `<${HEX}>`],
]

for (const [name, raw] of cases) {
  const id = r2AccountId(raw)
  const label = `${name}\n     raw=${JSON.stringify(raw.slice(0, 60))} → id=${JSON.stringify(id.slice(0, 60))}`
  try {
    await client(id).send(new ListObjectsV2Command({ Bucket: 'cortex-pdfs', MaxKeys: 1 }))
    console.log(`✓ ${label}\n    → OK (unexpected with fake creds)`)
  } catch (e) {
    const err = e as { name?: string; code?: string; message?: string; $metadata?: { httpStatusCode?: number }; cause?: { code?: string } }
    console.log(
      `✗ ${label}\n    → name=${err.name} code=${err.code ?? '-'} cause.code=${err.cause?.code ?? '-'} status=${err.$metadata?.httpStatusCode ?? '-'} msg=${(err.message || '').slice(0, 70)}`
    )
  }
}
