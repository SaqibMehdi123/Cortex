# Cloudflare R2 setup for Cortex (one-time, ~10 minutes)

The app ships with full R2 support built in. You only do the Cloudflare
console part once, add 4 environment variables to Vercel, and redeploy.
Until then nothing changes: the app keeps using Vercel Blob automatically.

---

## Step 1 — Create the bucket

1. Log in to https://dash.cloudflare.com
2. Left sidebar: **R2 Object Storage** → **Create bucket**
   (first time: click *Purchase R2* — the free tier is 10 GB / Class A+Z
   operations, $0 egress; no card charge unless you exceed it)
3. Name: `cortex-pdfs` (any name works — it must match `R2_BUCKET` exactly)
4. Location: **Automatic**
5. **Leave "Allow Access" / public access OFF** — Cortex never needs a
   public bucket. All reads go through short-lived signed URLs.
6. Click **Create bucket**. Do not add anything to it manually.

## Step 2 — Create the S3 API token

1. Still in **R2 Object Storage** → right sidebar **Account details** →
   **Manage R2 API Tokens** → **Create API Token**
2. Permissions: **Object Read & Write**
3. Scope: **Apply to specific buckets only** → select `cortex-pdfs`
4. (Optional) TTL: forever; client IP filtering: leave empty
5. **Create API Token**

You now see a JSON/summary with:

| Value | Copy into Vercel as |
|---|---|
| Access Key ID | `R2_ACCESS_KEY_ID` |
| Secret Access Key | `R2_SECRET_ACCESS_KEY` |
| Account ID (see below) | `R2_ACCOUNT_ID` |

For `R2_ACCOUNT_ID`: open **dash.cloudflare.com → R2 Object Storage → right
sidebar “Account details”** and copy the 32-character hex **Account ID** —
for example `a1b2c3d4…` (32 chars, only `0-9a-f`). Do **not** paste the whole
`https://….r2.cloudflarestorage.com` endpoint string, the bucket name, or the
API token. (The app auto-corrects a pasted endpoint URL, but the bare id is
cleanest.)

## Step 3 — Add the CORS rule (required, 2 minutes)

The browser PUTs files directly to R2 and the PDF viewer follows the signed
download URL cross-origin. Without this rule uploads/downloads fail with a
CORS error even though the bucket works.

1. R2 → your bucket `cortex-pdfs` → **Settings** → **CORS policy** →
   **Add CORS policy** (or "Edit")
2. Paste exactly this (replace `https://cortex-sync.vercel.app` if you use
   another domain — keep `http://localhost:3000` for local dev):

```json
[
  {
    "AllowedOrigins": ["https://cortex-sync.vercel.app", "http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["content-type", "range"],
    "ExposeHeaders": ["content-range", "content-length", "accept-ranges", "etag"],
    "MaxAgeSeconds": 3600
  }
]
```

3. Save.

## Step 4 — Add the env vars in Vercel

Project **Settings → Environment Variables**, all environments, then add:

```
R2_ACCOUNT_ID        = <32-hex account id from step 2>
R2_ACCESS_KEY_ID     = <access key id>
R2_SECRET_ACCESS_KEY = <secret access key>
R2_BUCKET            = cortex-pdfs
```

## Step 5 — Redeploy & verify

1. Redeploy (any new git push, or Deployments → ⋯ → Redeploy).
2. Open **https://cortex-sync.vercel.app/api/ops/health** and check the
   `r2` section:

```json
"r2": {
  "configured": true,
  "connectionOk": true,
  "errorCode": "OK",
  "hint": "credentials work against the bucket"
}
```

4. If `connectionOk` is `false`, the `errorCode` tells you exactly which value
   is wrong — fix that one variable and redeploy:

| `errorCode` | Wrong variable | Fix |
|---|---|---|
| `ENOTFOUND` / `InvalidEndpoint` | `R2_ACCOUNT_ID` | paste ONLY the 32-hex Account ID (not the endpoint URL) |
| `SignatureDoesNotMatch` | `R2_SECRET_ACCESS_KEY` | re-copy the Secret Access Key shown once at token creation (not the eyJ… “Token value”) |
| `InvalidAccessKeyId` | `R2_ACCESS_KEY_ID` | re-copy the S3-style Access Key ID |
| `AccessDenied` | (token scope) | re-create the API token with “Object Read & Write” scoped to this bucket |
| `NoSuchBucket` | `R2_BUCKET` | exact bucket name, case-sensitive (e.g. `cortex-pdfs`) |

5. In the app, import any PDF. It now uploads straight from your browser to
   R2 (single request, any size up to 200 MB, real progress bar — the
   vercel.com upload gateway is no longer involved at all).

## Step 6 (optional) — Move existing Blob PDFs to R2

Existing documents keep working from Vercel Blob; nothing breaks if you skip
this. To consolidate everything in R2, run once from your machine:

```bash
DATABASE_URL="<your Neon pooled DATABASE_URL>" \
R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=cortex-pdfs \
node scripts/migrate-blob-to-r2.mjs
```

It downloads each Blob PDF, copies it into R2, and repoints the database row
(`r2://…`). Re-run safely if some rows fail. Once every document is migrated
and verified in the reader, you may disconnect the Vercel Blob store.

---

## How it works after the switch

- **Upload:** `POST /api/documents/upload-url` returns a 1-hour presigned PUT;
  the browser sends the whole file to R2 in one request with progress events.
- **Reading:** `GET /api/documents/[id]/file` 302-redirects the owner's viewer
  to a 5-minute presigned GET. The bucket stays 100% private; other users and
  anonymous visitors can never reach the objects.
- **Deleting:** deleting a document deletes its R2 object server-side.
- **Rollback:** remove the four `R2_*` env vars and redeploy — the app falls
  back to Vercel Blob automatically. Old `r2://` documents keep serving (the
  signed-URL path only needs the R2 credentials, so remove them only when the
  Blob store holds everything again).
