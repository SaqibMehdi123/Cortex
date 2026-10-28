// Unit checks for the Plans week-pager redesign + landing-day rule and the
// TimePicker mount-seed fix. Run with: bun scripts/verify-week-nav.ts
//
// The date maths replicates plans.tsx (week memo + shiftWeek) with a fixed
// "today" so the assertions are deterministic; source regexes confirm the
// component files actually carry the changes.

import { readFileSync } from 'node:fs'

let pass = 0
let fail = 0
function check(name: string, cond: boolean) {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.error(`  ✗ ${name}`)
  }
}

// ── same formulas as plans.tsx ───────────────────────────────────────────
const NOON = 'T12:00:00' // noon anchor — immune to DST day clipping

function weekOf(now: Date, weekOffset: number): Date[] {
  const day = (now.getDay() + 6) % 7 // Monday=0
  const monday = new Date(now)
  monday.setDate(now.getDate() - day + weekOffset * 7)
  return Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function shiftAnchor(week: Date[], dir: number): Date {
  const monday = new Date(week[0])
  monday.setDate(monday.getDate() + dir * 7)
  const anchor = new Date(monday)
  if (dir < 0) anchor.setDate(anchor.getDate() + 6) // Sunday = last day
  return anchor
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const relativeWeekLabel = (weekOffset: number) =>
  weekOffset === 0 ? 'This week'
  : weekOffset === -1 ? 'Last week'
  : weekOffset < 0 ? `${-weekOffset} weeks ago`
  : weekOffset === 1 ? 'Next week'
  : `In ${weekOffset} weeks`

// Today = Wednesday 2026-10-28 (the user's reported scenario)
const today = new Date(`2026-10-28${NOON}`)
const currentWeek = weekOf(today, 0)

console.log('week memo — Monday-start weeks')
check('week[0] of the current week is Monday 2026-10-26', iso(currentWeek[0]) === '2026-10-26')
check('week[6] of the current week is Sunday 2026-11-01', iso(currentWeek[6]) === '2026-11-01')

console.log('shiftWeek landing rule — back lands on the target week’s LAST day (Sunday)')
const prevWeek = weekOf(today, -1)
check('previous week spans Mon Oct 19 – Sun Oct 25', iso(prevWeek[0]) === '2026-10-19' && iso(prevWeek[6]) === '2026-10-25')
check('BACK from Wednesday → Sunday Oct 25 (last day of previous week), NOT Wednesday Oct 21', iso(shiftAnchor(currentWeek, -1)) === '2026-10-25')
check('BACK twice → Sunday Oct 18', iso(shiftAnchor(weekOf(today, -1), -1)) === '2026-10-18')
check('FORWARD → Monday Nov 2 (first day of next week)', iso(shiftAnchor(currentWeek, 1)) === '2026-11-02')
check('BACK anchor is always a Sunday', shiftAnchor(currentWeek, -1).getDay() === 0)
check('FORWARD anchor is always a Monday', shiftAnchor(currentWeek, 1).getDay() === 1)
// from a Monday-start the rule still holds
const mondayUser = new Date(`2026-10-26${NOON}`)
check('BACK from Monday Oct 26 → Sunday Oct 25', iso(shiftAnchor(weekOf(mondayUser, 0), -1)) === '2026-10-25')

console.log('relative week tag')
check('0 → This week', relativeWeekLabel(0) === 'This week')
check('-1 → Last week', relativeWeekLabel(-1) === 'Last week')
check('-2 → 2 weeks ago', relativeWeekLabel(-2) === '2 weeks ago')
check('-4 → 4 weeks ago', relativeWeekLabel(-4) === '4 weeks ago')
check('1 → Next week', relativeWeekLabel(1) === 'Next week')
check('2 → In 2 weeks', relativeWeekLabel(2) === 'In 2 weeks')

console.log('component source — changes actually wired in')
const plansSrc = readFileSync(new URL('../src/components/views/plans.tsx', import.meta.url), 'utf8')
check('shiftWeek anchors on the current week’s Monday', plansSrc.includes('const monday = new Date(week[0])'))
check('shiftWeek adds 6 days for BACK (Sunday)', plansSrc.includes('anchor.setDate(anchor.getDate() + 6)'))
check('old weekday-carry navigation is gone', !plansSrc.includes('d.setDate(d.getDate() + dir * 7)'))
check('relative tag rendered in the pager', plansSrc.includes('{relativeWeekLabel}'))
check('center block snaps back to today when away', plansSrc.includes('disabled={!awayFromToday}') && plansSrc.includes('onClick={goToday}'))
check('Today affordance lives inside the pager bar', plansSrc.includes('<FaSun className="h-3 w-3" aria-hidden /> Today'))
check('old floating Today chip is gone', !plansSrc.includes("className=\"h-8 gap-1.5 px-2.5 text-xs\""))

const pickerSrc = readFileSync(new URL('../src/components/ui/time-picker.tsx', import.meta.url), 'utf8')
check('dial state seeds from the saved value at mount (hour)', pickerSrc.includes('() => parseValue(value)?.h12 ?? null'))
check('dial state seeds from the saved value at mount (ampm)', pickerSrc.includes("() => parseValue(value)?.ampm ?? 'AM'"))
check('dial state seeds from the saved value at mount (minute)', pickerSrc.includes('() => parseValue(value)?.min ?? null'))
check('post-mount external sync still present', pickerSrc.includes('if (value !== lastValue)'))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
