'use client'

import { FaBullseye, FaCalendarDays, FaCheck, FaChevronDown, FaChevronRight, FaCircleCheck, FaClock, FaEllipsis, FaInbox, FaList, FaPencil, FaPlus, FaSpinner, FaTableColumns, FaTrashCan, FaWandMagicSparkles } from 'react-icons/fa6'
import { useCallback, useMemo, useState, useEffect } from 'react'
import { api, todayISO } from '@/lib/client'
import type { Plan, Task, Goal } from '@/lib/types'
import { useApi } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { useUI } from '@/lib/nav-config'
import { cn } from '@/lib/utils'
import { PriorityDot, EmptyState, SkeletonCard } from '@/components/shared'
import { motion, AnimatePresence } from 'framer-motion'

type PlanNode = Plan & { children: Plan[] }

export function PlansView() {
  const { toast } = useToast()
  const setCaptureOpen = useUI((s) => s.setCaptureOpen)
  const { data, loading, reload } = useApi<{ plans: PlanNode[] }>('/api/plans')
  const [mode, setMode] = useState<'outline' | 'kanban' | 'day'>('outline')
  const [selectedDay, setSelectedDay] = useState(todayISO())
  const [addOpen, setAddOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [goalFor, setGoalFor] = useState<PlanNode | null>(null)

  const week = useMemo(() => {
    const now = new Date()
    const day = (now.getDay() + 6) % 7 // Monday=0
    const monday = new Date(now)
    monday.setDate(now.getDate() - day)
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      return d
    })
  }, [])

  // tzOffset (Date#getTimezoneOffset, minutes) lets the server build the day
  // window on the USER's calendar instead of the server's UTC clock.
  const tzOffset = new Date().getTimezoneOffset()
  const dayTasks = useApi<{ tasks: Task[] }>(
    `/api/tasks?date=${selectedDay}&tzOffset=${tzOffset}`,
    [selectedDay]
  )
  // Quick-capture tasks (and any task not attached to a plan) land here —
  // they used to be invisible on this page entirely.
  const inboxTasks = useApi<{ tasks: Task[] }>(`/api/tasks?unassigned=1&status=open`, [])

  async function toggleTask(t: Task) {
    const next = t.status === 'done' ? 'todo' : 'done'
    try {
      await api.patch(`/api/tasks/${t.id}`, { status: next })
      reload()
      dayTasks.reload()
      inboxTasks.reload()
    } catch {
      toast({ title: 'Could not update task', variant: 'destructive' })
    }
  }

  async function snoozeTask(t: Task) {
    try {
      await api.patch(`/api/tasks/${t.id}`, { snooze: 1, baseDue: t.dueDate ?? todayISO() })
      toast({ title: 'Snoozed to tomorrow' })
      reload()
      dayTasks.reload()
      inboxTasks.reload()
    } catch {
      toast({ title: 'Could not snooze', variant: 'destructive' })
    }
  }

  async function addTaskToPlan(planId: string | null, title: string) {
    try {
      await api.post('/api/tasks', { title, planId, dueDate: planId ? undefined : selectedDay })
      reload()
      dayTasks.reload()
      inboxTasks.reload()
    } catch {
      toast({ title: 'Could not add task', variant: 'destructive' })
    }
  }

  // Inbox quick-add: no plan, no date — exactly what quick capture creates.
  async function addInboxTask(title: string) {
    try {
      await api.post('/api/tasks', { title })
      toast({ title: 'Task added to inbox' })
      reload()
      inboxTasks.reload()
    } catch {
      toast({ title: 'Could not add task', variant: 'destructive' })
    }
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allPlansFlat = useMemo(() => {
    const out: { id: string; title: string; timeframe: string }[] = []
    const walk = (nodes: PlanNode[]) => {
      for (const n of nodes) {
        out.push({ id: n.id, title: `${n.timeframe === 'day' ? '☀' : n.timeframe === 'week' ? '🗓' : n.timeframe === 'month' ? '📅' : n.timeframe === 'quarter' ? '📈' : '🎯'} ${n.title}`, timeframe: n.timeframe })
        walk((n.children as PlanNode[]) ?? [])
      }
    }
    walk(data?.plans ?? [])
    return out
  }, [data])

  if (loading || !data) {
    return (
      <div className="space-y-4 pb-8">
        <SkeletonCard className="h-20" />
        <SkeletonCard className="h-64" />
      </div>
    )
  }

  return (
    <div className="anim-fade-up space-y-4 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plans</h1>
          <p className="text-sm text-muted-foreground">Year → Quarter → Month → Week → Day, with milestones and tasks.</p>
        </div>
        {/* full-width row on mobile; labels collapse to icons — three labeled
            controls + the view toggle can't fit a 390px viewport in one line */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="flex overflow-hidden rounded-lg border">
            <button onClick={() => setMode('outline')} className={cn('flex h-9 items-center gap-1.5 whitespace-nowrap px-3 text-xs font-medium transition-colors', mode === 'outline' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')} aria-label="Outline view">
              <FaList className="h-4 w-4" /> Outline
            </button>
            <button onClick={() => setMode('kanban')} className={cn('flex h-9 items-center gap-1.5 whitespace-nowrap border-l px-3 text-xs font-medium transition-colors', mode === 'kanban' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')} aria-label="Kanban view">
              <FaTableColumns className="h-4 w-4" /> Kanban
            </button>
          </div>
          <Button variant="outline" className="px-2.5" onClick={() => setTemplatesOpen(true)} aria-label="Browse plan templates">
            <FaWandMagicSparkles className="h-4 w-4" /> <span className="hidden sm:inline">Templates</span>
          </Button>
          <Button className="px-2.5" onClick={() => setAddOpen(true)} aria-label="New plan">
            <FaPlus className="h-4 w-4" /> <span className="hidden sm:inline">Plan</span>
          </Button>
        </div>
      </div>

      {/* Week strip — drag tasks here to reschedule */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {week.map((d) => {
          // local calendar date (NOT toISOString — that slices the UTC date)
          const iso = todayISO(d)
          const isToday = iso === todayISO()
          const isSel = iso === selectedDay
          return (
            <button
              key={iso}
              onClick={() => { setSelectedDay(iso); setMode('day') }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const taskId = e.dataTransfer.getData('text/task-id')
                if (taskId) {
                  // 09:00 in the USER's timezone, as a real instant — a bare
                  // `${iso}T09:00:00` is parsed as UTC by the server and
                  // landed at 14:00 for UTC+5 users.
                  const due = new Date(`${iso}T09:00:00`).toISOString()
                  api.patch(`/api/tasks/${taskId}`, { dueDate: due })
                    .then(() => { reload(); dayTasks.reload(); inboxTasks.reload(); toast({ title: `Rescheduled to ${d.toLocaleDateString('en-US', { weekday: 'short' })}` }) })
                    .catch(() => toast({ title: 'Reschedule failed', variant: 'destructive' }))
                }
              }}
              className={cn(
                'flex min-h-[58px] flex-col items-center justify-center gap-0.5 rounded-xl border bg-card p-1 transition-colors sm:min-h-[72px] sm:p-1.5',
                isSel && 'border-primary bg-primary/5',
                isToday && !isSel && 'border-primary/40'
              )}
            >
              {/* narrow single letter on phones, short name from sm up */}
              <span className="text-[10px] font-medium uppercase text-muted-foreground sm:hidden" aria-hidden>{d.toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
              <span className="hidden text-[10px] font-medium uppercase text-muted-foreground sm:inline">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
              <span className={cn('text-base font-bold sm:text-lg', isToday && 'text-primary')}>{d.getDate()}</span>
            </button>
          )
        })}
      </div>

      {mode === 'day' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FaCalendarDays className="h-4 w-4 text-primary" />
              Tasks for {new Date(`${selectedDay}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {dayTasks.loading ? (
              <div className="space-y-2">{[1, 2].map((i) => <SkeletonCard key={i} className="h-10" />)}</div>
            ) : (dayTasks.data?.tasks.length ?? 0) === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No tasks this day. Drag a task here from below, or add one.</p>
            ) : (
              dayTasks.data!.tasks.map((t) => (
                <TaskRow key={t.id} task={t} onToggle={toggleTask} onSnooze={snoozeTask} />
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Inbox: tasks with no plan (quick-capture home) ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FaInbox className="h-4 w-4 text-primary" />
            Inbox
            <span className="ml-1 text-xs font-normal text-muted-foreground">— captured tasks without a plan. Drag one onto a day above to schedule it.</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {inboxTasks.loading ? (
            <div className="space-y-2">{[1, 2].map((i) => <SkeletonCard key={i} className="h-10" />)}</div>
          ) : (inboxTasks.data?.tasks.length ?? 0) === 0 ? (
            <p className="py-3 text-center text-sm text-muted-foreground">Nothing here — tasks captured from anywhere (⌘K → Task) show up in this inbox.</p>
          ) : (
            inboxTasks.data!.tasks.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={toggleTask} onSnooze={snoozeTask} draggable />
            ))
          )}
          <InboxQuickAdd onAdd={addInboxTask} />
        </CardContent>
      </Card>

      {/* ── Outline mode ── */}
      {mode === 'outline' || mode === 'day' ? (
        <div className="space-y-2">
          {data.plans.length === 0 ? (
            <EmptyState
              icon={<FaCalendarDays className="h-5 w-5" />}
              title="Build your first plan"
              description="Create a yearly or monthly plan, nest weeks and days under it, then attach tasks. Or start from a template."
              action={{ label: 'Browse templates', onClick: () => setTemplatesOpen(true) }}
            />
          ) : (
            data.plans.map((p) => (
              <PlanNodeRow
                key={p.id}
                node={p}
                depth={0}
                collapsed={collapsed}
                toggleCollapse={toggleCollapse}
                onToggleTask={toggleTask}
                onSnoozeTask={snoozeTask}
                onAddTask={addTaskToPlan}
                onReload={reload}
                allPlans={allPlansFlat}
                mode={mode}
                onSetGoal={setGoalFor}
              />
            ))
          )}
        </div>
      ) : null}

      {/* ── Kanban mode ── */}
      {mode === 'kanban' && <KanbanBoard plans={data.plans} onToggle={toggleTask} onReload={reload} />}

      <AddPlanDialog open={addOpen} onOpenChange={setAddOpen} allPlans={allPlansFlat} onCreated={() => reload()} />
      <TemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} onApplied={() => { reload(); toast({ title: 'Template applied — goal, plans & tasks created', description: 'Check Goals and Plans.' }) }} />
      <GoalSelectDialog node={goalFor} onClose={() => setGoalFor(null)} onSaved={() => { setGoalFor(null); reload() }} />
    </div>
  )
}

// ─── Plan title with one-click done toggle + inline rename ──────────
function PlanTitleToggle({ node, onReload }: { node: PlanNode; onReload: () => void }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(node.title)
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  // the row menu's "Rename" action focuses this row's editor
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === node.id) setEditing(true)
    }
    document.addEventListener('cortex:rename-plan', handler)
    return () => document.removeEventListener('cortex:rename-plan', handler)
  }, [node.id])

  async function toggleDone() {
    try {
      await api.patch(`/api/plans/${node.id}`, { done: !node.done })
      onReload()
    } catch {
      toast({ title: 'Could not update plan', variant: 'destructive' })
    }
  }

  async function save() {
    const t = title.trim()
    if (!t || t === node.title) return setEditing(false)
    setBusy(true)
    try {
      await api.patch(`/api/plans/${node.id}`, { title: t })
      setEditing(false)
      onReload()
    } catch {
      toast({ title: 'Could not rename plan', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') {
            setTitle(node.title)
            setEditing(false)
          }
        }}
        onBlur={save}
        disabled={busy}
        className="h-7 max-w-[240px] text-sm font-semibold"
        autoFocus
        aria-label="Plan title"
      />
    )
  }

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <button
        onClick={toggleDone}
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
          node.done ? 'border-success bg-success text-white' : 'border-input text-transparent hover:border-success'
        )}
        aria-label={node.done ? `Mark "${node.title}" as not done` : `Mark "${node.title}" as done`}
      >
        <FaCheck className="h-3 w-3" />
      </button>
      <span className={cn('truncate text-sm font-semibold', node.done && 'text-muted-foreground line-through')} title={node.title}>
        {node.title}
      </span>
    </span>
  )
}

// menu: rename / done / destination goal
function PlanRowMenu({ node, onReload, onSetGoal }: { node: PlanNode; onReload: () => void; onSetGoal: (node: PlanNode) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground opacity-60 transition-opacity hover:bg-muted hover:opacity-100"
          aria-label={`Actions for ${node.title}`}
        >
          <FaEllipsis className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => document.dispatchEvent(new CustomEvent('cortex:rename-plan', { detail: node.id }))}>
          <FaPencil className="mr-2 h-3.5 w-3.5" /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await api.patch(`/api/plans/${node.id}`, { done: !node.done })
            onReload()
          }}
        >
          <FaCircleCheck className="mr-2 h-3.5 w-3.5" /> {node.done ? 'Mark as not done' : 'Mark as done'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSetGoal(node)}>
          <FaBullseye className="mr-2 h-3.5 w-3.5" /> Destination goal…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Recursive plan node row ───────────────────────────────────────
function PlanNodeRow({
  node, depth, collapsed, toggleCollapse, onToggleTask, onSnoozeTask, onAddTask, onReload, allPlans, mode, onSetGoal,
}: {
  node: PlanNode
  depth: number
  collapsed: Set<string>
  toggleCollapse: (id: string) => void
  onToggleTask: (t: Task) => void
  onSnoozeTask: (t: Task) => void
  onAddTask: (planId: string | null, title: string) => void
  onReload: () => void
  allPlans: { id: string; title: string; timeframe: string }[]
  mode: string
  onSetGoal: (node: PlanNode) => void
}) {
  const [adding, setAdding] = useState(false)
  const [newTask, setNewTask] = useState('')
  const { toast } = useToast()
  const setView = useUI((s) => s.setView)
  const hasChildren = (node.children?.length ?? 0) > 0
  const isCollapsed = collapsed.has(node.id)
  const tasks = node.tasks ?? []
  const doneCount = tasks.filter((t) => t.status === 'done').length

  const TF_ICON: Record<string, string> = { year: '🎯', quarter: '📈', month: '📅', week: '🗓', day: '☀️' }

  return (
    <div style={{ marginLeft: depth > 0 ? 16 : 0 }}>
      <div className={cn('rounded-xl border bg-card transition-shadow hover:shadow-soft', depth === 0 && 'shadow-soft')}>
        <div className="flex items-center gap-2 px-3 py-2.5">
          {hasChildren ? (
            <button onClick={() => toggleCollapse(node.id)} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted" aria-label={isCollapsed ? 'Expand' : 'Collapse'}>
              {isCollapsed ? <FaChevronRight className="h-4 w-4" /> : <FaChevronDown className="h-4 w-4" />}
            </button>
          ) : (
            <span className="w-6 text-center text-sm">{TF_ICON[node.timeframe]}</span>
          )}
          <PlanTitleToggle node={node} onReload={onReload} />
          <Badgeish timeframe={node.timeframe} />
          {node.goal && (
            <button
              onClick={() => setView('goals')}
              className="hidden shrink-0 items-center gap-1 rounded-full bg-sidebar-accent px-2 py-0.5 text-[10px] font-medium text-sidebar-accent-foreground transition-opacity hover:opacity-80 sm:inline-flex"
              title={`Destination goal: ${node.goal.title} — open Goals`}
            >
              <FaBullseye className="h-3 w-3" />
              <span className="max-w-[140px] truncate">{node.goal.title}</span>
            </button>
          )}
          <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{doneCount}/{tasks.length} tasks</span>
          <PlanRowMenu node={node} onReload={onReload} onSetGoal={onSetGoal} />
          <button
            onClick={async () => {
              await api.del(`/api/plans/${node.id}`)
              toast({ title: 'Plan deleted' })
              onReload()
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground opacity-60 transition-opacity hover:text-danger"
            aria-label="Delete plan"
          >
            <FaTrashCan className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setAdding((v) => !v)} className="flex h-7 w-7 items-center justify-center rounded-lg text-primary hover:bg-muted" aria-label="Add task to plan">
            <FaPlus className="h-4 w-4" />
          </button>
        </div>

        {adding && (
          <div className="flex gap-2 px-3 pb-3">
            <Input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTask.trim()) {
                  onAddTask(node.id, newTask.trim())
                  setNewTask('')
                  setAdding(false)
                }
              }}
              placeholder="Add a task to this plan…"
              className="h-9"
              autoFocus
            />
            <Button
              size="sm"
              className="h-9"
              onClick={() => {
                if (newTask.trim()) {
                  onAddTask(node.id, newTask.trim())
                  setNewTask('')
                  setAdding(false)
                }
              }}
            >
              Add
            </Button>
          </div>
        )}

        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="space-y-1 px-3 pb-3">
                {tasks.map((t) => (
                  <TaskRow key={t.id} task={t} onToggle={onToggleTask} onSnooze={onSnoozeTask} draggable />
                ))}
                {hasChildren && (node.children as PlanNode[]).map((child) => (
                  <PlanNodeRow
                    key={child.id}
                    node={child}
                    depth={depth + 1}
                    collapsed={collapsed}
                    toggleCollapse={toggleCollapse}
                    onToggleTask={onToggleTask}
                    onSnoozeTask={onSnoozeTask}
                    onAddTask={onAddTask}
                    onReload={onReload}
                    allPlans={allPlans}
                    mode={mode}
                    onSetGoal={onSetGoal}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function Badgeish({ timeframe }: { timeframe: string }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
      {timeframe}
    </span>
  )
}

// ─── Task row with checkbox + drag handle ──────────────────────────
function TaskRow({ task, onToggle, onSnooze, draggable }: { task: Task; onToggle: (t: Task) => void; onSnooze: (t: Task) => void; draggable?: boolean }) {
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/task-id', task.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={cn(
        'group flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2 transition-all hover:bg-muted/40',
        task.status === 'done' && 'opacity-55'
      )}
    >
      <Checkbox checked={task.status === 'done'} onCheckedChange={() => onToggle(task)} aria-label={`Toggle ${task.title}`} />
      <PriorityDot priority={task.priority} />
      <span className={cn('min-w-0 flex-1 truncate text-sm', task.status === 'done' && 'line-through')}>{task.title}</span>
      {task.goal && <span className="hidden shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground lg:inline">{task.goal.title}</span>}
      {task.dueDate && (
        <span className="hidden shrink-0 items-center gap-1 text-[10px] text-muted-foreground sm:flex">
          <FaClock className="h-3 w-3" />
          {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      )}
      <button onClick={() => onSnooze(task)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100" aria-label="Snooze to tomorrow">
        <FaClock className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// One-line add for the inbox — creates a task with no plan and no date,
// the same shape quick capture produces.
function InboxQuickAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('')
  return (
    <form
      className="flex items-center gap-2 pt-1"
      onSubmit={(e) => {
        e.preventDefault()
        const v = title.trim()
        if (!v) return
        onAdd(v)
        setTitle('')
      }}
    >
      <FaPlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task to the inbox…"
        aria-label="Add task to inbox"
        className="h-9"
      />
      {title.trim() && (
        <Button type="submit" size="sm" className="h-9 shrink-0">
          Add
        </Button>
      )}
    </form>
  )
}

// ─── Kanban board (todo / doing / done) ────────────────────────────
function KanbanBoard({ plans, onToggle, onReload }: { plans: PlanNode[]; onToggle: (t: Task) => void; onReload: () => void }) {
  const columns: { key: string; label: string }[] = [
    { key: 'todo', label: 'To do' },
    { key: 'doing', label: 'In progress' },
    { key: 'done', label: 'Done' },
  ]
  const allTasks = useMemo(() => {
    const out: Task[] = []
    const walk = (nodes: PlanNode[]) => {
      for (const n of nodes) {
        for (const t of n.tasks ?? []) out.push(t)
        walk((n.children as PlanNode[]) ?? [])
      }
    }
    walk(plans)
    return out
  }, [plans])

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {columns.map((col) => (
        <div
          key={col.key}
          className="rounded-xl border bg-muted/30 p-2.5"
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault()
            const taskId = e.dataTransfer.getData('text/task-id')
            if (taskId) {
              await api.patch(`/api/tasks/${taskId}`, { status: col.key })
              onReload()
            }
          }}
        >
          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {col.label} <span className="ml-1 text-[10px] font-normal">{allTasks.filter((t) => t.status === col.key).length}</span>
          </p>
          <div className="space-y-2">
            {allTasks.filter((t) => t.status === col.key).map((t) => (
              <motion.div key={t.id} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
                <div
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/task-id', t.id)}
                  className="cursor-grab rounded-lg border bg-card p-3 transition-shadow hover:shadow-soft active:cursor-grabbing"
                >
                  <div className="flex items-start gap-2">
                    <Checkbox checked={t.status === 'done'} onCheckedChange={() => onToggle(t)} aria-label={`Toggle ${t.title}`} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm font-medium leading-snug', t.status === 'done' && 'line-through opacity-60')}>{t.title}</p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <PriorityDot priority={t.priority} /> ~{t.estimate}m
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
            {allTasks.filter((t) => t.status === col.key).length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">Drag tasks here</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Add plan dialog ───────────────────────────────────────────────
function AddPlanDialog({ open, onOpenChange, allPlans, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; allPlans: { id: string; title: string; timeframe: string }[]; onCreated: () => void }) {
  const [title, setTitle] = useState('')
  const [timeframe, setTimeframe] = useState('day')
  const [parentId, setParentId] = useState('none')
  const [goalId, setGoalId] = useState('none')
  const [goals, setGoals] = useState<Goal[]>([])
  const [startDate, setStartDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!open) return
    setGoalId('none')
    api.get<{ goals: Goal[] }>('/api/goals').then((d) => setGoals(d.goals)).catch(() => setGoals([]))
  }, [open])

  async function create() {
    if (!title.trim()) return
    setBusy(true)
    try {
      await api.post('/api/plans', {
        title: title.trim(),
        timeframe,
        parentId: parentId === 'none' ? null : parentId,
        goalId: goalId === 'none' ? null : goalId,
        startDate: startDate || undefined,
      })
      setTitle('')
      onOpenChange(false)
      onCreated()
    } catch {
      toast({ title: 'Failed to create plan', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New plan</DialogTitle>
          <DialogDescription>Nest it under a parent plan (year → quarter → month → week → day) and optionally aim it at a goal.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. September — interview sprint" aria-label="Plan title" autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Timeframe</label>
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="year">Year</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="day">Day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Under parent</label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— none (top level) —</SelectItem>
                  {allPlans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="flex items-center gap-1 text-xs text-muted-foreground"><FaBullseye className="h-3 w-3" /> Destination goal (optional)</label>
            <Select value={goalId} onValueChange={setGoalId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="No destination goal" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— no destination goal —</SelectItem>
                {goals.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.title}{g.status === 'completed' ? ' ✓' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Start date</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={create} disabled={busy || !title.trim()}>
            {busy && <FaSpinner className="mr-1.5 h-4 w-4 animate-spin" />} Create plan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Templates dialog ──────────────────────────────────────────────
function TemplatesDialog({ open, onOpenChange, onApplied }: { open: boolean; onOpenChange: (v: boolean) => void; onApplied: () => void }) {
  const [templates, setTemplates] = useState<{ id: string; name: string; description: string }[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (open && templates.length === 0) {
      api.get<{ templates: { id: string; name: string; description: string }[] }>('/api/plans/templates').then((d) => setTemplates(d.templates)).catch(() => {})
    }
  }, [open, templates.length])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Plan templates</DialogTitle>
          <DialogDescription>One click creates the goal, milestones, plans and starter tasks.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {templates.length === 0 && <p className="text-sm text-muted-foreground">Loading templates…</p>}
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={async () => {
                setBusyId(t.id)
                try {
                  await api.post('/api/plans/templates', { templateId: t.id })
                  onApplied()
                  onOpenChange(false)
                } finally {
                  setBusyId(null)
                }
              }}
              className="flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left transition-all hover:shadow-soft"
            >
              <FaWandMagicSparkles className="h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t.name}</span>
                <span className="block text-xs text-muted-foreground">{t.description}</span>
              </span>
              {busyId === t.id && <FaSpinner className="h-4 w-4 animate-spin text-primary" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Destination goal picker — link a plan to the goal it serves ───
function GoalSelectDialog({ node, onClose, onSaved }: { node: PlanNode | null; onClose: () => void; onSaved: () => void }) {
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [goalId, setGoalId] = useState('none')
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!node) return
    setGoalId(node.goalId ?? 'none')
    setGoals(null)
    api.get<{ goals: Goal[] }>('/api/goals').then((d) => setGoals(d.goals)).catch(() => setGoals([]))
  }, [node])

  async function save() {
    if (!node) return
    setBusy(true)
    try {
      await api.patch(`/api/plans/${node.id}`, { goalId: goalId === 'none' ? null : goalId })
      toast({ title: goalId === 'none' ? 'Destination goal removed' : 'Destination goal linked', description: goalId === 'none' ? undefined : `“${node.title}” now drives toward the selected goal.` })
      onSaved()
    } catch {
      toast({ title: 'Could not update plan', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!node} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FaBullseye className="h-4 w-4 text-primary" /> Destination goal</DialogTitle>
          <DialogDescription>
            Choose the goal “{node?.title}” is driving toward. Goals stay a separate tab — this only connects the two.
          </DialogDescription>
        </DialogHeader>
        <Select value={goalId} onValueChange={setGoalId}>
          <SelectTrigger><SelectValue placeholder="Choose a goal" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— no destination goal —</SelectItem>
            {(goals ?? []).map((g) => (
              <SelectItem key={g.id} value={g.id}>{g.title}{g.status === 'completed' ? ' ✓' : ''}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {goals !== null && goals.length === 0 && (
          <p className="text-xs text-muted-foreground">No goals yet — create one in the Goals tab first.</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || goals === null}>
            {busy && <FaSpinner className="mr-1.5 h-4 w-4 animate-spin" />} Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
