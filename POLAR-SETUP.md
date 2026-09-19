# Polar setup — Cortex Pro on cortex.scrutinies.dev

This is the go-live path after the Lemon Squeezy application was rejected.
Everything below happens between the Polar dashboard, the Vercel dashboard
and (once) your terminal. Time budget: ~45 minutes plus one test purchase.

**What Polar is here:** the Merchant of Record for everyone outside Pakistan
(and the fallback inside Pakistan until Safepay is unblocked). Buyers see a
Polar-hosted checkout, Polar collects the money, handles VAT/sales tax, emails
the buyer their own invoice, and pays you out to your bank. Our site creates
a checkout session against a *product* you define, so the price you set in
the Polar dashboard is exactly what the buyer is charged.

**Why Polar (and not another LS clone):** it is a full MoR that onboards
individual developers from Pakistan — no registered company required — and
lets you build products and test the whole flow in a sandbox immediately
while the one-time organization review for real payments is in progress.
Fee model: ~4% + $0.40 per sale (confirm on polar.sh/pricing).

**What you will set up:**

| Vercel env var                | Value source                        | Used for                          |
| ----------------------------- | ----------------------------------- | --------------------------------- |
| `POLAR_ACCESS_TOKEN`          | Polar → Settings → API tokens       | creating checkouts from the site  |
| `POLAR_PRODUCT_ID_MONTHLY`    | product id (step 2)                 | $5/month plan                     |
| `POLAR_PRODUCT_ID_ANNUAL`     | product id (step 2)                 | $50/year plan (2 months free)     |
| `POLAR_WEBHOOK_SECRET`        | shown at endpoint creation (step 4) | verifying webhook signatures      |
| `POLAR_MODE`                  | `live` (default) or `sandbox`       | sandbox testing before review     |

Optional: leave `LEMONSQUEEZY_*` / `SAFEPAY_*` alone — the routing order is
Safepay → Polar → LS for PK visitors and Polar → LS → Safepay for everyone
else; the first *configured* provider serves the checkout.

⚠️ Make sure `BILLING_TEST_MODE` is **NOT** set in Vercel (Production). It is
a dev-only escape hatch that fakes checkouts; it must never exist in
production env vars.

---

## 1. Create the organization

1. Sign up at **polar.sh** (GitHub login works) and create an organization —
   e.g. `scrutinies`. Individual accounts are fine; no company paperwork.
2. Complete the profile (business/person details, payout country Pakistan).
   Polar starts a one-time review before real payments can go live — you can
   finish every other step below and test in the sandbox **while it is
   pending**.
3. Note the two dashboards up front: **polar.sh** is the live org;
   **sandbox.polar.sh** is a separate sandbox org (separate products, token
   and webhook) used for free testing in step 6.

## 2. Create the two products

In the live org → **Products → New product**, twice:

1. `Cortex Pro — Monthly`
   - Description: "Unlimited AI Copilot, summaries, flashcards & mind maps,
     500+ document library, instant job alerts."
   - Price: **Recurring — $5, billed monthly**.
2. `Cortex Pro — Annual`
   - Same description. Price: **Recurring — $50, billed yearly**.
3. Open each product (or its edit page) and copy the **product id** from the
   URL — a UUID like `9f3c…-…`. That is the value for the env vars.

> Prefer API over URLs? `curl -s https://api.polar.sh/v1/products -H
> "Authorization: Bearer pat_YOUR_TOKEN"` prints every product with its id.
> The dashboard price is the single source of truth — changing it later
> needs no code change.

## 3. Create an API token

1. Live org → **Settings → API tokens / Developer → New token**.
2. Name it `cortex-production`, enable at least the **checkouts:write**
   scope (product read is handy for the curl above, not required).
3. Copy the token (starts with `pat_`) — shown only once.

## 4. Create the webhook

1. Live org → **Settings → Webhooks → Add endpoint**.
2. **URL**: `https://cortex.scrutinies.dev/api/billing/webhook/polar`
3. **Format**: `Raw`.
4. **Events** — tick exactly these:
   - `order.created`, `order.paid`, `order.refunded`
   - `subscription.created`, `subscription.active`, `subscription.updated`,
     `subscription.canceled`, `subscription.revoked`
5. Save, then **copy the signing secret** (starts with `whsec_`) — shown
   once, it goes into Vercel in the next step.

What each does on our side: order paid / subscription active → user upgraded
to `pro` with `planExpiresAt` = the subscription's `current_period_end`
(a year for Annual — automatic), a `Payment` row is recorded, and Polar
emails the buyer its own invoice. `subscription.canceled` keeps access until
the period end. `subscription.revoked` drops the user to `free`.
`order.refunded` is recorded for bookkeeping. Bad signatures are rejected
with 401; the route also rejects replays older than 5 minutes.

