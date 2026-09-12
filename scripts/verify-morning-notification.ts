// Unit checks for src/lib/morning-briefing.ts — run with: bun scripts/verify-morning-notification.ts
//
// Everything exercised here is pure (no DB): day-window maths, wall-clock
// formatting, the cron auth matrix and the email template. The live
// end-to-end check (DB + real send) runs on production via
//   curl "https://cortex-sync.vercel.app/api/cron/morning?key=$CRON_SECRET&dryRun=1"

import {
  localDayLabel,
  userDayWindow,
  fmtTimeLocal,
  fmtDayLocal,
  fmtInDays,
  authorizeMorningCron,
  briefingEmailHtml,
  briefingEmailText,
  briefingSubject,
  type Briefing,
} from '../src/lib/morning-briefing'

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

console.log('localDayLabel — user wall clock, not server UTC')
// 2026-09-11 20:00 UTC == 2026-09-12 01:00 PKT (getTimezoneOffset -300)
check('PKT early-morning rolls to the next day', localDayLabel(new Date('2026-09-11T20:00:00Z'), -300) === '2026-09-12')
check('UTC stays put', localDayLabel(new Date('2026-09-11T20:00:00Z'), 0) === '2026-09-11')
check('US-east late evening rolls back a day', localDayLabel(new Date('2026-09-12T03:00:00Z'), 240) === '2026-09-11')
check('non-finite offset falls back to UTC', localDayLabel(new Date('2026-09-11T20:00:00Z'), NaN) === '2026-09-11')

console.log('userDayWindow — [local midnight, next local midnight)')
const w = userDayWindow(-300, new Date('2026-09-11T20:00:00Z'))
check('window start == 2026-09-11 19:00Z (PKT midnight)', w.start.toISOString() === '2026-09-11T19:00:00.000Z')
check('window end is start + 24h - 1ms', w.end.getTime() - w.start.getTime() === 86_400_000 - 1)
check('a 19:30Z task lands inside the PKT day', new Date('2026-09-11T19:30:00Z') >= w.start && new Date('2026-09-11T19:30:00Z') <= w.end)
check('an 18:59Z task falls outside (still Sep 11 PKT)', new Date('2026-09-11T18:59:00Z') < w.start)

console.log('fmtTimeLocal / fmtDayLocal / fmtInDays')
check('09:30Z on PKT wall clock is 2:30 PM', fmtTimeLocal(new Date('2026-09-12T09:30:00Z'), -300) === '2:30 PM')
check('bare-date midnight renders as all-day (null)', fmtTimeLocal(new Date('2026-09-12T00:00:00Z'), 0) === null)
check('12:05 AM edge', fmtTimeLocal(new Date('2026-09-12T19:05:00Z'), -300) === '12:05 AM')
check('noon edge', fmtTimeLocal(new Date('2026-09-12T06:59:00Z'), -300) === '11:59 AM')
check('day label uses the user calendar', fmtDayLocal(new Date('2026-09-11T20:00:00Z'), -300) === 'Sep 12')
check('fmtInDays 0', fmtInDays(0) === 'today')
check('fmtInDays 1', fmtInDays(1) === 'tomorrow')
check('fmtInDays 3', fmtInDays(3) === 'in 3 days')

console.log('authorizeMorningCron — auth matrix')
check('correct bearer accepted', authorizeMorningCron({ authHeader: 'Bearer s3cret', vercelCronHeader: null, keyParam: null, secret: 's3cret', isProd: true }).ok)
check('correct ?key= accepted', authorizeMorningCron({ authHeader: null, vercelCronHeader: null, keyParam: 's3cret', secret: 's3cret', isProd: true }).ok)
check('wrong bearer rejected', authorizeMorningCron({ authHeader: 'Bearer nope', vercelCronHeader: '1', keyParam: null, secret: 's3cret', isProd: true }).ok === false)
check('header fallback does NOT pass when a secret is configured', authorizeMorningCron({ authHeader: null, vercelCronHeader: '1', keyParam: null, secret: 's3cret', isProd: true }).status === 401)
check('no secret + prod + vercel header → fallback allowed', authorizeMorningCron({ authHeader: null, vercelCronHeader: '1', keyParam: null, secret: null, isProd: true }).ok)
check('no secret + prod + anonymous → rejected', authorizeMorningCron({ authHeader: null, vercelCronHeader: null, keyParam: null, secret: null, isProd: true }).ok === false)
check('no secret + dev → allowed', authorizeMorningCron({ authHeader: null, vercelCronHeader: null, keyParam: null, secret: null, isProd: false }).ok)

console.log('email template — sections, escaping, subject')
const synthetic = {
  to: 'you@example.com',
  name: 'Ali Khan',
  counts: { dueToday: 2, overdue: 1, reminders: 1, horizon: 2 },
  dueToday: [
    { id: 't1', title: 'Rent payment <script>alert(1)</script>', high: true, when: '2:30 PM', wasDue: null, plan: 'Deep Work' },
    { id: 't2', title: 'All-day errand', high: false, when: null, wasDue: null, plan: null },
  ],
  overdue: [{ id: 't3', title: 'Late report', high: false, when: null, wasDue: 'Sep 10', plan: null }],
  reminders: [{ id: 'r1', title: 'Pay internet bill', cadence: 'Monthly · day 1' }],
  horizon: [
    { id: 'h1', kind: 'opportunity' as const, title: 'Google — SWE', when: 'Sep 15 · in 3 days', daysLeft: 3 },
    { id: 'h2', kind: 'goal' as const, title: 'Finish thesis', when: 'tomorrow', daysLeft: 1 },
  ],
}
const now = new Date('2026-09-12T04:00:00Z')
const b: Briefing = {
  ...synthetic,
  subject: briefingSubject(synthetic, now, -300),
  html: '',
  text: '',
}
b.html = briefingEmailHtml(b)
b.text = briefingEmailText(b)

check('subject carries counts + local date', /Cortex · Sep 12: 2 due today, 1 overdue, 1 reminder/.test(b.subject))
check('html greets by first name', b.html.includes('Good morning, Ali'))
check('all four sections render', ['Due today · 2', 'Overdue · 1', 'Reminders for today · 1', 'On the horizon · 2'].every((s) => b.html.includes(s)))
check('task titles are HTML-escaped', b.html.includes('&lt;script&gt;') && !b.html.includes('<script>alert'))
check('due-today row shows clock time + plan', b.html.includes('2:30 PM') && b.html.includes('Plan · Deep Work'))
check('HIGH chip only on the high-priority row', b.html.includes('>HIGH<'))
check('overdue row shows "was due Sep 10"', b.html.includes('was due Sep 10'))
check('reminder row carries the cadence chip', b.html.includes('Monthly · day 1'))
check('horizon row tags applications', b.html.includes('APPLICATION'))
check('plain text lists every row', b.text.includes('• Rent payment <script>alert(1)</script> at 2:30 PM') && b.text.includes('• Pay internet bill (Monthly · day 1)') && b.text.includes('• Google — SWE — Sep 15 · in 3 days'))
check('open-cortex CTA present', b.html.includes('https://cortex-sync.vercel.app/app'))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
