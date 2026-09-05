'use client'

import { useState } from 'react'
import { api, useApi, fmtDate, daysUntil, todayISO, weekStartISO, monthStartISO } from '@/lib/client'
import type { Goal, Plan } from '@/lib/types'
import { PageHeader, EmptyState, LoadingBlock, ErrorBlock, paletteOf, Tone } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { Plus, Trash2, Target, Loader2, CalendarClock, PlusCircle, X, Trophy } from 'lucide-react'

const CATEGORIES = ['career', 'learning', 'health', 'personal', 'project']
const COLORS = ['emerald', 'amber', 'rose', 'violet', 'cyan', 'orange']

export function GoalsView() {
  const goalsApi = useApi<{ goals: Goal[] }>('/api/goals')
  const plansApi = useApi<{ plans: Plan[] }>('/api/plans?timeframe=all')
  const [tab, setTab] = useState('goals')
  const [createOpen, setCreateOpen] = useState(false)

  const goals = goalsApi.data?.goals ?? []
  const plans = plansApi.data?.plans ?? []
  const activeGoals = goals.filter((g) => g.status === 'active')

  function openCreate() {
    setCreateOpen(true)
  }

  function refreshAll() {
    goalsApi.reload()
    plansApi.reload()
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Goals & Plans" subtitle="Big goals, intermediary steps, and your month / week / day">
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" /> New goal
        </Button>
      </PageHeader>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4 sm:inline-grid sm:w-auto">
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="month">Monthly</TabsTrigger>
          <TabsTrigger value="week">Weekly</TabsTrigger>
          <TabsTrigger value="day">Daily</TabsTrigger>
        </TabsList>

        <TabsContent value="goals" className="mt-4">
          <GoalsTab goals={goals} loading={goalsApi.loading} error={goalsApi.error} onChanged={refreshAll} onCreate={openCreate} />
        </TabsContent>

        <TabsContent value="month" className="mt-4">
          <PlansTab timeframe="month" plans={plans.filter((p) => p.timeframe === 'month')} goals={activeGoals} loading={plansApi.loading} error={plansApi.error} onChanged={plansApi.reload} />
        </TabsContent>
        <TabsContent value="week" className="mt-4">
          <PlansTab timeframe="week" plans={plans.filter((p) => p.timeframe === 'week')} goals={activeGoals} loading={plansApi.loading} error={plansApi.error} onChanged={plansApi.reload} />
        </TabsContent>
        <TabsContent value="day" className="mt-4">
          <PlansTab timeframe="day" plans={plans.filter((p) => p.timeframe === 'day')} goals={activeGoals} loading={plansApi.loading} error={plansApi.error} onChanged={plansApi.reload} />
        </TabsContent>
      </Tabs>

      <CreateGoalDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refreshAll} />
    </div>
  )
}

// ─── Goals tab ──────────────────────────────────────────────────────

