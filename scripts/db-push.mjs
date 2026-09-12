// Build-time schema sync: pushes the Prisma schema to the database before
// `next build`. On Vercel (DATABASE_URL = postgres) this applies additive
// schema changes — new tables/columns — on every deploy; once in sync it is a
// no-op, so it is safe to run on each build. Intentionally non-destructive:
// `db push` refuses changes that would drop data (no --accept-data-loss here),
// so a destructive future change fails the build instead of eating data.
//
// Skipped anywhere DATABASE_URL is not a postgres URL (local dev / sandbox,
// where the stub env points at a sqlite file and the real database cannot be
// reached). A push failure is logged but does NOT fail the build — the app's
// reminder APIs degrade gracefully (empty lists) until the next deploy heals.
import { spawnSync } from 'node:child_process'

const url = process.env.DATABASE_URL || ''

if (!/^postgres(ql)?:\/\//i.test(url)) {
  console.log('[db-push] DATABASE_URL is not postgres — skipping schema push (local/dev)')
  process.exit(0)
}

if (process.env.DB_PUSH_DISABLE === '1') {
  console.log('[db-push] disabled via DB_PUSH_DISABLE — skipping')
  process.exit(0)
}

console.log('[db-push] syncing Prisma schema to the database…')
const res = spawnSync('node_modules/.bin/prisma', ['db', 'push', '--skip-generate'], {
  stdio: 'inherit',
})

if (res.error || res.status !== 0) {
  console.error('[db-push] WARNING: schema push failed — building anyway; new tables may be missing until the next deploy')
  process.exit(0)
}

console.log('[db-push] schema in sync')
