# Cortex — Design System Spec (v2)

> Status: ACTIVE — this is the design source of truth for the build.
> Pair with: CORTEX_SPEC.md (product scope). Source: verbatim user design brief, 2026-09-05.

## Design System

- **Inspiration**: Linear (precision), Notion (flexibility), Readwise (reading comfort)
- **Palette**: neutral base (zinc/slate), one accent: **indigo #6366F1**; semantic: green = done, amber = in progress, red = deadline/overdue
- **Typography**: Geist for UI (16px base); **Literata** for reading mode, line-height 1.6
- **Surfaces**: white / near-black **#0F0F10** (OLED dark); cards **12px radius**, subtle 1px borders, soft shadows
- **Spacing**: 4px grid; max content width ~1200px desktop
- **Motion**: 150–200ms ease transitions, spring animation for expanding cards, confetti when a goal completes; respect `prefers-reduced-motion`

## Layout — Desktop

- Collapsible left sidebar (icon + label): Dashboard, Library, Reader, Plans, Goals, News Radar, Career, Mindmaps, Flashcards, Analytics, Settings
- Persistent ⌘K command bar (universal search + quick actions)
- Main content area; collapsible right dock for AI Copilot chat

## Layout — Mobile

- Bottom tab bar: Home, Read, Plan, Radar, More
- Floating action button → quick capture (note, voice, URL, task)
- Floating AI assistant button → full-screen chat
- Swipe gestures on tasks: right = complete, left = snooze

## Key Screens

1. **Dashboard ("Today")**: greeting + date, today's timeline, progress rings for active goals, news digest card, deadlines card, Copilot briefing card
2. **Library**: grid/list toggle; documents show cover, tags, reading progress
3. **Reader**: distraction-free; highlight colors; floating "Ask AI" on text selection
4. **Plans**: nested outline + Kanban toggle; drag to reschedule; week strip at top
5. **Goals**: goal cards with progress bar, milestone checklist, streak flame, velocity chart
6. **News Radar**: card feed, source favicon, time-ago, 3-line summary, save button; filter chips
7. **Career**: application Kanban, company logos, stage, next-deadline countdown
8. **Mindmap canvas**: zoom/pan, draggable nodes, minimap, auto-layout
9. **Flashcards**: full-screen flip with Again / Hard / Good / Easy
10. **Copilot chat**: responses include citations linking back to source doc/note

## Modes & Details

- Full dark (OLED-friendly) + light mode, follow system preference + manual toggle
- Empty states that teach ("Import your first paper" + sample data)
- Skeleton loaders, offline indicator, sync status icon
- Accessibility: WCAG AA contrast, visible focus states, keyboard navigation, 44px touch targets
