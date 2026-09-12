// ─── Reminder recurrence + day-visibility logic (shared client + server) ──
//
// A reminder is anchored to ONE calendar day (startDate, stored UTC-midnight
// like plan dates) and repeats on a cadence (once / daily / weekly / monthly
// / yearly). Each occurrence stays visible for `showDays` consecutive days
// starting on the occurrence day itself — "rent on the 1st of every month,
// visible 3 days" = monthly, day-1 anchor, showDays 3.
//
// A reminder is ACTIVE on a calendar day when some occurrence O satisfies
// O ≤ day < O + showDays, and the current occurrence hasn't been completed:
// completion is recorded as lastDoneAt and hides only the occurrence it
// belongs to (marking a monthly reminder done in September must not hide
// October). `daily` is special-cased: every day from the anchor onward is an
// occurrence, so it shows every day regardless of showDays.
//
// All arithmetic uses UTC calendar labels (YYYY-MM-DD) on purpose — the same
// convention as plan-span: the UI saves bare dates, the server stores them as
// UTC midnight, and label math is immune to timezone drift.

export const RECURRENCES = ['once', 'daily', 'weekly', 'monthly', 'yearly'] as const
export type Recurrence = (typeof RECURRENCES)[number]

const DAY_MS = 86_400_000

export type ReminderInput = {
  recurrence: string
  startDate: string | Date
  showDays: number
  lastDoneAt?: string | Date | null
}

// any date-ish (bare label, ISO instant, Date) → its UTC calendar-day label
export function dayLabel(v: string | Date): string {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const d = typeof v === 'string' ? new Date(v) : v
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// UTC midnight of a calendar-day label
function parseDay(label: string): Date {
  const [y, m, d] = label.split('-').map((v) => Number.parseInt(v, 10))
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1))
}

// whole days from label a to label b (b - a)
export function diffDays(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / DAY_MS)
}

function daysInMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate()
}

/** Is `day` itself an occurrence day of the cadence anchored at `anchor`? */
export function isOccurrenceDay(anchor: string, recurrence: string, day: string): boolean {
  if (day < anchor) return false
  const [ay, am, ad] = anchor.split('-').map((v) => Number.parseInt(v, 10))
  const [dy, dm, dd] = day.split('-').map((v) => Number.parseInt(v, 10))
  switch (recurrence) {
    case 'once':
      return day === anchor
    case 'daily':
      return true
    case 'weekly':
      return diffDays(anchor, day) % 7 === 0
    case 'monthly': {
      if (dd !== ad) {
        // month-end clamp: an anchor on the 29th/30th/31st still fires on the
        // last real day of shorter months (Jan 31 → Feb 28/29, Apr 30)
        const dim = daysInMonth(dy, dm - 1)
        if (!(ad > dim && dd === dim)) return false
      }
      return true
    }
    case 'yearly': {
      if (dm !== am || dd !== ad) {
        // Feb-29 anchor fires on Feb 28 in common years
        const dim = daysInMonth(dy, dm - 1)
        if (!(am === 2 && ad === 29 && dm === 2 && dd === 28 && dim === 28)) return false
      }
      return true
    }
    default:
      return day === anchor
  }
}

/**
 * The occurrence this day belongs to — the latest occurrence O with
 * O ≤ day < O + showDays — or null when the day falls outside every window.
 */
export function activeOccurrence(r: ReminderInput, day: string): string | null {
  const anchor = dayLabel(r.startDate)
  const showDays = Math.max(1, Math.min(30, Math.floor(r.showDays) || 1))
  if (r.recurrence === 'daily') return day >= anchor ? day : null
  for (let back = 0; back < showDays; back++) {
    const cand = dayLabel(new Date(parseDay(day).getTime() - back * DAY_MS))
    if (cand < anchor) break
    if (isOccurrenceDay(anchor, r.recurrence, cand)) return cand
  }
  return null
}

/** completion hides only the occurrence it belongs to */
export function isDismissed(r: ReminderInput, day: string): boolean {
  if (!r.lastDoneAt) return false
  const doneDay = dayLabel(r.lastDoneAt)
  const occ = activeOccurrence(r, day)
  return occ !== null && doneDay >= occ
}

/** Should this reminder be shown on the given calendar day (local label)? */
export function reminderActiveOn(r: ReminderInput, day: string): boolean {
  return activeOccurrence(r, day) !== null && !isDismissed(r, day)
}

/** human chip for the cadence, e.g. "Monthly · day 1" / "Every Monday" */
export function recurrenceLabel(recurrence: string, anchor: string | Date): string {
  const a = dayLabel(anchor)
  const [y, m, d] = a.split('-').map((v) => Number.parseInt(v, 10))
  switch (recurrence) {
    case 'daily':
      return 'Every day'
    case 'weekly': {
      const wd = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
      return `Every ${wd}`
    }
    case 'monthly':
      return `Monthly · day ${d}`
    case 'yearly':
      return `Yearly · ${new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
    default:
      return 'One-time'
  }
}
