'use client'

import { useState } from 'react'
import { api, useApi, fmtDate, daysUntil } from '@/lib/client'
import type { Opportunity } from '@/lib/types'
import { PageHeader, EmptyState, LoadingBlock, ErrorBlock, Tone } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import {
  Plus,
  MailCheck,
  Trash2,
  Loader2,
  Sparkles,
  ExternalLink,
  CalendarClock,
  Wand2,
} from 'lucide-react'

const TYPES = ['internship', 'job', 'scholarship', 'event', 'referral']
const STATUSES = ['new', 'applied', 'interview', 'offer', 'rejected', 'archived']

const STATUS_TONE: Record<string, string> = {
  new: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  applied: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  interview: 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300',
  offer: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300',
  rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
  archived: 'bg-muted text-muted-foreground',
}

const emptyForm = {
  company: '',
  role: '',
  type: 'internship',
  sender: '',
  source: '',
  url: '',
  status: 'new',
  deadline: '',
  notes: '',
}

export function OpportunitiesView() {
  const { data, loading, error, reload } = useApi<{ opportunities: Opportunity[] }>('/api/opportunities')
  const [tab, setTab] = useState('active')
  const [addOpen, setAddOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const opportunities = data?.opportunities ?? []
  const shown =
    tab === 'active'
      ? opportunities.filter((o) => !['archived', 'rejected'].includes(o.status))
      : tab === 'all'
        ? opportunities
        : opportunities.filter((o) => o.status === tab)

  function openAdd(prefill?: Partial<typeof emptyForm>) {
    setEditingId(null)
    setForm({ ...emptyForm, ...prefill })
    setAddOpen(true)
  }

  function openEdit(o: Opportunity) {
    setEditingId(o.id)
    setForm({
      company: o.company,
      role: o.role,
      type: o.type,
      sender: o.sender ?? '',
      source: o.source ?? '',
      url: o.url ?? '',
      status: o.status,
      deadline: o.deadline ? o.deadline.slice(0, 10) : '',
      notes: o.notes ?? '',
    })
    setAddOpen(true)
  }

  async function save() {
    if (!form.company.trim() || !form.role.trim()) {
      toast({ title: 'Company and role are required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await api.patch(`/api/opportunities/${editingId}`, { ...form, deadline: form.deadline || null })
        setAddOpen(false)
        await reload()
        toast({ title: 'Opportunity updated' })
      } else {
        await api.post('/api/opportunities', { ...form, deadline: form.deadline || null })
        setAddOpen(false)
        await reload()
        toast({ title: 'Opportunity saved', description: 'Deadlines show up on the dashboard.' })
      }
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to save', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(o: Opportunity, status: string) {
    await api.patch(`/api/opportunities/${o.id}`, { status })
    reload()
  }

  async function remove(id: string) {
    await api.del(`/api/opportunities/${id}`)
    reload()
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Opportunities" description="Internship & job emails, deadlines and application status — in one board">
        <Button variant="outline" size="sm" onClick={() => setPasteOpen(true)}>
          <Wand2 className="mr-1.5 h-4 w-4" /> Paste email (AI)
        </Button>
        <Button size="sm" onClick={() => openAdd()}>
          <Plus className="mr-1.5 h-4 w-4" /> Add manually
        </Button>
      </PageHeader>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex w-full overflow-x-auto sm:w-auto">
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="new">New</TabsTrigger>
          <TabsTrigger value="applied">Applied</TabsTrigger>
          <TabsTrigger value="interview">Interview</TabsTrigger>
          <TabsTrigger value="offer">Offer</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <LoadingBlock rows={4} />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<MailCheck className="h-8 w-8" />}
          title="No opportunities here yet"
          hint='Forward-worthy: copy any internship/job email, click "Paste email (AI)" and the fields fill themselves. Or add one manually.'
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {shown.map((o) => {
            const dLeft = daysUntil(o.deadline)
            const soon = dLeft !== null && dLeft >= 0 && dLeft <= 7
            const overdue = dLeft !== null && dLeft < 0
            return (
              <div key={o.id} className="group rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <button className="min-w-0 text-left" onClick={() => openEdit(o)} aria-label={`Edit ${o.company}`}>
                    <p className="truncate text-sm font-semibold transition-colors hover:text-foreground">{o.company}</p>
                    <p className="truncate text-sm text-muted-foreground underline-offset-2 group-hover:underline">{o.role}</p>
                  </button>
                  <Tone className={cn('shrink-0 capitalize', STATUS_TONE[o.status] ?? '')}>{o.status}</Tone>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Tone className="capitalize">{o.type}</Tone>
                  {o.sender && <span>from {o.sender}</span>}
                  {o.source && <span>· via {o.source}</span>}
                </div>

                {o.deadline && (
                  <p
                    className={cn(
                      'mt-2 flex items-center gap-1.5 text-xs font-medium',
                      overdue ? 'text-rose-600 dark:text-rose-400' : soon ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                    )}
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    {overdue ? `Deadline passed ${fmtDate(o.deadline, { month: 'short', day: 'numeric' })}` : `Deadline ${fmtDate(o.deadline, { month: 'short', day: 'numeric' })} · ${dLeft}d left`}
                  </p>
                )}

                {o.notes && <p className="mt-2 line-clamp-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">{o.notes}</p>}

                <div className="mt-3 flex items-center justify-between gap-2">
                  <Select value={o.status} onValueChange={(v) => setStatus(o, v)}>
                    <SelectTrigger className="h-8 w-[130px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1">
                    {o.url && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                        <a href={o.url} target="_blank" rel="noreferrer" aria-label="Open link">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => remove(o.id)}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Paste email dialog */}
      <PasteEmailDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        onExtracted={(result) => {
          setPasteOpen(false)
          openAdd({
            company: result.company,
            role: result.role,
            type: result.type,
            sender: result.sender,
            deadline: result.deadline ?? '',
            notes: result.summary,
            source: 'Email (AI parsed)',
          })
        }}
      />

      {/* Add / edit dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add opportunity</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Company *</Label>
                <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Role *</Label>
                <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Deadline</Label>
                <Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Sender</Label>
                <Input value={form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })} placeholder="recruiter name" />
              </div>
              <div className="grid gap-1.5">
                <Label>Source</Label>
                <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Gmail, LinkedIn…" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Link</Label>
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
            </div>
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── AI email parser ────────────────────────────────────────────────

function PasteEmailDialog({
  open,
  onOpenChange,
  onExtracted,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onExtracted: (r: { company: string; role: string; type: string; sender: string; deadline: string | null; summary: string }) => void
}) {
  const [text, setText] = useState('')
  const [parsing, setParsing] = useState(false)

  async function parse() {
    if (!text.trim()) return
    setParsing(true)
    try {
      const res = await api.post<{ result: { company: string; role: string; type: string; sender: string; deadline: string | null; summary: string } }>(
        '/api/opportunities/parse',
        { text }
      )
      toast({ title: 'Email parsed', description: 'Check the details and save.' })
      onExtracted(res.result)
      setText('')
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Parsing failed', variant: 'destructive' })
    } finally {
      setParsing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Paste an email
          </DialogTitle>
          <DialogDescription>
            Copy any internship/job email body below — AI extracts company, role, type and deadline, then opens a pre-filled form.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'From: recruiting@company.com\n\nHi, we would love to invite you to interview for our Summer 2026 AI Residency…'}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={parse} disabled={parsing || !text.trim()}>
            {parsing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}
            {parsing ? 'Extracting…' : 'Extract details'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
