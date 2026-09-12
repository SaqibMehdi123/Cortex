'use client'

import { FaBell, FaBullseye, FaCalendarDays, FaCheck, FaChevronDown, FaChevronRight, FaCircleCheck, FaClock, FaClone, FaEllipsis, FaList, FaPencil, FaPlus, FaSpinner, FaStopwatch, FaTableColumns, FaTrashCan, FaWandMagicSparkles, FaXmark } from 'react-icons/fa6'
import { useCallback, useMemo, useState, useEffect, type FormEvent } from 'react'
import { api, todayISO } from '@/lib/client'
import type { Plan, Task, Goal, Reminder } from '@/lib/types'
import { useApi } from '@/lib/client'
import { planSpan, formatSpan, hasTimePart } from '@/lib/plan-span'
import { reminderActiveOn, recurrenceLabel } from '@/lib/reminder-span'
import { usePomodoro } from '@/lib/pomodoro'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { TimePicker } from '@/components/ui/time-picker'
import { useToast } from '@/hooks/use-toast'
import { ToastAction } from '@/components/ui/toast'
import { useUI } from '@/lib/nav-config'
import { cn } from '@/lib/utils'
import { PriorityDot, EmptyState, SkeletonCard } from '@/components/shared'
import { motion, AnimatePresence } from 'framer-motion'

type PlanNode = Plan & { children: Plan[] }

