# Cortex

![Next.js 16](https://img.shields.io/badge/Next.js%2016-000000?style=flat&logo=next.js&logoColor=white)
![React 19](https://img.shields.io/badge/React%2019-20232A?style=flat&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Tailwind CSS 4](https://img.shields.io/badge/Tailwind%20CSS%204-06B6D4?style=flat&logo=tailwindcss&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat&logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white)
![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?style=flat&logo=shadcnui&logoColor=white)

Cortex is a personal knowledge and productivity workspace. Reading, planning, review and career tracking live in one place — and each part feeds the next: what you read becomes highlights, highlights become flashcards, documents become mindmaps, and plans point at goals you actually care about. An apply agent closes the career loop: it reads your CV, shortlists real openings, and drafts the applications for your approval.

![Cortex landing page](docs/screenshots/landing.png)

## Why it exists

Knowledge work falls apart across tools. Papers live in one app, notes in another, plans in a spreadsheet, job applications in an inbox — every tool does one thing well and nothing talks to anything else. The cost is not the switching, it is the lost connections: the paper you read never becomes the flashcard you review, and the plan you make never points at the goal it serves.

Cortex is one workspace built around those connections. Everything below starts with the problem it solves, then how it is built.

---

## The daily dashboard

**Problem:** opening a laptop should answer *"what should I do right now?"* in seconds, not after clicking through five apps.

The dashboard opens with a briefing — flashcards due, unread stories, today's tasks — then the day itself: a timeline of scheduled tasks, the single **next best task** picked from what is due, active goals with computed progress, a news digest, and everything due within seven days. It reads the rest of the workspace so you do not have to.

The same briefing goes out as a **morning email** — deadlines, reminders, and what the apply agent did overnight — for the days you never open the app. In-app notifications (the bell) cover reminders and everything due today.

![Dashboard](docs/screenshots/dashboard.png)

## Reading — library and reader

**Problem:** PDFs on mobile are broken (browsers have no native viewer), and reading position never follows you between devices.

The library holds everything you read. Import happens three ways: pick a local file, paste a URL (an arXiv link like `arxiv.org/pdf/1706.03762` is fetched as a binary and stored properly), or paste raw text. The reader renders PDFs with pdf.js on a `<canvas>` — pixels, not iframes — so page geometry is identical on every device, including phones where the canvas stretches to fill the screen.

![Library](docs/screenshots/library.png)

![Reader](docs/screenshots/reader.png)

How the details are handled:

- **Resume everywhere.** The exact page is saved to `localStorage` instantly (same-device resume) and to the database debounced (cross-device resume). Reopening a book puts you back on the page, not at the top.
- **Immersive fullscreen.** One click hides the app chrome; the in-canvas toolbar keeps zoom, page navigation and the AI toggle. Esc minimizes the chat first, then exits fullscreen.
- **Text mode.** For anything with extracted text, the same document can be read as a clean typographic column with scroll-based progress — useful for articles and pasted content.

## Ask the document

**Problem:** AI answers about a paper are worthless if you cannot verify them against the source.

The reader carries a chat panel that answers strictly from the document's extracted text. Every claim gets a numbered citation chip; clicking one jumps the PDF to the exact page the answer came from — the viewer flips to `original` mode and scrolls there. The same chat stays available in fullscreen as a floating popup, so fact-checking never breaks the reading flow.

![Ask AI with citations](docs/screenshots/reader-chat.png)

Documents also get an AI summary with key takeaways, generated from the extracted text.

## Highlights become flashcards

**Problem:** rereading feels productive and isn't. Memory needs retrieval practice, and making cards by hand is enough friction that nobody does it.

Select any passage in the reader, pick a highlight color, and tap *Flashcard* — the AI writes the question and answer from the selected text. Review uses **SM-2**, the spaced-repetition algorithm behind Anki: each card gets an ease factor and an interval, due cards queue up daily, and honest grading ("again" through "easy") reschedules them. Cards keep a link back to the document and highlight they came from.

![Flashcards](docs/screenshots/flashcards.png)

## Mindmaps

**Problem:** after twenty pages you have the pieces but not the shape of the argument.

Any document, topic, or your collected notes can be turned into a mindmap: the AI returns a labeled tree, which is laid out automatically as a horizontal tree on an editable canvas — drag nodes, recolor branches, auto-layout, export to PNG or Markdown. Mindmaps can also absorb highlights and document references as linked nodes.

One map per document: regenerating a map for a document that already has one returns the existing map instead of silently creating a duplicate (enforced in the database by a `sourceDocId` link, so rapid double-clicks cannot create copies).

![Mindmaps](docs/screenshots/mindmaps.png)

## Plans and goals

**Problem:** plans drift when they point at nothing, and progress that is typed in by hand is a wish, not a measurement.

Plans nest from year down to day with an outline view and a Kanban board, plus starter templates. A plan can be linked to a goal — "linear algebra in October" points at "ML/DL architect role by 2027" — and the goal's progress ring is *computed* from its milestones and the tasks underneath them, never entered manually. The dashboard timeline and the plans week strip keep the near term visible: three day states (selected, today, past), drag a task onto a day to reschedule it.

![Plans](docs/screenshots/plans.png)

## Radar — news and papers

**Problem:** the field moves faster than tab-hoarding can track, and a feed you can't trust is noise.

Radar aggregates real sources — no seed data. News pulls live RSS from OpenAI, Google DeepMind, Hugging Face, Microsoft Research, NVIDIA, TechCrunch AI, TLDR AI, Import AI and Ahead of AI, with source and time filters and a saved list. Papers fetch from arXiv and the Hugging Face daily list; for any paper, the AI writes a structured breakdown: the problem it solves, what is actually new, key results, and why it matters.

![News and papers](docs/screenshots/news.png)

## Career

**Problem:** a job search is a pipeline, not a bookmark folder — and good roles are scattered across dozens of ATS boards nobody checks daily.

Three tabs. *Discover* pulls live jobs, internships and research positions from official company boards (Anthropic, Mistral AI, Databricks, Together AI, Scale AI, Figure AI, Imbue via the Greenhouse/Lever public APIs), the RemoteOK and Remotive APIs, and Pakistani employers on Workable/JazzHR/Zoho/WP boards plus rotating LinkedIn searches — every card links straight to the real posting, filterable by type, source and role family. A *Scholarships* tab aggregates masters/PhD funding feeds the same way. Anything interesting is saved into the *Pipeline* Kanban (saved → applied → interview → offer) in one click, and pasting a job email lets the AI extract company, role and deadline into a structured entry. Gmail import runs through real Google OAuth — your email goes through your own Google project.

![Career discover](docs/screenshots/career.png)

## The apply agent

**Problem:** applying is the worst part of a job search. Every ATS asks the same questions in a different order, and good intentions die somewhere around form number six.

The apply agent lives in Career and closes the loop from *discovered job* → *submitted application*, with you approving every step:

1. **Knows you** — upload your CV in the chat and it parses out skills, experience, education, links and work authorization into a structured profile you confirm.
2. **Shortlists** — every job on the Discover board gets scored against your profile: a match percentage, a plain-language "why", and your dealbreakers filtered out.
3. **Asks** — for a job you pick, it works out exactly what is missing for a complete application and asks the questions in grouped batches, once — not per form.
4. **Drafts** — it assembles the package: tailored answers for every form field, plus a cover letter. Greenhouse and Lever boards can be submitted directly (strictly opt-in, rate-capped, and every submission is logged); everything else gets a copy-paste-ready package.
5. **Learns** — outcomes (interview, offer, rejection, silence) feed back into the shortlist, and the agent reports its overnight progress in the morning briefing.

![Career discover](docs/screenshots/career.png)

## Pro plan

**Problem:** infrastructure costs money, but the core of a productivity tool should not be hostage to a subscription.

The core workspace — tasks, plans, kanban, pomodoro, reminders, goals, notes, feeds, briefings — is **permanently free and unlimited**. Only metered AI-cost drivers have free limits (copilot messages per day, document summaries, AI flashcards and mindmaps per month); **Pro** lifts them. Checkout runs through [Polar](https://polar.sh) (Merchant of Record, USD, tax handled) with [Safepay](https://getsafepay.com) for local PKR payments in Pakistan and Lemon Squeezy as fallback — geo-routed automatically, verified by signed webhooks, with branded email receipts. Self-hosting with no provider configured is fine: the pricing page simply shows "launching soon".

## Analytics

**Problem:** without honest feedback, you optimize what feels productive instead of what is.

Analytics charts reading time, tasks completed, focus hours, cards reviewed and goal velocity (milestones completed per week) over the week or month — all computed from real sessions: opening a book logs reading time, the Pomodoro timer logs focus, reviews log cards.

![Analytics](docs/screenshots/analytics.png)

## The rest of the loop

- **Quick capture** from anywhere — the plus button on every screen takes a note, task or link before the thought evaporates; items land in the inbox for triage.
- **Command bar** (`Ctrl/Cmd+K`) to jump to any document, view or action.
- **Copilot dock** with suggested questions on every screen; inside a book, the Copilot icon becomes the reader's own chat.
- **Focus timer** — a Pomodoro that logs sessions against tasks, with an always-on-top pop-out for a second monitor, feeding the focus chart.
- **Notifications** — an in-app bell for reminders and same-day dues, alongside the morning email.
- **Export** — full JSON, per-document Markdown and PDF.
- **Dark mode** — the same quiet palette, rebuilt for the dark, not an inverted afterthought.

![Dark mode](docs/screenshots/dashboard-dark.png)

## Mobile

The workspace reflows for phones: bottom tab bar, a floating action stack (mindmap, AI chat, quick capture) that follows you into the reader, and a PDF canvas that fills the screen down to the tab bar.

![Mobile reader](docs/screenshots/mobile-reader.png)

---

## Under the hood

| Choice | Why |
| --- | --- |
| Next.js 16 (App Router) + React 19 + TypeScript | One app for UI and API — no separate backend to deploy or keep in sync |
| Prisma + PostgreSQL (Neon in production) | Serverless-proof persistence; additive schema changes sync on every build; every table carries an owner id |
| Tailwind CSS 4 + shadcn/ui | A quiet monochrome design system — Inter for UI, Geist Mono for data, generous whitespace — built on accessible primitives |
| OpenAI-compatible AI client (`src/lib/ai.ts`) | Google Gemini, Groq, OpenAI or OpenRouter behind one env switch; transient-failure retries and optional failover models built in |
| Cloudflare R2 / Vercel Blob / disk | PDF storage with three backends, picked automatically from what is configured — R2 recommended (10 GB free, zero egress) |
| Resend → SendGrid → SMTP → Brevo | Outgoing mail walks the configured chain in order — verification codes, resets and the daily briefing survive a provider outage |
| Polar · Lemon Squeezy · Safepay | Merchant-of-record USD checkout plus local PKR payments, geo-routed with signature-verified webhooks |
| pdf.js (`<canvas>` rendering) | Consistent PDF geometry on every browser, including mobile ones with no native viewer |
| rss-parser + pdf-parse | Real RSS aggregation and text extraction — the unglamorous workhorses |
| SM-2 scheduler (`src/lib/sm2.ts`) | The proven Anki algorithm, not a homegrown scoring scheme |
| Two-layer rate limiter (`src/lib/rate-limit.ts`) | In-process sliding window plus a durable Postgres counter shared across instances — the fix for distributed password spraying on serverless |
| Recharts, @dnd-kit, Font Awesome | Charts, drag-and-drop and the icon set, without hand-rolling any of them |

## Security and privacy

**Per-user isolation.** Every account is a fully isolated workspace. Documents, highlights, goals, tasks, plans, notes, the news feed, saved papers, flashcards, the career pipeline, mindmaps, focus sessions, even the fetched job listings — each table carries an owner id and every query is scoped by the signed-in session. Fetching news or papers as a new user builds *your* feed from the same live sources without touching anyone else's read/saved state. Deleting an account cascades its data.

The rest of the hardening, briefly:

- **Sessions** are signed, `httpOnly`, `SameSite=Lax` cookies (`AUTH_SECRET`), `Secure` in production, and the workspace signs you out after 30 idle minutes.
- **Accounts**: salted PBKDF2 password hashing; signup requires a 6-digit emailed code (10-minute expiry, attempt-locked); password reset goes through the same coded flow.
- **Brute force & enumeration**: rate limiting on every auth surface with a durable cross-instance counter and an IP-level login ceiling (100 attempts / 5 min) against distributed password spraying; login responses are timing-equalized and never reveal whether an email is registered.
- **SSRF guard**: every user-supplied URL (document import, blob relay) is fetched through a guard that blocks private and internal addresses.
- **Input validation**: request payloads are validated and length-capped before they reach the database; ownership is re-checked server-side on every mutation.
- **Webhooks & crons**: payment webhooks verify provider signatures; scheduled jobs authenticate with `CRON_SECRET`; operator diagnostics (`/api/ops/health`) expose booleans only, never secrets.
- **Supply chain**: dependencies are audited and pinned with deliberate `overrides`; the whole surface passed a full security audit (account-takeover, SSRF, IDOR, security headers, crypto) in October 2026.

## Running it locally

You need Node.js 20+ (or Bun — there is a `bun.lock` in the repo) and a PostgreSQL database. The zero-setup path is a free [Neon](https://neon.tech) project (no Docker, no local server); for a fully offline one, `bun run scripts/pg-embed/start.ts` starts a throwaway Postgres on `127.0.0.1:5433`.

```bash
git clone https://github.com/SaqibMehdi123/Cortex.git
cd Cortex

# install dependencies
npm install        # or: bun install

# set up the database
cp .env.example .env   # then fill DATABASE_URL
npx prisma db push

# run it
npm run dev        # or: bun run dev
```

Open http://localhost:3000. You land on the signup page — create an account and the workspace is yours alone. It starts completely empty on purpose: no demo content, no "Welcome, John Doe". Import a paper, set a goal, and it builds from there. (In production the build syncs additive schema changes to the database automatically — `scripts/db-push.mjs` — so deploys stay one step.)

**Email verification and password reset.** New signups get a 6-digit code by email before the account is activated (10-minute expiry, 5 wrong attempts lock the code, one code per minute). Forgot your password? The sign-in page links to a reset flow that emails a fresh code and lets you pick a new password. On a machine with no mail provider configured the code appears in the UI and the server log, clearly labelled as a dev fallback. To send real mail, uncomment one provider block in `.env` — the chain tries Resend → SendGrid → SMTP → Brevo in order. Full walkthrough: [EMAIL-SETUP.md](EMAIL-SETUP.md).

**AI key.** Every AI feature (document chat, summaries, paper breakdowns, flashcards, mindmaps, the apply agent) runs through one OpenAI-compatible client. Google Gemini is the recommended default — a free AI Studio key works out of the box; Groq and OpenRouter are equally plug-in. Without any key, everything plain-HTTP (news, jobs, scholarships, reading, planning) still works and the AI surfaces explain themselves. Walkthrough: [GEMINI-SETUP.md](GEMINI-SETUP.md).

**Session secret.** Development works without it, but if you deploy Cortex anywhere, set `AUTH_SECRET` in `.env` (for example `openssl rand -base64 32`) so session cookies are signed with your own key.

**PDF storage.** Optional and automatic: set the four `R2_*` vars to use Cloudflare R2 (recommended), connect a Vercel Blob store and it just works, or leave both off and PDFs land on local disk (dev/VPS). Setup: [docs/R2-SETUP.md](docs/R2-SETUP.md).

**Billing.** Optional: with no payment provider configured the pricing page shows "launching soon" and everything else works. Walkthroughs: [POLAR-SETUP.md](POLAR-SETUP.md) and [LEMON-SQUEEZY-SETUP.md](LEMON-SQUEEZY-SETUP.md).

**Optional: Google integrations.** Gmail import and Calendar sync need OAuth credentials of your own — deliberate, since your email should flow through *your* Google project:

1. Create a project at [Google Cloud Console](https://console.cloud.google.com), enable the **Gmail API** and **Calendar API**
2. Create OAuth credentials (web application) with the redirect URI `http://localhost:3000/api/auth/google/callback`
3. Fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` in `.env`

Everything else works without any keys. For deployment on free platforms (VPS, Vercel + Neon + R2, containers), [DEPLOYMENT.md](DEPLOYMENT.md) is a step-by-step guide.

## Project structure

```
src/
├── app/
│   ├── page.tsx            # public landing page (/, server-rendered)
│   ├── pricing/            # Pro plan checkout (Polar / Lemon Squeezy / Safepay)
│   ├── login|signup|verify|forgot-password/   # the auth surfaces
│   ├── app/                # the workspace itself (client app under /app)
│   └── api/                # 33 route groups, 109 route handlers:
│                           # documents, plans, goals, tasks, mindmaps,
│                           # flashcards, news, papers, opportunities,
│                           # agent (apply agent), billing, auth, cron, ...
├── middleware.ts           # session gate for every page and API route
├── components/
│   ├── views/              # one file per screen (dashboard, library, plans, ...)
│   ├── landing/            # landing sections (hero, features, flow, ...)
│   ├── ui/                 # shadcn/ui primitives
│   ├── agent-cards.tsx     # apply-agent chat cards
│   ├── app-shell.tsx       # sidebar, mobile tabs, floating actions, layout
│   ├── pdf-viewer.tsx      # pdf.js canvas renderer (zoom, nav, fullscreen)
│   └── copilot-dock.tsx
└── lib/
    ├── db.ts               # Prisma client
    ├── auth.ts             # sessions, cookies, PBKDF2 password hashing
    ├── rate-limit.ts       # two-layer rate limiter (memory + Postgres)
    ├── entitlements.ts     # free/Pro plan resolution + metered AI limits
    ├── ai.ts               # OpenAI-compatible client with retry + failover
    ├── safe-url.ts         # SSRF guard for user-supplied URLs
    ├── mailer.ts           # Resend → SendGrid → SMTP → Brevo chain
    ├── storage.ts          # R2 / Vercel Blob / disk pick-a-backend
    ├── agent/              # apply agent: CV parse, shortlist, drafts, ATS
    ├── sm2.ts              # spaced-repetition scheduler
    ├── feeds.ts            # news + scholarship sources (real RSS endpoints)
    └── store.ts            # client UI state (zustand)
```

## Where it stands

Working and used daily: PDF import (file, URL, text), the reader with resume, fullscreen and Ask-AI citations, highlight-to-flashcard with SM-2, mindmaps with per-document dedup, plans/goals linking with computed progress, live news and papers, career Discover and Pipeline with scholarships, the apply agent (CV → shortlist → drafts → approved submissions), Pro billing with metered AI limits, the morning briefing email and in-app notifications, analytics, verified per-user accounts, export, dark mode, and a mobile layout that is a first-class citizen. Deployed on Vercel + Neon + R2, and the whole surface has passed a full security audit.

Known rough edges, in the order they get attention: the AI features need one OpenAI-compatible key (news, jobs and scholarships are plain HTTP and work regardless); calendar push is one-way; the career module's email classification is only as good as its parsing.

If something here sounds useful, fork it, break it, and tell me what you find.
