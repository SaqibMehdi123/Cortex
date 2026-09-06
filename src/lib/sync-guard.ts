import { db } from '@/lib/db'

// Shared server-side guardrails for every auto-syncable feed (news, papers,
// jobs, scholarships). The client may fire a sync on visit / interval, but the
// server enforces: one run per resource per account, and a cooldown on
// non-forced (automatic) calls so feeds and API quotas can't be hammered.
// Manual buttons always send force:true and skip the cooldown.

export const AUTO_SYNC_COOLDOWN_MS = 5 * 60_000

export type SyncResource = 'news' | 'papers' | 'jobs' | 'scholarships'

const FIELD_BY_RESOURCE: Record<SyncResource, 'lastNewsFetchAt' | 'lastPapersFetchAt' | 'lastJobsFetchAt' | 'lastScholarshipsFetchAt'> = {
  news: 'lastNewsFetchAt',
  papers: 'lastPapersFetchAt',
  jobs: 'lastJobsFetchAt',
  scholarships: 'lastScholarshipsFetchAt',
}

// In-process lock: one concurrent run per resource+account.
const running = new Set<string>()

export function tryLock(key: string): boolean {
  if (running.has(key)) return false
  running.add(key)
  return true
}

export function unlock(key: string): void {
  running.delete(key)
}

export interface SyncGuardResult {
  skip: boolean
  reason?: 'in_progress' | 'cooldown'
  lastFetchedAt: Date | null
}

/**
 * Fast pre-flight for a sync request. Reads the account's last sync timestamp
 * for the resource and applies the in-progress lock + auto cooldown.
 * When `skip` is false the caller MUST eventually call `unlockSync` and
 * `stampSync` (typically via try/finally + on completion).
 */
export async function beginSync(userId: string, resource: SyncResource, force: boolean): Promise<SyncGuardResult> {
  const key = `${resource}:${userId}`
  if (!tryLock(key)) return { skip: true, reason: 'in_progress', lastFetchedAt: null }

  const row = await db.user.findUnique({ where: { id: userId }, select: { [FIELD_BY_RESOURCE[resource]]: true } })
  const lastFetchedAt = (row?.[FIELD_BY_RESOURCE[resource]] as unknown as Date | null) ?? null

  if (!force && lastFetchedAt && Date.now() - lastFetchedAt.getTime() < AUTO_SYNC_COOLDOWN_MS) {
    unlock(key)
    return { skip: true, reason: 'cooldown', lastFetchedAt }
  }
  return { skip: false, lastFetchedAt }
}

/** Records a completed sync (even when nothing new arrived). */
export async function stampSync(userId: string, resource: SyncResource): Promise<Date> {
  const at = new Date()
  await db.user.update({ where: { id: userId }, data: { [FIELD_BY_RESOURCE[resource]]: at } })
  unlock(`${resource}:${userId}`)
  return at
}

/** Releases the lock without stamping (error path). */
export function abortSync(userId: string, resource: SyncResource): void {
  unlock(`${resource}:${userId}`)
}