function GoalsTab({
  goals,
  loading,
  error,
  onChanged,
  onCreate,
}: {
  goals: Goal[]
  loading: boolean
  error: string | null
  onChanged: () => void
  onCreate: () => void
}) {
  const [newStep, setNewStep] = useState<Record<string, string>>({})

  if (loading) return <LoadingBlock rows={4} />
  if (error) return <ErrorBlock message={error} />
  if (goals.length === 0)
    return (
      <EmptyState
        icon={<Target className="h-8 w-8" />}
        title="No goals yet"
        hint='Click "New goal" to set your first goal — e.g. "Land a summer internship". Break it into intermediary steps and the progress bar tracks itself.'
      />
    )

  async function toggleStep(goal: Goal, stepId: string, done: boolean) {
    await api.patch(`/api/steps/${stepId}`, { done })
    // auto-complete goal when all steps done
    const allDone = goal.steps.every((s) => (s.id === stepId ? done : s.done))
    if (allDone && goal.status === 'active') {
      await api.patch(`/api/goals/${goal.id}`, { status: 'completed' })
      toast({ title: '🏆 Goal completed!', description: goal.title })
    }
    onChanged()
  }

  async function addStep(goalId: string) {
    const title = (newStep[goalId] || '').trim()
    if (!title) return
    await api.post('/api/steps', { goalId, title })
    setNewStep({ ...newStep, [goalId]: '' })
    onChanged()
  }

  async function removeStep(stepId: string) {
    await api.del(`/api/steps/${stepId}`)
    onChanged()
  }

  async function setStatus(goal: Goal, status: string) {
    await api.patch(`/api/goals/${goal.id}`, { status })
    onChanged()
  }

  async function removeGoal(id: string) {
    await api.del(`/api/goals/${id}`)
    toast({ title: 'Goal deleted' })
    onChanged()
  }

  const sorted = [...goals].sort((a, b) => {
    const rank = (g: Goal) => (g.status === 'active' ? 0 : g.status === 'paused' ? 1 : 2)
    return rank(a) - rank(b)
  })

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sorted.map((g) => {
        const pal = paletteOf(g.color)
        const done = g.steps.filter((s) => s.done).length
        const pct = g.steps.length ? Math.round((done / g.steps.length) * 100) : 0
        const dLeft = daysUntil(g.deadline)
        const completed = g.status === 'completed'

        return (
          <div key={g.id} className={cn('rounded-xl border bg-card p-4 sm:p-5', completed && 'opacity-70')}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium leading-snug">
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', pal.dot)} />
                  <span className={cn('truncate', completed && 'line-through')}>{g.title}</span>
                  {completed && <Trophy className="h-4 w-4 shrink-0 text-amber-500" />}
                </p>
                {g.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{g.description}</p>}
              </div>
              <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" onClick={() => removeGoal(g.id)} aria-label="Delete goal">
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Tone>{g.category}</Tone>
              <Tone className={cn(pal.soft, pal.text)}>{completed ? 'completed' : g.status}</Tone>
              {g.deadline && (
                <Tone
                  className={cn(
                    dLeft !== null && dLeft <= 7 && dLeft >= 0 && 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                  )}
                >
                  <CalendarClock className="mr-1 h-3 w-3" />
                  {fmtDate(g.deadline, { month: 'short', day: 'numeric' })}
                </Tone>
              )}
            </div>

            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {done}/{g.steps.length} steps
                </span>
                <span className="font-medium tabular-nums">{pct}%</span>
              </div>
              <Progress value={pct} className="h-2" />
            </div>

            {/* Steps checklist */}
            <ul className="mt-3 space-y-1.5">
              {g.steps.map((s) => (
                <li key={s.id} className="group flex items-center gap-2.5 rounded-lg border bg-muted/30 px-2.5 py-2">
                  <Checkbox checked={s.done} onCheckedChange={(v) => toggleStep(g, s.id, Boolean(v))} />
                  <span className={cn('flex-1 text-sm', s.done && 'text-muted-foreground line-through')}>{s.title}</span>
                  <button
                    onClick={() => removeStep(s.id)}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Remove step"
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </li>
              ))}
            </ul>

            {/* Add step */}
            <div className="mt-2 flex gap-2">
              <Input
                value={newStep[g.id] ?? ''}
                onChange={(e) => setNewStep({ ...newStep, [g.id]: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && addStep(g.id)}
                placeholder="Add intermediary step…"
                className="h-9 text-sm"
              />
              <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={() => addStep(g.id)}>
                <PlusCircle className="h-4 w-4" />
              </Button>
            </div>

            {/* Status actions */}
            <div className="mt-3 flex gap-2">
              {g.status === 'active' ? (
                <>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setStatus(g, 'paused')}>
                    Pause
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setStatus(g, 'completed')}>
                    Mark completed
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setStatus(g, 'active')}>
                  Reactivate
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Plans tab (day / week / month) ─────────────────────────────────

function PlansTab({
  timeframe,
  plans,
  goals,
  loading,
  error,
  onChanged,
}: {
  timeframe: string
  plans: Plan[]
  goals: Goal[]
  loading: boolean
  error: string | null
  onChanged: () => void
}) {
  const [title, setTitle] = useState('')
  const [goalId, setGoalId] = useState<string>('none')
  const [adding, setAdding] = useState(false)

  const labels: Record<string, string> = {
    day: "Today's plan",
    week: 'This week',
    month: 'This month',
  }
  const hint: Record<string, string> = {
    day: 'What will you get done today?',
    week: 'Your priorities for this week',
    month: 'The bigger moves for this month',
  }

  async function add() {
    if (!title.trim()) return
    setAdding(true)
    try {
      const dueDate = timeframe === 'day' ? todayISO() : timeframe === 'week' ? weekStartISO() : monthStartISO()
      await api.post('/api/plans', { timeframe, title, dueDate, goalId: goalId === 'none' ? null : goalId })
      setTitle('')
      onChanged()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to add plan', variant: 'destructive' })
    } finally {
      setAdding(false)
    }
  }

  async function toggle(p: Plan) {
    await api.patch(`/api/plans/${p.id}`, { done: !p.done })
    onChanged()
  }

  async function remove(id: string) {
    await api.del(`/api/plans/${id}`)
    onChanged()
  }

  const open = plans.filter((p) => !p.done)
  const done = plans.filter((p) => p.done)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm font-medium">{labels[timeframe]}</p>
        <p className="mb-3 text-xs text-muted-foreground">{hint[timeframe]}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="e.g. Finish chapter 3, apply to Google internship…"
          />
          <div className="flex gap-2">
            <Select value={goalId} onValueChange={setGoalId}>
              <SelectTrigger className="sm:w-[170px]">
                <SelectValue placeholder="Link to goal (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No goal link</SelectItem>
                {goals.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={add} disabled={adding || !title.trim()} className="shrink-0">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-1.5 sm:hidden">Add</span>
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingBlock rows={3} />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : plans.length === 0 ? (
        <EmptyState title={`No ${timeframe} plans yet`} hint="Add your first item above — it will also appear on the dashboard." />
      ) : (
        <div className="space-y-2">
          {open.map((p) => (
            <PlanRow key={p.id} plan={p} onToggle={toggle} onRemove={remove} />
          ))}
          {done.length > 0 && (
            <>
              <p className="pt-2 text-xs font-medium text-muted-foreground">Completed ({done.length})</p>
              {done.map((p) => (
                <PlanRow key={p.id} plan={p} onToggle={toggle} onRemove={remove} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function PlanRow({ plan, onToggle, onRemove }: { plan: Plan; onToggle: (p: Plan) => void; onRemove: (id: string) => void }) {
  const pal = paletteOf(plan.goal?.color)
  return (
    <div className={cn('group flex items-center gap-3 rounded-xl border bg-card px-3.5 py-3', plan.done && 'opacity-60')}>
      <Checkbox checked={plan.done} onCheckedChange={() => onToggle(plan)} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', plan.done && 'line-through text-muted-foreground')}>{plan.title}</p>
        {plan.goal && (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('h-1.5 w-1.5 rounded-full', pal.dot)} />
            {plan.goal.title}
          </p>
        )}
      </div>
      <Tone className="hidden sm:inline-flex">{plan.timeframe}</Tone>
      <button
        onClick={() => onRemove(plan.id)}
        className="opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Delete plan"
      >
        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
      </button>
    </div>
  )
}

// ─── Create goal dialog ─────────────────────────────────────────────

function CreateGoalDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'learning',
    color: 'emerald',
    deadline: '',
    stepsText: '',
  })
  const [saving, setSaving] = useState(false)

  async function create() {
    if (!form.title.trim()) {
      toast({ title: 'Give your goal a title', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await api.post('/api/goals', {
        title: form.title,
        description: form.description,
        category: form.category,
        color: form.color,
        deadline: form.deadline || null,
        steps: form.stepsText
          .split('\n')
          .map((s) => ({ title: s.trim() }))
          .filter((s) => s.title),
      })
      onOpenChange(false)
      setForm({ title: '', description: '', category: 'learning', color: 'emerald', deadline: '', stepsText: '' })
      onCreated()
      toast({ title: 'Goal created', description: 'Break it into steps and start tracking.' })
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to create goal', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New goal</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid gap-1.5">
            <Label htmlFor="goal-title">Goal *</Label>
            <Input
              id="goal-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Land a summer 2026 AI internship"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Why does this matter to you?"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Deadline</Label>
              <Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Color</Label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => setForm({ ...form, color: c })}
                  className={cn(
                    'h-7 w-7 rounded-full transition-transform',
                    paletteOf(c).dot,
                    form.color === c ? 'scale-110 ring-2 ring-offset-2 ring-foreground/30' : 'opacity-70 hover:opacity-100'
                  )}
                />
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Intermediary steps (one per line)</Label>
            <Textarea
              rows={4}
              value={form.stepsText}
              onChange={(e) => setForm({ ...form, stepsText: e.target.value })}
              placeholder={'e.g.\nBuild a portfolio project\nRefresh DSA\nApply to 10 companies'}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={create} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Create goal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
