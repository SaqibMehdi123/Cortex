// ─── Pomodoro engine unit checks (bun run scripts/verify-pomodoro.ts) ────
// Runs the zustand engine headless with a localStorage shim and a stubbed
// fetch that records focus-log calls. All timestamps are injected so the
// wall clock never matters.
//
// Semantics under test (post "break-choice" rework):
//   • a finished work block PARKS and sets breakChoicePending — it never
//     auto-runs a break; the UI offers short/long/skip at that moment only
//   • startBreak('short'|'long') runs the chosen break; after a break the
//     next focus block follows autoStartWork
//   • skip at the boundary = decline the break; skip during a phase = move
//     on without logging
//   • startWithDuration arms a one-off block length (blockMin) that is
//     logged exactly; settings.workMin is untouched

class MemoryLS {
  store = new Map<string, string>()
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null }
  setItem(k: string, v: string) { this.store.set(k, v) }
  removeItem(k: string) { this.store.delete(k) }
  clear() { this.store.clear() }
  key(i: number) { return [...this.store.keys()][i] ?? null }
  get length() { return this.store.size }
}
;(globalThis as unknown as { localStorage: unknown }).localStorage = new MemoryLS()

const logCalls: { minutes: number; taskId: string | null }[] = []
;(globalThis as unknown as { fetch: unknown }).fetch = async (_url: unknown, init?: { body?: string }) => {
  const body = JSON.parse(init?.body ?? '{}')
  logCalls.push({ minutes: body.minutes, taskId: body.taskId ?? null })
  return new Response('{}', { status: 201 })
}

const { usePomodoro } = await import('../src/lib/pomodoro')

let pass = 0
let fail = 0
function check(name: string, cond: boolean, extra?: string) {
  if (cond) {
    pass++
    console.log(`  ok  ${name}`)
  } else {
    fail++
    console.error(`FAIL  ${name}${extra ? ` — ${extra}` : ''}`)
  }
}
const st = () => usePomodoro.getState()

// ── 1. idle state + settings ─────────────────────────────────────────
console.log('1. idle state')
check('starts idle', !st().running && st().endAt === null && st().completed === 0)
check('no break choice pending', st().breakChoicePending === false)
check('default settings', st().settings.workMin === 25 && st().settings.shortMin === 5 && st().settings.longMin === 15 && st().settings.roundsBeforeLong === 4)
check('idle countdown = focus length', st().secondsLeft === 25 * 60)

// ── 2. start + mid-phase ticking (timestamp-based) ───────────────────
console.log('2. start & tick')
st().start()
const s2 = st()
check('running with endAt', s2.running && s2.endAt !== null)
check('secondsLeft = work length', s2.secondsLeft === 25 * 60)
const endAt = s2.endAt!
// 5 minutes elapsed (throttled tab — one big delta instead of 300 ticks)
st().tick(endAt - 20 * 60 * 1000)
check('big-delta tick re-derives secondsLeft', st().secondsLeft === 20 * 60, `got ${st().secondsLeft}`)
check('phaseElapsed counts the delta', st().phaseElapsed === 5 * 60, `got ${st().phaseElapsed}`)
check('focusSeconds counts the delta', st().focusSeconds === 5 * 60, `got ${st().focusSeconds}`)
// stale tick (behind wall clock but before endAt) keeps display consistent
st().tick(endAt - 19 * 60 * 1000)
check('normal 1s-step tick', st().secondsLeft === 19 * 60 && st().phaseElapsed === 6 * 60)

// ── 3. pause / resume math ───────────────────────────────────────────
console.log('3. pause & resume')
st().pause(endAt - 19 * 60 * 1000)
check('paused parks remainder', !st().running && st().endAt === null && st().pausedRemaining === 19 * 60)
st().tick(Date.now())
check('paused tick keeps display', st().secondsLeft === 19 * 60)
st().resume(endAt - 19 * 60 * 1000)
const s3 = st()
check('resume re-anchors endAt', s3.running && s3.endAt === endAt)

// ── 4. work boundary → PARK + break choice (never auto-run) ──────────
console.log('4. work boundary parks with a break choice')
const t0 = st().endAt!
st().tick(t0 + 1000) // work block completed while away
check('stays on work phase but parked', st().phase === 'work' && !st().running && st().endAt === null)
check('break choice is pending', st().breakChoicePending === true)
check('completed = 1', st().completed === 1)
check('focusSeconds = exactly one block', st().focusSeconds === 25 * 60, `got ${st().focusSeconds}`)
check('work block logged (25)', logCalls.length === 1 && logCalls[0].minutes === 25, JSON.stringify(logCalls))
// the boundary that already fired must never log twice (tab dup / re-tick)
const loggedAfterFirst = logCalls.length
st().tick(t0 + 1000) // same boundary again — handledEndAt dedup
check('same boundary does not re-log', logCalls.length === loggedAfterFirst, JSON.stringify(logCalls))

