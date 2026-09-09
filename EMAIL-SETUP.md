# Email setup (verification codes & password resets)

Cortex emails a 6-digit code for two things: verifying your address after
signup, and resetting a forgotten password. To actually deliver those emails
the server needs a mail provider.

**Cortex tries providers in this order — the first one configured sends, and
the next configured one is the automatic fallback if a send fails:**

1. **SendGrid** (`SENDGRID_API_KEY`) — recommended
2. **Any SMTP provider** (`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`) — SMTP2GO,
   Postmark, Gmail App Password, …
3. **Brevo** (`BREVO_API_KEY`) — legacy fallback only, see the warning below

Until one is configured, codes are printed in the server log only, and the
sign-up / reset screens show a clear "email isn't set up" notice. The code is
never shown in the browser (unless you explicitly turn on the dev fallback
documented at the bottom).

Live check: `GET /api/ops/health` reports the active provider, whether its key
is valid, and whether the sender address is verified — all as safe booleans.

---

## Option A — SendGrid (recommended)

SendGrid's free tier (100 emails/day, forever) delivers to **any email
address** — Gmail, Outlook, anything — as long as the *sender* address is
verified inside SendGrid. No custom domain required, and — unlike Brevo —
**there is no IP allow-list to trip over**, so Vercel's rotating serverless
egress IPs are a non-issue.

1. Create a free account at [signup.sendgrid.com](https://signup.sendgrid.com)
   (2FA setup is part of onboarding — it's required).
2. Verify a sender: **Settings → Sender Authentication → Verify a Single
   Sender**. Use an address you can open (e.g. your Gmail) and click the
   confirmation link SendGrid emails you. This is usually instant.
3. Create an API key: **Settings → API Keys → Create API Key**. "Full Access"
   is fine for a personal app; a "Restricted Access" key must include
   **Mail Send**. Copy it once — it starts with `SG.`.
4. Add to `.env` on the server (or Vercel → Settings → Environment Variables):

   ```
   SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxx
   SENDGRID_SENDER_EMAIL=you@gmail.com
   ```

   `SENDGRID_SENDER_EMAIL` must be the exact address you verified in step 2.

5. Redeploy/restart, then check `GET /api/ops/health` →
   `mail.provider: "sendgrid"`, `keyValid: true`, `senderConfirmed: true`.

Notes:

- The display name defaults to `Cortex`; override with
  `MAIL_FROM="Cortex <you@gmail.com>"` if you want something else.
- If a send fails (wrong key, unverified sender) the UI shows
  "the mail provider rejected it" and the exact SendGrid error — including a
  hint for unverified senders — is printed in the server log.
- First verification mails to Gmail can land in **Spam** (new SendGrid
  account + shared IP pool). Mark one as "not spam" and the rest arrive
  normally. Adding DKIM authentication later (Sender Authentication →
  Authenticate a Domain, needs a domain) only improves this, it is not
  required to send.

## Option B — any SMTP provider (SMTP2GO, Postmark, Gmail …)

Cortex speaks plain SMTP, so any provider with an SMTP endpoint works.
**SMTP2GO** is a good default: free 1,000 emails/month, no IP allow-list, no
domain needed, and it never throttles serverless IPs.

1. Create a free account at [smtp2go.com](https://www.smtp2go.com) and verify
   the sender address it asks for.
2. Note the SMTP username / password from their dashboard (SMTP Users).
3. Add to `.env`:

   ```
   SMTP_HOST=mail.smtp2go.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=your-username
   SMTP_PASS=your-password
   ```

4. Restart Cortex and check `/api/auth/mail-status` → `{"configured": true}`.

Postmark works the same way (100 emails/month free, excellent deliverability):
`SMTP_HOST=smtp.postmarkapp.com`, port 587, `SMTP_USER`/`SMTP_PASS` = the
Server API token printed twice.

**Gmail App Password note:** this used to be documented as the easy option,
but Google has been phasing App Passwords out (newer accounts may no longer
offer them at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)).
If yours still works:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=you@gmail.com
SMTP_PASS=16-char-app-password
```

If Google blocks the login, the reason appears in the server log — prefer
Option A or B in that case.

## Legacy — Brevo (fallback only)

Brevo previously caused intermittent failures on serverless hosts: its
optional **Authorised IPs** feature rejects requests from unknown IPs, and
platforms like Vercel rotate egress IPs, so sends fail unpredictably. The
code path is kept only as an automatic last-resort fallback. If SendGrid (or
SMTP) is configured, **delete `BREVO_API_KEY` / `BREVO_SENDER_EMAIL` from
your env** so the dead provider is never tried. If you ever re-enable Brevo:
300 emails/day free, sender confirmed under *Senders, Domains & Dedicated
IPs*, key under *SMTP & API → API keys*.

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
# is mail configured, and which provider is active?
curl -s http://localhost:3000/api/auth/mail-status

# full production-style check (key validity + sender verification + Blob)
curl -s http://localhost:3000/api/ops/health | jq .mail

# tail the log for the dev banner or provider errors
tail -f dev.log | grep -A4 "DEV EMAIL\|send failed"

# offline wire-format test of the mailer (mock servers, no real emails)
bun scripts/sendgrid_provider_test.mjs
```
