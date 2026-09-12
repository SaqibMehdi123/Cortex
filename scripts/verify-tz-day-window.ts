// Verify the tzOffset day-window formula used by GET /api/tasks.
// Karachi (UTC+5): getTimezoneOffset() = -300. A task due 02:00 PKT on
// Sep 12 = 21:00Z Sep 11 — it MUST fall inside the Sep-12 window for its
// owner, while a server-UTC window would have missed it.

function windowFor(date: string, offsetMin: number): { start: Date; end: Date } {
  const [y, m, d] = date.split('-').map((v) => Number.parseInt(v, 10))
  const start = new Date(Date.UTC(y, (m || 1) - 1, d || 1) + offsetMin * 60_000)
  return { start, end: new Date(start.getTime() + 86_400_000 - 1) }
}

let passed = 0
const total = 4
function check(name: string, ok: boolean) {
  console.log(`  ${ok ? '✓' : '✗'} ${name}`)
  if (ok) passed++
}

// Task due 2026-09-11T21:00:00Z (= 02:00 PKT Sep 12)
const task = new Date('2026-09-11T21:00:00Z').getTime()

// Karachi (-300): Sep 12 window = 19:00Z Sep 11 → 19:00Z Sep 12
const pkt = windowFor('2026-09-12', -300)
check('PKT: late-night task inside its local day', task >= pkt.start.getTime() && task <= pkt.end.getTime())

// Server UTC (offset 0): same task is Sep 11 there — outside Sep 12 (the bug)
const utc = windowFor('2026-09-12', 0)
check('UTC: same task outside Sep 12 (why tzOffset is needed)', task < utc.start.getTime())

// Window bounds sanity: Karachi Sep 12 starts 2026-09-11T19:00Z
check('PKT Sep-12 window starts 2026-09-11T19:00Z', pkt.start.toISOString() === '2026-09-11T19:00:00.000Z')
check('window length exactly one day minus 1 ms', pkt.end.getTime() - pkt.start.getTime() === 86_400_000 - 1)

console.log(`\n${passed}/${total} passed`)
process.exit(passed === total ? 0 : 1)
