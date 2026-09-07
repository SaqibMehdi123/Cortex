'use client'

import { FaArrowTrendUp, FaBullseye, FaCalendarDay, FaCheck, FaChevronDown, FaChevronRight, FaCircleCheck, FaEllipsis, FaFire, FaPencil, FaPlus, FaRotateLeft, FaSpinner, FaTrashCan } from 'react-icons/fa6'
import { useState } from 'react'
import { api, fmtDate, daysUntil } from '@/lib/client'
import type { Goal, Milestone } from '@/lib/types'
import { useApi } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { colorHex, EmptyState, SkeletonCard, PriorityDot } from '@/components/shared'
import { fireConfetti } from '@/lib/confetti'

const CATEGORIES = ['career', 'learning', 'health', 'personal', 'project']
const COLORS = ['teal', 'emerald', 'amber', 'rose', 'violet', 'cyan']

export function GoalsView() {
  const { toast } = useToast()
  const { data, loading, reload } = useApi<{ goals: Goal[] }>('/api/goals')
  const [createOpen, setCreateOpen] = useState(false)
  const [editGoal, setEditGoal] = useState<Goal | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  async function toggleMilestone(goal: Goal, m: Milestone) {
    const done = !m.done
    try {
      await api.patch(`/api/milestones/${m.id}`, { done })
      // Reopening a milestone of a completed goal brings the goal back to active
      if (!done && goal.status === 'completed') {
        await api.patch(`/api/goals/${goal.id}`, { status: 'active' })
        toast({ title: 'Goal reopened', description: 'It moved back to your active goals.' })
      }
      reload()
      // If all milestones now done → celebrate
      if (done) {
        const remaining = goal.milestones.filter((x) => x.id !== m.id && !x.done).length
        if (remaining === 0 && goal.milestones.length > 0 && goal.status !== 'completed') {
          fireConfetti(120)
          await api.patch(`/api/goals/${goal.id}`, { status: 'completed' })
          toast({ title: `Goal complete: ${goal.title}`, description: 'You can reopen or edit it anytime from the goal menu.' })
        }
      }
    } catch {
      toast({ title: 'Could not update milestone', variant: 'destructive' })
    }
  }

  async function setStatus(goal: Goal, status: 'active' | 'completed') {
    try {
      await api.patch(`/api/goals/${goal.id}`, { status })
      reload()
      if (status === 'completed') fireConfetti(120)
      toast({ title: status === 'completed' ? `Goal complete: ${goal.title}` : `Goal reopened: ${goal.title}` })
    } catch {
      toast({ title: 'Could not update the goal', variant: 'destructive' })
    }
  }

  async function deleteGoal(goal: Goal) {
    try {
      await api.del(`/api/goals/${goal.id}`)
      reload()
      toast({ title: 'Goal deleted' })
    } catch {
      toast({ title: 'Could not delete goal', variant: 'destructive' })
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading || !data) {
    return (
      <div className="grid gap-4 pb-8 lg:grid-cols-2">
        {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} className="h-56" />)}
      </div>
    )
  }

  const active = data.goals.filter((g) => g.status === 'active')
  const completed = data.goals.filter((g) => g.status === 'completed')

  const goalMenu = (goal: Goal) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`Actions for ${goal.title}`}
        >
          <FaEllipsis className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => setEditGoal(goal)}>
          <FaPencil className="mr-2 h-3.5 w-3.5" /> Edit goal
        </DropdownMenuItem>
        {goal.status === 'completed' ? (
          <DropdownMenuItem onClick={() => setStatus(goal, 'active')}>
            <FaRotateLeft className="mr-2 h-3.5 w-3.5" /> Reopen goal
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => setStatus(goal, 'completed')}>
            <FaCircleCheck className="mr-2 h-3.5 w-3.5" /> Mark complete
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => deleteGoal(goal)} className="text-danger focus:text-danger">
          <FaTrashCan className="mr-2 h-3.5 w-3.5" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const renderMilestones = (goal: Goal) => (
    <div className="anim-fade-up mt-3 space-y-1.5 border-t pt-3">
      {goal.milestones.map((m) => (
        <MilestoneRow key={m.id} m={m} onToggle={() => toggleMilestone(goal, m)} onDeleted={reload} />
      ))}
      <AddMilestoneInline goalId={goal.id} onAdded={reload} />
    </div>
  )

  return (
    <div className="anim-fade-up space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracking-tight sm:text-[1.7rem]">Goals</h1>
          <p className="text-sm text-muted-foreground">Milestones, streaks and velocity — progress you can see.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <FaPlus className="mr-1.5 h-4 w-4" /> New goal
        </Button>
      </div>

      {active.length === 0 ? (
        <EmptyState
          icon={<FaBullseye className="h-5 w-5" />}
          title="Set your first goal"
          description="Break a big ambition into milestones, check them off, and watch the progress ring and streak build up."
          action={{ label: 'Create a goal', onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {active.map((goal) => {
            const done = goal.milestones.filter((m) => m.done).length
            const pct = goal.milestones.length ? Math.round((done / goal.milestones.length) * 100) : 0
            const dl = daysUntil(goal.deadline)
            const isOpen = expanded.has(goal.id)
            const hex = colorHex(goal.color)
            const velData = (goal.velocity ?? []).map((v, i) => ({ week: `W${i + 1}`, completed: v }))

            return (
              <Card key={goal.id} className="transition-shadow hover:shadow-soft">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: hex }} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">{goal.title}</p>
                      {goal.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{goal.description}</p>}
                    </div>
                    {goal.streak > 0 && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-warning/10 px-2 py-1 text-xs font-semibold text-warning">
                        <FaFire className="h-3.5 w-3.5" /> {goal.streak}
                      </span>
                    )}
                    {goalMenu(goal)}
                    <button onClick={() => toggleExpand(goal.id)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" aria-label={isOpen ? 'Collapse' : 'Expand milestones'}>
                      {isOpen ? <FaChevronDown className="h-4 w-4" /> : <FaChevronRight className="h-4 w-4" />}
                    </button>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <Progress value={pct} className="h-2" style={{ ['--progress-bg' as string]: hex }} />
                    <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: hex }}>{pct}%</span>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="tabular-nums">{done}/{goal.milestones.length} milestones</span>
                    {goal.deadline && (
                      <span className={cn('inline-flex items-center gap-1', dl !== null && dl < 0 && 'font-medium text-danger', dl !== null && dl >= 0 && dl <= 14 && 'text-warning')}>
                        <FaCalendarDay className="h-3 w-3" />
                        {dl !== null && dl < 0 ? `${-dl}d overdue` : dl !== null ? `${dl}d left` : fmtDate(goal.deadline)}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <FaArrowTrendUp className="h-3 w-3" /> {goal.velocity?.reduce((a, b) => a + b, 0) ?? 0} milestones / 8wk
                    </span>
                  </div>

                  {/* mini velocity sparkline */}
                  <div className="mt-3 h-14">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={velData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                        <defs>
                          <linearGradient id={`vel-${goal.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={hex} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={hex} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="week" hide />
                        <YAxis hide allowDecimals={false} />
                        <Area type="monotone" dataKey="completed" stroke={hex} strokeWidth={1.5} fill={`url(#vel-${goal.id})`} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* milestone checklist */}
                  {isOpen && renderMilestones(goal)}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {completed.length > 0 && (
        <>
          <h2 className="flex items-center gap-2 pt-3 text-sm font-semibold text-muted-foreground">
            Completed
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {completed.map((goal) => {
              const done = goal.milestones.filter((m) => m.done).length
              const pct = goal.milestones.length ? Math.round((done / goal.milestones.length) * 100) : 100
              const isOpen = expanded.has(goal.id)
              const hex = colorHex(goal.color)

              return (
                <Card key={goal.id} className="border-success/30 bg-success/5 transition-shadow hover:shadow-soft">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: hex }} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-snug">{goal.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Completed{goal.completedAt ? ` ${fmtDate(goal.completedAt, { month: 'short', day: 'numeric' })}` : ''} · {goal.milestones.length} milestones
                        </p>
                      </div>
                      <button
                        onClick={() => setStatus(goal, 'active')}
                        className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-success/40 bg-background px-2 text-xs font-medium text-success transition-colors hover:bg-success/10"
                        aria-label={`Reopen ${goal.title}`}
                      >
                        <FaRotateLeft className="h-3.5 w-3.5" /> Reopen
                      </button>
                      {goalMenu(goal)}
                      {goal.milestones.length > 0 && (
                        <button onClick={() => toggleExpand(goal.id)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" aria-label={isOpen ? 'Collapse' : 'Expand milestones'}>
                          {isOpen ? <FaChevronDown className="h-4 w-4" /> : <FaChevronRight className="h-4 w-4" />}
                        </button>
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-3">
                      <Progress value={pct} className="h-2" style={{ ['--progress-bg' as string]: hex }} />
                      <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: hex }}>{pct}%</span>
                    </div>

                    {/* milestones stay fully editable — unchecking one reopens the goal */}
                    {isOpen && goal.milestones.length > 0 && renderMilestones(goal)}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      <CreateGoalDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => reload()} />
      <EditGoalDialog goal={editGoal} onOpenChange={(v) => !v && setEditGoal(null)} onSaved={() => reload()} />
    </div>
  )
}

// ─── Milestone row with toggle, rename and delete ───────────────────
function MilestoneRow({ m, onToggle, onDeleted }: { m: Milestone; onToggle: () => void; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(m.title)
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  async function save() {
    const t = title.trim()
    if (!t || t === m.title) return setEditing(false)
    setBusy(true)
    try {
      await api.patch(`/api/milestones/${m.id}`, { title: t })
      setEditing(false)
      onDeleted()
    } catch {
      toast({ title: 'Could not rename milestone', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-2 py-1">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') {
              setTitle(m.title)
              setEditing(false)
            }
          }}
          className="h-8 text-sm"
          autoFocus
          aria-label="Milestone title"
        />
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={save} disabled={busy} aria-label="Save title">
          {busy ? <FaSpinner className="h-3.5 w-3.5 animate-spin" /> : <FaCheck className="h-3.5 w-3.5" />}
        </Button>
      </div>
    )
  }

  return (
    <div className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50">
      <Checkbox checked={m.done} onCheckedChange={onToggle} aria-label={`Toggle ${m.title}`} />
      <span className={cn('min-w-0 flex-1 truncate text-sm', m.done && 'text-muted-foreground line-through')}>{m.title}</span>
      {m.completedAt && <span className="shrink-0 text-[10px] text-success">{fmtDate(m.completedAt, { month: 'short', day: 'numeric' })}</span>}
      <button
        onClick={() => setEditing(true)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        aria-label="Rename milestone"
      >
        <FaPencil className="h-3 w-3" />
      </button>
      <button
        onClick={async () => {
          await api.del(`/api/milestones/${m.id}`)
          onDeleted()
        }}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
        aria-label="Delete milestone"
      >
        <FaTrashCan className="h-3 w-3" />
      </button>
    </div>
  )
}

function AddMilestoneInline({ goalId, onAdded }: { goalId: string; onAdded: () => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!value.trim() || busy) return
    setBusy(true)
    await api.post('/api/milestones', { goalId, title: value.trim() })
    setValue('')
    setBusy(false)
    onAdded()
  }

  return (
    <div className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add()
        }}
        placeholder="Add milestone…"
        className="h-8 text-sm"
      />
      <Button size="sm" variant="ghost" className="h-8" disabled={busy || !value.trim()} onClick={add}>
        <FaPlus className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// ─── Create goal ────────────────────────────────────────────────────
function CreateGoalDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('learning')
  const [color, setColor] = useState('teal')
  const [deadline, setDeadline] = useState('')
  const [milestoneInput, setMilestoneInput] = useState('')
  const [milestones, setMilestones] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  async function create() {
    if (!title.trim()) return
    setBusy(true)
    try {
      await api.post('/api/goals', {
        title, description, category, color,
        deadline: deadline || undefined,
        milestones: milestones.map((m) => ({ title: m })),
      })
      setTitle(''); setDescription(''); setMilestones([]); setDeadline('')
      onOpenChange(false)
      onCreated()
    } catch {
      toast({ title: 'Failed to create goal', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New goal</DialogTitle>
          <DialogDescription>Describe the outcome, then list the milestones (intermediary steps) that get you there.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Land a 2027 summer internship" aria-label="Goal title" autoFocus />
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why does this matter? (optional)" className="min-h-[60px]" aria-label="Description" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Deadline</label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Color</label>
            <div className="mt-1.5 flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn('h-7 w-7 rounded-full border-2 transition-transform hover:scale-110', color === c ? 'border-foreground' : 'border-transparent')}
                  style={{ background: colorHex(c) }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Milestones</label>
            <div className="mt-1.5 flex gap-2">
              <Input
                value={milestoneInput}
                onChange={(e) => setMilestoneInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && milestoneInput.trim()) {
                    e.preventDefault()
                    setMilestones((m) => [...m, milestoneInput.trim()])
                    setMilestoneInput('')
                  }
                }}
                placeholder="e.g. Finish portfolio site"
              />
              <Button variant="secondary" onClick={() => {
                if (milestoneInput.trim()) {
                  setMilestones((m) => [...m, milestoneInput.trim()])
                  setMilestoneInput('')
                }
              }}>Add</Button>
            </div>
            {milestones.length > 0 && (
              <ul className="mt-2 space-y-1">
                {milestones.map((m, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm">
                    <PriorityDot priority="med" /> <span className="flex-1">{m}</span>
                    <button onClick={() => setMilestones((ms) => ms.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-danger" aria-label="Remove">
                      <FaTrashCan className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={create} disabled={busy || !title.trim()}>
            {busy && <FaSpinner className="mr-1.5 h-4 w-4 animate-spin" />} Create goal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit goal — works for active AND completed goals ───────────────
function EditGoalDialog({ goal, onOpenChange, onSaved }: { goal: Goal | null; onOpenChange: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('learning')
  const [color, setColor] = useState('teal')
  const [deadline, setDeadline] = useState('')
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()
  const [loadedFor, setLoadedFor] = useState<string | null>(null)

  // prefill whenever a different goal is opened
  if (goal && loadedFor !== goal.id) {
    setLoadedFor(goal.id)
    setTitle(goal.title)
    setDescription(goal.description ?? '')
    setCategory(goal.category)
    setColor(goal.color)
    setDeadline(goal.deadline ? goal.deadline.slice(0, 10) : '')
  }

  async function save() {
    if (!goal || !title.trim()) return
    setBusy(true)
    try {
      await api.patch(`/api/goals/${goal.id}`, {
        title: title.trim(), description, category, color,
        deadline: deadline || null,
      })
      toast({ title: 'Goal updated' })
      onOpenChange()
      onSaved()
    } catch {
      toast({ title: 'Failed to update goal', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!goal} onOpenChange={(v) => !v && onOpenChange()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit goal</DialogTitle>
          <DialogDescription>Change anything — title, deadline, color. Works for completed goals too.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Goal title" aria-label="Goal title" autoFocus />
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why does this matter? (optional)" className="min-h-[60px]" aria-label="Description" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Deadline</label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Color</label>
            <div className="mt-1.5 flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn('h-7 w-7 rounded-full border-2 transition-transform hover:scale-110', color === c ? 'border-foreground' : 'border-transparent')}
                  style={{ background: colorHex(c) }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onOpenChange}>Cancel</Button>
          <Button onClick={save} disabled={busy || !title.trim()}>
            {busy && <FaSpinner className="mr-1.5 h-4 w-4 animate-spin" />} Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
