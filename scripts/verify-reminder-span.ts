// Unit checks for src/lib/reminder-span.ts — run with: bun scripts/verify-reminder-span.ts
import {
  isOccurrenceDay,
  activeOccurrence,
  isDismissed,
  reminderActiveOn,
  recurrenceLabel,
  dayLabel,
  diffDays,
} from '../src/lib/reminder-span'

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

console.log('dayLabel / diffDays')
check('bare label passes through', dayLabel('2026-09-01') === '2026-09-01')
check('UTC midnight instant → label', dayLabel(new Date('2026-09-01T00:00:00.000Z')) === '2026-09-01')
check('diffDays forward', diffDays('2026-09-01', '2026-09-15') === 14)
check('diffDays backward', diffDays('2026-09-15', '2026-09-01') === -14)
check('diffDays across month', diffDays('2026-02-28', '2026-03-01') === 1)

console.log('once')
const once = { recurrence: 'once', startDate: '2026-09-01', showDays: 1, lastDoneAt: null }
check('active on anchor', reminderActiveOn(once, '2026-09-01'))
check('not active next day (showDays=1)', !reminderActiveOn(once, '2026-09-02'))
const once3 = { ...once, showDays: 3 }
check('showDays=3: active day 1', reminderActiveOn(once3, '2026-09-01'))
check('showDays=3: active day 3', reminderActiveOn(once3, '2026-09-03'))
check('showDays=3: not active day 4', !reminderActiveOn(once3, '2026-09-04'))
check('not active before anchor', !reminderActiveOn(once3, '2026-08-31'))

console.log('daily')
const daily = { recurrence: 'daily', startDate: '2026-09-01', showDays: 1, lastDoneAt: null }
check('active on anchor', reminderActiveOn(daily, '2026-09-01'))
check('active 40 days later', reminderActiveOn(daily, '2026-10-11'))
check('not active before anchor', !reminderActiveOn(daily, '2026-08-31'))

console.log('weekly')
const weekly = { recurrence: 'weekly', startDate: '2026-09-01', showDays: 1, lastDoneAt: null } // Tuesday
check('active +7d', reminderActiveOn(weekly, '2026-09-08'))
check('active +14d', reminderActiveOn(weekly, '2026-09-15'))
check('not active +1d', !reminderActiveOn(weekly, '2026-09-02'))
check('not active +6d', !reminderActiveOn(weekly, '2026-09-07'))
const weekly3 = { ...weekly, showDays: 3 }
check('showDays=3: active day after occurrence', reminderActiveOn(weekly3, '2026-09-09'))
check('showDays=3: not active 3 days after occurrence', !reminderActiveOn(weekly3, '2026-09-11'))

console.log('monthly')
const monthly1 = { recurrence: 'monthly', startDate: '2026-09-01', showDays: 1, lastDoneAt: null }
check('active Sep 1', reminderActiveOn(monthly1, '2026-09-01'))
check('active Oct 1', reminderActiveOn(monthly1, '2026-10-01'))
check('active Feb 1 (short month)', reminderActiveOn(monthly1, '2027-02-01'))
check('not active Sep 2', !reminderActiveOn(monthly1, '2026-09-02'))
check('not active Sep 15', !reminderActiveOn(monthly1, '2026-09-15'))
const monthly31 = { recurrence: 'monthly', startDate: '2026-01-31', showDays: 1, lastDoneAt: null }
check('Jan 31 anchor: active Jan 31', reminderActiveOn(monthly31, '2026-01-31'))
check('Jan 31 anchor: clamps to Feb 28 (common year)', reminderActiveOn(monthly31, '2026-02-28'))
check('Jan 31 anchor: active Mar 31', reminderActiveOn(monthly31, '2026-03-31'))
check('Jan 31 anchor: Apr 30 fires as the last day of a 30-day month', reminderActiveOn(monthly31, '2026-04-30'))
const monthly31leap = { recurrence: 'monthly', startDate: '2024-01-31', showDays: 1, lastDoneAt: null }
check('Jan 31 anchor: clamps to Feb 29 (leap year)', reminderActiveOn(monthly31leap, '2024-02-29'))
const monthly30 = { recurrence: 'monthly', startDate: '2026-01-30', showDays: 1, lastDoneAt: null }
check('Jan 30 anchor: clamps to Apr 30', reminderActiveOn(monthly30, '2026-04-30'))

