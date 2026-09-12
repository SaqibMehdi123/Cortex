// ─── Plan date-span logic (shared client + server) ──────────────────
//
// A plan applies to a stretch of time. The database stores optional
// startDate / endDate; when either is missing the span is DERIVED from the
// plan's timeframe (day → 1 day, week → 7 days, month → its calendar month,
// quarter → 3 months, year → 12 months). A plan with no dates at all cannot
// be placed on any calendar — it stays an outline-only entry.
//
// Calendar arithmetic is done in UTC on purpose: the UI saves bare
// `YYYY-MM-DD` strings and the server turns them into `new Date("YYYY-MM-DD")`
// = UTC midnight. Extracting Y/M/D in UTC recovers exactly the calendar day
// the user picked, on every server and timezone.

export type SpanInput = {
  timeframe: string
  startDate: string | Date | null
  endDate: string | Date | null
}

export type PlanSpan = { start: Date; end: Date; derivedEnd: boolean }

const DAY_MS = 86_400_000

function ymdUTC(v: string | Date): { y: number; m: number; d: number } {
  const dt = typeof v === 'string' ? new Date(v) : v
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() }
}

// midnight (UTC) of the calendar day stored in the instant
function dayStartUTC(v: string | Date): Date {
  const { y, m, d } = ymdUTC(v)
  return new Date(Date.UTC(y, m, d))
}

// end of that calendar day (23:59:59.999 UTC)
function dayEndUTC(v: string | Date): Date {
  const s = dayStartUTC(v)
  return new Date(s.getTime() + DAY_MS - 1)
}

// If a plan has no explicit endDate, its timeframe decides how long it runs.
function deriveEnd(start: Date, timeframe: string): Date {
  const { y, m, d } = ymdUTC(start)
  switch (timeframe) {
    case 'day':
      return new Date(start.getTime() + DAY_MS - 1)
    case 'week':
      return new Date(start.getTime() + 7 * DAY_MS - 1)
    case 'month':
      // last day of the calendar month the plan starts in
      return new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999))
    case 'quarter':
      // quarter bucket of the start month, then 3 whole months
      return new Date(Date.UTC(y, Math.floor(m / 3) * 3 + 3, 0, 23, 59, 59, 999))
    case 'year':
      return new Date(Date.UTC(y + 1, m, d) - 1)
    default:
      return new Date(start.getTime() + DAY_MS - 1)
  }
}

/**
 * The plan's effective span. Returns null when the plan carries no dates at
 * all (it cannot be placed on a calendar), otherwise start-of-start-day
 * through end-of-end-day. An endDate without a startDate is treated as a
 * one-day plan on the endDate.
 */
export function planSpan(plan: SpanInput): PlanSpan | null {
  const hasStart = !!plan.startDate
  const hasEnd = !!plan.endDate
  if (!hasStart && !hasEnd) return null

  const start = hasStart ? dayStartUTC(plan.startDate!) : dayStartUTC(plan.endDate!)
  if (hasEnd) {
    const end = dayEndUTC(plan.endDate!)
    return { start, end: end.getTime() >= start.getTime() ? end : start, derivedEnd: false }
  }
  return { start, end: deriveEnd(start, plan.timeframe), derivedEnd: true }
}

/** local `YYYY-MM-DD` for a Date — the same convention as todayISO() */
export function isoOf(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Is the plan "on" for the given calendar day (local `YYYY-MM-DD`)? True when
 * the plan's span overlaps that day — so a day-plan shows only on its day,
 * while week/month/quarter/year plans show on every day they cover.
 */
export function planActiveOnDay(plan: SpanInput, isoDay: string): boolean {
  const span = planSpan(plan)
  if (!span) return false
  const [y, m, d] = isoDay.split('-').map((v) => Number.parseInt(v, 10))
  const dayStart = new Date(Date.UTC(y, (m || 1) - 1, d || 1))
  const dayEnd = new Date(dayStart.getTime() + DAY_MS - 1)
  return span.start.getTime() <= dayEnd.getTime() && span.end.getTime() >= dayStart.getTime()
}

/** "Sep 8" / "Sep 8 → Sep 14" for chips — UTC dates on purpose (see header). */
export function formatSpan(plan: SpanInput): string {
  const span = planSpan(plan)
  if (!span) return ''
  const fmt = (dt: Date) =>
    dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const start = fmt(span.start)
  const end = fmt(span.end)
  return start === end ? start : `${start} → ${end}`
}

/** does this dueDate instant carry a meaningful time-of-day (local clock)? */
export function hasTimePart(iso: string | null | undefined): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  return d.getHours() !== 0 || d.getMinutes() !== 0
}