// ── 5. chosen break → auto next focus per autoStartWork; absence bounded ──
console.log('5. chosen short break & long absence')
st().startBreak('short')
check('short break running', st().phase === 'short' && st().running && st().endAt !== null)
check('break choice cleared', st().breakChoicePending === false)
check('break length = shortMin', st().secondsLeft === 5 * 60)
const bEnd = st().endAt!
st().tick(bEnd + 1000)
check('auto-start work after break (autoStartWork default)', st().phase === 'work' && st().running)
check('work length reloaded', st().secondsLeft === 25 * 60)
check('break did not log', logCalls.length === loggedAfterFirst)
// 1h absence: the auto-started work block runs to its end in wall time and
// logs ONCE; the break after it is never auto-run → parked at the choice
st().tick(bEnd + 60 * 60 * 1000)
check('absence logs the elapsed work block once', logCalls.length === loggedAfterFirst + 1, JSON.stringify(logCalls))
check('absence parks at the break choice', !st().running && st().endAt === null && st().breakChoicePending === true, `running=${st().running} pending=${st().breakChoicePending}`)
check('focusSeconds = two full blocks', st().focusSeconds === 50 * 60, `got ${st().focusSeconds}`)

// ── 6. skip semantics ────────────────────────────────────────────────
console.log('6. skip')
check('parked at break choice before skip', st().breakChoicePending === true && st().completed === 2)
st().skip() // at the boundary = decline the break
check('skip at boundary parks next focus block', st().breakChoicePending === false && st().phase === 'work' && !st().running && st().secondsLeft === 25 * 60)
st().start()
const runEnd = st().endAt!
st().tick(runEnd - 10 * 60 * 1000) // 15 min into the block
st().skip() // skip a RUNNING work block = advance without logging
check('skip work does not log', logCalls.length === loggedAfterFirst + 1, JSON.stringify(logCalls))
check('skip work parks at break choice', st().breakChoicePending === true && st().completed === 1) // fresh start() reset the round counter
st().skip() // decline again
st().stop()

// ── 7. stop with partial work block logs the remainder ───────────────
console.log('7. stop & partial log')
st().start()
const workEnd = st().endAt!
st().tick(workEnd - 15 * 60 * 1000) // 10 minutes elapsed of 25
st().stop()
check('partial work block logs minutes', logCalls.some((c) => c.minutes === 10), JSON.stringify(logCalls))
check('stop resets everything', !st().running && st().completed === 0 && st().phaseElapsed === 0 && st().taskLink === null && st().breakChoicePending === false)

// ── 8. custom durations; long break after roundsBeforeLong ───────────
console.log('8. custom durations')
st().updateSettings({ workMin: 42, shortMin: 7, longMin: 21, roundsBeforeLong: 2 })
check('idle settings update resets countdown', st().secondsLeft === 42 * 60)
st().start()
check('custom focus length', st().secondsLeft === 42 * 60)
const wEnd = st().endAt!
st().tick(wEnd + 1000)
check('parks at break choice after custom block', st().breakChoicePending === true && st().completed === 1)
check('custom work block logged (42)', logCalls.some((c) => c.minutes === 42))
st().startBreak('short')
check('custom short break length', st().phase === 'short' && st().secondsLeft === 7 * 60)
const sEnd = st().endAt!
st().tick(sEnd + 1000) // short break over → auto-start work (42m)
check('back to work after short', st().phase === 'work' && st().running && st().secondsLeft === 42 * 60)
const w2End = st().endAt!
st().tick(w2End + 1000) // second work block over → completed=2 → LONG is due
check('parks at choice again, completed=2', st().breakChoicePending === true && st().completed === 2)
st().startBreak('long')
check('chosen long break length', st().phase === 'long' && st().secondsLeft === 21 * 60)
st().stop()

// ── 9. startWithDuration: one-off session length + link switch ───────
console.log('9. one-off duration & link switch')
st().start({ id: 'task-a', title: 'Task A' })
const runEnd2 = st().endAt!
st().tick(runEnd2 - 10 * 60 * 1000) // 15 min into the block
st().startWithDuration({ id: 'task-b', title: 'Task B' }, 40)
check('mid-session startWithDuration keeps the countdown', st().running && st().endAt === runEnd2 && st().secondsLeft === 10 * 60)
check('task link switched', st().taskLink?.id === 'task-b')
st().stop()
st().startWithDuration({ id: 'task-c', title: 'Task C' }, 40)
check('one-off 40m block running', st().running && st().secondsLeft === 40 * 60)
check('blockMin tracks the armed length', st().blockMin === 40)
check('settings untouched by one-off duration', st().settings.workMin === 42)
const cEnd = st().endAt!
st().tick(cEnd + 1000)
check('40m block logged exactly', logCalls.some((c) => c.minutes === 40), JSON.stringify(logCalls))
check('parks at break choice after one-off block', st().breakChoicePending === true)
// starting a fresh session on another task while parked = new session
st().startWithDuration({ id: 'task-d', title: 'Task D' }, 15)
check('fresh session replaces the parked choice', st().running && st().breakChoicePending === false && st().completed === 0 && st().secondsLeft === 15 * 60)
st().stop()

// ── 10. persistence ──────────────────────────────────────────────────
console.log('10. persistence')
const raw = (globalThis as unknown as { localStorage: MemoryLS }).localStorage.getItem('cortex-pomodoro')
check('persisted to localStorage', !!raw)
const parsed = raw ? JSON.parse(raw) : null
check('settings persisted', parsed?.state?.settings?.workMin === 42)
check('dialogOpen not persisted', parsed?.state?.dialogOpen === undefined)
check('running session not persisted as running (parked on reload migrate)', parsed?.state?.running === false || parsed?.state?.running === undefined)

// ── 11. sanitize clamps ──────────────────────────────────────────────
console.log('11. sanitize')
st().updateSettings({ workMin: 9999, shortMin: 0, roundsBeforeLong: 99 })
check('values clamped', st().settings.workMin === 180 && st().settings.shortMin === 1 && st().settings.roundsBeforeLong === 8)
st().stop()

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)

export {}
