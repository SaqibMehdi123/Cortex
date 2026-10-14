# Apply Agent — Feature Plan (v1)

> **Status: IMPLEMENTED (Phases 0–4).** The full v1 feature set shipped: CV parse →
> profile confirmation, shortlist scoring + Discover badges, per-job drafts with
> grouped intake, Tier A packages, Tier B direct submission for Greenhouse/Lever
> (opt-in, capped, audited), outcome learning, and the morning-briefing agent
> section. The original plan is preserved below; build decisions are recorded at the bottom.
>
> The idea, as agreed: agents working inside Cortex shortlist jobs based on the user's needs and
> skill set, ask the user for missing information (starting with their resume/CV) **in the chat**,
> and then apply to the job on the user's behalf, attaching the CV to the job form — with the user
> approving every application.

---

## 1. What we are building

**"Apply Agent"** — an agent that lives in the Career module and closes the loop from
*discovered job* → *submitted application*:

1. **Knows the user** — parses their CV (uploaded in chat) into a structured profile: skills,
   experience, education, links, work authorization, preferences.
2. **Shortlists** — scores the Discover board against the profile, ranks jobs with a match
   percentage and a human-readable "why", and filters out what the user doesn't want.
3. **Asks** — for each job the user picks, works out exactly what's missing for a complete
   application and asks for it in one grouped chat message (quick-reply chips, not a form).
4. **Prepares** — assembles a complete application draft: CV, (optional) cover letter, and a
   question→answer sheet for the job's form.
5. **Applies** — submits on the user's behalf where technically possible, always behind an
   explicit per-application approval card; where automated submission isn't possible, hands over
   a one-click package.

Design principle: **the agent does the grunt work, the user makes every decision that matters.**
The agent never fabricates experience and never submits anything the user hasn't seen in full.

---

## 2. What Cortex already gives us (grounded in the current codebase)

| Existing asset | Where | Role in the Apply Agent |
|---|---|---|
| Job sources — Greenhouse, Lever, Workable, JazzHR, Zoho Recruit, WordPress boards, NETSOL, NSTP, LinkedIn (PK), RemoteOK, Remotive | `src/app/api/opportunities/fetch/route.ts` | The candidate pool to shortlist from (already deduped per user via `@@unique([userId, url])`) |
| Opportunity pipeline with statuses `saved → applied → interview → offer → rejected` | `Opportunity` model + `PipelineTab` in `career.tsx` | The agent's output lands here; status flips automatically on submission |
| Generic chat threads (`ChatMessage.thread`: `'copilot'`, `'doc:<id>'`) | `src/app/api/copilot`, `ChatMessage` model | Agent conversations fit with **no new conversation tables** — use `'agent'` / `'agent:draft:<id>'` thread strings |
| Working AI chat UI (optimistic send, markdown, usage counter) | `src/components/copilot-dock.tsx` | Base for the agent chat; needs a paperclip (attachments) + structured cards |
| LLM client with retry + Groq failover (one-shot JSON completions) | `src/lib/ai.ts` (`createAI`) | All agent reasoning; **no agent framework needed** — extend the existing one-shot pattern |
| File storage abstraction (R2 / Vercel Blob / disk, presigned 1h PUT / 5min GET) | `src/lib/storage.ts` | CV file storage (private bucket, short-lived download URLs) |
| PDF text extraction (pdf-parse v2, page-batched, 50s deadline) | `src/lib/pdf-extract.ts` | CV → raw text → LLM structured parse |
| Metering / entitlements (`guardUsage`, `DailyUsage` features `copilot\|summary\|cards\|mindmap`) | `src/lib/entitlements.ts` | New `'agent'` usage feature; free vs Pro caps |
| Role-family classifier | `src/lib/job-families.ts` | Rule-level hard filters before LLM scoring |
| SSRF-hardened fetch | `src/lib/safe-fetch.ts` | Fetching job-description pages safely |
| Email chain + daily briefing + 2 crons (08:00 / 08:30 PKT) | `src/lib/mailer.ts`, `src/lib/morning-briefing.ts`, `vercel.json` | "N new matches / M drafts awaiting your approval" section in the morning email |
| Board API probes (Greenhouse / Lever / Ashby / Bamboo curl outputs) | `scripts/t_*.out` | Head start for the ATS submission tier |

**Gaps that this feature must fill** (this is the actual work):

