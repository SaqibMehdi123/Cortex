// Mimic the app's mailer exactly: send a test code email via Brevo
// so we can confirm (a) the key works, (b) the sender is confirmed.
// Usage: BREVO_API_KEY=xkeysib-... BREVO_SENDER_EMAIL=you@x.com node scripts/brevo_test.mjs [to]
const KEY = process.env.BREVO_API_KEY
const SENDER = process.env.BREVO_SENDER_EMAIL
const TO = process.argv[2] || SENDER

if (!KEY || !SENDER) {
  console.error('Set BREVO_API_KEY and BREVO_SENDER_EMAIL first.')
  process.exit(1)
}

const res = await fetch('https://api.brevo.com/v3/smtp/email', {
  method: 'POST',
  headers: { 'api-key': KEY, 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify({
    sender: { name: 'Cortex', email: SENDER },
    to: [{ email: TO }],
    subject: 'Cortex email test — you can ignore this',
    htmlContent: '<p>This is a delivery test from your Cortex server. If you see it, real emails work.</p>',
  }),
  signal: AbortSignal.timeout(15_000),
})
console.log('status:', res.status)
console.log((await res.text()).slice(0, 500))
