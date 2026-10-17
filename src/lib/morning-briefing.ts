// ─── Morning briefing: daily deadline + reminder email ────────────────────
//
// Assembled once a day by the Vercel cron ("0 3 * * *" = 08:00 Asia/Karachi)
// through GET /api/cron/morning. For every verified account it collects:
//
//   • Due today      — open tasks whose dueDate falls inside the user's LOCAL
//                      calendar day (same window maths as /api/dashboard)
//   • Overdue        — open tasks that became due within the last 2 days
//                      only (OVERDUE_LOOKBACK_DAYS). Older arrears are
//                      deliberately dropped from the mail — "what's gone is
//                      gone": a task overdue more than 2 days stops nagging
//                      every morning. (The dashboard still shows the full
//                      backlog; this limit is email-only.)
//   • Reminders      — reminders active today (shared reminder-span rules:
//                      recurrence + showDays windows + dismissal)
//   • On the horizon — tasks due within the next 3 days plus opportunity and
//                      goal deadlines within a week
//
// …and emails them via the same provider chain as the auth codes. Accounts
// with nothing to report receive nothing — no empty-notification noise.
//
// Timezone: the serverless runtime is UTC-only. The browser reports
// Date#getTimezoneOffset() on every dashboard visit, the route stores it in
// Setting.tzOffset, and the cron reconstructs each user's local calendar from
// it — for the day windows only. No offset learned yet → UTC. (At 08:00 PKT
// the local date equals the UTC date for every realistic offset, so the
// subject date is always right.)
//
// Everything except the two collect* functions at the bottom is pure — no DB
// import — so scripts/verify-morning-notification.ts can unit-check the
// windows, formatting, auth matrix and email template without a database.

import { SITE_NAME, SITE_URL, SUPPORT_EMAIL } from './site'
import { recurrenceLabel, reminderActiveOn } from './reminder-span'

const DAY_MS = 86_400_000

/**
 * How far back the briefing's Overdue section looks. A task whose dueDate is
 * more than this many days before today never appears in the email again —
 * the user explicitly asked to stop resurfacing old arrears ("overdue tasks
 * of more than last 2 days should not be in the mail; before that, what's
 * gone is gone"). Exported so scripts/verify-morning-notification.ts pins
 * the window maths.
 */
export const OVERDUE_LOOKBACK_DAYS = 2

/**
 * Earliest dueDate the Overdue section still reports: local midnight
 * (OVERDUE_LOOKBACK_DAYS) days before the given local midnight. Pure so the
 * boundary can be unit-checked — a task due exactly this instant is day 2
 * overdue and stays in the mail; anything earlier is gone.
 */
export function overdueCutoffStart(todayStart: Date): Date {
  return new Date(todayStart.getTime() - OVERDUE_LOOKBACK_DAYS * DAY_MS)
}

// ── Pure day/time helpers ────────────────────────────────────────────────

/** the same instant, re-labeled on a UTC+(-offsetMin) wall clock */
function shifted(d: Date, offsetMin: number): Date {
  const safe = Number.isFinite(offsetMin) ? offsetMin : 0
  return new Date(d.getTime() - safe * 60_000)
}

/** the user's local calendar day as YYYY-MM-DD (same convention as plans) */
export function localDayLabel(now: Date, offsetMin: number): string {
  const s = shifted(now, offsetMin)
  const m = String(s.getUTCMonth() + 1).padStart(2, '0')
  const d = String(s.getUTCDate()).padStart(2, '0')
  return `${s.getUTCFullYear()}-${m}-${d}`
}

/**
 * Local-midnight → local-midnight instant window for the user's current day.
 * Mirrors userDayWindow() in /api/dashboard (offset is getTimezoneOffset()
 * minutes — negative east of UTC).
 */
export function userDayWindow(offsetMin: number, now: Date): { start: Date; end: Date } {
  const safe = Number.isFinite(offsetMin) ? offsetMin : 0
  const s = shifted(now, safe)
  const start = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) + safe * 60_000)
  return { start, end: new Date(start.getTime() + DAY_MS - 1) }
}

