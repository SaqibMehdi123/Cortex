'use client'

import { useState } from 'react'
import { api, todayISO, fmtDate } from '@/lib/client'
import { useUI } from '@/lib/nav-config'
import type { DashboardData, Task } from '@/lib/types'
import { useApi } from '@/lib/client'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ProgressRing, SwipeTaskRow, PriorityDot, EmptyState, SkeletonCard, colorHex } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Sparkles, BookOpen, Newspaper, CalendarClock, Layers, Flame, Zap, AlertTriangle, Clock3, Sun, Moon as MoonIcon, Sunset, Target, ChevronRight, Timer, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useAutoSync } from '@/hooks/use-auto-sync'
import { fireConfetti } from '@/lib/confetti'

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return { text: 'Burning the midnight oil', icon: <MoonIcon className="h-4 w-4" /> }
  if (h < 12) return { text: 'Good morning', icon: <Sun className="h-4 w-4" /> }
  if (h < 18) return { text: 'Good afternoon', icon: <Sun className="h-4 w-4" /> }
  return { text: 'Good evening', icon: <Sunset className="h-4 w-4" /> }
}

export function DashboardView() {
  const setView = useUI((s) => s.setView)
  const openReader = useUI((s) => s.openReader)
  const setCopilotOpen = useUI((s) => s.setCopilotOpen)
  const setFocusTask = useUI((s) => s.setFocusTask)
  const { toast } = useToast()
  const { data, loading, setData, reload } = useApi<DashboardData>('/api/dashboard')
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set())

  // First visit / stale feed: quietly pull news in the background so the digest
  // card is never a dead end. Dashboard refreshes itself when the fetch lands.
  const { autoFetching: newsAutoFetching } = useAutoSync({
    key: 'news',
    statusEndpoint: '/api/news/status',
    fetchEndpoint: '/api/news/fetch',
    onAutoFetched: () => {
      reload()
    },
  })

  const g = greeting()

  async function toggleTask(t: Task) {
    const done = t.status === 'done'
    try {
      const { task } = await api.patch<{ task: Task }>(`/api/tasks/${t.id}`, { status: done ? 'todo' : 'done' })
      if (data) {
        if (!done) {
          // completed — remove from today list
          setData({ ...data, briefing: { ...data.briefing, tasksDoneToday: data.briefing.tasksDoneToday + 1 }, todayTasks: data.todayTasks.filter((x) => x.id !== t.id) })
          if (data.briefing.nextBestTask?.id === t.id) fireConfetti(50)
        }
      }
      setCompletingIds((prev) => new Set(prev).add(t.id))
      void task
    } catch {
      toast({ title: 'Could not update task', variant: 'destructive' })
    }
  }

  async function snoozeTask(t: Task) {
    try {
      await api.patch(`/api/tasks/${t.id}`, { snooze: 1, baseDue: t.dueDate ?? todayISO() })
      if (data) setData({ ...data, todayTasks: data.todayTasks.filter((x) => x.id !== t.id) })
      toast({ title: 'Snoozed to tomorrow' })
    } catch {
      toast({ title: 'Could not snooze task', variant: 'destructive' })
    }
  }

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <SkeletonCard className="h-28" />
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonCard className="h-64" />
          <SkeletonCard className="h-64" />
        </div>
        <SkeletonCard className="h-48" />
      </div>
    )
  }

  const b = data.briefing

  return (
    <div className="anim-fade-up space-y-5 pb-8">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {g.icon}
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            {g.text}, {data.greetingName}
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" /> {b.readMinutesToday}m read · {b.focusMinutesToday}m focused today
        </div>
      </div>

      {/* Copilot briefing card */}
      <Card className="gap-4 py-5 transition-shadow hover:shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            Daily briefing
          </CardTitle>
          <CardAction>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCopilotOpen(true)}>
              Ask Copilot <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setView('flashcards')} className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted">
              <Layers className="h-3.5 w-3.5 text-primary" /> {b.dueFlashcards} flashcards due
            </button>
            <button onClick={() => setView('news')} className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted">
              <Newspaper className="h-3.5 w-3.5 text-primary" /> {b.unreadNews} unread stories
            </button>
            {b.streakBest > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium">
                <Flame className="h-3.5 w-3.5 text-warning" /> {b.streakBest}-day best streak
              </span>
            )}
            <span className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium">
              <Zap className="h-3.5 w-3.5 text-primary" /> {b.tasksDoneToday}/{b.tasksTotalToday} tasks today
            </span>
          </div>
          {b.nextBestTask && (
            <div className="flex items-start gap-2 rounded-lg bg-card p-3">
              <Zap className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Next best task</p>
                <p className="truncate font-medium">{b.nextBestTask.title}</p>
              </div>
            </div>
          )}
          {b.atRiskGoals.map((gr) => (
            <button key={gr.id} onClick={() => setView('goals')} className="flex w-full items-start gap-2 rounded-lg bg-danger/5 p-3 text-left transition-colors hover:bg-danger/10">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-danger">At-risk goal: {gr.title}</p>
                <p className="text-xs text-muted-foreground">{gr.reason}</p>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Today's timeline */}
        <Card className="gap-4 py-5 transition-shadow hover:shadow-soft">
          <CardHeader>
            <CardTitle className="text-sm">Today&apos;s timeline</CardTitle>
            <CardAction>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setView('plans')}>
                Plans <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.todayTasks.length === 0 && data.todayPlans.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing scheduled today. Enjoy the calm — or plan something.</p>
            ) : (
              <>
                {data.todayPlans.map((p) => (
                  <div key={p.id} className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                    <CalendarClock className="h-4 w-4 text-primary" />
                    <span className="font-medium">{p.title}</span>
                    <Badge variant="outline" className="ml-auto text-[10px]">plan</Badge>
                  </div>
                ))}
                {data.todayTasks.map((t) => (
                  <SwipeTaskRow key={t.id} task={t} onToggle={toggleTask} onSnooze={snoozeTask}>
                    <div className={cn('flex items-start gap-3 px-3 py-2.5', completingIds.has(t.id) && 'opacity-40')}>
                      <Checkbox
                        checked={false}
                        onCheckedChange={() => toggleTask(t)}
                        aria-label={`Complete ${t.title}`}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.title}</p>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <PriorityDot priority={t.priority} />
                          {t.dueDate && <span>{fmtDate(t.dueDate, { hour: 'numeric', minute: '2-digit' })}</span>}
                          <span>~{t.estimate}m</span>
                          {t.goal && (
                            <span className="inline-flex items-center gap-1">
                              <Target className="h-3 w-3" style={{ color: colorHex(t.goal.color) }} /> {t.goal.title}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setFocusTask({ id: t.id, title: t.title, goalId: t.goalId })}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                        aria-label={`Focus on ${t.title}`}
                      >
                        <Timer className="h-4 w-4" />
                      </button>
                    </div>
                  </SwipeTaskRow>
                ))}
                <p className="hidden pt-1 text-center text-[10px] text-muted-foreground sm:block lg:hidden xl:block">
                  Swipe right to complete, left to snooze (touch devices)
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Progress rings */}
        <Card className="gap-4 py-5 transition-shadow hover:shadow-soft">
          <CardHeader>
            <CardTitle className="text-sm">Active goals</CardTitle>
            <CardAction>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setView('goals')}>
                Goals <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {data.goals.length === 0 ? (
              <EmptyState
                icon={<Target className="h-5 w-5" />}
                title="No goals yet"
                description="Set a goal with milestones and watch the rings fill as you progress."
                action={{ label: 'Create your first goal', onClick: () => setView('goals') }}
              />
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
                {data.goals.map((goal) => (
                  <button key={goal.id} onClick={() => setView('goals')} className="group rounded-xl p-1 transition-transform active:scale-95">
                    <ProgressRing
                      value={goal.progress}
                      color={colorHex(goal.color)}
                      sublabel={
                        <span className="inline-flex items-center gap-1">
                          {goal.streak > 0 && <Flame className="h-3 w-3 text-warning" />}
                          {goal.title}
                        </span>
                      }
                    />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* News digest */}
        <Card className="gap-4 py-5 transition-shadow hover:shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Newspaper className="h-4 w-4 text-primary" /> News digest
            </CardTitle>
            <CardAction>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setView('news')}>
                Radar <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {data.newsDigest.length === 0 ? (
              <p className="flex items-center justify-center gap-2 py-6 text-center text-sm text-muted-foreground">
                {newsAutoFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {newsAutoFetching ? 'Fetching the latest AI news…' : 'No stories yet — hit Fetch latest on the News radar.'}
              </p>
            ) : (
              data.newsDigest.map((n) => (
                <a
                  key={n.id}
                  href={n.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group block rounded-xl border px-3 py-2.5 transition-colors hover:border-primary/30 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{n.source ?? 'Web'}</span>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{n.category}</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm font-medium group-hover:text-primary">{n.title}</p>
                  {n.summary && (
                    <div className="mt-1.5 space-y-1">
                      {n.summary
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .slice(0, 3)
                        .map((line, i) => (
                          <p key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                            <span className="line-clamp-1">{line}</span>
                          </p>
                        ))}
                    </div>
                  )}
                </a>
              ))
            )}
          </CardContent>
        </Card>

        {/* Deadlines */}
        <Card className="gap-4 py-5 transition-shadow hover:shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarClock className="h-4 w-4 text-primary" /> Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.deadlines.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No deadlines in the next 7 days.</p>
            ) : (
              data.deadlines.map((d) => (
                <div key={d.kind + d.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                  <span
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      d.daysLeft < 0 ? 'bg-danger' : d.daysLeft <= 2 ? 'bg-warning' : 'bg-success'
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">{d.subtitle ?? (d.kind === 'task' ? 'Task' : d.kind === 'goal' ? 'Goal' : 'Application')}</p>
                  </div>
                  <Badge variant="outline" className={cn('shrink-0 text-[10px]', d.daysLeft < 0 && 'border-danger/50 text-danger', d.daysLeft >= 0 && d.daysLeft <= 2 && 'border-warning/50 text-warning')}>
                    {d.daysLeft < 0 ? `${-d.daysLeft}d overdue` : d.daysLeft === 0 ? 'today' : `${d.daysLeft}d`}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Continue reading */}
      {data.continueReading.length > 0 && (
        <Card className="gap-4 py-5 transition-shadow hover:shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <BookOpen className="h-4 w-4 text-primary" /> Continue reading
            </CardTitle>
            <CardAction>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setView('library')}>
                Library <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {data.continueReading.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => openReader(doc.id)}
                  className="flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:shadow-soft active:scale-[0.99]"
                >
                  <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded-md border bg-secondary font-display text-lg text-foreground/40">
                    {(doc.title.trim().charAt(0) || '·').toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.title}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Progress value={doc.progress} className="h-1.5 w-full" />
                      <span className="shrink-0 text-[10px] text-muted-foreground">{doc.progress}%</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