1. **No candidate profile exists** — skills/experience/preferences live nowhere today.
2. **No Resume object** — `Opportunity.resume` is a free-text label typed by hand; CVs are never uploaded.
3. **`JobListing` has no description text** — fetchers store metadata only; shortlisting on titles alone would be weak.
4. **Chat has no attachments and no structured cards** (`ChatMessage` = role + content + citations).
5. **Zero form-filling / submission code** — no headless browser, no ATS apply integration; Discover's "Apply" is a plain link.
6. **`Task` has no link to `Opportunity`** — follow-up tasks per application need a new FK.

---

## 3. End-to-end experience (the designed flow)

```
 User opens "Apply Agent" (Career view)
        │
        ▼
 [Step 1] KNOW ME ── agent asks for CV in chat ── user attaches PDF/DOCX
        │           → parsed profile confirmation card → user edits/corrects
        │           → 6 quick preference questions (chips, skippable)
        ▼
 [Step 2] SHORTLIST ── agent scores the Discover board against the profile
        │              → match % + "why" on Discover cards
        │              → daily "Top 5 for you" card in chat
        │              → user taps "Prepare application" (or "Not interested")
        ▼
 [Step 3] ASK ── one grouped checklist per job in chat:
        │        "I have 8/10 answers from your profile. Still need:
        │         (1) expected salary  (2) portfolio link"
        ▼
 [Step 4] PREPARE ── ApplicationDraft: tailored CV + cover letter (opt-in)
        │             + form answers sheet → full preview card in chat
        ▼
 [Step 5] APPLY ── [Approve & submit] / [Edit] / [Skip]
        │           ├─ automatable board → agent submits → status flips to applied
        │           └─ otherwise → "Open application" + package download →
        │              user confirms "I submitted it"
        ▼
 [Step 6] FOLLOW THROUGH ── follow-up task auto-created, morning email shows
                            agent status; Gmail import keeps closing the loop
```

