import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/export?format=json|md — privacy-first full data export
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const format = searchParams.get('format') === 'md' ? 'md' : 'json'

    const [documents, highlights, notes, goals, plans, tasks, news, opportunities, mindmaps, flashcards] = await Promise.all([
      db.document.findMany({ include: { highlights: true } }),
      db.highlight.findMany(),
      db.note.findMany(),
      db.goal.findMany({ include: { milestones: true } }),
      db.plan.findMany(),
      db.task.findMany(),
      db.newsArticle.findMany({ where: { saved: true } }),
      db.opportunity.findMany(),
      db.mindMap.findMany(),
      db.flashcard.findMany(),
    ])

    if (format === 'json') {
      const payload = { exportedAt: new Date().toISOString(), app: 'Cortex', documents, highlights, notes, goals, plans, tasks, savedArticles: news, opportunities, mindmaps, flashcards }
      return new NextResponse(JSON.stringify(payload, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="cortex-export-${new Date().toISOString().slice(0, 10)}.json"`,
        },
      })
    }

    // Markdown export
    const md: string[] = ['# Cortex Export', '', `Exported: ${new Date().toLocaleString()}`, '']

    md.push('## Documents')
    for (const d of documents) {
      md.push(`### ${d.title}${d.author ? ` — ${d.author}` : ''}`)
      md.push(`- Status: ${d.status} · Progress: ${d.progress}%${d.tags ? ` · Tags: ${d.tags}` : ''}`)
      if (d.summary) md.push(`\n> ${d.summary}`)
      for (const h of highlights.filter((h) => h.documentId === d.id)) {
        md.push(`\n> 💡 "${h.text}"${h.note ? `\n>\n> Note: ${h.note}` : ''}`)
      }
      if (d.notes) md.push(`\nMy notes: ${d.notes}`)
      md.push('')
    }

    md.push('## Notes')
    for (const n of notes) md.push(`- ${n.title ? `**${n.title}** — ` : ''}${n.content.replace(/\n/g, ' ')}`)

    md.push('\n## Goals')
    for (const g of goals) {
      const done = g.milestones.filter((m) => m.done).length
      md.push(`### ${g.title} (${done}/${g.milestones.length})`)
      for (const m of g.milestones) md.push(`- [${m.done ? 'x' : ' '}] ${m.title}`)
      md.push('')
    }

    md.push('## Plans')
    for (const p of plans) md.push(`- [${p.timeframe}] ${p.title}${p.done ? ' ✅' : ''}`)

    md.push('\n## Career')
    for (const o of opportunities) md.push(`- ${o.company} — ${o.role} [${o.status}]${o.deadline ? ` (deadline ${new Date(o.deadline).toISOString().slice(0, 10)})` : ''}`)

    md.push('\n## Flashcards')
    for (const f of flashcards) md.push(`- **Q:** ${f.front}\n  **A:** ${f.back}`)

    md.push('\n## Mindmaps')
    for (const m of mindmaps) {
      const nodes = JSON.parse(m.nodes || '[]') as { id: string; label: string; parentId: string | null }[]
      md.push(`### ${m.title}`)
      const outline = (parentId: string | null, depth: number) => {
        for (const n of nodes.filter((x) => (x.parentId ?? null) === parentId)) {
          md.push(`${'  '.repeat(depth)}- ${n.label}`)
          outline(n.id, depth + 1)
        }
      }
      outline(null, 0)
      md.push('')
    }

    md.push('\n## Saved articles')
    for (const a of news) md.push(`- [${a.title}](${a.url})`)

    return new NextResponse(md.join('\n'), {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="cortex-export-${new Date().toISOString().slice(0, 10)}.md"`,
      },
    })
  } catch (e) {
    console.error('GET /api/export error', e)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
