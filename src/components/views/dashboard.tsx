'use client'

import { FaBolt, FaBell, FaBookOpen, FaBullseye, FaCalendarDay, FaChevronRight, FaClock, FaCloudSun, FaFire, FaMoon, FaNewspaper, FaSpinner, FaStopwatch, FaSun, FaTriangleExclamation } from 'react-icons/fa6'
import { useMemo, useState } from 'react'
import { api, todayISO, fmtDate } from '@/lib/client'
import { useUI } from '@/lib/nav-config'
import type { DashboardData, Task, Reminder } from '@/lib/types'
import { useApi } from '@/lib/client'
import { recurrenceLabel } from '@/lib/reminder-span'
import { Button } from '@/components/ui/button'
import { SwipeTaskRow, PriorityDot, EmptyState, SkeletonCard, StatCard, StatRow, Panel, Meter, colorHex } from '@/components/shared'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useAutoSync } from '@/hooks/use-auto-sync'
import { fireConfetti } from '@/lib/confetti'

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return { text: 'Burning the midnight oil', icon: <FaMoon className="h-4 w-4" /> }
  if (h < 12) return { text: 'Good morning', icon: <FaSun className="h-4 w-4" /> }
  if (h < 18) return { text: 'Good afternoon', icon: <FaSun className="h-4 w-4" /> }
  return { text: 'Good evening', icon: <FaCloudSun className="h-4 w-4" /> }
}

// task row body shared by nested (under-plan) and individual timeline rows
function NestedTaskBody({ task: t, completing, onToggle, onFocus }: {
  task: Task
  completing: boolean
  onToggle: (t: Task) => void
  onFocus: () => void
}) {
  return (
    <div className={cn('flex items-start gap-3 px-3 py-2.5', completing && 'opacity-40')}>
      <Checkbox
        checked={false}
        onCheckedChange={() => onToggle(t)}
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
              <FaBullseye className="h-3 w-3" style={{ color: colorHex(t.goal.color) }} /> {t.goal.title}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onFocus}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
        aria-label={`Focus on ${t.title}`}
      >
        <FaStopwatch className="h-4 w-4" />
      </button>
    </div>
  )
}

