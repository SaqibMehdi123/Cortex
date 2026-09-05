'use client'

import { useApi, fmtDate, daysUntil } from '@/lib/client'
import type { DashboardData } from '@/lib/types'
import type { ViewKey } from '@/components/app-shell'
import { PageHeader, StatCard, LabeledProgress, EmptyState, LoadingBlock, ErrorBlock, paletteOf, Tone } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { api } from '@/lib/client'
import { BookOpen, Newspaper, Briefcase, ListTodo, ArrowRight, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function DashboardView({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const { data, loading, error, reload } = useApi<DashboardData>('/api/dashboard')

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" subtitle="Your day at a glance" />
        <LoadingBlock rows={5} />
      </div>
    )
  }
  if (error) return <ErrorBlock message={error} />
  if (!data) return null

  const now = new Date()
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const hours = now.getHours()
  const greeting = hours < 12 ? 'Good morning' : hours < 18 ? 'Good afternoon' : 'Good evening'

  async function togglePlan(id: string, done: boolean) {
    await api.patch(`/api/plans/${id}`, { done })
    reload()
  }

  return (
    <div className="space-y-6">
      <PageHeader title={`${greeting} 👋`} subtitle={`${dateLabel} — here is where things stand`}>
        <Button variant="outline" size="sm" onClick={() => onNavigate('news')}>
          <Newspaper className="mr-1.5 h-4 w-4" /> AI News
        </Button>
        <Button size="sm" onClick={() => onNavigate('goals')}>
          <ListTodo className="mr-1.5 h-4 w-4" /> Plan your day
        </Button>
      </PageHeader>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Reading now"
          value={data.stats.totalDocs - data.stats.finishedDocs}
          hint={`${data.stats.finishedDocs} finished`}
          icon={<BookOpen className="h-4 w-4" />}
        />
        <StatCard label="Open plans" value={data.stats.openPlans} hint="across day / week / month" icon={<ListTodo className="h-4 w-4" />} />
        <StatCard label="Unread AI news" value={data.stats.unreadNews} hint="from labs & companies" icon={<Newspaper className="h-4 w-4" />} />
        <StatCard label="Active applications" value={data.stats.activeOpportunities} hint="internships & jobs" icon={<Briefcase className="h-4 w-4" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Today's focus */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Today&apos;s focus</CardTitle>
            <CardDescription>Daily plan items — check them off as you go</CardDescription>
          </CardHeader>
          <CardContent>
            {data.todayPlans.length === 0 ? (
              <EmptyState
                title="No open tasks for today"
                hint="Add a few daily plans in Goals & Plans, and they will show up here."
              />
            ) : (
              <ul className="space-y-2">
                {data.todayPlans.slice(0, 6).map((p) => (
                  <li key={p.id} className="flex items-start gap-3 rounded-lg border p-3">
                    <Checkbox checked={p.done} onCheckedChange={() => togglePlan(p.id, !p.done)} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{p.title}</p>
                      {p.goal && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <span className={cn('h-1.5 w-1.5 rounded-full', paletteOf(p.goal.color).dot)} />
                          {p.goal.title}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => onNavigate('goals')}>
              View all plans <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>

        {/* Goal progress */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Goal progress</CardTitle>
            <CardDescription>
              {data.stats.totalSteps > 0
                ? `${data.stats.totalStepsDone}/${data.stats.totalSteps} milestone steps completed`
                : 'Set a goal with steps to start tracking progress'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.goals.length === 0 ? (
              <EmptyState
                title="No active goals yet"
                hint="Create a goal, break it into intermediary steps, and watch the progress bar move."
              />
            ) : (
              <div className="space-y-4">
                {data.goals.slice(0, 4).map((g) => {
                  const pal = paletteOf(g.color)
                  return (
                    <div key={g.id}>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <p className="flex items-center gap-2 truncate text-sm font-medium">
                          <span className={cn('h-2 w-2 shrink-0 rounded-full', pal.dot)} />
                          {g.title}
                        </p>
                        <Tone>{g.category}</Tone>
                      </div>
                      <LabeledProgress value={g.progress} />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {g.stepsTotal > 0
                          ? g.nextStep
                            ? `Next: ${g.nextStep}`
                            : 'All steps done 🎉'
                          : 'No steps yet — add intermediary steps'}
                        {g.deadline ? ` · due ${fmtDate(g.deadline, { month: 'short', day: 'numeric' })}` : ''}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => onNavigate('goals')}>
              Manage goals <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>

        {/* Continue reading */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Continue reading</CardTitle>
            <CardDescription>Pick up where you left off</CardDescription>
          </CardHeader>
          <CardContent>
            {data.documents.length === 0 ? (
              <EmptyState
                title="Nothing in progress"
                hint="Add books, papers, articles or newsletters to your library and track reading progress."
              />
            ) : (
              <ul className="space-y-3">
                {data.documents.map((d) => (
                  <li key={d.id}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{d.title}</p>
                      <Tone>{d.type}</Tone>
                    </div>
                    <LabeledProgress value={d.progress} />
                  </li>
                ))}
              </ul>
            )}
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => onNavigate('library')}>
              Open library <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>

        {/* Opportunities */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Opportunities to act on</CardTitle>
            <CardDescription>Internship & job updates that need attention</CardDescription>
          </CardHeader>
          <CardContent>
            {data.opportunities.length === 0 ? (
              <EmptyState
                title="Nothing pending"
                hint="Log emails about internships or jobs here so deadlines never slip by."
              />
            ) : (
              <ul className="space-y-2">
                {data.opportunities.map((o) => {
                  const dLeft = daysUntil(o.deadline)
                  const soon = dLeft !== null && dLeft >= 0 && dLeft <= 7
                  return (
                    <li key={o.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {o.company} · {o.role}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <Tone className="mr-1.5">{o.status}</Tone>
                          {o.deadline ? `deadline ${fmtDate(o.deadline, { month: 'short', day: 'numeric' })}` : 'no deadline'}
                        </p>
                      </div>
                      {soon && (
                        <span className="flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          <CheckCircle2 className="h-3 w-3" /> {dLeft}d left
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => onNavigate('opportunities')}>
              Open tracker <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
