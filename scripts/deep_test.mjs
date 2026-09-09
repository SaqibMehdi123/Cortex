// Deep end-to-end production test for Cortex (run from the sandbox):
//   STAGE 1  register test account via production API        → mail verdict
//   STAGE 2  mark verified directly in Neon DB (test user only)
//   STAGE 3  login → session cookie
//   STAGE 4  blob probe → client token (the previously broken step)
//   STAGE 5  PUT the PDF to Vercel Blob
//   STAGE 6  from-blob import (extraction + DB row)
//   STAGE 7  cleanup: delete document (also deletes blob), delete user
// Usage: node scripts/deep_test.mjs [--keep]
process.env ||= {}
import { readFileSync } from 'node:fs'

// ── load .env (DATABASE_URL) ──────────────────────────────────────────
try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
  }
} catch {}

const BASE = 'https://cortex-sync.vercel.app'
const EMAIL = `deep-test-${Date.now()}@example.com`
const PASS = 'deep-test-passw0rd'
const results = []
const log = (stage, ok, detail) => {
  results.push({ stage, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${stage} — ${detail}`)
}

// ── minimal valid single-page PDF with computed xref offsets ─────────
function minimalPdf() {
  const objs = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ]
  const text = 'BT /F1 24 Tf 72 700 Td (Deep test upload) Tj ET'
  objs.push(`5 0 obj\n<< /Length ${text.length} >>\nstream\n${text}\nendstream\nendobj\n`)
  let out = '%PDF-1.4\n'
  const offsets = []
  for (const o of objs) offsets.push(out.length), (out += o)
  const xrefPos = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

const { PrismaClient } = await import('@prisma/client')
const prisma = new PrismaClient()

try {
  // ── STAGE 1: register (real mail send) ──────────────────────────────
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Deep Test', email: EMAIL, password: PASS }),
  })
  const regBody = await reg.json().catch(() => ({}))
  log(
    '1 register',
    reg.status === 201 || reg.status === 200,
    `HTTP ${reg.status} | emailSent=${regBody.emailSent} emailError=${regBody.emailError ?? '—'} devCode=${regBody.devCode ?? '—'}`
  )
  if (reg.status >= 500) throw new Error('register 5xx — aborting')

  // ── STAGE 2: verify the TEST user directly in DB (never the code path) ──
  const user = await prisma.user.findUnique({ where: { email: EMAIL } })
  if (!user) throw new Error('test user not found in DB')
  await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } })
  log('2 db-verify', true, `user ${user.id} marked verified (test user only)`)

  // ── STAGE 3: login → cookie ─────────────────────────────────────────
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  })
  const setCookie = login.headers.get('set-cookie') || ''
  const cookie = setCookie.split(';')[0]
  log('3 login', login.ok && cookie.startsWith('cortex_session='), `HTTP ${login.status} | cookie ${cookie ? 'received' : 'MISSING'}`)
  if (!cookie) throw new Error('no session cookie — aborting')

  // ── STAGE 4: probe + client token ───────────────────────────────────
  const probe = await fetch(`${BASE}/api/documents/upload-url`, { headers: { cookie } })
  const probeBody = await probe.json().catch(() => ({}))
  log('4a blob probe', probeBody.mode === 'blob', `mode=${probeBody.mode}`)

  const tokRes = await fetch(`${BASE}/api/documents/upload-url`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ type: 'blob.generate-client-token', payload: { pathname: `deep-test-${Date.now()}.pdf`, multipart: false } }),
  })
  const tokBody = await tokRes.json().catch(() => ({}))
  log('4b client token', tokRes.ok && typeof tokBody.clientToken === 'string', `HTTP ${tokRes.status} | ${tokBody.error ?? `token ${tokBody.clientToken?.length ?? 0} chars`}`)
  if (!tokBody.clientToken) throw new Error('client token failed — THIS was the old bug; still broken?')

  const { getPayloadFromClientToken } = await import('@vercel/blob/client')
  const payload = getPayloadFromClientToken(tokBody.clientToken)
  console.log('   token payload keys:', Object.keys(payload).join(', '))

  // ── STAGE 5: PUT to Blob ────────────────────────────────────────────
  const pdf = minimalPdf()
  const uploadUrl = payload.uploadUrl || payload.url || payload.blobUrl
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${tokBody.clientToken}`,
      'content-type': 'application/pdf',
      'x-verify-user': payload.userId ?? '',
      ...(payload.headers || {}),
    },
    body: pdf,
  })
  const putBody = await putRes.json().catch(() => ({}))
  log('5 blob PUT', putRes.ok && putBody.url, `HTTP ${putRes.status} | url=${(putBody.url || putBody.error || '—').slice(0, 90)}`)
  if (!putBody.url) throw new Error('PUT failed')

  // ── STAGE 6: from-blob import (extraction + DB row) ─────────────────
  const imp = await fetch(`${BASE}/api/documents/pdf/from-blob`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ blobUrl: putBody.url, name: 'deep-test.pdf' }),
  })
  const impBody = await imp.json().catch(() => ({}))
  log(
    '6 from-blob import',
    imp.status === 201,
    `HTTP ${imp.status} | doc=${impBody.document?.id ?? impBody.error} pages=${impBody.pages ?? '—'} chars=${impBody.chars ?? '—'} warning=${impBody.warning ?? '—'}`
  )

  // ── STAGE 7: cleanup ────────────────────────────────────────────────
  if (impBody.document?.id && !process.argv.includes('--keep')) {
    const del = await fetch(`${BASE}/api/documents/${impBody.document.id}`, { method: 'DELETE', headers: { cookie } })
    log('7a delete doc', del.ok || del.status === 200, `HTTP ${del.status} (also removes the blob)`)
  }
  await prisma.user.delete({ where: { id: user.id } })
  log('7b delete test user', true, 'user + codes + settings cascade-deleted')

  console.log('\n═══ SUMMARY ═══')
  const failed = results.filter((r) => !r.ok)
  console.log(failed.length === 0 ? 'ALL STAGES PASSED' : `${failed.length} stage(s) FAILED:`)
  for (const f of failed) console.log(' -', f.stage, '|', f.detail)
} finally {
  await prisma.$disconnect()
}
