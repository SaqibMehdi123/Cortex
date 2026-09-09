// Wire-format + provider-chain test for src/lib/mailer.ts.
//
// Runs the REAL mailer code (bun imports TS natively) against local mock
// HTTP servers standing in for the SendGrid / Brevo APIs:
//
//   1. SendGrid wire format — POST /v3/mail/send carries Bearer auth, a
//      personalizations[].to[].email, verified from.name/email from
//      MAIL_FROM, subject, and BOTH text/plain + text/html parts.
//   2. 202 Accepted → { delivered: true }.
//   3. 401 → sendgrid rejects, no fallback configured → { delivered: false }.
//   4. SendGrid 500 → chain falls through to Brevo → { delivered: true }.
//   5. Provider-detection helpers under different env combinations.
//
// Usage: bun scripts/sendgrid_provider_test.mjs
// Exit code 0 = all scenarios passed.

import http from 'node:http'
import assert from 'node:assert'

const logs = []
const origError = console.error
console.error = (...args) => {
  logs.push(args.map(String).join(' '))
  origError(...args)
}

function makeMock(port) {
  const hits = []
  let responder = () => {}
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const hit = {
        method: req.method,
        url: req.url,
        auth: req.headers.authorization || null,
        apiKey: req.headers['api-key'] || null,
        contentType: req.headers['content-type'] || null,
        body: body ? JSON.parse(body) : null,
      }
      hits.push(hit)
      responder(req, res, hit)
    })
  })
  return {
    hits,
    server,
    setResponder: (fn) => (responder = fn),
    start: () => new Promise((ok) => server.listen(port, '127.0.0.1', ok)),
    stop: () => new Promise((ok) => server.close(ok)),
  }
}

const envBackup = { ...process.env }
const restoreEnv = () => {
  for (const k of ['SENDGRID_API_KEY', 'SENDGRID_SENDER_EMAIL', 'SENDGRID_API_BASE', 'BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'BREVO_API_BASE', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'])
    delete process.env[k]
  Object.assign(process.env, envBackup)
}

const sg = makeMock(0)
const br = makeMock(0)
await sg.start()
await br.start()
const sgBase = `http://127.0.0.1:${sg.server.address().port}`
const brBase = `http://127.0.0.1:${br.server.address().port}`

const mailer = await import('../src/lib/mailer.ts')

// ── Scenario 1+2: wire format & 202 success ─────────────────────────────
process.env.SENDGRID_API_KEY = 'SG.TESTKEY'
process.env.MAIL_FROM = 'Cortex <sender@example.com>'
process.env.SENDGRID_API_BASE = sgBase
for (const k of ['BREVO_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) delete process.env[k]

assert.deepEqual(mailer.configuredProviders(), ['sendgrid'], 'only sendgrid configured')
assert.equal(mailer.activeMailProvider(), 'sendgrid')
assert.equal(mailer.configuredFromEmail(), 'sender@example.com')
assert.equal(mailer.mailFrom(), 'Cortex <sender@example.com>')
assert.equal(mailer.mailConfigured(), true)

sg.setResponder((req, res) => {
  assert.equal(req.url, '/v3/mail/send', 'sendgrid path')
  res.writeHead(202, { 'content-type': 'application/json' })
  res.end('{}')
})
const r1 = await mailer.sendCodeEmail('user@gmail.com', 'Saqib', '123456', 'verify')
assert.deepEqual(r1, { delivered: true }, '202 → delivered')
const hit1 = sg.hits.at(-1)
assert.equal(hit1.auth, 'Bearer SG.TESTKEY', 'Bearer auth header')
assert.equal(hit1.contentType, 'application/json')
assert.equal(hit1.body.personalizations[0].to[0].email, 'user@gmail.com')
assert.equal(hit1.body.from.email, 'sender@example.com')
assert.equal(hit1.body.from.name, 'Cortex')
assert.equal(hit1.body.subject, 'Your Cortex verification code')
const plain = hit1.body.content.find((c) => c.type === 'text/plain')
const rich = hit1.body.content.find((c) => c.type === 'text/html')
assert.ok(plain && plain.value.includes('123456'), 'text/plain part carries the code')
assert.ok(rich && rich.value.includes('123456') && rich.value.includes('<html'), 'text/html part intact')
origError('\n✔ scenario 1: sendgrid wire format + 202 → delivered\n')
logs.length = 0

// ── Scenario 3: 401 → rejected, no fallback ─────────────────────────────
sg.setResponder((req, res) => {
  res.writeHead(401, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ errors: [{ message: 'Permission denied, wrong credentials' }] }))
})
const r2 = await mailer.sendCodeEmail('user@gmail.com', 'Saqib', '123456', 'verify')
assert.deepEqual(r2, { delivered: false, reason: 'send_failed' }, '401 → send_failed')
assert.ok(logs.some((l) => l.includes('SendGrid send failed (401)')), '401 logged with provider name')
origError('✔ scenario 2: 401 → send_failed, no crash\n')
logs.length = 0

