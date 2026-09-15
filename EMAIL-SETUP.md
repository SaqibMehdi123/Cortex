# Email setup — receiving (name.com) & sending (provider chain)

Cortex sends three kinds of email: signup verification codes, password-reset
codes, and the 09:00 PKT morning briefing (plus the 08:30 feed sync cron that
feeds it). This doc covers both halves of email:

1. **Receiving** — mail sent TO brand addresses (`support@`, `hello@`)
2. **Sending** — mail sent BY the app (codes, briefings)

---

## 1. Receiving — name.com Email Forwarding (DONE, live)

Both brand mailboxes exist at the registrar and forward to the owner's
personal Gmail (`saqibmehdi234@gmail.com`):

| Brand address            | Forwards to              | Used for                          |
| ------------------------ | ------------------------ | --------------------------------- |
| `hello@scrutinies.dev`   | saqibmehdi234@gmail.com  | general contact (footer)          |
| `support@scrutinies.dev` | saqibmehdi234@gmail.com  | user support, Reply-To on all mail|

DNS facts (verified 2026-09-16): nameservers = name.com (`ns1bcp/ns2cvx/
ns3jkl/ns4cfn.name.com`), MX = name.com forwarders (`mx3–mx8.name.com`).
**Do not delete those MX records** — they ARE the forwarding.

Notes:

- Replying to a forwarded mail goes out from the personal Gmail address.
  That is fine for support. Sending *as* hello@ needs the sending setup below.
- Old leftovers in DNS from a previous Brevo attempt: the `brevo-code:…` TXT
  and the `_dmarc` TXT pointing at `rua@dmarc.brevo.com`. Harmless. Once the
  Resend domain below is Verified, the `brevo-code` TXT can be deleted and the
  `_dmarc` value replaced by Resend's.

## 2. Sending — provider chain (code: `src/lib/mailer.ts`)

The first configured provider sends; the next configured one automatically
takes over if a send fails:

1. **Resend** (`RESEND_API_KEY`) — current recommendation (HTTP API, made for
   serverless; free tier 3,000 emails/month, 100/day)
2. **SendGrid** (`SENDGRID_API_KEY`) — free 100/day, verified single sender
3. **Raw SMTP** (`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`) — currently ACTIVE:
   Gmail app-password (smtp.gmail.com:465)
4. **Brevo** (`BREVO_API_KEY`) — legacy last-resort (its Authorised-IPs
   feature intermittently blocks Vercel egress IPs)

Current live state: **Gmail SMTP is the active sender**, so verification codes
and briefings go out "Cortex <saqibmehdi234@gmail.com>" and every message
carries `Reply-To: support@scrutinies.dev`.

Live diagnostics:

- `GET /api/ops/health` — safe booleans: active provider, key valid, sender
  confirmed, SMTP port reachable
- Dashboard → Settings → **Send test email** — sends through the real chain
  to your own address and reports provider/delivered/error

---

## 3. Upgrade the sender identity to `hello@scrutinies.dev` (Resend)

Goal: outgoing mail shows **Cortex <hello@scrutinies.dev>** instead of the
personal Gmail. Resend needs to own the domain's sending identity, which takes
3 DNS records at name.com plus two env vars.

### Step 1 — Resend account

