'use client'

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
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip as ReTooltip } from 'recharts'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { colorHex, EmptyState, SkeletonCard, PriorityDot } from '@/components/shared'
import { fireConfetti } from '@/lib/confetti'
import {
  Target, Plus, Flame, Trash2, Loader2, TrendingUp, CalendarClock, ChevronDown, ChevronRight, Sparkles,
} from 'lucide-react'

const CATEGORIES = ['career', 'learning', 'health', 'personal', 'project']
const COLORS = ['indigo', 'teal', 'emerald', 'amber', 'rose', 'violet', 'cyan']

export function GoalsView() {
  const { toast } = useToast()
  const { data, loading, reload } = useApi<{ goals: Goal[] }>('/api/goals')
  const [createOpen, setCreateOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  async function toggleMilestone(goal: Goal, m: Milestone) {
    const done = !m.done
    try {
      await api.patch(`/api/milestones/${m.id}`, { done })
      reload()
      // If all milestones now done → celebrate
      const remaining = goal.milestones.filter((x) => x.id !== m.id && !x.done).length
      if (done && remaining === 0 && goal.milestones.length > 0) {
        fireConfetti(120)
        await api.patch(`/api/goals/${goal.id}`, { status: 'completed' })
        toast({ title: `🏆 Goal complete: ${goal.title}` })
      }
    } catch {
      toast({ title: 'Could not update milestone', variant: 'destructive' })
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

  return (
    <div className="anim-fade-up space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Goals</h1>
          <p className="text-sm text-muted-foreground">Milestones, streaks and velocity — progress you can see.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New goal
        </Button>
      </div>

      {active.length === 0 ? (
        <EmptyState
          icon={<Target className="h-5 w-5" />}
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
                        <Flame className="h-3.5 w-3.5" /> {goal.streak}
                      </span>
                    )}
                    <button onClick={() => toggleExpand(goal.id)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" aria-label={isOpen ? 'Collapse' : 'Expand milestones'}>
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <Progress value={pct} className="h-2" style={{ ['--progress-bg' as string]: hex }} />
                    <span className="shrink-0 text-xs font-semibold" style={{ color: hex }}>{pct}%</span>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{done}/{goal.milestones.length} milestones</span>
                    {goal.deadline && (
                      <span className={cn('inline-flex items-center gap-1', dl !== null && dl < 0 && 'font-medium text-danger', dl !== null && dl >= 0 && dl <= 14 && 'text-warning')}>
                        <CalendarClock className="h-3 w-3" />
                        {dl !== null && dl < 0 ? `${-dl}d overdue` : dl !== null ? `${dl}d left` : fmtDate(goal.deadline)}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 capitalize">
                      <TrendingUp className="h-3 w-3" /> {goal.velocity?.reduce((a, b) => a + b, 0) ?? 0} milestones / 8wk
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
                        <ReTooltip hide />
                        <Area type="monotone" dataKey="completed" stroke={hex} strokeWidth={1.5} fill={`url(#vel-${goal.id})`} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* milestone checklist */}
                  {isOpen && (
                    <div className="anim-fade-up mt-3 space-y-1.5 border-t pt-3">
                      {goal.milestones.map((m) => (
                        <div key={m.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50">
                          <Checkbox checked={m.done} onCheckedChange={() => toggleMilestone(goal, m)} aria-label={`Toggle ${m.title}`} />
                          <span className={cn('min-w-0 flex-1 truncate text-sm', m.done && 'text-muted-foreground line-through')}>{m.title}</span>
                          {m.completedAt && <span className="shrink-0 text-[10px] text-success">{fmtDate(m.completedAt, { month: 'short', day: 'numeric' })}</span>}
                          <button
                            onClick={async () => {
                              await api.del(`/api/milestones/${m.id}`)
                              reload()
                            }}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                            aria-label="Delete milestone"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <AddMilestoneInline goalId={goal.id} onAdded={reload} />
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {completed.length > 0 && (
        <>
          <h2 className="flex items-center gap-2 pt-3 text-sm font-semibold text-muted-foreground">
            <Sparkles className="h-4 w-4 text-success" /> Completed
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {completed.map((g) => (
              <Card key={g.id} className="border-success/30 bg-success/5">
                <CardContent className="flex items-center gap-2.5 p-3.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorHex(g.color) }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium line-through decoration-success/50">{g.title}</span>
                  <span className="text-[10px] text-muted-foreground">{g.milestones.length} done</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <CreateGoalDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => reload()} />
    </div>
  )
}

function AddMilestoneInline({ goalId, onAdded }: { goalId: string; onAdded: () => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key === 'Enter' && value.trim()) {
            setBusy(true)
            await api.post('/api/milestones', { goalId, title: value.trim() })
            setValue('')
            setBusy(false)
            onAdded()
          }
        }}
        placeholder="Add milestone…"
        className="h-8 text-sm"
      />
      <Button
        size="sm"
        variant="ghost"
        className="h-8"
        disabled={busy || !value.trim()}
        onClick={async () => {
          setBusy(true)
          await api.post('/api/milestones', { goalId, title: value.trim() })
          setValue('')
          setBusy(false)
          onAdded()
        }}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function CreateGoalDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('learning')
  const [color, setColor] = useState('indigo')
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
                      <Trash2 className="h-3.5 w-3.5" />
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
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Create goal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
