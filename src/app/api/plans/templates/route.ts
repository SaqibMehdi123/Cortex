import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth-server'
import { copyPlanSubtree, summarizeTemplate, type TemplateSummary } from '@/lib/plan-template'

const TEMPLATES: {
  id: string
  name: string
  description: string
  color: string
  category: string
  goalTitle: string
  milestones: { title: string; tasks: string[] }[]
  plans: { timeframe: string; title: string; tasks: string[] }[]
}[] = [
  {
    id: 'internship-prep',
    name: 'Internship prep',
    description: 'Portfolio, applications and interview prep in a 4-week sprint.',
    color: 'indigo',
    category: 'career',
    goalTitle: 'Land a great internship',
    milestones: [
      { title: 'Polish resume & portfolio', tasks: ['Update resume with latest project', 'Deploy portfolio site', 'Write 3 case studies'] },
      { title: 'Apply to 20 positions', tasks: ['Shortlist 20 companies', 'Tailor resume per application', 'Track all in Career board'] },
      { title: 'Interview preparation', tasks: ['Practice 30 LeetCode problems', 'Do 3 mock interviews', 'Prepare STAR stories'] },
      { title: 'Follow up & negotiate', tasks: ['Send follow-up emails', 'Compare offers', 'Decide'] },
    ],
    plans: [
      { timeframe: 'month', title: 'Internship sprint month', tasks: ['Review progress every Sunday'] },
      { timeframe: 'week', title: 'Week 1: foundations', tasks: ['Update resume', 'Shortlist companies'] },
    ],
  },
  {
    id: 'paper-per-week',
    name: 'One paper per week',
    description: 'Read one research paper weekly, take highlights and build flashcards.',
    color: 'teal',
    category: 'learning',
    goalTitle: 'Read 12 research papers this quarter',
    milestones: [
      { title: 'Build a paper backlog', tasks: ['Collect 12 papers on arXiv', 'Pick weekly order'] },
      { title: 'Reading ritual', tasks: ['Skim abstract + figures', 'Deep read & highlight', 'Summarize takeaways', 'Create 5 flashcards'] },
      { title: 'Share & retain', tasks: ['Write weekly note', 'Review flashcards 3x/week'] },
    ],
    plans: [
      { timeframe: 'week', title: 'This week\'s paper', tasks: ['Choose paper', 'Deep-read session', 'Make flashcards'] },
    ],
  },
]

// GET /api/plans/templates — starter templates + the user's own saved ones
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const roots = await db.plan.findMany({
      where: { userId: user.id, timeframe: 'template', parentId: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, notes: true, createdAt: true },
    })
    const userTemplates: TemplateSummary[] = await Promise.all(roots.map((r) => summarizeTemplate(user.id, r)))

    return NextResponse.json({ templates: TEMPLATES, userTemplates })
  } catch (e) {
    console.error('GET /api/plans/templates error', e)
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 })
  }
}

// POST /api/plans/templates — apply a template.
//   { templateId: '<builtin-id>' }  → starter template (goal + plans + tasks)
//   { templateId: 'user:<cuid>' }   → the user's saved plan blueprint (plans + tasks)
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const templateId: string = body?.templateId

    if (typeof templateId === 'string' && templateId.startsWith('user:')) {
      const rootId = templateId.slice('user:'.length)
      const root = await db.plan.findFirst({
        where: { id: rootId, userId: user.id, timeframe: 'template', parentId: null },
        select: { id: true },
      })
      if (!root) return NextResponse.json({ error: 'Unknown template' }, { status: 404 })
      // the blueprint is the (single) child of the template root
      const blueprint = await db.plan.findFirst({
        where: { parentId: root.id, userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })
      if (!blueprint) return NextResponse.json({ error: 'Template is empty' }, { status: 400 })

      const newRootId = await copyPlanSubtree(user.id, blueprint.id, null)
      return NextResponse.json({ ok: true, rootPlanId: newRootId }, { status: 201 })
    }

    const template = TEMPLATES.find((t) => t.id === templateId)
    if (!template) return NextResponse.json({ error: 'Unknown template' }, { status: 404 })

    const goal = await db.goal.create({
      data: {
        userId: user.id,
        title: template.goalTitle,
        category: template.category,
        color: template.color,
        description: `Created from the "${template.name}" template.`,
        milestones: {
          create: template.milestones.map((m, i) => ({
            userId: user.id,
            title: m.title,
            order: i,
            tasks: { create: m.tasks.map((t, j) => ({ userId: user.id, title: t, order: j })) },
          })),
        },
      },
    })

    // Create plan tree: month → week(s)
    let monthPlanId: string | null = null
    for (const p of template.plans) {
      const plan = await db.plan.create({
        data: {
          userId: user.id,
          title: p.title,
          timeframe: p.timeframe,
          goalId: goal.id,
          parentId: p.timeframe === 'week' && monthPlanId ? monthPlanId : null,
          tasks: { create: p.tasks.map((t, j) => ({ userId: user.id, title: t, order: j, goalId: goal.id })) },
        },
      })
      if (p.timeframe === 'month') monthPlanId = plan.id
    }

    return NextResponse.json({ ok: true, goalId: goal.id }, { status: 201 })
  } catch (e) {
    console.error('POST /api/plans/templates error', e)
    return NextResponse.json({ error: 'Failed to apply template' }, { status: 500 })
  }
}

// DELETE /api/plans/templates?templateId=user:<cuid> — remove a saved template
export async function DELETE(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const templateId = req.nextUrl.searchParams.get('templateId') ?? ''
    if (!templateId.startsWith('user:')) {
      return NextResponse.json({ error: 'Starter templates cannot be deleted' }, { status: 400 })
    }
    const rootId = templateId.slice('user:'.length)
    const root = await db.plan.findFirst({
      where: { id: rootId, userId: user.id, timeframe: 'template', parentId: null },
      select: { id: true },
    })
    if (!root) return NextResponse.json({ error: 'Unknown template' }, { status: 404 })

    await db.plan.delete({ where: { id: root.id } }) // children + tasks cascade
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/plans/templates error', e)
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }
}
