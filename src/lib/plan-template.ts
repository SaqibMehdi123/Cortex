import { db } from '@/lib/db'

// ─── User plan templates ────────────────────────────────────────────
//
// A user template is stored inside the regular Plan table as a tree whose
// ROOT row carries timeframe='template' (parentId=null, no dates, no goal):
//
//   template root   timeframe='template'  ← the saved template itself
//   └── blueprint   real timeframe        ← a date-stripped copy of the plan
//       └── ...     real timeframes       ← nested structure, tasks included
//
// Every consumer that reads live plans must exclude template roots AND their
// descendants (see the tree-exclusion helper below) — children keep real
// timeframes, so filtering by timeframe alone would orphan them.
//
// No schema change: templates ride on Plan (+ Task) rows, so production
// needs no migration.

export const TEMPLATE_TIMEFRAME = 'template'

export type TemplateSummary = {
  id: string
  name: string
  description: string
  planCount: number
  taskCount: number
  createdAt: string
}

/**
 * Deep-copy a plan subtree into new rows. Copies title, timeframe and notes;
 * everything instance-specific is reset: dates cleared, goal unlinked,
 * tasks fresh (status 'todo', no due date, zero focus minutes).
 * Returns the id of the created subtree root.
 */
export async function copyPlanSubtree(userId: string, sourcePlanId: string, parentId: string | null): Promise<string> {
  const src = await db.plan.findUnique({
    where: { id: sourcePlanId },
    include: { tasks: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } },
  })
  if (!src) throw new Error('Source plan not found')

  const created = await db.plan.create({
    data: {
      userId,
      title: src.title,
      timeframe: src.timeframe,
      notes: src.notes,
      startDate: null,
      endDate: null,
      goalId: null,
      done: false,
      parentId,
    },
  })

  for (const t of src.tasks) {
    await db.task.create({
      data: {
        userId,
        planId: created.id,
        title: t.title,
        status: 'todo',
        priority: t.priority,
        estimate: t.estimate,
        order: t.order,
        dueDate: null,
        goalId: null,
        focusMinutes: 0,
        milestoneId: null,
      },
    })
  }

  const children = await db.plan.findMany({
    where: { parentId: sourcePlanId, userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  for (const c of children) {
    await copyPlanSubtree(userId, c.id, created.id)
  }

  return created.id
}

/**
 * Collect the ids of a template subtree (root + all descendants).
 */
export async function templateSubtreeIds(userId: string, templateRootId: string): Promise<string[]> {
  const out: string[] = []
  const queue = [templateRootId]
  while (queue.length) {
    const id = queue.shift()!
    out.push(id)
    const children = await db.plan.findMany({
      where: { parentId: id, userId },
      select: { id: true },
    })
    queue.push(...children.map((c) => c.id))
  }
  return out
}

/**
 * Summarize a user template (root + blueprint counts) for the templates list.
 */
export async function summarizeTemplate(userId: string, root: { id: string; title: string; notes: string | null; createdAt: Date }): Promise<TemplateSummary> {
  const ids = await templateSubtreeIds(userId, root.id)
  const [planCount, taskCount] = await Promise.all([
    db.plan.count({ where: { userId, id: { in: ids } } }),
    db.task.count({ where: { userId, planId: { in: ids } } }),
  ])
  const blueprint = await db.plan.findFirst({
    where: { parentId: root.id, userId },
    select: { title: true },
  })
  const created = root.createdAt.toISOString().slice(0, 10)
  return {
    id: root.id,
    name: root.title,
    description: root.notes || `Blueprint of “${blueprint?.title ?? 'plan'}” · ${Math.max(0, planCount - 1)} nested plan${planCount - 1 === 1 ? '' : 's'} · ${taskCount} task${taskCount === 1 ? '' : 's'} · saved ${created}`,
    planCount: Math.max(0, planCount - 1),
    taskCount,
    createdAt: created,
  }
}

/**
 * Given the fetched flat plan list, drop template roots and every descendant
 * of a template root. Use this wherever the live plan tree is built.
 */
export function stripTemplateRows<T extends { id: string; parentId: string | null; timeframe: string }>(plans: T[]): T[] {
  const templateRootIds = new Set<string>()
  for (const p of plans) if (p.timeframe === TEMPLATE_TIMEFRAME) templateRootIds.add(p.id)
  if (templateRootIds.size === 0) return plans

  const excluded = new Set<string>(templateRootIds)
  let grew = true
  while (grew) {
    grew = false
    for (const p of plans) {
      if (excluded.has(p.id)) continue
      if (p.parentId && excluded.has(p.parentId)) {
        excluded.add(p.id)
        grew = true
      }
    }
  }
  return plans.filter((p) => !excluded.has(p.id))
}
