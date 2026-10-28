// Unit check: the clock needle must point AT the selected number's chip.
//
// Chip positions (dialPos in time-picker.tsx): index i sits at screen angle
// (i*30 − 90)° — screen coords have y pointing down, so −90° = up = 12/00.
//
// Needle: the un-rotated element extends RIGHT from the dial center (0° =
// 3 o'clock) and the transform is rotate(handAngle − 90deg), where
// handAngle = clock angle counted from 12. So the needle's screen angle is
// (handAngle − 90)°.
//
// Alignment therefore requires:  handAngle − 90  ≡  i*30 − 90  (mod 360)
// for the chip index i of the selected value — i.e. the needle overlaps the
// chip. Run with: bun scripts/verify-clock-needle.ts

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

const HOUR_DIAL = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const MIN_DIAL = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

// same formulas as src/components/ui/time-picker.tsx
const chipScreenAngle = (i: number) => i * 30 - 90
const handClockAngleHour = (h12: number) => (h12 % 12) * 30
const handClockAngleMin = (min: number) => min * 6
const handScreenAngle = (clockAngle: number) => clockAngle - 90 // the −90° fix

const norm = (deg: number) => ((deg % 360) + 360) % 360

console.log('hour mode — needle screen angle == chip screen angle (mod 360)')
let allHours = true
for (const h of HOUR_DIAL) {
  const i = HOUR_DIAL.indexOf(h)
  const ok = norm(handScreenAngle(handClockAngleHour(h))) === norm(chipScreenAngle(i))
  if (!ok) {
    allHours = false
    console.error(`    hour ${h}: needle ${norm(handScreenAngle(handClockAngleHour(h)))}° vs chip ${norm(chipScreenAngle(i))}°`)
  }
}
check('all 12 hour numbers aligned', allHours)
check('spot: 12 → needle up (270° screen)', norm(handScreenAngle(0)) === 270)
check('spot: 3 → needle right (0°)', norm(handScreenAngle(90)) === 0)
check('spot: 6 → needle down (90°)', norm(handScreenAngle(180)) === 90)
check('spot: 9 → needle left (180°)', norm(handScreenAngle(270)) === 180)

console.log('minute mode — needle screen angle == chip screen angle (mod 360)')
let allMin = true
for (const m of MIN_DIAL) {
  const i = MIN_DIAL.indexOf(m)
  const ok = norm(handScreenAngle(handClockAngleMin(m))) === norm(chipScreenAngle(i))
  if (!ok) {
    allMin = false
    console.error(`    minute ${m}: needle ${norm(handScreenAngle(handClockAngleMin(m)))}° vs chip ${norm(chipScreenAngle(i))}°`)
  }
}
check('all 12 minute chips aligned', allMin)
check('spot: :00 → needle up', norm(handScreenAngle(0)) === 270)
check('spot: :30 → needle down', norm(handScreenAngle(180)) === 90)

console.log('component source — fix is actually wired in')
const src = readFileSync(new URL('../src/components/ui/time-picker.tsx', import.meta.url), 'utf8')
check('transform applies the −90° offset', src.includes('rotate(${handAngle - 90}deg)'))
check('needle length reaches the number ring (38%)', src.includes('w-[38%]'))
check('needle ignores pointer events', /pointer-events-none[^>]*origin-left/.test(src))
check('old wrong-angle transform is gone', !src.includes('rotate(${handAngle}deg)'))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
