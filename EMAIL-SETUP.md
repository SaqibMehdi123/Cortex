# Email setup (verification codes & password resets)

Cortex emails a 6-digit code for two things: verifying your address after
signup, and resetting a forgotten password. To actually deliver those emails
the server needs a mail provider. There are two supported options — pick one,
add it to the server's `.env`, restart, done.

Until one is configured, codes are printed in the server log only, and the
sign-up / reset screens show a clear "email isn't set up" notice. The code is
never shown in the browser (unless you explicitly turn on the dev fallback
documented at the bottom).

---

## Option A — Brevo (recommended, sends to ANY recipient on the free tier)

Brevo's free tier (300 emails/day, 9,000/month) delivers to **any email
address** — Gmail, Outlook, anything — as long as the *sender* address is
confirmed inside Brevo. No custom domain, no paid plan, no SMTP ports.

1. Create a free account at [app.brevo.com](https://app.brevo.com).
2. Confirm a sender: click your avatar (top right) → **Senders, Domains &
   Dedicated IPs** → **Senders** → **Add sender**. Use an address you can
   open (e.g. your Gmail) and click the confirmation link Brevo sends you.
3. Generate an API key: avatar → **SMTP & API** → **API keys** → **Generate
   new key** → copy it (`xkeysib-...`).
4. Add to `.env` on the server:

   ```
   BREVO_API_KEY=xkeysib-xxxxxxxxxxxxxxxxxxxx
   BREVO_SENDER_EMAIL=you@gmail.com
   ```

   `BREVO_SENDER_EMAIL` must be the exact address you confirmed in step 2.

5. Restart Cortex (`pkill -f "next dev"; nohup npm run dev &`) and check
   `GET /api/auth/mail-status` → `{"configured": true}`.

Notes:

- The display name defaults to `Cortex`; override with
  `MAIL_FROM="Cortex <you@gmail.com>"` if you want something else.
- If a send fails (wrong key, unconfirmed sender) the UI shows
  "the mail provider rejected it" and the exact Brevo error — including a
  hint for unconfirmed senders — is printed in the server log.
- Free-tier emails sit behind Brevo's shared IP pool; for a personal app's
  verification codes this is a non-issue. Adding your domain later
  (Senders → Domains → authenticate with DKIM/SPF records) only improves
  deliverability, it is not required to send.

## Option B — Gmail SMTP

Uses your own Gmail account via an **App Password** (a regular Gmail password
is always rejected by Google).

1. Make sure 2-Step Verification is on:
   [myaccount.google.com/security](https://myaccount.google.com/security)
2. Create an App Password:
   [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   → name it "Cortex" → copy the 16-character password.
3. Add to `.env` on the server:

   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=your.name@gmail.com
   SMTP_PASS=abcdefghijklmnop
   ```

   (Paste the app password **without spaces**.)

4. Restart Cortex and check `/api/auth/mail-status` → `{"configured": true}`.

Gmail will then deliver codes to any address, and a copy of every
verification mail lands in the Gmail account's "Sent" folder. If Google
blocks the login (rare, usually means 2-Step Verification is off), the UI
reports "the mail provider rejected it" and the reason appears in the server
log.

## Both configured?

Brevo wins; SMTP acts as an automatic fallback if the Brevo call fails.

## Local development without any mail provider

Working offline and just need the flow to run end-to-end? Set:

```
AUTH_DEV_CODE_FALLBACK=true
```

The API will then include the code in its response and the screen shows it in
a labelled amber box, exactly like the old dev behaviour. **Never enable this
on a server other people can reach** — it would let anyone read anyone's
verification / reset codes.

## Quick checklist

```bash
# is mail configured?
curl -s http://localhost:3000/api/auth/mail-status

# tail the log for the dev banner or provider errors
tail -f dev.log | grep -A4 "DEV EMAIL\|send failed"
```
