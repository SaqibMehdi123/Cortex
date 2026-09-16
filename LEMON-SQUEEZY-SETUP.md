# Lemon Squeezy setup — Cortex Pro on cortex.scrutinies.dev

Your store is approved, so everything below happens between the Lemon Squeezy
dashboard, the Vercel dashboard and (once) your terminal. Follow the steps in
order — each one feeds the next. Time budget: ~30 minutes plus one test
purchase.

**What Lemon Squeezy is here:** the Merchant of Record for everyone outside
Pakistan. Buyers see an LS-hosted checkout, LS collects the money and handles
VAT/sales tax, and pays you out via **Payoneer**. Our site creates the
checkout against a *variant* you define, so the price you set in the LS
dashboard is exactly what the buyer is charged.

**What you will set up:**

| Vercel env var                  | Value source                                   | Used for                          |
| ------------------------------- | ---------------------------------------------- | --------------------------------- |
| `LEMONSQUEEZY_API_KEY`          | LS → Settings → API                            | creating checkouts from the site  |
| `LEMONSQUEEZY_STORE_ID`         | API (step 3 curl)                              | scoping the checkout to your store|
| `LEMONSQUEEZY_VARIANT_ID`       | API (step 3 curl) — "Monthly" variant          | $5/month plan                     |
| `LEMONSQUEEZY_ANNUAL_VARIANT_ID`| API (step 3 curl) — "Annual" variant           | $50/year plan (2 months free)     |
| `LEMONSQUEEZY_WEBHOOK_SECRET`   | you generate (step 5)                          | verifying webhook signatures      |

Optional, leave unset unless needed: `LEMONSQUEEZY_API_BASE` (defaults to
`https://api.lemonsqueezy.com`).

⚠️ Make sure `BILLING_TEST_MODE` is **NOT** set in Vercel (Production). It is
a dev-only escape hatch that fakes checkouts; it must never exist in
production env vars.

---

## 1. Create the product and its two variants

1. Log in at **app.lemonsqueezy.com** → your store (Cortex).
2. **Products → New product**:
   - Name: `Cortex Pro`
   - Description: one line — "Unlimited AI Copilot, summaries, flashcards &
     mind maps, 500+ document library, instant job alerts."
   - Upload a square logo/image if you have one (appears on checkout).
3. When adding the first **variant**, choose the **Subscription** price model:
   - Variant name: `Monthly`
   - Price: **$5**, interval: **every 1 month**
4. On the product page choose **Add variant** again:
   - Variant name: `Annual`
   - Price: **$50**, interval: **every 1 year**
5. Still in the product's settings, look for **after purchase / redirect** and
   set the redirect URL to `https://cortex.scrutinies.dev/app` — buyers land
   back in the workspace after paying.

> Prices live on the variants on purpose: our checkout API sends
> `custom_price: null`, so the dashboard price is the single source of truth
> and can be changed later without touching code.

## 2. Create an API key

1. **Settings → API** → **+** → name it `cortex-production`.
2. Copy the key (starts with `api_`) — you will paste it into Vercel in step 6
   and use it in the curl below. It is shown only once.

## 3. Read the store ID and the two variant IDs

The dashboard shows slugs, but the API needs **numeric IDs**. With your API
key in a terminal:

```bash
# store id (first number printed is the store id)
curl -s https://api.lemonsqueezy.com/v1/stores \
  -H "Authorization: Bearer api_YOUR_KEY" \
  | python3 -c "import sys,json;[print(d['id'],d['attributes']['name']) for d in json.load(sys.stdin)['data']]"

# variant ids (look for Monthly and Annual on the Cortex Pro product)
curl -s https://api.lemonsqueezy.com/v1/variants \
  -H "Authorization: Bearer api_YOUR_KEY" \
  | python3 -c "import sys,json;[print(d['id'],d['attributes']['name'],'price:',d['attributes']['price']) for d in json.load(sys.stdin)['data']]"
```

(No python? Replace the pipe with `> out.json` and open the file — you want
the `id` numbers.)

Note the three numbers: **store id**, **Monthly variant id**, **Annual
variant id**.

## 4. Turn on Test mode (so testing costs nothing)

Bottom-left of the LS dashboard → toggle **Test mode ON**. While it is on:

- checkouts created are sandbox transactions (no real money moves),
- the same API key works, scoped to test data,
- test card `4242 4242 4242 4242`, any future expiry, any CVC.

## 5. Create the webhook

1. Generate a signing secret — run `openssl rand -hex 32` in any terminal
   (Windows: generate a random 64-character hex string any way you like).
   Keep this value; it goes in TWO places.
