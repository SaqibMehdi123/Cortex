// ─── SM-2 style spaced repetition scheduling ────────────────────────

export type Grade = 'again' | 'hard' | 'good' | 'easy'

export interface ScheduleState {
  ease: number
  interval: number // days
  repetitions: number
  lapses: number
}

export interface ScheduledCard extends ScheduleState {
  dueAt: Date
  lastReviewedAt: Date
}

const DAY_MS = 86_400_000
const MINUTES_10 = (10 * 60 * 1000) / DAY_MS // ~0.0069 days

export function schedule(prev: ScheduleState, grade: Grade, now: Date = new Date()): ScheduledCard {
  let { ease, interval, repetitions, lapses } = prev

  if (grade === 'again') {
    repetitions = 0
    lapses += 1
    interval = MINUTES_10
    ease = Math.max(1.3, ease - 0.2)
  } else {
    repetitions += 1
    if (repetitions === 1) {
      interval = grade === 'hard' ? 0.5 : grade === 'easy' ? 3 : 1
    } else if (repetitions === 2) {
      interval = grade === 'hard' ? 3 : grade === 'good' ? 6 : 8
    } else {
      const mult = grade === 'hard' ? 1.2 : grade === 'good' ? ease : ease * 1.3
      interval = Math.max(interval * mult, interval + 1)
    }
    if (grade === 'hard') ease = Math.max(1.3, ease - 0.15)
    if (grade === 'easy') ease = Math.min(3.2, ease + 0.15)
  }

  // Cap interval at ~1 year
  interval = Math.min(interval, 365)

  return {
    ease,
    interval,
    repetitions,
    lapses,
    dueAt: new Date(now.getTime() + interval * DAY_MS),
    lastReviewedAt: now,
  }
}

// Preview next interval labels for the grade buttons
export function previewLabels(prev: ScheduleState): Record<Grade, string> {
  const out = {} as Record<Grade, string>
  const grades: Grade[] = ['again', 'hard', 'good', 'easy']
  for (const grade of grades) {
    const s = schedule(prev, grade, new Date())
    const days = s.interval
    if (days < 1) {
      const hours = days * 24
      out[grade] = hours >= 1 ? `${Math.round(hours)}h` : `${Math.round(hours * 60)}m`
    } else if (days < 30) out[grade] = `${Math.round(days)}d`
    else if (days < 365) out[grade] = `${Math.round(days / 30)}mo`
    else out[grade] = '1y'
  }
  return out
}
