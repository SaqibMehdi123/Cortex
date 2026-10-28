// Unit check: the plans outline's collapse state must survive page reloads.
// Verifies the persistence wiring in src/components/views/plans.tsx (the
// logic itself is browser localStorage + React effects, so source checks are
// the meaningful assertions here). Run with: bun scripts/verify-collapse-persist.ts

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

const src = readFileSync(new URL('../src/components/views/plans.tsx', import.meta.url), 'utf8')

console.log('collapse persistence — localStorage wiring')
check('dedicated storage key defined', src.includes("const COLLAPSED_KEY = 'cortex:plans:collapsed'"))
check('mount effect re-hydrates from localStorage', src.includes('localStorage.getItem(COLLAPSED_KEY)'))
check('hydration parses the saved id set', src.includes('setCollapsed(new Set(JSON.parse(raw) as string[]))'))
check('hydration failures fall back to expanded (try/catch)', /useEffect\(\(\) => \{\s*try \{\s*const raw = localStorage\.getItem\(COLLAPSED_KEY\)/.test(src))
check('every change persists the set', src.includes('localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]))'))
check('save effect tracks the collapsed state', src.includes('}, [collapsed])'))
check('state starts empty (SSR-safe first paint)', src.includes('useState<Set<string>>(new Set())'))

console.log('toggle behaviour untouched')
check('collapse toggle still flips membership', /if \(next\.has\(id\)\) next\.delete\(id\)\s*else next\.add\(id\)/.test(src))
check('no other code resets the collapsed set (only hydrate + toggle)', (src.match(/setCollapsed\(/g) ?? []).length === 2)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