/** "2:30 PM" on the user's wall clock — null when the instant is day-wide */
export function fmtTimeLocal(instant: Date, offsetMin: number): string | null {
  const s = shifted(instant, offsetMin)
  const h = s.getUTCHours()
  const m = s.getUTCMinutes()
  if (h === 0 && m === 0) return null
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

/** "Sep 12" on the user's wall clock */
export function fmtDayLocal(instant: Date, offsetMin: number): string {
  return shifted(instant, offsetMin).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** "tomorrow" / "in 3 days" / "today" — whole days from now, ceil */
export function fmtInDays(daysLeft: number): string {
  if (daysLeft <= 0) return 'today'
  if (daysLeft === 1) return 'tomorrow'
  return `in ${daysLeft} days`
}

// ── One digest per local calendar day ────────────────────────────────────

/**
 * Has this account already received today's briefing?
 *
 * The scheduled cron fires exactly once a day, so the lastDigestSentAt
 * marker is a pure safety net — it keeps a manual test run (or any future
 * extra hit) from doubling the daily email. "Today" is read on the USER's
 * calendar via tzOffset, matching how the briefing's day windows are built.
 */
export function digestAlreadySentToday(
  lastSentAt: Date | null | undefined,
  offsetMin: number,
  now: Date
): boolean {
  if (!lastSentAt) return false
  return localDayLabel(lastSentAt, offsetMin) === localDayLabel(now, offsetMin)
}

// ── Cron authorization ───────────────────────────────────────────────────

export type CronAuthInput = {
  authHeader: string | null // full Authorization header
  keyParam: string | null // ?key= — manual curl convenience (dev only)
  secret: string | null // the configured CRON_SECRET (null = not set)
  isProd: boolean
}

/**
 * CRON_SECRET is the strong gate: Vercel automatically sends
 * "Authorization: Bearer $CRON_SECRET" when the env var exists.
 *
 * Production fails CLOSED: without CRON_SECRET there is no acceptable proof
 * of scheduler identity — the scheduler's x-vercel-cron header is sent by the
 * platform but can also be sent by anyone else, so it is never sufficient in
 * production (the previous header fallback let any caller trigger mass
 * briefing emails and feed syncs when the env var was missing). Dev keeps the
 * open path so local testing without an env var still works. The secret is
 * compared in constant time; the ?key= convenience parameter is dev-only
 * (secrets in URLs leak into access logs).
 */
export function authorizeMorningCron(p: CronAuthInput): { ok: boolean; status: number; reason: string } {
  const expected = (p.secret || '').trim()
  const bearer = p.authHeader?.startsWith('Bearer ') ? p.authHeader.slice(7).trim() : null
  if (expected) {
    // constant-time compare — the secret gates mass email sends
    if (bearer && timingSafeEq(bearer, expected)) return { ok: true, status: 200, reason: 'bearer' }
    if (!p.isProd && p.keyParam && timingSafeEq(p.keyParam.trim(), expected)) return { ok: true, status: 200, reason: 'key' }
    return { ok: false, status: 401, reason: 'bad_secret' }
  }
  if (!p.isProd) return { ok: true, status: 200, reason: 'dev' }
  return { ok: false, status: 401, reason: 'no_secret_configured' }
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Same CRON_SECRET contract, shared by the daily feed sync (/api/cron/feeds). */
export const authorizeCron = authorizeMorningCron

// ── Briefing shape ───────────────────────────────────────────────────────

export type BriefingTask = {
  id: string
  title: string
  high: boolean
  when: string | null // local clock time, null = all-day
  wasDue: string | null // overdue rows: "Sep 10"
  plan: string | null
}

export type BriefingReminder = { id: string; title: string; cadence: string }

export type BriefingHorizon = {
  id: string
  kind: 'task' | 'opportunity' | 'goal'
  title: string
  when: string // "tomorrow" / "Sep 15 · in 3 days"
  daysLeft: number
}

// Apply Agent section — yesterday's shortlist winners + drafts waiting on the user
export type BriefingMatch = {
  id: string
  company: string
  role: string
  score: number
}

export type BriefingAgent = {
  topMatches: BriefingMatch[]
  draftsAwaiting: number
}

export type Briefing = {
  userId: string
  to: string
  name: string
  subject: string
  html: string
  text: string
  counts: { dueToday: number; overdue: number; reminders: number; horizon: number }
  dueToday: BriefingTask[]
  overdue: BriefingTask[]
  reminders: BriefingReminder[]
  horizon: BriefingHorizon[]
  agent: BriefingAgent
}

// ── Email template (inline styles — email clients strip <style>) ─────────

const PRIORITY_CHIP = (label: string, bg: string, fg: string) =>
  `<span style="background:${bg};color:${fg};font-size:10px;font-weight:700;letter-spacing:0.05em;padding:1px 7px;border-radius:999px;margin-left:6px;vertical-align:1px;">${label}</span>`

function sectionHeader(title: string, count: number, accent: string): string {
  return `<h2 style="margin:22px 0 8px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#52525b;"><span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${accent};margin-right:7px;vertical-align:0;"></span>${title} · ${count}</h2>`
}

function taskRow(t: BriefingTask): string {
  // plan titles are user input — every interpolated string in this template
  // must pass escapeHtml (PRIORITY_CHIP's arguments are internal constants).
  const meta = [t.when ? escapeHtml(t.when) : null, t.wasDue ? `was due ${escapeHtml(t.wasDue)}` : null, t.plan ? `Plan · ${escapeHtml(t.plan)}` : null]
    .filter(Boolean)
    .join(' · ')
  return `<div class="row" style="margin:0 0 6px;padding:9px 12px;border:1px solid ${t.wasDue ? '#fecdd3' : '#e4e4e7'};border-left:3px solid ${t.wasDue ? '#e11d48' : '#a1a1aa'};border-radius:10px;">
    <div style="font-size:14px;font-weight:600;color:#18181b;line-height:1.4;">${escapeHtml(t.title)}${t.high ? PRIORITY_CHIP('HIGH', '#fee2e2', '#b91c1c') : ''}</div>
    ${meta ? `<div style="margin-top:2px;font-size:12px;color:${t.wasDue ? '#be123c' : '#71717a'};">${meta}</div>` : ''}
  </div>`
}

function reminderRow(r: BriefingReminder): string {
  return `<div class="row" style="margin:0 0 6px;padding:9px 12px;border:1px solid #fde68a;border-left:3px solid #d97706;border-radius:10px;">
    <div style="font-size:14px;font-weight:600;color:#18181b;line-height:1.4;">${escapeHtml(r.title)}</div>
    <div style="margin-top:2px;font-size:12px;color:#92400e;">${escapeHtml(r.cadence)}</div>
  </div>`
}

function horizonRow(h: BriefingHorizon): string {
  const tag =
    h.kind === 'opportunity'
      ? PRIORITY_CHIP('APPLICATION', '#e0e7ff', '#4338ca')
      : h.kind === 'goal'
        ? PRIORITY_CHIP('GOAL', '#f3e8ff', '#7e22ce')
        : ''
  return `<div class="row" style="margin:0 0 6px;padding:9px 12px;border:1px solid #e4e4e7;border-left:3px solid #7c3aed;border-radius:10px;">
    <div style="font-size:14px;font-weight:600;color:#18181b;line-height:1.4;">${escapeHtml(h.title)}${tag}</div>
    <div style="margin-top:2px;font-size:12px;color:#71717a;">${escapeHtml(h.when)}</div>
  </div>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function briefingEmailHtml(b: Omit<Briefing, 'subject' | 'html' | 'text'>): string {
  const first = b.name.split(' ')[0] || 'there'
  const sections: string[] = []
  if (b.dueToday.length) sections.push(sectionHeader('Due today', b.dueToday.length, '#2563eb') + b.dueToday.map(taskRow).join(''))
  if (b.overdue.length) sections.push(sectionHeader('Overdue', b.overdue.length, '#e11d48') + b.overdue.map(taskRow).join(''))
  if (b.reminders.length) sections.push(sectionHeader('Reminders for today', b.reminders.length, '#d97706') + b.reminders.map(reminderRow).join(''))
  if (b.horizon.length) sections.push(sectionHeader('On the horizon', b.horizon.length, '#7c3aed') + b.horizon.map(horizonRow).join(''))
  if (b.agent.topMatches.length || b.agent.draftsAwaiting) {
    const rows = b.agent.topMatches
      .map(
        (m) =>
          `<div class="row" style="margin:0 0 6px;padding:9px 12px;border:1px solid #e4e4e7;border-left:3px solid #059669;border-radius:10px;">\n    <div style="font-size:14px;font-weight:600;color:#18181b;line-height:1.4;">${escapeHtml(m.role)} <span style="color:#71717a;">at ${escapeHtml(m.company)}</span>${PRIORITY_CHIP(`${m.score}% MATCH`, '#d1fae5', '#047857')}</div>\n  </div>`
      )
      .join('')
    const draftLine = b.agent.draftsAwaiting
      ? `<p style="margin:6px 0 0;font-size:12px;color:#92400e;">${b.agent.draftsAwaiting} application draft${b.agent.draftsAwaiting === 1 ? '' : 's'} waiting for your approval in the Apply Agent chat.</p>`
      : ''
    sections.push(
      sectionHeader('Apply Agent', b.agent.topMatches.length + (b.agent.draftsAwaiting ? 1 : 0), '#059669') +
        (rows || '<p style="margin:0 0 6px;font-size:13px;color:#71717a;">Your agent is ready when you are.</p>') +
        draftLine
    )
  }

  // Mobile: clients like iOS Mail / Gmail auto-inflate text on narrow
  // viewports (the "everything looks huge on my phone" effect) and the
  // desktop paddings waste half a 390px screen. Inline styles stay as the
  // fallback — the <style> block only refines them where supported.
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @media only screen and (max-width:620px) {
    .card { padding:20px 14px 16px !important; border-radius:12px !important; }
    .row { padding:8px 10px !important; border-radius:8px !important; }
    .title { font-size:18px !important; }
    .cta a { display:block !important; width:100% !important; box-sizing:border-box !important; text-align:center !important; }
    .foot { padding:0 8px !important; }
  }
</style>
</head>
<body style="margin:0;padding:20px 10px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;text-size-adjust:100%;">
  <div class="card" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px 28px 20px;border:1px solid #e4e4e7;">
    <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#18181b;">${SITE_NAME}</p>
    <h1 class="title" style="margin:0 0 4px;font-size:20px;color:#18181b;">Good morning, ${escapeHtml(first)}</h1>
    <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#71717a;">Your deadlines and reminders for today, in one pass.</p>
    ${sections.join('')}
    <div class="cta" style="margin:24px 0 4px;text-align:center;">
      <a href="${SITE_URL}/app" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:10px;">Open Cortex</a>
    </div>
  </div>
  <p class="foot" style="max-width:480px;margin:12px auto 0;font-size:11px;line-height:1.6;color:#a1a1aa;text-align:center;">
    Sent every morning while you have deadlines or reminders coming up.
    <a href="${SITE_URL}/app" style="color:#a1a1aa;">Manage your agenda</a>.<br>
    Questions? Just reply, or write to <a href="mailto:${SUPPORT_EMAIL}" style="color:#a1a1aa;">${SUPPORT_EMAIL}</a>.
  </p>
</body></html>`
}

export function briefingEmailText(b: Omit<Briefing, 'subject' | 'html' | 'text'>): string {
  const lines: string[] = [`${SITE_NAME} — good morning, ${b.name.split(' ')[0] || 'there'}`, '']
  if (b.dueToday.length) {
    lines.push(`Due today (${b.dueToday.length}):`)
    for (const t of b.dueToday) lines.push(`  • ${t.title}${t.when ? ` at ${t.when}` : ''}${t.wasDue ? ` (was due ${t.wasDue})` : ''}${t.plan ? ` — plan: ${t.plan}` : ''}`)
    lines.push('')
  }
  if (b.overdue.length) {
    lines.push(`Overdue (${b.overdue.length}):`)
    for (const t of b.overdue) lines.push(`  • ${t.title}${t.wasDue ? ` (was due ${t.wasDue})` : ''}`)
    lines.push('')
  }
  if (b.reminders.length) {
    lines.push(`Reminders for today (${b.reminders.length}):`)
    for (const r of b.reminders) lines.push(`  • ${r.title} (${r.cadence})`)
    lines.push('')
  }
  if (b.horizon.length) {
    lines.push(`On the horizon (${b.horizon.length}):`)
    for (const h of b.horizon) lines.push(`  • ${h.title} — ${h.when}`)
    lines.push('')
  }
  if (b.agent.topMatches.length || b.agent.draftsAwaiting) {
    if (b.agent.topMatches.length) {
      lines.push(`Top matches for you (${b.agent.topMatches.length}):`)
      for (const m of b.agent.topMatches) lines.push(`  • ${m.role} at ${m.company} — ${m.score}% match`)
      lines.push('')
    }
    if (b.agent.draftsAwaiting) {
      lines.push(`Apply Agent: ${b.agent.draftsAwaiting} application draft(s) waiting for your approval.`)
      lines.push('')
    }
  }
  lines.push(`Open Cortex: ${SITE_URL}/app`)
  lines.push(`Questions or need help? support@scrutinies.dev`)
  return lines.join('\n')
}

/** "Cortex · Sep 12: 2 due today, 1 overdue, 2 reminders" */
export function briefingSubject(b: Omit<Briefing, 'subject' | 'html' | 'text'>, now: Date, offsetMin: number): string {
  const parts: string[] = []
  if (b.counts.dueToday) parts.push(`${b.counts.dueToday} due today`)
  if (b.counts.overdue) parts.push(`${b.counts.overdue} overdue`)
  if (b.counts.reminders) parts.push(`${b.counts.reminders} reminder${b.counts.reminders === 1 ? '' : 's'}`)
  if (b.counts.horizon && parts.length < 3) parts.push(`${b.counts.horizon} this week`)
  return `${SITE_NAME} · ${fmtDayLocal(now, offsetMin)}: ${parts.slice(0, 3).join(', ')}`
}

// ── Data collection (dynamic db import — keeps this module unit-testable) ─

type CollectResult = {
  dueToday: BriefingTask[]
  overdue: BriefingTask[]
  reminders: BriefingReminder[]
  horizon: BriefingHorizon[]
  agent: BriefingAgent
}

async function toBriefingTask(
  t: { id: string; title: string; priority: string; dueDate: Date | null; plan?: { title: string } | null },
  offsetMin: number,
  mode: 'today' | 'overdue'
): Promise<BriefingTask> {
  const when = t.dueDate ? fmtTimeLocal(t.dueDate, offsetMin) : null
  return {
    id: t.id,
    title: t.title,
    high: t.priority === 'high',
    when: mode === 'today' ? when : null,
    wasDue: mode === 'overdue' && t.dueDate ? fmtDayLocal(t.dueDate, offsetMin) : null,
    plan: t.plan?.title ?? null,
  }
}

async function collectForUser(userId: string, offsetMin: number, now: Date): Promise<CollectResult> {
  const { db } = await import('./db')
  const { start: todayStart, end: todayEnd } = userDayWindow(offsetMin, now)
  const in3 = new Date(now.getTime() + 3 * DAY_MS)
  const in7 = new Date(now.getTime() + 7 * DAY_MS)
  const matchWindow = new Date(now.getTime() - 36 * 3_600_000)

  // Overdue mail window: due before today, but not older than the 2-day
  // lookback — older arrears are left out of the email entirely.
  const overdueFrom = overdueCutoffStart(todayStart)
  const [dueTodayRows, overdueRows, reminderRows, horizonTaskRows, opportunities, goals, matchRows, draftsAwaiting] = await Promise.all([
    db.task.findMany({
      where: { userId, status: { not: 'done' }, dueDate: { gte: todayStart, lte: todayEnd } },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      take: 20,
      include: { plan: { select: { title: true } } },
    }),
    db.task.findMany({
      where: { userId, status: { not: 'done' }, dueDate: { gte: overdueFrom, lt: todayStart } },
      orderBy: { dueDate: 'asc' },
      take: 15,
      include: { plan: { select: { title: true } } },
    }),
    db.reminder.findMany({ where: { userId }, orderBy: { startDate: 'asc' }, take: 200 }),
    db.task.findMany({
      where: { userId, status: { not: 'done' }, dueDate: { gt: todayEnd, lte: in3 } },
      orderBy: { dueDate: 'asc' },
      take: 10,
    }),
    db.opportunity.findMany({
      where: { userId, status: { in: ['saved', 'applied', 'interview'] }, deadline: { gte: todayStart, lte: in7 } },
      orderBy: { deadline: 'asc' },
      take: 6,
    }),
    db.goal.findMany({
      where: { userId, status: 'active', deadline: { gte: todayStart, lte: in7 } },
      orderBy: { deadline: 'asc' },
      take: 6,
    }),
    // Apply Agent: top matches from the last shortlist run (persisted — no
    // LLM work at email time), plus drafts waiting for approval
    db.jobListing.findMany({
      where: { userId, matchScore: { gte: 70 }, matchRunAt: { gte: matchWindow } },
      orderBy: { matchScore: 'desc' },
      take: 3,
      select: { id: true, company: true, role: true, matchScore: true },
    }),
    db.applicationDraft.count({ where: { userId, status: 'ready' } }),
  ])

  const dueToday: BriefingTask[] = []
  for (const t of dueTodayRows) dueToday.push(await toBriefingTask(t, offsetMin, 'today'))
  const overdue: BriefingTask[] = []
  for (const t of overdueRows) overdue.push(await toBriefingTask(t, offsetMin, 'overdue'))

  // reminders active on the user's local day — same rules as the plans page
  const label = localDayLabel(now, offsetMin)
  const reminders: BriefingReminder[] = reminderRows
    .filter((r) => reminderActiveOn(r, label))
    .slice(0, 20)
    .map((r) => ({ id: r.id, title: r.title, cadence: recurrenceLabel(r.recurrence, r.startDate) }))

  const horizon: BriefingHorizon[] = []
  for (const t of horizonTaskRows) {
    if (!t.dueDate) continue
    const daysLeft = Math.max(1, Math.ceil((t.dueDate.getTime() - now.getTime()) / DAY_MS))
    horizon.push({
      id: t.id,
      kind: 'task',
      title: t.title,
      daysLeft,
      when: fmtTimeLocal(t.dueDate, offsetMin) ? `${fmtDayLocal(t.dueDate, offsetMin)} · ${fmtTimeLocal(t.dueDate, offsetMin)}` : fmtInDays(daysLeft),
    })
  }
  for (const o of opportunities) {
    if (!o.deadline) continue
    const dl = new Date(o.deadline)
    horizon.push({
      id: o.id,
      kind: 'opportunity',
      title: `${o.company} — ${o.role}`,
      daysLeft: Math.ceil((dl.getTime() - now.getTime()) / DAY_MS),
      when: `${fmtDayLocal(dl, offsetMin)} · ${fmtInDays(Math.ceil((dl.getTime() - now.getTime()) / DAY_MS))}`,
    })
  }
  for (const g of goals) {
    if (!g.deadline) continue
    const dl = new Date(g.deadline)
    horizon.push({
      id: g.id,
      kind: 'goal',
      title: g.title,
      daysLeft: Math.ceil((dl.getTime() - now.getTime()) / DAY_MS),
      when: `${fmtDayLocal(dl, offsetMin)} · ${fmtInDays(Math.ceil((dl.getTime() - now.getTime()) / DAY_MS))}`,
    })
  }
  horizon.sort((a, b) => a.daysLeft - b.daysLeft)

  return {
    dueToday,
    overdue,
    reminders,
    horizon: horizon.slice(0, 10),
    agent: {
      topMatches: matchRows.map((m) => ({ id: m.id, company: m.company, role: m.role, score: m.matchScore ?? 0 })),
      draftsAwaiting,
    },
  }
}

// ── Public builders ──────────────────────────────────────────────────────

/**
 * Build one account's email — or null when there is nothing worth an email
 * today (no due tasks, no overdue, no active reminders, no upcoming).
 */
export async function buildBriefingForUser(
  user: { id: string; email: string; name: string },
  tzOffset: number | null | undefined,
  now: Date
): Promise<Briefing | null> {
  const offsetMin = Number.isFinite(tzOffset ?? NaN) ? (tzOffset as number) : 0
  const collected = await collectForUser(user.id, offsetMin, now)
  const base = {
    userId: user.id,
    to: user.email,
    name: user.name,
    counts: {
      dueToday: collected.dueToday.length,
      overdue: collected.overdue.length,
      reminders: collected.reminders.length,
      horizon: collected.horizon.length,
    },
    ...collected,
  }
  if (base.counts.dueToday + base.counts.overdue + base.counts.reminders + base.counts.horizon === 0) return null
  return {
    ...base,
    subject: briefingSubject(base, now, offsetMin),
    html: briefingEmailHtml(base),
    text: briefingEmailText(base),
  }
}

/**
 * Build briefings for every verified account (optionally just one email).
 * The daily cron delivers each account's digest once per calendar day — the
 * lastDigestSentAt marker is a safety net so repeated hits in the same day
 * (manual test runs included) cannot double-email anyone.
 * opts.force bypasses the marker for a single manual test run.
 * collectForUser swallows per-user failures — one broken account must not
 * block the rest of the run.
 */
export async function buildAllBriefings(
  now: Date,
  opts?: { email?: string; force?: boolean }
): Promise<{ briefings: Briefing[]; skipped: number; notDue: number; errors: string[] }> {
  const { db } = await import('./db')
  const users = await db.user.findMany({
    where: { emailVerified: true, ...(opts?.email ? { email: opts.email } : {}) },
    select: {
      id: true,
      email: true,
      name: true,
      setting: { select: { tzOffset: true, lastDigestSentAt: true } },
    },
    take: 500,
  })

  const briefings: Briefing[] = []
  const errors: string[] = []
  let skipped = 0
  let notDue = 0
  for (const u of users) {
    try {
      const alreadySent = digestAlreadySentToday(u.setting?.lastDigestSentAt, u.setting?.tzOffset ?? 0, now)
      if (alreadySent && opts?.force !== true) {
        notDue++
        continue
      }
      const b = await buildBriefingForUser(u, u.setting?.tzOffset ?? 0, now)
      if (b) briefings.push(b)
      else skipped++
    } catch (e) {
      errors.push(`${u.email}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { briefings, skipped, notDue, errors }
}

/**
 * Record that a digest was actually delivered — the marker
 * digestAlreadySentToday reads to hold back further sends on the same local
 * calendar day. Best-effort: a failed write at worst causes one duplicate
 * email on a repeated run, never a lost digest.
 */
export async function markDigestSent(userId: string, at: Date): Promise<void> {
  const { db } = await import('./db')
  await db.setting.updateMany({ where: { userId }, data: { lastDigestSentAt: at } })
}
