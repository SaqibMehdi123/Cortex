// Mimic the app's mailer exactly: send a test code email via Resend
// so we can confirm (a) the key works, (b) which `to` addresses are allowed.
const KEY = process.env.RESEND_API_KEY
const TO = process.argv[2] || 'saqibmehdi234@gmail.com'

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from: 'Cortex <onboarding@resend.dev>',
    to: [TO],
    subject: 'Cortex email test — you can ignore this',
    html: '<p>This is a delivery test from your Cortex server. If you see it, real emails work.</p>',
  }),
  signal: AbortSignal.timeout(15_000),
})
console.log('status:', res.status)
console.log((await res.text()).slice(0, 500))
