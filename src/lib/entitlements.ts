// ─── Entitlements: plan resolution + metered AI limits ─────────────────────
//
// The free/Pro split, in one file. Core planning and knowledge work (tasks,
// plans, kanban, pomodoro, reminders, goals, notes, feeds, briefings) is
// PERMANENTLY FREE and unlimited — only usage-metered cost drivers (AI calls,
// heavy generations) have free limits.
//
// Free limits (per the published pricing):
//   copilot  — 15 messages/day  (covers /api/copilot AND /api/chat doc Q&A)
//   summary  —  5 documents/month
//   cards    —  2 AI-generated flashcards/month
//   mindmap  —  2 AI-generated mind maps/month
// Pro: unlimited (still counted — the data doubles as cost analytics).
//
// Enforcement contract: routes call `guardUsage()` BEFORE doing expensive
// work. It returns { allowed, used, limit, isPro } and — when allowed —
// records the use. A 402 response shape is provided by `limitResponse()` so
// every metered route speaks the same dialect to the client:
//   { error: "<human message>", code: "limit_reached", feature, used, limit }
// The generic api client surfaces `error` in its thrown Error message, so the
// existing UI error paths show the upgrade hint without further wiring.

import { db } from '@/lib/db'

export type UsageFeature = 'copilot' | 'summary' | 'cards' | 'mindmap'

export interface PlanFields {
  plan: string
  planExpiresAt: Date | null
}

/** Pro = plan:'pro' and (no expiry recorded OR expiry in the future). */
export function isActivePro(user: Pick<PlanFields, 'plan' | 'planExpiresAt'>, now: Date = new Date()): boolean {
  if (user.plan !== 'pro') return false
  return !user.planExpiresAt || user.planExpiresAt.getTime() > now.getTime()
}

export const FREE_LIMITS: Record<UsageFeature, { limit: number; window: 'day' | 'month' }> = {
  copilot: { limit: 15, window: 'day' },
  summary: { limit: 5, window: 'month' },
  cards: { limit: 2, window: 'month' },
  mindmap: { limit: 2, window: 'month' },
}

/** Window start key for a feature: UTC midnight (day) or 1st of month (month). */
function windowStart(feature: UsageFeature, now: Date): Date {
  const d = new Date(now)
  d.setUTCHours(0, 0, 0, 0)
  if (FREE_LIMITS[feature].window === 'month') d.setUTCDate(1)
  return d
}

export interface UsageVerdict {
  allowed: boolean
  isPro: boolean
  used: number
  limit: number
}

/**
 * Count one use of a metered feature (Pro users are counted too — the
 * aggregate is our AI cost analytics). Increment happens only when `allowed`
 * was true on a prior `guardUsage` call; see guardUsage for the flow.
 */
async function recordUse(userId: string, feature: UsageFeature, now: Date): Promise<void> {
  const day = windowStart(feature, now)
  await db.dailyUsage.upsert({
    where: { userId_day_feature: { userId, day, feature } },
    create: { userId, feature, day, count: 1 },
    update: { count: { increment: 1 } },
  })
}

/**
 * Check + record one use of `feature`.
 *  - Pro  → allowed, recorded.
 *  - Free → allowed while the window count stays under the limit, recorded.
 *
 * Count-then-record is not atomic under perfectly parallel duplicate requests;
 * acceptable for a per-account limit (the unique (userId, day, feature) row
 * makes each counter consistent, and abuse is additionally bounded by auth).
 */
export async function guardUsage(userId: string, feature: UsageFeature, isPro: boolean): Promise<UsageVerdict> {
  const { limit } = FREE_LIMITS[feature]
  const day = windowStart(feature, new Date())
  const row = await db.dailyUsage.findUnique({
    where: { userId_day_feature: { userId, day, feature } },
    select: { count: true },
  })
  const used = row?.count ?? 0
  if (!isPro && used >= limit) return { allowed: false, isPro, used, limit }
  await recordUse(userId, feature, new Date())
  return { allowed: true, isPro, used: used + 1, limit }
}

/** Human, actionable message for a free-plan limit hit. */
export function limitMessage(feature: UsageFeature, limit: number): string {
  const { window } = FREE_LIMITS[feature]
  const span = window === 'day' ? 'today' : 'this month'
  const label =
    feature === 'copilot' ? 'Copilot messages' :
    feature === 'summary' ? 'AI summaries' :
    feature === 'cards' ? 'AI flashcards' : 'AI mind maps'
  return `Free plan: ${limit} ${label.toLowerCase()} ${span}. Upgrade to Pro on the Pricing page for unlimited use.`
}

/** Extra JSON body fields for a 402 limit response (see limitResponse usage in routes). */
export function usageFields(feature: UsageFeature, v: UsageVerdict) {
  return { code: 'limit_reached' as const, feature, used: v.used, limit: v.limit }
}
