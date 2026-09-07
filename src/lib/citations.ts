// ─── Citation marker helpers (shared by reader rail + Copilot dock) ────

import type { Citation } from './types'

/**
 * Split assistant markdown into (string | Citation) parts.
 *
 * Bracketed citation markers — single `[2]` or combined `[1, 3]` — become
 * chip parts for every number that maps to a stored citation. Markers with
 * no matching citation stay as plain text (they may be literal text like a
 * matrix notation "[1, 2]" from the document itself).
 */
export function splitCitationParts(
  content: string,
  citations: Citation[]
): (string | Citation)[] {
  const parts: (string | Citation)[] = []
  const regex = /\[(\d+(?:\s*,\s*\d+)*)\]/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(content)) !== null) {
    const nums = m[1]
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n))
    const cites = nums
      .map((n) => citations.find((c) => c.n === n))
      .filter(Boolean) as Citation[]
    if (cites.length) {
      if (m.index > last) parts.push(content.slice(last, m.index))
      for (const c of cites) parts.push(c)
      last = m.index + m[0].length
    }
  }
  if (last < content.length) parts.push(content.slice(last))
  return parts
}

/** The set of citation numbers referenced anywhere in `reply` ([2] or [1, 3]). */
export function usedCitationNumbers(reply: string): Set<number> {
  const used = new Set<number>()
  for (const m of reply.matchAll(/\[([\d\s,]+)\]/g)) {
    for (const part of m[1].split(',')) {
      const n = Number(part.trim())
      if (Number.isFinite(n)) used.add(n)
    }
  }
  return used
}