export function DashboardView() {
  const setView = useUI((s) => s.setView)
  const openReader = useUI((s) => s.openReader)
  const setCopilotOpen = useUI((s) => s.setCopilotOpen)
  const setFocusTask = useUI((s) => s.setFocusTask)
  const { toast } = useToast()
  // tzOffset keeps every "today" window on the USER's calendar (the serverless
  // runtime runs on UTC — without it early-morning items shift days)
  const tzOffset = new Date().getTimezoneOffset()
  const { data, loading, error, setData, reload } = useApi<DashboardData>(`/api/dashboard?tzOffset=${tzOffset}`)
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

  // ── Today's timeline grouping ──
  // Tasks attached to a plan render UNDER that plan (never in a second flat
  // list — no duplication); tasks without a plan are "individual". Counts
  // are capped so the dashboard stays a briefing, not a backlog.
  const timeline = useMemo(() => {
    const byPlan = new Map<string, Task[]>()
    const individual: Task[] = []
    for (const t of data?.todayTasks ?? []) {
      if (t.planId) {
        const arr = byPlan.get(t.planId) ?? []
        arr.push(t)
        byPlan.set(t.planId, arr)
      } else {
        individual.push(t)
      }
    }
    const shownPlans = (data?.todayPlans ?? []).slice(0, 5).map((p) => ({ id: p.id, title: p.title, tasks: byPlan.get(p.id) ?? [] }))
    const shownIds = new Set(shownPlans.map((s) => s.id))
    // tasks whose plan didn't make the "today" cut still stay under their own
    // plan (mini rows), never dumped into the flat list
    const extras = [...byPlan.entries()]
      .filter(([id]) => !shownIds.has(id))
      .slice(0, 3)
      .map(([id, tasks]) => ({ id, title: tasks[0]?.plan?.title ?? 'Plan', tasks }))
    return { shownPlans, extras, individual }
  }, [data])

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

  // a reminder checked off here hides its CURRENT occurrence only — a monthly
  // reminder done today still comes back next month
  async function dismissReminder(r: Reminder) {
    try {
      await api.patch(`/api/reminders/${r.id}`, { done: true })
      if (data) setData({ ...data, todayReminders: (data.todayReminders ?? []).filter((x) => x.id !== r.id) })
    } catch {
      toast({ title: 'Could not dismiss reminder', variant: 'destructive' })
    }
  }

  if (loading || !data) {
    // a failed cold load used to spin skeletons forever — distinguish it
    if (!loading && error) {
      return (
        <div className="anim-fade-up space-y-4">
          <EmptyState
            icon={<FaTriangleExclamation className="h-5 w-5 text-danger" />}
            title="Couldn't load your day"
            description="Something went wrong while fetching your briefing, tasks and goals. Your data is safe — nothing was lost."
            action={{ label: 'Try again', onClick: () => reload() }}
          />
        </div>
      )
    }
    return (
      <div className="space-y-5">
        <StatRow>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-[10px] border bg-card px-4 py-3.5 shadow-soft">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2.5 h-6 w-14" />
            </div>
          ))}
        </StatRow>
        <div className="grid gap-5 lg:grid-cols-2">
          <SkeletonCard className="h-64" />
          <SkeletonCard className="h-64" />
        </div>
      </div>
    )
  }

  const b = data.briefing

  return (
    <div className="anim-fade-up space-y-5 pb-8">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            {g.icon}
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1 className="mt-1 break-words text-2xl font-semibold tracking-[-0.02em]">
            {g.text}, {data.greetingName}
          </h1>
        </div>
      </div>

      {/* Stat row — the day's figures in mono numerals (replaces pill chips) */}
      <StatRow>
        <StatCard
          label="Tasks today"
          value={<span>{b.tasksDoneToday}<span className="text-lg text-muted-foreground">/{b.tasksTotalToday}</span></span>}
          delta={b.tasksTotalToday > b.tasksDoneToday ? `${b.tasksTotalToday - b.tasksDoneToday} to go` : b.tasksTotalToday > 0 ? 'all done' : 'nothing scheduled'}
          tone={b.tasksTotalToday > 0 && b.tasksDoneToday >= b.tasksTotalToday ? 'up' : 'flat'}
        />
        <StatCard label="Read today" value={<span>{b.readMinutesToday}<span className="text-lg text-muted-foreground">m</span></span>} delta="reading minutes" />
        <StatCard label="Focused" value={<span>{b.focusMinutesToday}<span className="text-lg text-muted-foreground">m</span></span>} delta="focus minutes" />
        <StatCard
          label="Best streak"
          value={<span>{b.streakBest}<span className="text-lg text-muted-foreground">d</span></span>}
          delta={b.streakBest > 0 ? 'keep it alive' : 'start one today'}
          tone={b.streakBest > 0 ? 'up' : 'flat'}
        />
      </StatRow>

      {/* Copilot briefing — hairline rows instead of chips */}
      <Panel
        title="Daily briefing"
        action={
          <Button variant="ghost" size="sm" className="h-7 text-xs text-link hover:text-link" onClick={() => setCopilotOpen(true)}>
            Ask Copilot <FaChevronRight className="h-3.5 w-3.5" />
          </Button>
        }
      >
        {b.nextBestTask ? (
          <button onClick={() => setFocusTask({ id: b.nextBestTask!.id, title: b.nextBestTask!.title, goalId: b.nextBestTask!.goalId })} className="flex w-full items-start gap-3 border-t px-4 py-3 text-left transition-colors first:border-t-0 hover:bg-muted/40">
            <FaBolt className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Next best task</p>
              <p className="mt-0.5 truncate text-sm font-medium">{b.nextBestTask.title}</p>
            </div>
            <span className="ml-auto shrink-0 self-center font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">focus</span>
          </button>
        ) : (
          <div className="border-t px-4 py-3 text-sm text-muted-foreground first:border-t-0">
            No nudges today — your plan is clear.
          </div>
        )}
        {b.atRiskGoals.map((gr) => (
          <button key={gr.id} onClick={() => setView('goals')} className="flex w-full items-start gap-3 border-t px-4 py-3 text-left transition-colors hover:bg-danger/5">
            <FaTriangleExclamation className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="break-words text-xs font-medium text-danger">At-risk goal: {gr.title}</p>
              <p className="break-words text-xs text-muted-foreground">{gr.reason}</p>
            </div>
          </button>
        ))}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Today's timeline */}
        <Panel
          title="Today's timeline"
          action={
            <Button variant="ghost" size="sm" className="h-7 text-xs text-link hover:text-link" onClick={() => setView('plans')}>
              Plans <FaChevronRight className="h-3.5 w-3.5" />
            </Button>
          }
        >
          <div className="space-y-2.5 px-4 py-3.5">
            {data.todayTasks.length === 0 && data.todayPlans.length === 0 && (data.todayReminders?.length ?? 0) === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-muted-foreground">Nothing scheduled today. Enjoy the calm — or plan something.</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setView('plans')}>
                  Open Plans
                </Button>
              </div>
            ) : (
              <>
                {/* reminders active today — dismissible (current occurrence only) */}
                {(data.todayReminders?.length ?? 0) > 0 && (
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <FaBell className="h-3 w-3" /> Reminders for today
                    </p>
                    {data.todayReminders!.map((r) => (
                      <div key={r.id} className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5">
                        <Checkbox checked={false} onCheckedChange={() => dismissReminder(r)} aria-label={`Done with ${r.title}`} className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{r.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {recurrenceLabel(r.recurrence, r.startDate)}
                            {r.showDays > 1 && r.recurrence !== 'daily' ? ` · shows for ${r.showDays} day${r.showDays === 1 ? '' : 's'}` : ''}
                          </p>
                        </div>
                        <FaBell className="h-4 w-4 shrink-0 text-warning" />
                      </div>
                    ))}
                  </div>
                )}

                {/* plans active today — each with its own tasks nested beneath it */}
                {timeline.shownPlans.map((section) => (
                  <div key={section.id} className="space-y-1.5">
                    <div className="flex items-center gap-2 pt-1.5 text-[13px]">
                      <FaCalendarDay className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-medium">{section.title}</span>
                      {section.tasks.length > 0 && (
                        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">{section.tasks.length} task{section.tasks.length === 1 ? '' : 's'}</span>
                      )}
                    </div>
                    {section.tasks.slice(0, 3).map((t) => (
                      <div key={t.id} className="ml-5 sm:ml-7">
                        <SwipeTaskRow task={t} onToggle={toggleTask} onSnooze={snoozeTask}>
                          <NestedTaskBody task={t} completing={completingIds.has(t.id)} onToggle={toggleTask} onFocus={() => setFocusTask({ id: t.id, title: t.title, goalId: t.goalId })} />
                        </SwipeTaskRow>
                      </div>
                    ))}
                    {section.tasks.length > 3 && (
                      <button onClick={() => setView('plans')} className="block w-full text-center text-[10px] text-muted-foreground transition-colors hover:text-primary">
                        + {section.tasks.length - 3} more in this plan — open Plans
                      </button>
                    )}
                  </div>
                ))}

                {/* tasks from plans not active today — still under their plan */}
                {timeline.extras.map((section) => (
                  <div key={section.id} className="space-y-1.5">
                    <div className="flex items-center gap-2 pt-1.5 text-[13px] text-muted-foreground">
                      <FaCalendarDay className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate font-medium">{section.title}</span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums">{section.tasks.length} task{section.tasks.length === 1 ? '' : 's'}</span>
                    </div>
                    {section.tasks.slice(0, 3).map((t) => (
                      <div key={t.id} className="ml-5 sm:ml-7">
                        <SwipeTaskRow task={t} onToggle={toggleTask} onSnooze={snoozeTask}>
                          <NestedTaskBody task={t} completing={completingIds.has(t.id)} onToggle={toggleTask} onFocus={() => setFocusTask({ id: t.id, title: t.title, goalId: t.goalId })} />
                        </SwipeTaskRow>
                      </div>
                    ))}
                  </div>
                ))}

                {/* individual tasks — no plan attached */}
                {timeline.individual.length > 0 && (
                  <>
                    <p className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Individual tasks</p>
                    {timeline.individual.slice(0, 6).map((t) => (
                      <SwipeTaskRow key={t.id} task={t} onToggle={toggleTask} onSnooze={snoozeTask}>
                        <NestedTaskBody task={t} completing={completingIds.has(t.id)} onToggle={toggleTask} onFocus={() => setFocusTask({ id: t.id, title: t.title, goalId: t.goalId })} />
                      </SwipeTaskRow>
                    ))}
                    {timeline.individual.length > 6 && (
                      <button onClick={() => setView('plans')} className="block w-full text-center text-[10px] text-muted-foreground transition-colors hover:text-primary">
                        + {timeline.individual.length - 6} more — open Plans
                      </button>
                    )}
                  </>
                )}
                <p className="hidden pt-1 text-center text-[10px] text-muted-foreground sm:block">
                  Hover a task for focus &amp; snooze
                </p>
              </>
            )}
          </div>
        </Panel>

        {/* Active goals — meter rows, not rings */}
        <Panel
          title="Active goals"
          action={
            <Button variant="ghost" size="sm" className="h-7 text-xs text-link hover:text-link" onClick={() => setView('goals')}>
              Goals <FaChevronRight className="h-3.5 w-3.5" />
            </Button>
          }
        >
          {data.goals.length === 0 ? (
            <div className="px-4 py-8">
              <EmptyState
                icon={<FaBullseye className="h-5 w-5" />}
                title="No goals yet"
                description="Set a goal with milestones and watch the meters fill as you progress."
                action={{ label: 'Create your first goal', onClick: () => setView('goals') }}
              />
            </div>
          ) : (
            data.goals.map((goal, idx) => (
              <button
                key={goal.id}
                onClick={() => setView('goals')}
                className={cn('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40', idx > 0 && 'border-t')}
              >
                <span className="flex w-[42%] min-w-0 shrink-0 items-center gap-1.5 sm:w-[220px]">
                  {goal.streak > 0 && <FaFire className="h-3 w-3 shrink-0 text-warning" />}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{goal.title}</span>
                </span>
                <span className="flex min-w-[100px] flex-1 items-center gap-2.5">
                  <Meter value={goal.progress} className="flex-1" />
                  <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">{goal.progress}%</span>
                </span>
              </button>
            ))
          )}
        </Panel>

        {/* News digest */}
        <Panel
          title={
            <span className="flex items-center gap-2">
              <FaNewspaper className="h-3.5 w-3.5 text-muted-foreground" /> News &amp; Papers
            </span>
          }
          action={
            <Button variant="ghost" size="sm" className="h-7 text-xs text-link hover:text-link" onClick={() => setView('news')}>
              Open <FaChevronRight className="h-3.5 w-3.5" />
            </Button>
          }
        >
          <div className="px-4 py-2">
            {data.newsDigest.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  {newsAutoFetching && <FaSpinner className="h-3.5 w-3.5 animate-spin" />}
                  {newsAutoFetching ? 'Fetching the latest AI news…' : 'No stories yet — pull a fresh feed in one click.'}
                </p>
                {!newsAutoFetching && (
                  <Button variant="outline" size="sm" onClick={() => setView('news')}>
                    Go to News &amp; Papers
                  </Button>
                )}
              </div>
            ) : (
              data.newsDigest.map((n) => (
                <a
                  key={n.id}
                  href={n.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group block border-t py-2.5 transition-colors first:border-t-0"
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{n.source ?? 'Web'}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.06em]">{n.category}</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm font-medium [overflow-wrap:anywhere] group-hover:text-link">{n.title}</p>
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
                            <span className="line-clamp-1 [overflow-wrap:anywhere]">{line}</span>
                          </p>
                        ))}
                    </div>
                  )}
                </a>
              ))
            )}
          </div>
        </Panel>

        {/* Deadlines */}
        <Panel
          title={
            <span className="flex items-center gap-2">
              <FaCalendarDay className="h-3.5 w-3.5 text-muted-foreground" /> Deadlines
            </span>
          }
        >
          {data.deadlines.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No deadlines in the next 7 days.</p>
          ) : (
            data.deadlines.map((d, idx) => (
              <div key={d.kind + d.id} className={cn('flex items-center gap-3 px-4 py-3', idx > 0 && 'border-t')}>
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    d.daysLeft < 0 ? 'bg-danger' : d.daysLeft <= 2 ? 'bg-warning' : 'bg-success'
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.title}</p>
                  <p className="break-words text-xs text-muted-foreground">{d.subtitle ?? (d.kind === 'task' ? 'Task' : d.kind === 'goal' ? 'Goal' : 'Application')}</p>
                </div>
                <span className={cn('shrink-0 font-mono text-xs tabular-nums', d.daysLeft < 0 ? 'font-medium text-danger' : d.daysLeft >= 0 && d.daysLeft <= 2 ? 'text-warning' : 'text-muted-foreground')}>
                  {d.daysLeft < 0 ? `${-d.daysLeft}d overdue` : d.daysLeft === 0 ? 'today' : `${d.daysLeft}d`}
                </span>
              </div>
            ))
          )}
        </Panel>
      </div>

      {/* Continue reading */}
      {data.continueReading.length > 0 && (
        <Panel
          title={
            <span className="flex items-center gap-2">
              <FaBookOpen className="h-3.5 w-3.5 text-muted-foreground" /> Continue reading
            </span>
          }
          action={
            <Button variant="ghost" size="sm" className="h-7 text-xs text-link hover:text-link" onClick={() => setView('library')}>
              Library <FaChevronRight className="h-3.5 w-3.5" />
            </Button>
          }
        >
          {data.continueReading.map((doc, idx) => (
            <button
              key={doc.id}
              onClick={() => openReader(doc.id)}
              className={cn('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40', idx > 0 && 'border-t')}
            >
              <div className="flex h-10 w-7 shrink-0 items-center justify-center rounded-[4px] border bg-secondary font-mono text-sm text-foreground/40">
                {(doc.title.trim().charAt(0) || '·').toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{doc.title}</p>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <Meter value={doc.progress} className="max-w-[220px] flex-1" />
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">{doc.progress}%</span>
                </div>
              </div>
            </button>
          ))}
        </Panel>
      )}
    </div>
  )
}