2. LS dashboard → **Settings → Webhooks → +**:
   - **Callback URL**: `https://cortex.scrutinies.dev/api/billing/webhook/lemonsqueezy`
   - **Signing secret**: the value from step 5.1
   - **Events** — tick exactly these:
     - `order created`
     - `subscription created`
     - `subscription payment success`
     - `subscription payment failed`
     - `subscription expired`
   - Save. (Other events are tolerated but ignored by the site.)

What each does on our side: success events → user upgraded to `pro` with
`planExpiresAt = renews_at` (a year for Annual — automatic), a `Payment` row
is recorded, and a branded **receipt email** is sent from
`hello@scrutinies.dev`. `payment failed` → recorded, plan keeps its remaining
time. `subscription expired` → user drops to `free` (only fires after a
cancelled period truly ends, so cancellers keep what they paid for).

## 6. Put the five values into Vercel

**Vercel → your project → Settings → Environment Variables**, add for
**Production** (and Preview if you want branches to bill in test):

```
LEMONSQUEEZY_API_KEY            = api_…            (step 2)
LEMONSQUEEZY_STORE_ID           = <store id>        (step 3)
LEMONSQUEEZY_VARIANT_ID         = <monthly id>      (step 3)
LEMONSQUEEZY_ANNUAL_VARIANT_ID  = <annual id>       (step 3)
LEMONSQUEEZY_WEBHOOK_SECRET     = <hex secret>      (step 5.1)
```

Then **Deployments → latest → ⋯ → Redeploy** — env changes only apply to
deployments made after they are saved.

## 7. Test the whole loop (in Test mode)

1. Open `https://cortex.scrutinies.dev/pricing` **while logged in**.
2. Pro card → toggle **Monthly** → **Upgrade to Pro — monthly** → you should
   land on the LS checkout showing **$5** with your email pre-filled.
3. Go back, toggle **Annual** → the button now reads *— annual* and the
   checkout shows **$50**.
4. Pay with `4242 4242 4242 4242` (any future expiry / CVC / postcode).
5. Verify, in this order:
   - LS dashboard → **Orders** shows the test order.
   - Your inbox: receipt from **Cortex <hello@scrutinies.dev>**.
   - Site → **Settings → Plan**: badge **Pro**, expiry ≈ +1 month (monthly)
     or ≈ +1 year (annual).
   - LS → **Settings → Webhooks**: the latest delivery logged **200**.

All four green → flip **Test mode OFF** in the LS dashboard. You are live;
the next purchase is real money.

## 8. Ongoing operations cheat-sheet

- **Refunds (14-day guarantee):** LS dashboard → the order → **Refund**. LS
  returns the money and handles the tax reversal; our side keeps the plan
  until its expiry — if you want it cut short, set the user back to `free` by
  hand (or just let it lapse).
- **Cancellations:** buyer cancels in the LS customer portal or you cancel in
  the dashboard. Access runs until `renews_at`; `subscription expired` then
  drops them to free automatically.
- **Student 50% off:** applied manually — they email
  `support@scrutinies.dev` with proof of enrolment; you create a 50%-off
  variant/coupon in LS or upgrade the account directly.
- **Price changes:** edit the variant price in LS — the site picks it up on
  the next checkout (the PKR line on the pricing page is the only place to
  update by hand).
- **Payouts:** LS → Payoneer. LS, as Merchant of Record, invoices buyers and
  remits sales tax for you.

## Troubleshooting

| Symptom | Cause → fix |
| --- | --- |
| Button says "launching soon" | env vars missing **or** deployed before saving → recheck names, Redeploy |
| Annual says "launching soon", monthly works | `LEMONSQUEEZY_ANNUAL_VARIANT_ID` not set (or set to the monthly id — never point both at one variant) |
| Purchase ok but no upgrade | webhook: URL typo, event not ticked, or secret mismatch → check LS webhook delivery log; our route rejects bad signatures with 401 |
| Checkout 502 from the site | LS API call failed → Vercel function logs show the exact LS error |
| Two receipts (LS + Cortex) | expected — LS sends its own; ours is the branded one with the plan expiry |

## Safepay, for later

Pakistan visitors are geo-routed to Safepay only when `SAFEPAY_SECRET_KEY`
exists in Vercel. **Leave Safepay unset and Lemon Squeezy serves everyone** —
Pakistani debit/credit cards work on LS. When the KYB documents come through,
set `SAFEPAY_SECRET_KEY` / `SAFEPAY_MODE` / `SAFEPAY_WEBHOOK_SECRET`, and PK
visitors automatically start seeing the PKR (JazzCash/Easypaisa) checkout.
Monthly and annual amounts (PKR 1,500 / 15,000) are already wired.
