# Worklog

---
Task ID: 1
Agent: Main agent (Super Z)
Task: Build "Second Brain" — a cross-device personal knowledge hub web platform (Next.js 16 fullstack)

Work Log:
- Initialized fullstack environment via init script (Next.js 16 + Tailwind 4 + shadcn/ui + Prisma/SQLite)
- Designed Prisma schema with 7 models: Document, ChatMessage, Goal, Step, Plan, NewsArticle, Opportunity, MindMap; pushed to SQLite
- Built 17 API endpoints under src/app/api/: documents CRUD, AI chat (z-ai-web-dev-sdk LLM grounded on document content), goals/steps/plans CRUD, AI news (web_search + dedupe + DB cache), opportunities CRUD + AI email parser, mindmaps CRUD (JSON nodes serialization fix), dashboard aggregation
- Built responsive app shell: desktop left sidebar + mobile bottom nav (6 items), single-page view switching (dashboard/library/goals/news/opportunities/mindmap)
- Built 6 views: Dashboard (stats, today's focus, goal progress, continue reading, opportunities), Library (reading tracker + progress slider + notes + per-document AI chat with markdown), Goals & Plans (goal cards with steps checklist + auto progress %, day/week/month plan tabs, goal-linking), AI News (live web fetch, read/save filters, category chips), Opportunities (status board + AI email extraction dialog), Mindmaps (drag-and-drop nodes, bezier SVG edges, tidy layout, autosave)
- Fixed issues found during verification: lucide `Child` icon export error, `doc is not defined` key typo, mindmap nodes JSON-string vs array persistence bug (API now always parses nodes before responding)
- Browser-verified end-to-end with agent-browser on desktop (1280x800) and mobile (390x844): goal creation, step toggle → 25% progress, daily plan → dashboard, document + grounded AI answer, 28 live news articles fetched, Google internship email parsed by AI into pre-filled form, mindmap child nodes + tidy + persistence across reload

Stage Summary:
- Runnable Next.js 16 app at / (port 3000), lint clean, all golden paths verified in browser
- Seed/demo data present: 1 goal (4 steps, 25%), 1 daily plan, 1 document with AI chat history, 28 news articles, 1 opportunity (Google SWE intern), 1 mindmap (3 nodes)
- Key files: prisma/schema.prisma, src/app/api/**, src/components/app-shell.tsx, src/components/views/*.tsx, src/lib/{types,client,db}.ts

---
Task ID: 2
Agent: Main agent (Super Z)
Task: Save the "Cortex" v2 product specification provided by the user (no build work — explicitly deferred)

Work Log:
- Read existing worklog to confirm v1 "Second Brain" state (6 views, 17 API routes, Prisma/SQLite, verified E2E)
- Transcribed the user's full Cortex brief verbatim into /home/z/my-project/CORTEX_SPEC.md: 6 core modules (Knowledge Hub, Planning & Goal Engine, AI News Radar, Career Command Center, Mindmap Studio, AI Copilot), 5 additional features (spaced repetition SM-2, ⌘K universal search, focus/Pomodoro mode, quick capture with voice memo transcription, analytics charts), and non-functional requirements (real-time sync, offline-first, auth email+Google, encryption at rest, export Markdown/JSON, <2s cold load)
- Marked spec as SAVED / DO-NOT-BUILD until the user's design prompt arrives

Stage Summary:
- Cortex v2 spec persisted at /home/z/my-project/CORTEX_SPEC.md; it supersedes v1 scope
- Current codebase remains the runnable v1 "Second Brain" app — untouched
- NEXT STEP (pending user input): receive the design prompt, then rebuild/extend v1 to full Cortex scope strictly following that design (desktop + mobile breakpoints)

---
Task ID: 3
Agent: Main agent (Super Z)
Task: Build "Cortex" v2 — full rebuild of the app per CORTEX_SPEC.md, strictly following DESIGN_SPEC.md (Linear/Notion/Readwise-inspired design system)

Work Log:
- Saved design brief verbatim to /home/z/my-project/DESIGN_SPEC.md
- Prisma schema v2: Document(+summary/takeaways/lastReadAt), Highlight, ChatMessage(+thread/citations), Note, Goal(+streak), Milestone (replaces Step), Task(+status/priority/estimate/focusMinutes), Plan (self-nested year/month/week/day), NewsArticle, CustomSource, Opportunity(+classification/resume/nextAction), MindMap(+node links), Flashcard(+SM-2 fields), ReviewLog, ReadingSession, FocusSession, Setting; pushed to SQLite
- Design system in globals.css: indigo #6366F1 accent, 12px radius, OLED dark #0F0F10, semantic success/warning/danger, Literata reading-prose (1.6 line-height), 150-200ms motion, confetti keyframes, prefers-reduced-motion respected, WCAG focus rings, highlight mark colors
- 30+ API routes: documents(+URL import/summarize AI), highlights, chat (doc RAG w/ citation paragraphs), copilot (cross-module RAG w/ citations), goals/milestones (streak recompute), tasks (swipe complete/snooze/focus), plans (nested tree) + templates (Internship prep, One paper per week), news fetch (13 curated sources + custom sources + batched 3-line AI summaries), opportunities (+AI email parse & classification), mindmaps (+AI generate + tree layout), flashcards (+SM-2 review via lib/sm2), notes, capture (note/voice/url/task router), search (7 models), dashboard v2 (timeline/rings/digest/deadlines/briefing w/ at-risk goals & next-best-task), analytics (reading/tasks/focus/velocity), focus, reading-sessions, export (JSON/Markdown), settings
- Frontend: collapsible sidebar (11 items), mobile bottom tabs (Home/Read/Plan/Radar/More) + FABs, ⌘K command bar (shouldFilter=false, server-filtered), Copilot right dock / mobile full-screen sheet with clickable citation chips, quick capture (voice via Web Speech API + fallback), Pomodoro focus timer linked to tasks, progress rings, swipeable task rows (framer-motion), notifications popover, offline banner + sync indicator, theme toggle (mounted-guard against hydration mismatch), confetti on goal completion, skeleton loaders, teaching empty states
- Fixed during verification: ui.tsx barrel import paths (./ui/*), cmdk filter race (items mounted after search set were culled → replaced CommandDialog with Dialog+Command shouldFilter={false}), next-themes hydration mismatch (useMounted via useSyncExternalStore), copilot mobile Sheet blocking desktop clicks (breakpoint guard), floating buttons overlap, SM-2 preview labels (720m→12h), seed script day-plan reference bug
- Browser-verified E2E (agent-browser) desktop 1440×900 + mobile 390×844, light + dark: all 11 views render with seeded data; flashcard review flow (flip → grade Good → queue advances, persisted); task completion persisted; ⌘K search returns docs/notes/tasks; Copilot answered "Which goals are at risk?" with cross-module data + working citation links; reader shows seeded highlight + AI summary + Literata typography; lint clean; all APIs 200

Stage Summary:
- Cortex v2 is the running app on port 3000: 11 views, 30+ API routes, 17-model schema, rich demo data (scripts/seed.ts)
- Design tokens match DESIGN_SPEC.md exactly (indigo accent, 12px cards, OLED dark, Literata reading, spring motion, reduced-motion)
- Known honest limitations: Gmail OAuth & Google Calendar two-way sync are placeholder flows (email paste-parser + JSON export instead); PDF/EPUB import is metadata-only until text is pasted; voice capture uses browser SpeechRecognition where available
- Key files: prisma/schema.prisma, src/lib/{sm2,store,nav-config,confetti,timeago,types,client}.ts, src/components/{app-shell,command-bar,copilot-dock,quick-capture,focus-timer,shared,theme-provider,ui.tsx}, src/components/views/*.tsx (11), src/app/api/** (30+), scripts/seed.ts

---
Task ID: 4
Agent: Main agent (Super Z)
Task: Respond to user feedback — real news/papers (no dummy data), UI overhaul, fix empty Reader tab, real Gmail/Calendar OAuth, PDF text extraction

Work Log:
- Diagnosed complaints: news came from generic web_search (stale/homogenized), Reader nav item rendered no view (page.tsx had no 'reader' branch), seed demo data still present, OAuth/PDF were placeholders, UI execution disliked
- Replaced news engine with REAL feeds: curl-tested 19 sources, kept 9 verified-live RSS (OpenAI, Hugging Face, Google DeepMind, Microsoft Research, NVIDIA, TechCrunch AI, TLDR AI, Import AI, Ahead of AI) in src/lib/feeds.ts; rewrote /api/news/fetch with rss-parser (parallel, per-source error isolation, URL dedupe, utm-stripping, batched 3-line AI digests for 15 newest); /api/news gained server-side range filter (day/week/month/year) + source facet counts
- Built papers pipeline: new Paper model (arxivId unique, abstract, upvotes, AI analysis fields); POST /api/papers/fetch pulls Hugging Face Daily Papers API (paperswithcode.com was sunset in 2025 → HF is its successor) + arXiv Atom API (cs.AI/CL/LG/CV), dedupes, auto-analyzes top-3 upvoted; src/lib/paper-analysis.ts LLM produces structured {tldr, problem, innovation, results[], whyItMatters}; POST /api/papers/[id]/analyze on demand; POST /api/papers/[id] saves paper into Library as Document (opens in Reader)
- PDF extraction: POST /api/documents/pdf (multipart) uses pdf-parse v2 (PDFParse class, dynamic import + serverExternalPackages), cleans hyphenation/control chars, extracts meta title + pages + text; verified 15-page arXiv PDF → 39,936 chars; import dialog gained drag-and-drop PDF tab
- Google OAuth for real: src/lib/google.ts (scopes gmail.readonly + calendar.readonly + calendar.events, auto token refresh via refresh_token), routes /api/auth/google (302 consent), /callback (code exchange + userinfo + persist), /status (configured/connected/redirectUri always derived), DELETE disconnect+revoke; POST /api/gmail/import (last 25 inbox msgs 60d → AI classification → Opportunity upsert, gmailId dedupe); GET /api/calendar (upcoming events), POST /api/calendar/push (due-date tasks → events, title dedupe); Settings shows step-by-step credential setup with copyable redirect URI
- Wiped ALL demo data (scripts/wipe.ts) and made scripts/seed.ts a no-op by design; db pushed with new schema (Paper, Setting.googleAuth/googleEmail, Opportunity.gmailId)
- UI overhaul: globals.css refined light/dark tokens (deeper OLED #0e0e10, cleaner borders, semantic color fixes), new utilities (card-lift hover, text-gradient, skeleton-shimmer, shadow-lift); sidebar rebuilt — grouped WORKSPACE/INTELLIGENCE/SYSTEM sections, active left-indicator bar, gradient logo, prominent search pill, tighter 232px width; PageHeader + polished EmptyState in shared.tsx; News & Papers view fully rewritten (two tabs, favicon-rich cards via Google s2, filters: category/source/saved/range for news; range/sort/saved for papers; expandable Problem/Innovation/Results breakdown; Save-to-Library → Reader)
- Fixed Reader tab: new ReaderHome view (Continue reading + Reading queue + counts) registered in page.tsx — the tab was previously dead because no view was bound to it
- Career view: Scan Gmail button (+ auto-jump to Settings when not connected); Settings rewritten with real Google account card (setup guide/connect/connected states, inbox scan, calendar push); added missing api.put helper (latent bug — settings save would have crashed)
- Fixed hydration mismatch on theme toggle (SSR/client Sun-vs-Moon) with CSS-only dark: variant swap; cleared stale .next cache; fresh-session page errors = 0

Stage Summary:
- Verified live: 98 real articles from 9 feeds with AI 3-line digests; 79 real papers (HF+arXiv), top-3 auto-analyzed + on-demand analyze working; PDF upload extracted 15 pages/39.9k chars; OAuth status callback/setup flows correct; news & papers filters work (Today→This year)
- DB is clean of dummy data (user creates own content; one user-created doc "Elite Slide Mastery" appeared mid-test and was preserved)
- Lint clean; browser-verified desktop 1440×900 light+dark, iPhone 14 mobile; zero console/page errors in fresh session
- For the user: to activate Gmail/Calendar, add GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET to .env (redirect URI shown in Settings → Google account)
