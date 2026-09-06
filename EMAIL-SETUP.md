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

## Option A — Resend (recommended, ~2 minutes, no server ports involved)

Resend's free tier (100 emails/day) is plenty for a personal workspace, and
without a verified domain it can send **to your own email address** — which is
exactly what a personal tool needs.

1. Go to [resend.com](https://resend.com) and create a free account.
2. **API Keys → Create API Key**, copy the key (`re_...`).
3. Add it to `.env` on the server:

   ```
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
   ```

4. Restart Cortex (`pkill -f "next dev"; nohup npm run dev &`) and check
   `GET /api/auth/mail-status` → `{"configured": true}`.

Notes:

- Sender defaults to `Cortex <onboarding@resend.dev>`. With that shared
  sandbox sender, Resend only delivers to the email address that owns the
  Resend account — so sign up in Cortex with the **same email you registered
  at Resend**. To deliver to arbitrary addresses, verify a domain at
  resend.com/domains and set `MAIL_FROM="Cortex <no-reply@yourdomain.com>"`.
- If a send fails (wrong key, recipient not allowed) the UI shows
  "the mail provider rejected it" instead of pretending success.

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

Resend wins; SMTP acts as an automatic fallback if the Resend call fails.

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