// ── Scenario 4: sendgrid 500 → brevo fallback wins ──────────────────────
process.env.BREVO_API_KEY = 'xkeysib.TESTKEY'
process.env.BREVO_SENDER_EMAIL = 'sender@example.com'
process.env.BREVO_API_BASE = brBase
assert.deepEqual(mailer.configuredProviders(), ['sendgrid', 'brevo'], 'chain order: sendgrid → brevo')

sg.setResponder((req, res) => {
  res.writeHead(500, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ errors: [{ message: 'boom' }] }))
})
br.setResponder((req, res, hit) => {
  assert.equal(hit.url, '/v3/smtp/email', 'brevo path')
  assert.equal(hit.apiKey, 'xkeysib.TESTKEY')
  assert.equal(hit.body.sender.email, 'sender@example.com')
  assert.equal(hit.body.to[0].email, 'user@gmail.com')
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end('{"messageId":"1"}')
})
const r3 = await mailer.sendCodeEmail('user@gmail.com', 'Saqib', '654321', 'reset')
assert.deepEqual(r3, { delivered: true }, 'fallback to brevo → delivered')
assert.equal(br.hits.length, 1, 'brevo mock received exactly one call')
origError('✔ scenario 3: sendgrid 500 → brevo fallback → delivered\n')
logs.length = 0

// ── Scenario 5: detection helpers under mixed envs ──────────────────────
delete process.env.SENDGRID_API_KEY
delete process.env.BREVO_API_KEY
delete process.env.SENDGRID_SENDER_EMAIL
delete process.env.BREVO_SENDER_EMAIL
process.env.SMTP_HOST = 'smtp.smtp2go.com'
process.env.SMTP_USER = 'cortex@smtp2go.net'
process.env.SMTP_PASS = 'secret'
assert.deepEqual(mailer.configuredProviders(), ['smtp'], 'smtp only')
assert.equal(mailer.activeMailProvider(), 'smtp')
assert.equal(mailer.configuredFromEmail(), 'sender@example.com', 'MAIL_FROM still wins for from')
assert.equal(mailer.mailFrom(), 'Cortex <sender@example.com>')

delete process.env.MAIL_FROM
assert.equal(mailer.configuredFromEmail(), 'cortex@smtp2go.net', 'falls back to SMTP_USER for from')

delete process.env.SMTP_HOST
delete process.env.SMTP_USER
delete process.env.SMTP_PASS
assert.equal(mailer.mailConfigured(), false, 'nothing configured')
assert.equal(mailer.activeMailProvider(), null)
assert.equal(mailer.configuredFromEmail(), null)
const r4 = await mailer.sendCodeEmail('user@gmail.com', 'Saqib', '111111', 'verify')
assert.deepEqual(r4, { delivered: false, reason: 'not_configured' }, 'nothing configured → not_configured')
origError('✔ scenario 4: provider detection + not_configured contract\n')

await sg.stop()
await br.stop()
restoreEnv()
origError('\nALL PROVIDER TESTS PASSED\n')
process.exit(0)