**Step 1 — Know me.** First open of the agent shows a consent explainer: *"I will never submit an
application without showing you exactly what will be sent."* The agent then asks for the CV. The
user attaches a file in chat (composer paperclip → PDF/DOCX, v1 limit ~10 MB). The file goes
through the existing storage abstraction, text is extracted with `extractPdfText`, and one LLM call
parses it into a structured profile. The agent replies with a **confirmation card** ("I found:
3 yrs React · 2 yrs Python · NUST CS '24 — correct?") the user can correct inline — this matters,
because every later answer is grounded in this profile, not in the model's imagination. Then a
short preference Q&A (target roles/families, locations/remote, job vs internship, salary
expectation, sponsorship needs) — all with quick-reply chips, all skippable, all editable later in
Settings. Multiple CVs are supported (labeled versions, one default).

**Step 2 — Shortlist.** Two-stage matching. Stage 1: cheap hard filters (role family from
`job-families.ts`, type job/internship, location/remote preference, freshness, not already in the
pipeline). Stage 2: LLM batch-scoring of survivors in batches of ~20 listings per call against the
profile JSON, returning `{score 0–100, why: ≤2 lines, gaps: [...]}` per listing. Discover cards
gain a match badge and an expandable "why"; the agent posts a **"Top 5 for you"** card in chat each
day. "Not interested" taps are recorded as preference signals (Phase 1: simple keyword/family
demotion; learning from outcomes comes much later).

**Step 3 — Ask.** For each job the user picks, the agent builds the application checklist from
three buckets: (a) already answerable from the profile, (b) reusable answers the user gave for a
previous application (`profile.answers` — "remember for next time" is on by default), (c) genuinely
missing. One grouped chat message per job — never an interrogation, one question at a time. Free
text and chips both work; every reusable answer is offered back to the profile.

**Step 4 — Prepare.** The agent assembles an `ApplicationDraft`:
- **CV** — the default CV file, plus an optional *tailored emphasis* variant derived from the
  parsed profile (reordered/re-highlighted bullets — see Open Decision #6 on rephrasing).
- **Cover letter** — opt-in per job, ≤350 words, grounded strictly in CV + JD.
- **Answers sheet** — `[{question, answer, source: profile|user}]` for the job's form questions
  (from the ATS form schema where known; standard question set otherwise).
- **Preview card** — everything that would be submitted, visible in one place in chat.
Draft status: `collecting → ready`.

**Step 5 — Apply.** Every submission is gated by an approval card: `[Approve & submit] [Edit] [Skip]`.
On approve: automatable boards get submitted server-side (Tier B below) → draft `submitted`,
`Opportunity.status: saved → applied` automatically, follow-up task created ("Follow up with Acme —
applied 3 days ago"). Non-automatable boards: one-click "Open application" + package download; the
user confirms "I submitted it" and the pipeline moves the same way.

**Step 6 — Follow through.** Deadlines and next actions already surface in the pipeline and the
morning briefing; Gmail import classification (interview/rejection emails) already updates the
pipeline and now closes the outcome loop for the agent's shortlisted applications.

---

## 4. Proposed data model (NOT applied — for review)

```prisma
model CandidateProfile {          // one per user
  id        String  @id @default(cuid())
  userId    String  @unique
  headline  String?                 // "Final-year CS student, full-stack"
  skills    Json?                   // ["Next.js", "Python", ...]
  experience Json?                  // parsed CV blocks
  education Json?
  links     Json?                   // {linkedin, github, portfolio}
  phone     String?
  location  String?
  workAuth  String?                 // "PK citizen — needs sponsorship"
  salaryTarget String?
  prefs     Json?                   // {roleFamilies[], locations[], remote, types[], keywords[]}
  answers   Json?                   // reusable screening answers
  resumeId  String?                 // default CV
}

model Resume {
  id        String  @id @default(cuid())
  userId    String
  label     String                  // "SWE CV — Jan 2026"
  fileRef   String                  // storage.ts ref (r2://… / blob URL / disk name)
  fileName  String
  mimeType  String
  rawText   String?                 // extractPdfText output
  parsed    Json?                   // cached structured extraction
  isDefault Boolean @default(false)
  createdAt DateTime @default(now())
}

model ApplicationDraft {
  id            String  @id @default(cuid())
  userId        String
  opportunityId String?               // applying to a pipeline job
  listingId     String?               // applying straight from Discover
  resumeId      String
  status        String  @default("collecting")
  // collecting | ready | awaiting_approval | approved | submitted | submitted_manually | failed | skipped
  coverLetter   String?
  answers       Json?                 // [{question, answer, source}]
  missingItems  Json?                 // ["expected salary", ...]
  packageRef    String?               // generated package (optional, later)
  method        String?               // ats_greenhouse | ats_lever | manual
  failureReason String?
  approvedAt    DateTime?
  submittedAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

**Small additive migrations to existing models:**

| Model | Change | Why |
|---|---|---|
| `JobListing` | + `descriptionText String?`, `descriptionFetchedAt DateTime?` | Shortlisting needs JD text; Greenhouse/Lever expose content endpoints |
| `ChatMessage` | + `payload Json?` (structured card: shortlist / checklist / approval), + `attachmentRef/attachmentName/attachmentKind String?` | Agent cards + CV attachments in chat |
| `Task` | + `opportunityId String?` | Follow-up tasks per application |
| `Opportunity` | + `resumeId String?` | Real CV link (legacy free-text `resume` kept until backfilled) |
| `DailyUsage.feature` | + `'agent'` value | Metering |

No new conversation tables — agent threads are `ChatMessage` rows with
`thread: 'agent'` (global) and `'agent:draft:<id>'` (per job). Everything stays strictly
`userId`-scoped, matching the existing multi-tenancy pattern.

---

## 5. Submission strategy — what is actually automatable (the honest part)

Automated "apply on behalf" is only as good as what each board allows. Three tiers, deliberately
ordered so value ships before risk:

**Tier A — Assisted apply (default, ships in Phase 2).** The agent hands over a complete package:
tailored CV + cover letter + answers sheet + "Open application" deep link. The user clicks submit
on the board themselves, then taps "I submitted it". Works for **every** source including LinkedIn;
zero ToS exposure. Even without Tier B, this removes ~90% of the pain (thinking, writing, gathering).

**Tier B — ATS direct submit (opt-in, Phase 3).** Greenhouse and Lever first — they are already our
richest fetch sources, expose public JSON APIs for job content **and application form questions**,
and Greenhouse accepts a standard multipart form POST including the resume file. The flow: fetch
the job's form schema → map `draft.answers` onto it → attach the stored CV file → submit
server-side → verify response → mark `submitted` (or `failed` with reason and fall back to Tier A).
Board-level probe work already exists in `scripts/t_greenhouse_*.out` / `t_lever_*.out`.
Guardrails: per-application approval, daily submission caps, full audit snapshot of what was sent,
and honest opt-in UI ("experimental — some boards may block automated submissions").

**Tier C — later / exploratory.** Ashby + BambooHR (probes exist), Workable, and eventually a
browser extension for arbitrary sites (e.g., LinkedIn Easy Apply). Heavy, fragile, and
ToS-sensitive — explicitly out of scope until Tier B proves out.

**Never, at any tier:** fabricated answers (unknown → ask the user), auto-submit without per-
application approval, applying to jobs the user didn't select, exceeding caps.

---

## 6. Agent orchestration — no framework needed

Cortex's AI pattern is one-shot LLM calls with strict JSON prompts and regex extraction. The agent
keeps that pattern and adds a plain-TypeScript state machine on top:

```
src/lib/agent/            (proposed)
  profile.ts    CV text → structured CandidateProfile (1 LLM call)
  match.ts      hard filters + batch LLM scoring (1 call per ~20 listings)
  intake.ts     checklist builder + answer routing (mostly deterministic)
  draft.ts      tailored CV emphasis + cover letter + answers sheet (1–2 calls)
  run.ts        per-draft state machine: collecting → ready → awaiting_approval →
                approved → submitted/failed; writes agent messages into ChatMessage
```

Proposed API surface (all under the existing `getSessionUser()` auth):

```
POST   /api/agent/profile/parse-cv     attachment → Resume + CandidateProfile
GET    /api/agent/profile              PATCH /api/agent/profile
POST   /api/agent/resumes/upload-url   (mirrors /api/documents/upload-url pattern)
POST   /api/agent/shortlist            run scoring → persists Top-5 card message
POST   /api/agent/drafts               create draft for listing/opportunity
GET    /api/agent/drafts/:id
POST   /api/agent/drafts/:id/answer    intake answers → advances state machine
POST   /api/agent/drafts/:id/approve   approval card → submit (Tier B) or package (Tier A)
POST   /api/agent/drafts/:id/skip
POST   /api/agent/chat                 agent conversation transport (mirrors /api/copilot)
```

UX note: there is no streaming anywhere in the app today, and a multi-step agent turn takes
seconds. Mitigation: the agent writes short step messages ("Scoring 42 jobs…") into the thread as
it works — same optimistic-render pattern CopilotDock already uses.

---

## 7. UI touchpoints

- **CopilotDock** — gains a thread switcher (Copilot / Apply Agent), a paperclip in the composer
  (PDF/DOCX ≤10 MB), and rendering for `payload` cards: ShortlistCard, ChecklistCard, ApprovalCard
  (same markdown + chip infrastructure as citation chips).
- **Career view — Discover** — match badge + expandable "why" + "Prepare application" button on
  cards; "Shortlisted for you" filter.
- **Career view — Pipeline** — agent draft state chip on cards ("Draft ready · awaiting your
  approval"); draft column or filter.
- **Settings** — "Apply Agent" card: default CV, preferences, agent on/off, delete-my-agent-data
  (CVs + profile + drafts).
- **Empty states** — Discover without a profile: "The agent needs your CV before it can shortlist."

## 8. Email touchpoints

The morning briefing (already a pure-function builder with per-user idempotency and timezone
handling) gains an **Agent section**: "3 new matches — top: Frontend @ Careem (87%)", "2 drafts
awaiting your approval". CTAs deep-link into the workspace. Because `/app` is an SPA with a
persisted Zustand view, deep links need a small boot-param handler (`/app?view=career&tab=discover`)
— a tiny, isolated change listed in Phase 1.

---

## 9. Safety, consent & trust rules (non-negotiables)

1. **Explicit approval per application** — the approval card shows the complete submission; no
   global "auto-apply everything" switch in v1.
2. **Grounded answers only** — every answer traces to the parsed profile or a user reply; the
   agent asks rather than invents; the preview card is the ground truth of what gets sent.
3. **Caps** — daily submission cap (Tier B) and daily agent usage (metered `'agent'` feature) to
   protect cost and prevent spray-and-pray applications.
4. **PII care** — CVs live in private storage with 5-minute presigned downloads; deletion removes
   file + parsed profile + drafts; nothing is shared across users (already enforced by `userId`
   scoping everywhere).
5. **Audit trail** — every submitted draft stores what was sent (answers snapshot + file refs +
   method + timestamps).

---

## 10. Delivery phases (rough, single-dev)

| Phase | Scope | Exit criteria | Rough effort |
|---|---|---|---|
| **0 — Foundations** | Models + `db-push` migration; CV upload via chat paperclip; parse → editable profile confirmation card; Settings agent card | Upload CV in chat → structured, correctable profile + stored default CV | ~3–4 days |
| **1 — Shortlist** | JD text fetch (Greenhouse/Lever content endpoints; safe-fetch extract where trivial); hard filters + batch scoring; Discover match badges; daily Top-5 card; `/app?view=` deep links | "Top 5 for you" with reasons appears daily | ~4–5 days |
| **2 — Drafts & intake** | Per-job threads, grouped checklist Q&A, tailored CV emphasis + cover letter + answers sheet, package preview/download, "I submitted it" confirm | Full copilot loop end-to-end without auto-submit (Tier A) | ~5–6 days |
| **3 — Auto-submit** | Greenhouse + Lever form fetch/fill/multipart submit behind approval cards; failure + fallback to Tier A; caps + audit | Approved draft → submitted on supported boards without leaving Cortex | ~1–2 weeks |
| **4 — Later** | Browser extension; Ashby/Bamboo/Workable; outcome learning (interview rate → better shortlisting); batch approval from the morning email | — | exploratory |

Phases are independently shippable — Tier A alone (Phases 0–2) is a complete, safe product.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Board bot-detection / ToS exposure (Tier B) | Opt-in only, daily caps, per-application approval, fallback to Tier A on failure, audit log |
| LLM fabrication in answers/cover letters | Grounded-generation prompts + preview card before any submit + "ask rather than invent" state machine |
| JD text unavailable (LinkedIn et al.) | Score on metadata with lower confidence label; fetch descriptions only where boards permit |
| LLM cost / runaway usage | Batch scoring (~20/call), metered `'agent'` feature, per-phase caps |
| PII in CVs | Private storage, short-lived presigned URLs, one-click agent-data deletion |
| SPA deep links from email | Small boot-param handler in `/app` (Phase 1) |

---

## 12. Open decisions (need your call before implementation)

1. **Agent chat home** — extend `CopilotDock` with a thread switcher, or build a dedicated Career
   agent panel? *(Recommendation: CopilotDock threads — least new UI, chat already persists.)*
2. **Auto-submit without per-application approval — ever?** *(Recommendation: never in v1; consider
   an explicit "trusted mode" much later.)*
3. **Cover letters** — default on, off, or ask per job? *(Recommendation: ask per job.)*
4. **Priority boards for Tier B** — Greenhouse + Lever first as proposed, or different?
5. **Free vs Pro limits** for agent features (shortlist runs/day, drafts, submissions).
6. **Tailored CV variants** — strictly reorder/highlight existing bullets, or allow light
   rephrasing? *(Integrity vs strength trade-off.)*

---

## 13. Build decisions (how the open questions were resolved)

Recorded 2026-10-14, during implementation. Each maps to §12's open decisions.

1. **Agent chat home** — CopilotDock gained a two-tab switcher (Copilot / Apply Agent). Same
   optimistic send, markdown, usage counter; agent thread is `ChatMessage.thread = 'agent'`.
2. **Auto-submit without approval** — never. Both submission paths run through
   `POST /api/agent/drafts/[id]/approve`, and direct submission additionally requires the
   Settings opt-in (`prefs.atsOptIn`).
3. **Cover letters** — opt-in per job via a checkbox on the checklist card (≤350 words, grounded
   in CV text + JD only).
4. **Priority boards** — Greenhouse (public form schema + multipart submit) and Lever (standard
   fields; custom-question rejections fall back to Tier A).
5. **Limits** — metered `agent` feature: 10 actions/day free (parses, shortlist runs, cover
   letters, draft creates, submits), unlimited on Pro. Tier B direct submissions capped at 5/day
   for every account (`ATS_DAILY_CAP`).
6. **Tailored CV variants** — none in v1 (integrity-first): the package carries the default CV
   file + cover letter + answers sheet; no rewriting of CV content.

Additional implementation notes (deviations worth knowing):

- **Single agent thread** — cards are self-contained (draftId inside), so per-draft threads
  (`agent:draft:<id>`) proved unnecessary; the thread format stays reserved.
- **Packages render on demand** (`GET /api/agent/drafts/[id]/package`) — nothing stored, so no
  stale-package failure mode; `ApplicationDraft.packageRef` stays reserved.
- **"Not interested"** is a persisted signal (`JobListing.matchScore = -1`) honored by every
  later shortlist run.
- **Outcome learning (v0)** — companies with agent-submitted applications get ±10/±8/±15 score
  adjustments (rejected/interview/offer) within a 60-day window, with the adjustment disclosed in
  the match "why" text.
- **Daily Top-5** — the morning cron runs bounded shortlists (10 accounts/hit) before building
  emails; the briefing email gains an "Apply Agent" section read from persisted scores (no LLM
  work at email time).
- **ATS base-URL env overrides** (`ATS_API_BASE_GREENHOUSE`, `ATS_SUBMIT_BASE_LEVER`,
  `ATS_DAILY_CAP`) exist solely for deterministic tests against a local mock; production never
  sets them.