Sign up at [resend.com](https://resend.com) (free). Leave the default region.

### Step 2 — Add the domain

Resend dashboard → **Domains → Add Domain** → enter `scrutinies.dev` (the
apex — that is what allows `hello@scrutinies.dev` as From).

### Step 3 — Copy Resend's DNS records into name.com

Resend shows a records table (values are unique per account — copy YOURS
exactly). It looks like:

| Type | Host (name.com "Host" field) | Answer / Value                              | Priority |
| ---- | ---------------------------- | ------------------------------------------- | -------- |
| TXT  | *(empty = root)*             | `v=spf1 include:amazonses.com ~all`          | —        |
| TXT  | `resend._domainkey`          | `p=MIGfMA0GCSqGSIb3…` (long DKIM key)        | —        |
| TXT  | `_dmarc`                     | `v=DMARC1; p=none;`                          | —        |
| MX   | *(empty = root)*             | `feedback-smtp.<region>.amazonses.com`       | **99**   |

Rules that keep your forwarding intact:

- **ADD only. Never edit or delete the existing `mx3–mx8.name.com` MX
  records.**
- If Resend lists the MX at priority 10, enter it with **priority 99** — it
  stays valid for Resend's bounce handling but is tried last, so incoming
  mail keeps flowing to name.com's forwarders first.
- `_dmarc` already exists (Brevo leftover): **edit that record's value** to
  Resend's instead of adding a second one.
- The `brevo-code:…` TXT is only a Brevo verification artifact — delete it
  once Resend shows Verified.

### Step 4 — Verify

Resend → Domains → **Verify**. SPF + DKIM turn green (minutes to ~1 h).
name.com DNS changes may take a little while to propagate.

### Step 5 — API key

Resend → **API Keys → Create API Key** → copy the `re_…` value.

### Step 6 — Vercel env vars (add BOTH together, then redeploy)

Vercel → Project → Settings → Environment Variables (Production):

```
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM=Cortex <hello@scrutinies.dev>
```

Then Deployments → Redeploy. Env vars only apply after a redeploy.

Deliberately leave `MAIL_FROM` unset: `RESEND_FROM` controls the Resend From
address, while `MAIL_FROM` would also change the From used by the SMTP
fallback — and Gmail would reject a `hello@` From it isn't authenticated for.
With `MAIL_FROM` unset, if Resend is ever down the chain falls back to your
Gmail sender automatically and delivery keeps working.

### Step 7 — Prove it

1. Dashboard → Settings → **Send test email** → response should say
   `provider: "resend"`, `delivered: true`.
2. The mail lands in your Gmail **From "Cortex <hello@scrutinies.dev>"**
   (check Spam on first arrival; mark "not spam" once).
3. Deliverability is now backed by your own SPF + DKIM, so inbox placement is
   far better than the shared-Gmail setup.

Rollback = delete those two env vars + redeploy; nothing else to undo. The
Gmail SMTP config can stay in place forever as the automatic fallback.

## Alternatives (documented, not currently used)

### SendGrid

Free 100/day to any recipient; only the *sender* must be verified (no domain
records). Settings → Sender Authentication → Verify a Single Sender, then:

```
SENDGRID_API_KEY=SG.xxxx
SENDGRID_SENDER_EMAIL=you@gmail.com
```

### Any SMTP provider (SMTP2GO, Postmark, Gmail app-password)

```
SMTP_HOST=smtp.gmail.com      # or mail.smtp2go.com / smtp.postmarkapp.com
SMTP_PORT=465                 # SMTP_SECURE=true for 465
SMTP_USER=…
SMTP_PASS=…
```

Google is phasing out App Passwords; if yours still works it is a fine
fallback (it is what currently sends). First mails to Gmail can land in Spam
until you mark one "not spam".

### Brevo (legacy — do not rely on)

Authorised-IPs intermittently rejects Vercel's rotating egress IPs, so sends
fail unpredictably; the code path exists only as a last-resort fallback. If
SMTP/Resend/SendGrid is configured, remove `BREVO_API_KEY` /
`BREVO_SENDER_EMAIL` from env.

## Local development without any mail provider

`AUTH_DEV_CODE_FALLBACK=true` shows codes in the UI when delivery is
impossible. **DEV ONLY — never on a reachable server.**

---

## Morning briefing — schedule & manual runs

`vercel.json` registers two crons (Vercel reads it on every deploy):

| Path                | Schedule (UTC) | Local (PKT) | What it does                        |
| ------------------- | -------------- | ----------- | ----------------------------------- |
| `/api/cron/morning` | `0 4 * * *`    | 09:00       | Personal agenda email per verified user |
| `/api/cron/feeds`   | `30 3 * * *`   | 08:30       | Sync scholarships + exchange programmes |

Auth: with `CRON_SECRET` set (it is), Vercel signs each invocation with
`Authorization: Bearer $CRON_SECRET` and the routes reject everything else
(the spoofable `x-vercel-cron` fallback only applies while the secret is
unset). Manual runs use the same secret:

```bash
CRON_SECRET=<your value>

# dry run — build everything, send nothing
curl "https://cortex.scrutinies.dev/api/cron/morning?key=$CRON_SECRET&dryRun=1"

# real run for one account
curl "https://cortex.scrutinies.dev/api/cron/morning?key=$CRON_SECRET&user=you@example.com"

# full run (what the cron does at 09:00)
curl "https://cortex.scrutinies.dev/api/cron/morning?key=$CRON_SECRET"

# feed sync (scholarships + exchange programmes)
curl "https://cortex.scrutinies.dev/api/cron/feeds?key=$CRON_SECRET"
```

Accounts with an empty agenda get no email. Each response lists per-account
counts plus `sent / skipped / failed` on real runs.
