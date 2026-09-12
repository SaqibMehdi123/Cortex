// Unit checks for src/lib/plan-span.ts — run with: bun run scripts/verify-plan-span.ts
// All arithmetic mirrors the production rule: plan dates are bare YYYY-MM-DD
// stored as UTC midnights; spans are calendar-day math in UTC.
import { planSpan, planActiveOnDay, formatSpan, hasTimePart } from '../src/lib/plan-span'

let pass = 0
let fail = 0
function check(name: string, cond: boolean) {
  if (cond) {
    pass++
    console.log(`  ok  ${name}`)
  } else {
    fail++
    console.error(`FAIL  ${name}`)
  }
}

// ── derived spans ────────────────────────────────────────────────────
const dayPlan = { timeframe: 'day', startDate: '2026-09-12', endDate: null }
const daySpan = planSpan(dayPlan)!
check('day plan spans exactly its date', daySpan.start.getTime() === Date.UTC(2026, 8, 12) && daySpan.end.getTime() === Date.UTC(2026, 8, 12) + 86_400_000 - 1)

const weekPlan = { timeframe: 'week', startDate: '2026-09-07', endDate: null }
const weekSpan = planSpan(weekPlan)!
check('week plan spans 7 days', weekSpan.end.getTime() === Date.UTC(2026, 8, 13, 23, 59, 59, 999))

const monthPlan = { timeframe: 'month', startDate: '2026-09-01', endDate: null }
const monthSpan = planSpan(monthPlan)!
check('month plan ends on the last day of September', monthSpan.end.getTime() === Date.UTC(2026, 8, 30, 23, 59, 59, 999))

const quarterPlan = { timeframe: 'quarter', startDate: '2026-07-01', endDate: null }
const quarterSpan = planSpan(quarterPlan)!
check('Q3 plan (Jul start) ends Sep 30', quarterSpan.end.getTime() === Date.UTC(2026, 8, 30, 23, 59, 59, 999))

const yearPlan = { timeframe: 'year', startDate: '2026-01-01', endDate: null }
const yearSpan = planSpan(yearPlan)!
check('year plan ends Dec 31', yearSpan.end.getTime() === Date.UTC(2026, 11, 31, 23, 59, 59, 999))

// ── explicit end date (deadline) wins ───────────────────────────────
const custom = { timeframe: 'week', startDate: '2026-09-01', endDate: '2026-09-20' }
const customSpan = planSpan(custom)!
check('explicit end date overrides derived span', customSpan.end.getTime() === Date.UTC(2026, 8, 20, 23, 59, 59, 999))
check('explicit end is not marked derived', customSpan.derivedEnd === false)

// ── undated plans ────────────────────────────────────────────────────
check('undated plan has no span', planSpan({ timeframe: 'day', startDate: null, endDate: null }) === null)
check('undated plan is active on no day', planActiveOnDay({ timeframe: 'day', startDate: null, endDate: null }, '2026-09-12') === false)

// ── active-on-day visibility rule ────────────────────────────────────
check('day plan visible on its own day', planActiveOnDay(dayPlan, '2026-09-12') === true)
check('day plan invisible the next day', planActiveOnDay(dayPlan, '2026-09-13') === false)
check('day plan invisible the day before', planActiveOnDay(dayPlan, '2026-09-11') === false)

check('week plan visible on its last day', planActiveOnDay(weekPlan, '2026-09-13') === true)
check('week plan visible mid-week', planActiveOnDay(weekPlan, '2026-09-10') === true)
check('week plan invisible after it ends', planActiveOnDay(weekPlan, '2026-09-14') === false)

check('month plan visible late in the month', planActiveOnDay(monthPlan, '2026-09-29') === true)
check('month plan invisible next month', planActiveOnDay(monthPlan, '2026-10-01') === false)

check('quarter plan visible in Sep', planActiveOnDay(quarterPlan, '2026-09-15') === true)
check('quarter plan invisible in Oct', planActiveOnDay(quarterPlan, '2026-10-01') === false)

check('year plan visible in Dec', planActiveOnDay(yearPlan, '2026-12-31') === true)
check('year plan invisible next year', planActiveOnDay(yearPlan, '2027-01-01') === false)

check('custom deadline plan visible on its deadline', planActiveOnDay(custom, '2026-09-20') === true)
check('custom deadline plan invisible after deadline', planActiveOnDay(custom, '2026-09-21') === false)

// end date without start date → one-day plan on that date
const endOnly = { timeframe: 'day', startDate: null, endDate: '2026-09-12' }
check('end-only plan anchored on the end date', planActiveOnDay(endOnly, '2026-09-12') === true && planActiveOnDay(endOnly, '2026-09-13') === false)

// ── formatting ───────────────────────────────────────────────────────
check('single-day span formats as one date', formatSpan(dayPlan) === 'Sep 12')
check('multi-day span formats as range', formatSpan(weekPlan) === 'Sep 7 → Sep 13')
check('undated plan formats as empty', formatSpan({ timeframe: 'day', startDate: null, endDate: null }) === '')

// ── hasTimePart ──────────────────────────────────────────────────────
check('midnight instant = date only', hasTimePart('2026-09-12T00:00:00.000Z') === false)
check('09:00 instant carries time', hasTimePart(new Date(new Date().getTimezoneOffset() >= 0 ? '2026-09-12T09:00:00' : '2026-09-12T09:00:00').toISOString()) === true)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
