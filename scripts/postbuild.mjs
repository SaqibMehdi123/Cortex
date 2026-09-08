// Post-build: complete the standalone bundle for self-hosting (VPS/containers)
// by copying static assets and public files into it. On Vercel — or anywhere
// standalone output is disabled — .next/standalone does not exist and this
// exits cleanly, so `next build` remains the only required step.
import { cpSync, existsSync } from 'node:fs'

if (process.env.VERCEL || !existsSync('.next/standalone')) {
  console.log('[postbuild] standalone output not present — nothing to copy')
  process.exit(0)
}

cpSync('.next/static', '.next/standalone/.next/static', { recursive: true })
cpSync('public', '.next/standalone/public', { recursive: true })
console.log('[postbuild] standalone bundle completed (static + public copied)')