## 5. Put the values into Vercel

**Vercel → your project → Settings → Environment Variables**, add for
**Production** (and Preview if you want branches to bill against sandbox):

```
POLAR_ACCESS_TOKEN         = pat_…                 (step 3)
POLAR_PRODUCT_ID_MONTHLY   = <monthly uuid>        (step 2)
POLAR_PRODUCT_ID_ANNUAL    = <annual uuid>         (step 2)
POLAR_WEBHOOK_SECRET       = whsec_…               (step 4)
POLAR_MODE                 = live                  (step 6 may set sandbox first)
```

Then **Deployments → latest → ⋯ → Redeploy** — env changes only apply to
deployments made after they are saved.

## 6. Test the whole loop (sandbox first)

1. In **sandbox.polar.sh** (the separate sandbox org): repeat steps 2–4 —
   sandbox products, a sandbox token, and a sandbox webhook pointing at the
   same URL with its own `whsec_` secret.
2. In Vercel (Preview environment, or Production temporarily):
   `POLAR_MODE=sandbox` + the sandbox token/product ids/secret → Redeploy.
3. Open `https://cortex.scrutinies.dev/pricing` **while logged in**.
4. Pro card → toggle **Monthly** → **Upgrade to Pro — monthly** → you should
   land on the Polar checkout showing **$5** with your email pre-filled.
5. Go back, toggle **Annual** → the button now reads *— annual* and the
   checkout shows **$50**.
6. Pay with `4242 4242 4242 4242` (any future expiry / CVC / postcode).
7. Verify, in this order:
   - Sandbox org → **Sales/Orders** shows the test order.
   - Site → **Settings → Plan**: badge **Pro**, expiry ≈ +1 month (monthly)
     or ≈ +1 year (annual).
   - Sandbox → **Settings → Webhooks**: the latest delivery logged **200**.
8. All green → set `POLAR_MODE=live` + the LIVE token/product ids/secret in
   Production → Redeploy. You are live the moment your organization review
   completes; the next purchase is real money.

## 7. Ongoing operations cheat-sheet

- **Refunds (14-day guarantee):** Polar dashboard → the order → refund.
  Polar returns the money and reverses the tax; the plan keeps its remaining
  time on our side (recorded as `refunded`) — shorten by hand if ever needed.
- **Cancellations:** buyers manage their subscription in Polar's customer
  portal; access runs until `current_period_end`, then the webhook's
  `subscription.revoked` / expiry cutoff drops them to `free` automatically.
- **Student 50% off:** create a 50%-off **discount** in the Polar dashboard
  and share the code, or upgrade the account by hand after they email
  `support@scrutinies.dev` with proof of enrolment.
- **Price changes:** edit the product price in Polar — the site picks it up
  on the next checkout (the PKR line on the pricing page is the only place
  to update by hand).
- **Payouts:** configured during organization onboarding — bank payout to
  Pakistan; the exact rails and schedule are shown in your dashboard once
  the review completes.

## Troubleshooting

| Symptom | Cause → fix |
| --- | --- |
| Button says "launching soon" | env vars missing **or** deployed before saving → recheck names, Redeploy |
| Annual says "launching soon", monthly works | `POLAR_PRODUCT_ID_ANNUAL` not set (or set to the monthly id — never point both at one product) |
| Checkout 401/403 in Vercel logs | token from the sandbox org used against live API (or vice versa) → match `POLAR_MODE` with the org the token came from |
| Purchase ok but no upgrade | webhook: URL typo, event not ticked, or `whsec_` mismatch → check the webhook delivery log; our route rejects bad signatures with 401 |
| Webhook logged 401 after working before | secret rotated in Polar but not in Vercel (or the other way) → set the same value in both, Redeploy |
| Two invoices to the buyer | expected — Polar sends its own MoR invoice; nothing is duplicated by Cortex |

## Lemon Squeezy and Safepay, for later

- **Lemon Squeezy** (application rejected): the integration and
  LEMON-SQUEEZY-SETUP.md stay in the repo untouched. If a future reapply
  succeeds (e.g. after you have an NTN + bank documents), just set the
  `LEMONSQUEEZY_*` env vars — international traffic would still prefer Polar
  until you remove them, per the priority list.
- **Safepay** (KYB documents pending): once the bank maintenance certificate
  and registration/NTN documents exist, set `SAFEPAY_SECRET_KEY` /
  `SAFEPAY_MODE` / `SAFEPAY_WEBHOOK_SECRET` and PK visitors automatically
  start seeing the PKR (JazzCash/Easypaisa) checkout — Polar keeps serving
  everyone else. Monthly and annual amounts (PKR 1,500 / 15,000) are already
  wired.