export function PlansView() {
  const { toast } = useToast()
  const setCaptureOpen = useUI((s) => s.setCaptureOpen)
  const { data, loading, reload } = useApi<{ plans: PlanNode[] }>('/api/plans')
  // one page, two boards: outline (the plan tree) is the default and the
  // home of everything; kanban is an optional task-status lens.
  // Above the tree sit two day-scoped cards — the day agenda (individual
  // tasks for the selected day + a quick-add) and reminders — plans
  // themselves are NOT repeated there; they live in the outline below.
  const [mode, setMode] = useState<'outline' | 'kanban'>('outline')
  const [selectedDay, setSelectedDay] = useState(todayISO())
  const [addOpen, setAddOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [goalFor, setGoalFor] = useState<PlanNode | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editPlan, setEditPlan] = useState<PlanNode | null>(null)
  const [templateFor, setTemplateFor] = useState<PlanNode | null>(null)
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null)

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
  // Tasks with no plan (quick-capture home). Undated ones surface in the day
  // agenda's "Unscheduled" group on today; dated ones show on their day.
  const unassignedTasks = useApi<{ tasks: Task[] }>(`/api/tasks?unassigned=1&status=open`, [])
  // Reminders — filtered per selected day by the shared reminder-span rules.
  const reminders = useApi<{ reminders: Reminder[] }>('/api/reminders', [])
  const activeReminders = useMemo(
    () => (reminders.data?.reminders ?? []).filter((r) => reminderActiveOn(r, selectedDay)),
    [reminders.data, selectedDay]
  )

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

  async function toggleTask(t: Task) {
    const next = t.status === 'done' ? 'todo' : 'done'
    try {
      await api.patch(`/api/tasks/${t.id}`, { status: next })
      reload()
      dayTasks.reload()
      unassignedTasks.reload()
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
      unassignedTasks.reload()
    } catch {
      toast({ title: 'Could not snooze', variant: 'destructive' })
    }
  }

  async function addTaskToPlan(planId: string | null, title: string, dueISO?: string) {
    try {
      await api.post('/api/tasks', { title, planId, dueDate: dueISO ?? (planId ? undefined : selectedDay) })
      reload()
      dayTasks.reload()
      unassignedTasks.reload()
    } catch {
      toast({ title: 'Could not add task', variant: 'destructive' })
    }
  }

  // Day-agenda quick-add: creates a STANDALONE task (no plan) — the
  // replacement for the old inbox adds. The date defaults to the selected
  // day; time optional.
  async function addDayTask(title: string, dueISO?: string) {
    try {
      await api.post('/api/tasks', { title, dueDate: dueISO })
      toast({ title: dueISO ? 'Task added' : 'Task added — no date set (find it under Unscheduled on today)' })
      reload()
      dayTasks.reload()
      unassignedTasks.reload()
    } catch {
      toast({ title: 'Could not add task', variant: 'destructive' })
    }
  }

  function reloadAll() {
    reload()
    dayTasks.reload()
    unassignedTasks.reload()
  }

  function openEdit(t: Task) {
    setEditingTask(t)
    setEditOpen(true)
  }

  // ── reminders ──
  async function completeReminder(r: Reminder) {
    try {
      await api.patch(`/api/reminders/${r.id}`, { done: true })
      reminders.reload()
      toast({
        title: 'Reminder completed',
        action: (
          <ToastAction altText="Undo" onClick={() => { void api.patch(`/api/reminders/${r.id}`, { done: false }).then(() => reminders.reload()) }}>
            Undo
          </ToastAction>
        ),
      })
    } catch (e) {
      toast({ title: 'Could not update reminder', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    }
  }

  async function deleteReminder(r: Reminder) {
    try {
      await api.del(`/api/reminders/${r.id}`)
      reminders.reload()
      toast({ title: 'Reminder deleted' })
    } catch (e) {
      toast({ title: 'Could not delete reminder', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
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

  if (loading || !data) {
    return (
      <div className="space-y-4 pb-8">
        <SkeletonCard className="h-20" />
        <SkeletonCard className="h-64" />
      </div>
    )
  }

  const dayLabel = new Date(`${selectedDay}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  return (
    <div className="anim-fade-up space-y-4 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plans</h1>
          <p className="text-sm text-muted-foreground">Year → Quarter → Month → Week → Day, with deadlines, tasks and focus.</p>
        </div>
        {/* full-width row on mobile; labels collapse to icons — four labeled
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
          <Button variant="outline" className="px-2.5" onClick={() => usePomodoro.getState().open()} aria-label="Open Pomodoro timer">
            <FaStopwatch className="h-4 w-4" /> <span className="hidden sm:inline">Pomodoro</span>
          </Button>
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
              onClick={() => setSelectedDay(iso)}
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
                    .then(() => { reload(); dayTasks.reload(); unassignedTasks.reload(); toast({ title: `Rescheduled to ${d.toLocaleDateString('en-US', { weekday: 'short' })}` }) })
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

      {/* ── Day agenda — individual tasks due on the selected day, with a
          quick-add (+ → text + date/time, no plan attached). Plans
          themselves are NOT repeated here (they live in the outline below,
          exactly once) — only standalone tasks get a day listing. ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FaClock className="h-4 w-4 text-primary" />
            Tasks for {dayLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {dayTasks.loading ? (
            <div className="space-y-2">{[1, 2].map((i) => <SkeletonCard key={i} className="h-10" />)}</div>
          ) : (dayTasks.data?.tasks.filter((t) => !t.planId).length ?? 0) === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No individual tasks due this day. Tasks under a plan live on the plan itself in the outline below.
            </p>
          ) : (
            dayTasks.data!.tasks.filter((t) => !t.planId).map((t) => (
              <TaskRow key={t.id} task={t} onToggle={toggleTask} onSnooze={snoozeTask} onEdit={openEdit} draggable />
            ))
          )}
          {/* Undated standalone tasks (e.g. quick-capture without a day) —
              visible on today's agenda so they can't silently vanish; drag
              one onto a day above to schedule it. */}
          {selectedDay === todayISO() && (unassignedTasks.data?.tasks.filter((t) => !t.dueDate).length ?? 0) > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Unscheduled — no date yet</p>
              {unassignedTasks.data!.tasks.filter((t) => !t.dueDate).map((t) => (
                <TaskRow key={t.id} task={t} onToggle={toggleTask} onSnooze={snoozeTask} onEdit={openEdit} draggable />
              ))}
            </div>
          )}
          <DayQuickAdd selectedDay={selectedDay} onAdd={addDayTask} />
        </CardContent>
      </Card>

      {/* ── Reminders — day-anchored nudges with optional repeats. Shown ONLY
          on the days they cover (one day, or several via "show for N days").
          Replaces the old inbox card. ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FaBell className="h-4 w-4 text-primary" />
            Reminders
            <span className="ml-1 text-xs font-normal text-muted-foreground">— appear only on the days they&apos;re for</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {reminders.loading ? (
            <div className="space-y-2">{[1, 2].map((i) => <SkeletonCard key={i} className="h-10" />)}</div>
          ) : activeReminders.length === 0 ? (
            <p className="py-3 text-center text-sm text-muted-foreground">
              No reminders on this day. Add one below — e.g. pay rent on the 1st of every month.
            </p>
          ) : (
            activeReminders.map((r) => (
              <ReminderRow key={r.id} reminder={r} onDone={completeReminder} onDelete={deleteReminder} onEdit={setEditingReminder} />
            ))
          )}
          <ReminderQuickAdd selectedDay={selectedDay} onSaved={reminders.reload} />
        </CardContent>
      </Card>

      {/* ── Outline mode (management view of every plan) ── */}
      {mode === 'outline' ? (
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
                onEditTask={openEdit}
                onReload={reload}
                allPlans={allPlansFlat}
                onEditPlan={setEditPlan}
                onSetGoal={setGoalFor}
                onSaveTemplate={setTemplateFor}
              />
            ))
          )}
        </div>
      ) : null}

      {/* ── Kanban mode ── */}
      {mode === 'kanban' && <KanbanBoard plans={data.plans} onToggle={toggleTask} onEditTask={openEdit} onReload={reload} />}

      <EditTaskDialog open={editOpen} task={editingTask} plans={allPlansFlat} onClose={() => { setEditOpen(false); setEditingTask(null) }} onSaved={reloadAll} />
      <PlanDialog open={addOpen} onOpenChange={setAddOpen} plan={null} allPlans={allPlansFlat} onSaved={reload} />
      <PlanDialog open={!!editPlan} onOpenChange={(v) => { if (!v) setEditPlan(null) }} plan={editPlan} allPlans={allPlansFlat} onSaved={() => { setEditPlan(null); reload() }} />
      <TemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} onApplied={() => { reload(); toast({ title: 'Template applied — plans & tasks created', description: 'Find them in the outline above (starter templates also add a goal).' }) }} />
      <SaveTemplateDialog node={templateFor} onClose={() => setTemplateFor(null)} onSaved={() => { setTemplateFor(null); toast({ title: 'Saved to your templates', description: 'Open Templates to apply it to any future plan.' }) }} />
      <GoalSelectDialog node={goalFor} onClose={() => setGoalFor(null)} onSaved={() => { setGoalFor(null); reload() }} />
      <ReminderEditDialog reminder={editingReminder} onClose={() => setEditingReminder(null)} onSaved={reminders.reload} />
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

// menu: edit details / rename / done / destination goal / save as template
function PlanRowMenu({ node, onReload, onSetGoal, onEditPlan, onSaveTemplate }: { node: PlanNode; onReload: () => void; onSetGoal: (node: PlanNode) => void; onEditPlan: (node: PlanNode) => void; onSaveTemplate: (node: PlanNode) => void }) {
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
        <DropdownMenuItem onClick={() => onEditPlan(node)}>
          <FaPencil className="mr-2 h-3.5 w-3.5" /> Edit details…
        </DropdownMenuItem>
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
        <DropdownMenuItem onClick={() => onSaveTemplate(node)}>
          <FaClone className="mr-2 h-3.5 w-3.5" /> Save as template…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Recursive plan node row ───────────────────────────────────────
function PlanNodeRow({
  node, depth, collapsed, toggleCollapse, onToggleTask, onSnoozeTask, onAddTask, onEditTask, onReload, allPlans, onEditPlan, onSetGoal, onSaveTemplate,
}: {
  node: PlanNode
  depth: number
  collapsed: Set<string>
  toggleCollapse: (id: string) => void
  onToggleTask: (t: Task) => void
  onSnoozeTask: (t: Task) => void
  onAddTask: (planId: string | null, title: string, dueISO?: string) => void
  onEditTask: (t: Task) => void
  onReload: () => void
  allPlans: { id: string; title: string; timeframe: string }[]
  onEditPlan: (node: PlanNode) => void
  onSetGoal: (node: PlanNode) => void
  onSaveTemplate: (node: PlanNode) => void
}) {
  const [adding, setAdding] = useState(false)
  const [newTask, setNewTask] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const { toast } = useToast()
  const setView = useUI((s) => s.setView)
  const hasChildren = (node.children?.length ?? 0) > 0
  const isCollapsed = collapsed.has(node.id)
  const tasks = node.tasks ?? []
  const doneCount = tasks.filter((t) => t.status === 'done').length

  const TF_ICON: Record<string, string> = { year: '🎯', quarter: '📈', month: '📅', week: '🗓', day: '☀️' }

  function closeForm() {
    setAdding(false)
    setNewTask('')
    setDueDate('')
    setDueTime('')
  }

  function submitTask() {
    const t = newTask.trim()
    if (!t) return
    // date + time compose into a real instant in the USER's timezone (a bare
    // string would be parsed as UTC on the server and shift the clock)
    const due = dueDate ? new Date(`${dueDate}T${dueTime || '09:00'}:00`).toISOString() : undefined
    onAddTask(node.id, t, due)
    closeForm()
  }

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
          <PlanSpanChip node={node} />
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
          <PlanRowMenu node={node} onReload={onReload} onSetGoal={onSetGoal} onEditPlan={onEditPlan} onSaveTemplate={onSaveTemplate} />
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
          <button
            onClick={() => (adding ? closeForm() : setAdding(true))}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-primary hover:bg-muted"
            aria-label={adding ? 'Cancel adding a task' : 'Add task to plan'}
            title={adding ? 'Cancel' : 'Add task'}
          >
            {adding ? <FaXmark className="h-4 w-4" /> : <FaPlus className="h-4 w-4" />}
          </button>
        </div>

        {adding && (
          <div className="space-y-2 px-3 pb-3">
            <div className="flex gap-2">
              <Input
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitTask()
                  if (e.key === 'Escape') closeForm()
                }}
                placeholder="Add a task to this plan…"
                className="h-9"
                autoFocus
              />
              <Button size="sm" className="h-9" onClick={submitTask}>
                Add
              </Button>
              <Button size="sm" variant="ghost" className="h-9" onClick={closeForm}>
                Cancel
              </Button>
            </div>
            <DueFields dueDate={dueDate} dueTime={dueTime} onDate={setDueDate} onTime={setDueTime} hint="Optional — when this task is due" />
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
                  <TaskRow key={t.id} task={t} onToggle={onToggleTask} onSnooze={onSnoozeTask} onEdit={onEditTask} draggable />
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
                    onEditTask={onEditTask}
                    onReload={onReload}
                    allPlans={allPlans}
                    onEditPlan={onEditPlan}
                    onSetGoal={onSetGoal}
                    onSaveTemplate={onSaveTemplate}
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

// start → end chip; red when the deadline passed while the plan is open.
// Spans are derived from the timeframe when no end date is set.
function PlanSpanChip({ node }: { node: PlanNode }) {
  const span = planSpan(node)
  const label = formatSpan(node)
  if (!span) {
    return (
      <span className="hidden shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground sm:inline-flex" title="No start date set — edit the plan to place it on the calendar">
        no date
      </span>
    )
  }
  const overdue = !node.done && span.end.getTime() < Date.now()
  return (
    <span
      className={cn(
        'hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline-flex',
        overdue ? 'bg-danger/10 text-danger' : 'bg-muted text-muted-foreground'
      )}
      title={overdue ? 'Deadline passed' : 'Plan span'}
    >
      <FaClock className="h-3 w-3" />
      {label}
    </span>
  )
}

// shared optional due date + time fields for inline task adds.
// The time is the DUE (deadline) time — when the task should be done BY —
// picked on a clock dial instead of the native spinny time input.
function DueFields({ dueDate, dueTime, onDate, onTime, hint }: { dueDate: string; dueTime: string; onDate: (v: string) => void; onTime: (v: string) => void; hint?: string }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => onDate(e.target.value)}
          className="h-8 text-xs"
          aria-label="Due date (optional)"
        />
        <TimePicker
          value={dueTime}
          onChange={onTime}
          disabled={!dueDate}
          className="h-8 text-xs"
          ariaLabel="Due time (optional)"
          placeholder="due time"
        />
      </div>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{hint ?? 'Optional — the time this task is DUE (its deadline), not a start time'}</p>
    </div>
  )
}

// ─── Task row: checkbox, edit, focus, snooze ────────────────────────
function TaskRow({ task, onToggle, onSnooze, onEdit, draggable }: { task: Task; onToggle: (t: Task) => void; onSnooze: (t: Task) => void; onEdit: (t: Task) => void; draggable?: boolean }) {
  const setFocusTask = useUI((s) => s.setFocusTask)
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
          {hasTimePart(task.dueDate) && (
            <span className="tabular-nums"> · {new Date(task.dueDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
          )}
        </span>
      )}
      <button
        onClick={() => setFocusTask({ id: task.id, title: task.title, goalId: task.goalId })}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-100 transition-opacity hover:bg-muted hover:text-primary sm:opacity-0 sm:group-hover:opacity-100"
        aria-label={`Pomodoro on ${task.title}`}
        title="Start a pomodoro on this task"
      >
        <FaStopwatch className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => onEdit(task)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-100 transition-opacity hover:bg-muted sm:opacity-0 sm:group-hover:opacity-100"
        aria-label={`Edit ${task.title}`}
        title="Edit task"
      >
        <FaPencil className="h-3.5 w-3.5" />
      </button>
      <button onClick={() => onSnooze(task)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-100 transition-opacity hover:bg-muted sm:opacity-0 sm:group-hover:opacity-100" aria-label="Snooze to tomorrow" title="Snooze to tomorrow">
        <FaClock className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ─── Day agenda quick-add: "+" opens a text + date/time form for a
// standalone task (no plan); the date is preset to the selected day and the
// whole thing is dismissible — Add, Cancel or Escape all leave cleanly. ───
function DayQuickAdd({ selectedDay, onAdd }: { selectedDay: string; onAdd: (title: string, dueISO?: string) => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(selectedDay)
  const [dueTime, setDueTime] = useState('')

  function openForm() {
    setDueDate(selectedDay)
    setDueTime('')
    setTitle('')
    setOpen(true)
  }

  function close() {
    setOpen(false)
    setTitle('')
    setDueDate(selectedDay)
    setDueTime('')
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const v = title.trim()
    if (!v) return
    // date + time compose into a real instant in the USER's timezone
    const due = dueDate ? new Date(`${dueDate}T${dueTime || '09:00'}:00`).toISOString() : undefined
    onAdd(v, due)
    close()
  }

  if (!open) {
    return (
      <button
        onClick={openForm}
        className="flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        aria-label="Add a task for this day"
      >
        <FaPlus className="h-3.5 w-3.5" /> Add a task for this day
      </button>
    )
  }

  return (
    <form className="space-y-2 rounded-lg border bg-muted/20 p-2.5" onSubmit={submit}>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit(e as unknown as FormEvent)
          if (e.key === 'Escape') { e.preventDefault(); close() }
        }}
        placeholder="What needs doing?"
        aria-label="New task title"
        className="h-9"
        autoFocus
      />
      <DueFields dueDate={dueDate} dueTime={dueTime} onDate={setDueDate} onTime={setDueTime} hint={`Date is preset to the selected day — the time is when it's DUE (deadline)`} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" size="sm" className="h-8" disabled={!title.trim()}>
          Add
        </Button>
      </div>
    </form>
  )
}

// ─── Reminder row: complete (current occurrence), edit, delete ──────
function ReminderRow({ reminder, onDone, onDelete, onEdit }: { reminder: Reminder; onDone: (r: Reminder) => void; onDelete: (r: Reminder) => void; onEdit: (r: Reminder) => void }) {
  return (
    <div className="group flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2 transition-all hover:bg-muted/40">
      <Checkbox checked={false} onCheckedChange={() => onDone(reminder)} aria-label={`Done with ${reminder.title}`} />
      <FaBell className="h-3.5 w-3.5 shrink-0 text-warning" />
      <span className="min-w-0 flex-1 truncate text-sm">{reminder.title}</span>
      <span className="hidden shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground sm:inline">
        {recurrenceLabel(reminder.recurrence, reminder.startDate)}
      </span>
      {reminder.showDays > 1 && reminder.recurrence !== 'daily' && (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground" title="How many consecutive days this reminder appears, starting on its day">
          shows {reminder.showDays}d
        </span>
      )}
      <button
        onClick={() => onEdit(reminder)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-100 transition-opacity hover:bg-muted sm:opacity-0 sm:group-hover:opacity-100"
        aria-label={`Edit ${reminder.title}`}
        title="Edit reminder"
      >
        <FaPencil className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => onDelete(reminder)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-100 transition-opacity hover:bg-muted hover:text-danger sm:opacity-0 sm:group-hover:opacity-100"
        aria-label={`Delete ${reminder.title}`}
        title="Delete reminder"
      >
        <FaTrashCan className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ─── Reminder quick-add: title + first day + cadence + how many days it
// shows — fully dismissible like the task quick-adds. ─────────────────
function ReminderQuickAdd({ selectedDay, onSaved }: { selectedDay: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(selectedDay)
  const [recurrence, setRecurrence] = useState('once')
  const [showDays, setShowDays] = useState(1)
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  function openForm() {
    setDate(selectedDay)
    setRecurrence('once')
    setShowDays(1)
    setTitle('')
    setOpen(true)
  }

  function close() {
    setOpen(false)
    setTitle('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const v = title.trim()
    if (!v || busy) return
    setBusy(true)
    try {
      await api.post('/api/reminders', { title: v, startDate: date || selectedDay, recurrence, showDays })
      toast({ title: 'Reminder added', description: 'It will appear only on the days it covers.' })
      onSaved()
      close()
    } catch (err) {
      toast({ title: 'Could not add reminder', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={openForm}
        className="flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        aria-label="Add a reminder"
      >
        <FaBell className="h-3.5 w-3.5" /> Add a reminder
      </button>
    )
  }

  return (
    <form className="space-y-2 rounded-lg border bg-muted/20 p-2.5" onSubmit={submit}>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); close() } }}
        placeholder="e.g. Pay tuition installment"
        aria-label="Reminder title"
        className="h-9"
        autoFocus
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">First day</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs" aria-label="First day" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Repeats</label>
          <Select value={recurrence} onValueChange={setRecurrence}>
            <SelectTrigger className="mt-0.5 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="once">Once</SelectItem>
              <SelectItem value="daily">Every day</SelectItem>
              <SelectItem value="weekly">Every week</SelectItem>
              <SelectItem value="monthly">Every month</SelectItem>
              <SelectItem value="yearly">Every year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {recurrence !== 'daily' && (
        <div>
          <label className="text-[10px] text-muted-foreground">Show for N day(s) — consecutive days it appears, starting on its day</label>
          <Input
            type="number"
            min={1}
            max={30}
            value={showDays}
            onChange={(e) => setShowDays(Math.max(1, Math.min(30, Number.parseInt(e.target.value || '1', 10) || 1)))}
            className="h-8 w-24 text-xs"
            aria-label="Days to show"
          />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" size="sm" className="h-8" disabled={busy || !title.trim()}>
          {busy && <FaSpinner className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Add
        </Button>
      </div>
    </form>
  )
}

// ─── Reminder edit dialog — title, first day, cadence, show-days ────
function ReminderEditDialog({ reminder, onClose, onSaved }: { reminder: Reminder | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [recurrence, setRecurrence] = useState('once')
  const [showDays, setShowDays] = useState(1)
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!reminder) return
    setTitle(reminder.title)
    setDate(planDateInput(reminder.startDate))
    setRecurrence(reminder.recurrence)
    setShowDays(reminder.showDays)
  }, [reminder])

  async function save() {
    if (!reminder || !title.trim() || busy) return
    setBusy(true)
    try {
      await api.patch(`/api/reminders/${reminder.id}`, {
        title: title.trim(),
        startDate: date || undefined,
        recurrence,
        showDays,
      })
      toast({ title: 'Reminder updated' })
      onSaved()
      onClose()
    } catch (err) {
      toast({ title: 'Could not update reminder', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!reminder} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FaBell className="h-4 w-4 text-primary" /> Edit reminder</DialogTitle>
          <DialogDescription>
            The reminder appears on the days it covers — its first day, then on the cadence you pick, for as many days as you set.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Reminder title" placeholder="Reminder title" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">First day</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" aria-label="First day" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Repeats</label>
              <Select value={recurrence} onValueChange={setRecurrence}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Once</SelectItem>
                  <SelectItem value="daily">Every day</SelectItem>
                  <SelectItem value="weekly">Every week</SelectItem>
                  <SelectItem value="monthly">Every month</SelectItem>
                  <SelectItem value="yearly">Every year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {recurrence !== 'daily' && (
            <div>
              <label className="text-xs text-muted-foreground">Show for N day(s)</label>
              <Input
                type="number"
                min={1}
                max={30}
                value={showDays}
                onChange={(e) => setShowDays(Math.max(1, Math.min(30, Number.parseInt(e.target.value || '1', 10) || 1)))}
                className="mt-1 w-28"
                aria-label="Days to show"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">Consecutive days each occurrence stays visible — e.g. 3 makes a monthly reminder show on the 1st, 2nd and 3rd.</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !title.trim()}>
            {busy && <FaSpinner className="mr-1.5 h-4 w-4 animate-spin" />} Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit task dialog — full editing from inbox, day, plan or kanban ──
function EditTaskDialog({ open, task, plans, onClose, onSaved }: {
  open: boolean
  task: Task | null
  plans: { id: string; title: string; timeframe: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('med')
  const [status, setStatus] = useState('todo')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [estimate, setEstimate] = useState(30)
  const [planId, setPlanId] = useState('none')
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  // prefill from the task each time the dialog opens
  useEffect(() => {
    if (!open || !task) return
    setTitle(task.title)
    setPriority(task.priority)
    setStatus(task.status)
    setEstimate(task.estimate)
    setPlanId(task.planId ?? 'none')
    if (task.dueDate) {
      const d = new Date(task.dueDate)
      setDueDate(todayISO(d))
      setDueTime(hasTimePart(task.dueDate) ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '')
    } else {
      setDueDate('')
      setDueTime('')
    }
  }, [open, task])

  async function save() {
    if (!task || !title.trim()) return
    setBusy(true)
    try {
      await api.patch(`/api/tasks/${task.id}`, {
        title: title.trim(),
        priority,
        status,
        estimate,
        // date + time compose in the USER's timezone (same rule as capture)
        dueDate: dueDate ? new Date(`${dueDate}T${dueTime || '09:00'}:00`).toISOString() : null,
        planId: planId === 'none' ? null : planId,
      })
      toast({ title: 'Task updated' })
      onSaved()
      onClose()
    } catch {
      toast({ title: 'Could not update task', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!task) return
    setBusy(true)
    try {
      await api.del(`/api/tasks/${task.id}`)
      toast({ title: 'Task deleted' })
      onSaved()
      onClose()
    } catch {
      toast({ title: 'Could not delete task', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>Change the details, set a due date and time, move it to another plan — or delete it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Task title" placeholder="Task title" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="med">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To do</SelectItem>
                  <SelectItem value="doing">In progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Due date &amp; time (deadline)</span>
              {dueDate && (
                <button type="button" onClick={() => { setDueDate(''); setDueTime('') }} className="text-[10px] font-medium text-primary hover:underline">
                  Clear
                </button>
              )}
            </label>
            <div className="mt-1 flex gap-2">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="flex-1" aria-label="Due date" />
              <TimePicker
                value={dueTime}
                onChange={setDueTime}
                disabled={!dueDate}
                className="flex-1 h-9"
                ariaLabel="Due time (deadline)"
                placeholder="due time"
              />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">The time is when the task is DUE — its deadline, not a start time.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Estimate (minutes)</label>
              <Input
                type="number"
                min={5}
                step={5}
                value={estimate}
                onChange={(e) => setEstimate(Math.max(0, Number.parseInt(e.target.value || '0', 10) || 0))}
                className="mt-1"
                aria-label="Estimate in minutes"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Plan</label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— inbox (no plan) —</SelectItem>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" className="text-danger hover:text-danger hover:bg-danger/10" onClick={remove} disabled={busy}>
            <FaTrashCan className="mr-1.5 h-3.5 w-3.5" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={busy || !title.trim()}>
              {busy && <FaSpinner className="mr-1.5 h-4 w-4 animate-spin" />} Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Kanban board (todo / doing / done) ────────────────────────────
function KanbanBoard({ plans, onToggle, onEditTask, onReload }: { plans: PlanNode[]; onToggle: (t: Task) => void; onEditTask: (t: Task) => void; onReload: () => void }) {
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
                  onClick={() => onEditTask(t)}
                  className="cursor-pointer rounded-lg border bg-card p-3 transition-shadow hover:shadow-soft"
                  role="button"
                  aria-label={`Edit ${t.title}`}
                >
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={t.status === 'done'}
                      onCheckedChange={() => onToggle(t)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Toggle ${t.title}`}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm font-medium leading-snug', t.status === 'done' && 'line-through opacity-60')}>{t.title}</p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <PriorityDot priority={t.priority} /> ~{t.estimate}m
                        {t.dueDate && (
                          <span className="inline-flex items-center gap-1">
                            <FaClock className="h-3 w-3" />
                            {new Date(t.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {hasTimePart(t.dueDate) && <span className="tabular-nums">{new Date(t.dueDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}
                          </span>
                        )}
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

// plan dates are saved from bare YYYY-MM-DD (server stores UTC midnight) —
// recover the calendar day in UTC, never in the viewer's local zone
function planDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

// ─── Plan dialog — create AND edit (title, timeframe, parent, goal,
//     start date, deadline, notes) ─────────────────────────────────────
function PlanDialog({ open, onOpenChange, plan, allPlans, onSaved }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  plan: PlanNode | null // null = create
  allPlans: { id: string; title: string; timeframe: string }[]
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [timeframe, setTimeframe] = useState('day')
  const [parentId, setParentId] = useState('none')
  const [goalId, setGoalId] = useState('none')
  const [goals, setGoals] = useState<Goal[]>([])
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  const editing = !!plan

  useEffect(() => {
    if (!open) return
    api.get<{ goals: Goal[] }>('/api/goals').then((d) => setGoals(d.goals)).catch(() => setGoals([]))
    if (plan) {
      setTitle(plan.title)
      setTimeframe(plan.timeframe)
      setParentId(plan.parentId ?? 'none')
      setGoalId(plan.goalId ?? 'none')
      setStartDate(planDateInput(plan.startDate) || todayISO())
      setEndDate(planDateInput(plan.endDate))
      setNotes(plan.notes ?? '')
    } else {
      setTitle('')
      setTimeframe('day')
      setParentId('none')
      setGoalId('none')
      setStartDate(todayISO())
      setEndDate('')
      setNotes('')
    }
  }, [open, plan])

  async function submit() {
    if (!title.trim()) return
    setBusy(true)
    try {
      if (editing && plan) {
        await api.patch(`/api/plans/${plan.id}`, {
          title: title.trim(),
          timeframe,
          parentId: parentId === 'none' ? null : parentId,
          goalId: goalId === 'none' ? null : goalId,
          startDate: startDate || null,
          endDate: endDate || null,
          notes: notes.trim() || null,
        })
        toast({ title: 'Plan updated' })
      } else {
        await api.post('/api/plans', {
          title: title.trim(),
          timeframe,
          parentId: parentId === 'none' ? null : parentId,
          goalId: goalId === 'none' ? null : goalId,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          notes: notes.trim() || undefined,
        })
        toast({ title: 'Plan created' })
      }
      onOpenChange(false)
      onSaved()
    } catch {
      toast({ title: editing ? 'Could not update plan' : 'Failed to create plan', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit plan' : 'New plan'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update the details or the deadline — the calendar visibility follows the start and end dates.'
              : 'Nest it under a parent plan (year → quarter → month → week → day) and optionally aim it at a goal.'}
          </DialogDescription>
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
                  {allPlans.filter((p) => p.id !== plan?.id).map((p) => (
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Start date</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1" aria-label="Plan start date" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Deadline (end date)</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1" aria-label="Plan deadline (end date)" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            The plan appears in the day agenda (under the week strip) on every date it covers. Without an end date the timeframe decides the span (day = 1 day, week = 7 days, month / quarter / year = their calendar length).
          </p>
          <div>
            <label className="text-xs text-muted-foreground">Notes (optional)</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 min-h-[64px]" aria-label="Plan notes" placeholder="Any details, links or context…" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !title.trim()}>
            {busy && <FaSpinner className="mr-1.5 h-4 w-4 animate-spin" />} {editing ? 'Save changes' : 'Create plan'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Templates dialog — starter templates + the user's own saved ones ──
type BuiltinTemplate = { id: string; name: string; description: string }
type UserTemplate = { id: string; name: string; description: string; planCount: number; taskCount: number }

function TemplatesDialog({ open, onOpenChange, onApplied }: { open: boolean; onOpenChange: (v: boolean) => void; onApplied: () => void }) {
  const [templates, setTemplates] = useState<BuiltinTemplate[] | null>(null)
  const [userTemplates, setUserTemplates] = useState<UserTemplate[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const { toast } = useToast()

  async function fetchAll() {
    try {
      const d = await api.get<{ templates: BuiltinTemplate[]; userTemplates: UserTemplate[] }>('/api/plans/templates')
      setTemplates(d.templates)
      setUserTemplates(d.userTemplates ?? [])
    } catch {
      setTemplates([])
      setUserTemplates([])
    }
  }

  useEffect(() => {
    if (open) void fetchAll()
  }, [open])

  async function apply(templateId: string) {
    setBusyId(templateId)
    try {
      await api.post('/api/plans/templates', { templateId })
      onApplied()
      onOpenChange(false)
    } catch {
      toast({ title: 'Could not apply template', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  async function remove(t: UserTemplate) {
    setBusyId(t.id)
    try {
      await api.del(`/api/plans/templates?templateId=user:${t.id}`)
      setUserTemplates((prev) => (prev ?? []).filter((x) => x.id !== t.id))
      toast({ title: 'Template deleted' })
    } catch {
      toast({ title: 'Could not delete template', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Plan templates</DialogTitle>
          <DialogDescription>
            Save any of your plans as a reusable blueprint from its ⋯ menu, then apply it here — a fresh copy of the plan, its sub-plans and its tasks, ready to customize.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {/* user templates */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">My templates</h3>
            {userTemplates === null ? (
              <p className="py-2 text-sm text-muted-foreground">Loading…</p>
            ) : userTemplates.length === 0 ? (
              <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                None yet — open any plan&apos;s <span className="font-medium">⋯ menu → Save as template…</span> to turn it into a reusable blueprint (nesting, tasks, priorities and estimates are kept; dates, statuses and goal links are not).
              </p>
            ) : (
              userTemplates.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border bg-card p-3.5 transition-all hover:shadow-soft">
                  <FaClone className="h-5 w-5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{t.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t.planCount} nested plan{t.planCount === 1 ? '' : 's'} · {t.taskCount} task{t.taskCount === 1 ? '' : 's'}
                    </span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => apply(`user:${t.id}`)} disabled={busyId === t.id}>
                    {busyId === `user:${t.id}` ? <FaSpinner className="h-4 w-4 animate-spin" /> : 'Apply'}
                  </Button>
                  <button
                    onClick={() => remove(t)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                    aria-label={`Delete template ${t.name}`}
                  >
                    {busyId === t.id ? <FaSpinner className="h-4 w-4 animate-spin" /> : <FaTrashCan className="h-4 w-4" />}
                  </button>
                </div>
              ))
            )}
          </section>

          {/* starter templates */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Starter templates</h3>
            {(templates ?? []).map((t) => (
              <button
                key={t.id}
                onClick={() => apply(t.id)}
                disabled={busyId !== null}
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
            {templates !== null && templates.length === 0 && (
              <p className="text-sm text-muted-foreground">No starter templates available.</p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Save-as-template dialog — blueprint a plan for future reuse ────
function SaveTemplateDialog({ node, onClose, onSaved }: { node: PlanNode | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (node) {
      setName(node.title)
      setDescription('')
    }
  }, [node])

  async function save() {
    if (!node || !name.trim()) return
    setBusy(true)
    try {
      await api.post(`/api/plans/${node.id}/template`, { name: name.trim(), description: description.trim() || undefined })
      onSaved()
    } catch {
      toast({ title: 'Could not save template', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!node} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FaClone className="h-4 w-4 text-primary" /> Save as template</DialogTitle>
          <DialogDescription>
            Stores “{node?.title}” with its sub-plans and tasks as a reusable blueprint. Dates, done-states and goal links are left out, so every future copy starts clean.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Template name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" aria-label="Template name" placeholder="e.g. Weekly deep-work plan" autoFocus />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Description (optional)</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" aria-label="Template description" placeholder="When is this blueprint useful?" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !name.trim()}>
            {busy && <FaSpinner className="mr-1.5 h-4 w-4 animate-spin" />} Save template
          </Button>
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