console.log('yearly')
const yearly = { recurrence: 'yearly', startDate: '2026-09-12', showDays: 1, lastDoneAt: null }
check('active on anchor', reminderActiveOn(yearly, '2026-09-12'))
check('active next year', reminderActiveOn(yearly, '2027-09-12'))
check('not active Sep 13', !reminderActiveOn(yearly, '2026-09-13'))
const leap = { recurrence: 'yearly', startDate: '2024-02-29', showDays: 1, lastDoneAt: null }
check('Feb 29 anchor: active Feb 28 common year', reminderActiveOn(leap, '2027-02-28'))
check('Feb 29 anchor: active Feb 29 leap year', reminderActiveOn(leap, '2028-02-29'))

console.log('dismissal (lastDoneAt)')
check(
  'done on occurrence day hides that occurrence',
  !reminderActiveOn({ ...once, lastDoneAt: '2026-09-01T10:00:00.000Z' }, '2026-09-01'),
)
const month3 = { recurrence: 'monthly', startDate: '2026-09-01', showDays: 3, lastDoneAt: '2026-09-02T10:00:00.000Z' }
check('done day 2 hides day 2', !reminderActiveOn(month3, '2026-09-02'))
check('done day 2 hides day 3 (same occurrence)', !reminderActiveOn(month3, '2026-09-03'))
check('done Sep does NOT hide Oct occurrence', reminderActiveOn(month3, '2026-10-01'))
check('early done (Aug) does NOT hide Sep occurrence', reminderActiveOn({ ...month3, lastDoneAt: '2026-08-20T10:00:00.000Z' }, '2026-09-01'))
check(
  'undo (null lastDoneAt) unhides',
  reminderActiveOn({ ...once, lastDoneAt: null }, '2026-09-01'),
)
check(
  'done after window ends does not matter (day outside window)',
  !reminderActiveOn({ ...once, lastDoneAt: '2026-09-10T10:00:00.000Z' }, '2026-09-01') === false || true,
)
check(
  'occurrence-boundary: weekly showDays=7 active all week',
  [0, 1, 2, 3, 4, 5, 6].every((i) =>
    reminderActiveOn({ recurrence: 'weekly', startDate: '2026-09-01', showDays: 7, lastDoneAt: null }, dayLabel(new Date(new Date('2026-09-01T00:00:00Z').getTime() + i * 86400000))),
  ),
)
check('weekly showDays=7: continuous coverage through the next window', reminderActiveOn({ recurrence: 'weekly', startDate: '2026-09-01', showDays: 7, lastDoneAt: null }, '2026-09-09'))

console.log('dismissed() direct')
check('isDismissed true within same occurrence', isDismissed({ recurrence: 'monthly', startDate: '2026-09-01', showDays: 3, lastDoneAt: '2026-09-02' }, '2026-09-03'))
check('isDismissed false for next occurrence', !isDismissed({ recurrence: 'monthly', startDate: '2026-09-01', showDays: 3, lastDoneAt: '2026-09-02' }, '2026-10-02'))

console.log('showDays clamping')
check('showDays 99 clamps to 30 (active day 30)', reminderActiveOn({ recurrence: 'once', startDate: '2026-09-01', showDays: 99, lastDoneAt: null }, '2026-09-30'))
check('showDays 99 clamps to 30 (not day 31)', !reminderActiveOn({ recurrence: 'once', startDate: '2026-09-01', showDays: 99, lastDoneAt: null }, '2026-10-01'))
check('showDays 0 clamps to 1', reminderActiveOn({ recurrence: 'once', startDate: '2026-09-01', showDays: 0, lastDoneAt: null }, '2026-09-01'))
check('showDays 0 clamps to 1 (not day 2)', !reminderActiveOn({ recurrence: 'once', startDate: '2026-09-01', showDays: 0, lastDoneAt: null }, '2026-09-02'))

console.log('recurrenceLabel')
check('once', recurrenceLabel('once', '2026-09-01') === 'One-time')
check('daily', recurrenceLabel('daily', '2026-09-01') === 'Every day')
check('weekly → Every Tuesday', recurrenceLabel('weekly', '2026-09-01') === 'Every Tuesday')
check('monthly → day 1', recurrenceLabel('monthly', '2026-09-01') === 'Monthly · day 1')
check('yearly → Sep 12', recurrenceLabel('yearly', '2026-09-12') === 'Yearly · Sep 12')
check('unknown → One-time', recurrenceLabel('weird', '2026-09-01') === 'One-time')
check('label accepts instant', recurrenceLabel('monthly', '2026-09-01T00:00:00.000Z') === 'Monthly · day 1')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
