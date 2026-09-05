# Cortex — Product Specification (v2 Build Brief)

> Status: SAVED — awaiting design prompt. Do NOT build until the design prompt arrives.
> Supersedes: "Second Brain" v1 (current codebase in this repo).
> Source: verbatim user brief, 2026-09-05.

## Product Definition

**Cortex** — a cross-platform personal knowledge & productivity workspace (responsive web app for laptop + optimized mobile experience) with real-time sync, so reading, documents, plans, goals, AI news, and career tracking live in one coherent place.

---

## CORE MODULES

### 1. Knowledge Hub (Reading & Documents)
- Import PDFs, EPUBs, web articles (URL), and pasted text into a library
- Built-in reader with highlighting, annotations, and tags
- AI chat with any document (RAG): ask questions, get cited answers
- Auto-generated summaries and key takeaways per document
- Reading queue ("read later") and full reading history
- Turn highlights into flashcards or mindmap nodes with one click

### 2. Planning & Goal Engine
- Nested plans: Year → Month → Week → Day
- Goals with milestones (intermediary steps); each milestone has tasks
- Auto-computed progress: % complete, streaks, estimated time-to-goal
- Views: list, Kanban board, and calendar (with Google Calendar sync)
- Plan templates (e.g., "Internship prep," "One paper per week")
- Reminders + smart notifications for deadlines and stalled goals
- Weekly Review: AI-generated report of what got done, what slipped, and why

### 3. AI News Radar
- Aggregates from: OpenAI, Anthropic, Google DeepMind, Meta AI, Mistral, Microsoft Research, NVIDIA, Hugging Face, arXiv (cs.AI / cs.CL / cs.LG), top researcher blogs, and newsletters (The Batch, Import AI, TLDR AI, Ahead of AI)
- Every article gets a 3-line AI summary; tap through to full text
- Filter by topic, source, and recency; save articles to the reading queue
- Custom sources: user can add any blog, newsletter, or X/Twitter account
- Optional daily digest delivered at a time the user chooses

### 4. Career Command Center
- Gmail integration (OAuth) that surfaces internship/job-related emails
- AI classification: opportunity, rejection, interview, offer, deadline
- Application tracker (Kanban: Saved → Applied → Interview → Offer) with auto-detected deadlines and reminders
- Link resume/CV versions to specific applications

### 5. Mindmap Studio
- Auto-generate mindmaps from a document, a topic, or notes
- Editable canvas: drag, re-parent, add, and color-code nodes
- Nodes can link to documents, tasks, goals, or external URLs
- Export as image or Markdown outline

### 6. AI Copilot (cross-module assistant)
- Chat with access to docs, plans, highlights, and notes
- "Ask my second brain": e.g., "What did that paper say about attention?"
- Daily Briefing card: today's plan + news digest + upcoming deadlines
- Proactive suggestions: next best task, due flashcards, at-risk goals

---

## ADDITIONAL FEATURES

7. **Spaced repetition**: highlights become flashcards with SM-2-style review scheduling and a daily due count
8. **Universal search (⌘K)**: one search across documents, notes, tasks, goals, news, and emails
9. **Focus mode**: Pomodoro timer linked to a specific task; logs focus hours per goal
10. **Quick capture**: note, voice memo (auto-transcribed), URL, or task from anywhere, on any device
11. **Analytics**: reading time, tasks completed, focus hours, goal velocity — shown as weekly/monthly charts

---

## NON-FUNCTIONAL REQUIREMENTS

- Cross-device real-time sync; offline-first with conflict resolution
- Auth via email + Google; data encrypted at rest
- Privacy-first: user data stays the user's; export everything (Markdown/JSON) anytime
- Fast: under 2s cold load, instant navigation between modules

---

## Build Directive

When the design prompt arrives, rebuild/update the current v1 codebase to satisfy every module above, strictly following the provided design (visual language, layout, components) for both desktop and mobile breakpoints.
