# Deploying Cortex on Free Platforms

A practical, step-by-step guide. Read sections 1–2 first: the right platform depends on three hard requirements the app has, and choosing wrong is the difference between a 30-minute deploy and a broken one.

No emojis. Every command is copy-pasteable. Paths assume the repo root.

---

## 1. What Cortex actually needs at runtime

Cortex is **one fullstack app** — the Next.js server renders the UI *and* serves the backend (`/api/*` route handlers + Prisma). There is no separate backend process to deploy, but the server it runs on must provide:

| Requirement | Why | Consequence |
|---|---|---|
| **Persistent disk** | SQLite database (`db/custom.db`) and uploaded PDFs (`uploads/`, up to 200 MB each) live on local disk | Serverless platforms (Vercel, Netlify) have **read-only filesystems** — SQLite and uploads cannot survive there without moving to external services |
| **No request-body cap** | Large PDFs stream through `POST /api/documents/pdf/stream` (the app raises Next.js' own limit to 250 MB) | Vercel/Netlify functions cap request bodies at ~4.5 MB — big uploads fail regardless of app config |
| **Long-running requests** | PDF text extraction can take a minute+ on large files | Serverless free tiers cap functions at 10–60 s |
| **HTTPS for login** | Session cookies are `Secure` in production — browsers drop them on plain HTTP, so login silently loops | You need TLS, even on a free setup (Caddy gives this for free with a domain) |
| **One config file for AI** | `z-ai-web-dev-sdk` reads credentials from `.z-ai-config` (project dir, `$HOME`, or `/etc`) | Works on any VM/container; cannot ship as a file on serverless |
| **Outbound email** | Verification codes / password resets via **Resend HTTP API** (works everywhere) or SMTP ports 465/587 | Resend is the safe choice — some clouds block SMTP ports |

Everything else (RSS fetching, ATS job data, Google OAuth) is plain outbound HTTPS and works anywhere.

**Bottom line:** the app deploys unchanged and fully-functional on any host with a persistent disk. Serverless requires moving three subsystems (database, file storage, AI provider) to external services first.

---

## 2. Choose your path

| | Path A — free VPS | Path B — Vercel + Neon + R2 | Path C — free containers |
|---|---|---|---|
| Code changes | **None** | Prisma→Postgres, disk→S3 storage, AI SDK swap | None |
| All features (200 MB PDFs, AI, everything) | Yes | Uploads via presigned URLs; AI via your own key | Yes, but disk is wiped on restart |
| Cost | Free forever (Oracle) | Free tiers of 3 services | Free with sleeps |
| Effort | ~45 min first time | Half a day (refactor) | ~20 min |
| Best for | Real daily use | You specifically want Vercel/CI | Quick demos |

- **Path A (recommended):** Oracle Cloud "Always Free" VM — genuinely free forever, persistent disk, run the app exactly as it runs in dev.
- **Path B:** Vercel Hobby + Neon Postgres + Cloudflare R2 — the classic free serverless stack, needs the three changes described.
- **Path C:** Koyeb / Render / Hugging Face Spaces — free container hosting, but the disk is ephemeral (fine for demos, bad for a real library).

---

## 3. Path A — Full deploy on a free VPS (Oracle Cloud Always Free)

Works identically on any Ubuntu VM (AWS/GCP free tiers, a spare box, etc.). Steps are written for Ubuntu 22.04/24.04.

### Step 1 — Create the VM

1. Sign up at https://cloud.oracle.com (card required for verification; Always Free resources are never charged).
2. Compute → Instances → Create. Pick **Ubuntu 22.04** (or 24.04), shape **Ampere A1** (ARM), **2 OCPU / 8 GB RAM** (the free allowance is up to 4 OCPU / 24 GB total), boot volume **50–100 GB** (of 200 GB free).
3. Download the SSH key. Connect: `ssh -i key.pem ubuntu@<PUBLIC_IP>`

### Step 2 — Open the firewall (two layers)

Oracle's Security List: VCN → Security Lists → Add Ingress Rule → source `0.0.0.0/0`, ports **80, 443** (TCP). Then on the VM:

```bash
sudo iptables -I INPUT -p tcp -m state --state NEW -m tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT -p tcp -m state --state NEW -m tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### Step 3 — Install runtime + tools

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git openssl
sudo npm i -g pm2
node -v   # v20.x
```

> The repo's `start` script uses Bun (`bun .next/standalone/server.js`). On a server you can run the identical standalone build with plain Node — the deploy script below does exactly that.

### Step 4 — Get a domain for HTTPS (free options)

Login cookies require HTTPS, and HTTPS requires a certificate for a hostname. Easiest free routes:

- **DuckDNS** (free subdomain): create `yourname.duckdns.org` pointing to the VM's IP. Note: Let's Encrypt rate-limits the shared `duckdns.org` suffix occasionally — if you hit it, wait or use the next option.
- **A real domain** you own (or a cheap/free one from a registrar) — most reliable.
- **Zero-setup fallback:** `nip.io`/`sslip.io` — e.g. `1-2-3-4.sslip.io` automatically resolves to `1.2.3.4`. Works with Caddy out of the box; subject to the same rate-limit caveats.

### Step 5 — Clone and configure

```bash
git clone https://github.com/SaqibMehdi123/Cortex.git cortex
cd cortex
cp .env.example .env
```

Edit `.env` (see section 6 for every variable). Minimum for production:

```bash
DATABASE_URL="file:./db/custom.db"
AUTH_SECRET="$(openssl rand -hex 32)"        # required in prod — the dev fallback is unsafe
RESEND_API_KEY=re_xxxxxxxx                    # email delivery (free: 100/day)
# AUTH_DEV_CODE_FALLBACK must NOT be set in production
```

Bring the AI credentials over from your dev machine (this is what powers summaries, doc Q&A, mindmaps, flashcards):

```bash
# on your DEV machine:
scp /etc/.z-ai-config ubuntu@<SERVER_IP>:~/.z-ai-config
```

> Note: the AI gateway the SDK points at may only be reachable from certain networks. If AI calls fail on the server, section 7 has the fallback (swap to an OpenAI-compatible provider). Everything else works regardless.

### Step 6 — Install, create the schema, build

```bash
npm ci
npx prisma generate
npm run db:push        # creates db/custom.db with the full schema
npm run build          # next build, output: standalone (+ static/public copied in)
mkdir -p uploads
```

### Step 7 — Run under pm2

```bash
pm2 start ".next/standalone/server.js" --name cortex --env NODE_ENV=production
pm2 save
pm2 startup    # follow the printed command — survives server reboots
```

The app now answers on port 3000, localhost only.

### Step 8 — HTTPS reverse proxy with Caddy

```bash
sudo apt-get install -y caddy
sudo tee /etc/caddy/Caddyfile > /dev/null << 'EOF'
yourname.duckdns.org {
    reverse_proxy localhost:3000
}
EOF
sudo systemctl reload caddy
```

Caddy obtains and renews the TLS certificate automatically. Nginx works too, but remember `client_max_body_size 250m;` — Caddy has no body limit by default.

### Step 9 — Verify

1. Open `https://yourname.duckdns.org` → sign up → the verification email arrives (check spam) → login sticks (if it loops, you're on HTTP, not HTTPS).
2. Import a PDF → it opens in the viewer; check `uploads/` now contains `<id>.pdf`.
3. Ask the document a question (exercises the AI path).

### Step 10 — Backups (the part everyone skips)

SQLite + uploads are just files — back them up like files:

```bash
crontab -e
# nightly 3am: consistent DB snapshot + uploads to a dated folder
0 3 * * * sqlite3 /home/ubuntu/cortex/db/custom.db ".backup '/home/ubuntu/backups/db-$(date +\%F).db'" && rsync -a --delete /home/ubuntu/cortex/uploads/ /home/ubuntu/backups/uploads/
```

Copy the backup dir anywhere off-box (rclone to Google Drive, `scp`, etc.).

### Step 11 — Future updates

```bash
cd ~/cortex
git pull && npm ci && npx prisma generate && npm run db:push && npm run build
pm2 restart cortex
```

Optional — auto-deploy on push with a GitHub Actions workflow that SSHes in and runs exactly those commands.

---

## 4. Path B — Vercel + Neon + Cloudflare R2 (serverless)

The classic free stack: **Vercel** (app), **Neon** (Postgres, 0.5 GB free), **R2** (object storage, 10 GB free). It requires three code changes — without them the deploy will build but break at runtime (read-only filesystem kills SQLite/uploads; the 4.5 MB body cap kills streaming uploads; `.z-ai-config` cannot exist on Vercel).

### Change 1 — Database: SQLite → Postgres (Neon)

1. Create a free project at https://neon.tech → copy the **pooled** connection string.
2. In `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

3. Push the schema: `DATABASE_URL="postgres://..." npx prisma db push`. The schema uses only portable types (strings, ints, booleans, datetimes) — no SQLite-specific changes needed. Keep `file:./db/custom.db` for local dev by swapping the value of `DATABASE_URL` per environment.

### Change 2 — PDF storage: disk → R2

Files that touch disk: `api/documents/route.ts` (`createPdfDocument`), `api/documents/pdf/route.ts`, `api/documents/pdf/stream/route.ts`, `api/documents/[id]/route.ts` (delete), `api/documents/[id]/file/route.ts` (serve).

The pattern:

- **Upload:** client asks `/api/documents/upload-url` (new small route) → server returns an R2 **presigned PUT URL** → browser uploads the PDF **directly to R2** → then calls the existing create route with the object key. This is also what bypasses Vercel's 4.5 MB body limit — the bytes never pass through the function.
- **Serve:** `[id]/file/route.ts` returns a 302 to a presigned GET URL (auth check stays in the route, so private PDFs stay private).
- **Delete:** `unlink()` becomes an R2 `DeleteObject`.

Use `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` with R2's S3-compatible endpoint (`https://<account>.r2.cloudflarestorage.com`), bucket private, region `auto`.

### Change 3 — AI provider: SDK → any OpenAI-compatible API

`z-ai-web-dev-sdk` reads its credentials from a file that serverless cannot provide (and its gateway may not be reachable from your host anyway). Swap it in the **9 call sites**:

```
src/app/api/chat/route.ts              src/app/api/mindmaps/generate/route.ts
src/app/api/copilot/route.ts           src/app/api/news/fetch/route.ts
src/app/api/documents/[id]/summarize   src/app/api/opportunities/parse/route.ts
src/app/api/flashcards/route.ts        src/app/api/gmail/import/route.ts
src/lib/paper-analysis.ts
```

They all follow the same shape (`ZAI.create()` → `zai.chat.completions.create(...)`), so a thin wrapper around the OpenAI SDK pointed at **Groq** (free, fast) or **OpenRouter** (has free models) with `OPENAI_API_KEY` + `OPENAI_BASE_URL` env vars replaces all nine with one helper. Generation prompts are already in the call sites — only the client changes.

### Deploy steps

1. Push the refactored code to GitHub.
2. Vercel → Add New Project → import the repo (framework auto-detected; leave build settings as-is).
3. Environment variables (Production + Preview):

```
DATABASE_URL=<neon pooled connection string>
AUTH_SECRET=<openssl rand -hex 32>
R2_ACCOUNT_ID= / R2_ACCESS_KEY_ID= / R2_SECRET_ACCESS_KEY= / R2_BUCKET= / R2_ENDPOINT=
OPENAI_API_KEY= / OPENAI_BASE_URL=
RESEND_API_KEY=          # or SMTP_*
GOOGLE_CLIENT_ID= / GOOGLE_CLIENT_SECRET= / GOOGLE_REDIRECT_URI=   # optional
```

4. Deploy, then set the Google OAuth redirect URI (if used) to `https://<app>.vercel.app/api/auth/google/callback`.
5. Bump `maxDuration` (e.g. `export const maxDuration = 60`) on the extraction-heavy routes — Hobby allows up to 60 s.

### Know the remaining limits (Hobby tier)

| Limit | Value | Mitigation |
|---|---|---|
| Request body | 4.5 MB | Presigned uploads (Change 2) — by design |
| Function duration | 60 s | Extraction budget already time-boxed in code |
| Cold starts | ~1–3 s first hit | Acceptable for personal use |
| Neon free tier | 0.5 GB, scales to zero | First request after idle is slower |

---

## 5. Path C — Free container platforms (Koyeb / Render / HF Spaces)

All three give you one free container that **sleeps when idle** and — critically — **wipes its disk on restart/redeploy**. Your SQLite library and uploaded PDFs would vanish on every deploy. Usable for demos, not for real data.

Container recipe (works on all three):

```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", ".next/standalone/server.js"]
```

If you go this route anyway, add a survival net: a nightly job that ships `db/custom.db` + `uploads/` to Supabase Storage or any S3, restored on container boot. At that point, honestly reassess — Path A gives you persistence for free.

---

## 6. Environment variable reference

| Variable | Required | Where it comes from |
|---|---|---|
| `DATABASE_URL` | Yes | `file:./db/custom.db` (VPS) or Neon pooled connection string (Vercel) |
| `AUTH_SECRET` | **Yes in prod** | `openssl rand -hex 32` — signs session cookies; the repo's dev fallback is for localhost only |
| `RESEND_API_KEY` | One email option | resend.com → API Keys (free 100 emails/day, HTTP API — no SMTP ports) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` (+`SMTP_SECURE`) | One email option | Any SMTP provider; Gmail needs a 16-char App Password (see EMAIL-SETUP.md) |
| `MAIL_FROM` | Optional | Sender identity, e.g. `Cortex <you@yourdomain>` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Optional | Google Cloud console OAuth client; redirect must match your deployed origin exactly |
| `.z-ai-config` (file, not env) | Path A only | Copy from dev machine to `$HOME` or `/etc` on the server — powers AI features |

Never enable `AUTH_DEV_CODE_FALLBACK=true` outside local dev — it shows login codes in the UI.

---

## 7. Post-deploy checklist & troubleshooting

Checklist, in order:

1. Landing page loads over **HTTPS**.
2. Sign up → verification email arrives → login **sticks** after reload.
3. Import a small PDF → opens in the viewer with extracted text (highlights work).
4. Ask the document a question → cited answer returns (AI path healthy).
5. Create a shelf, drop the book on it → reload → still there (DB persistence healthy).
6. Check `uploads/` (VPS) or R2 bucket (Vercel) actually holds the file.

| Symptom | Cause | Fix |
|---|---|---|
| Login loops back to the form | Cookies are `Secure` in production; you're on plain HTTP | Put Caddy (or any TLS) in front; never serve prod over bare HTTP |
| "Verification code" shown in the UI | `AUTH_DEV_CODE_FALLBACK=true` in prod env | Remove it; configure real email delivery |
| No email arrives | SMTP port blocked (Oracle blocks 25/465/587 on free tiers) | Use `RESEND_API_KEY` — it's a plain HTTPS call, always reachable |
| PDF upload fails >few MB on Vercel | Serverless 4.5 MB body cap | Presigned-direct-to-R2 flow (Path B, Change 2) |
| PDF opens but no text/highlights | Extraction timed out on a huge/scan PDF | Expected for scans; increase `maxDuration`/budget on Path B, or just use the VPS path |
| AI features error | `.z-ai-config` missing or gateway unreachable from your host | Copy the file to server `$HOME` (Path A); otherwise swap the 9 call sites to an OpenAI-compatible provider (works on both paths) |
| 502 after server reboot | pm2 not resurrected | Run `pm2 startup` once and the command it prints |
| Prisma engine errors on ARM/Debian | Missing OpenSSL | `sudo apt-get install -y openssl` (already in the Dockerfile) |
| 413 on Nginx (not Caddy) | Default 1 MB body limit | `client_max_body_size 250m;` |
| OAuth redirect_uri_mismatch | Callback registered for another origin | Update the redirect URI in Google console to the deployed origin |
