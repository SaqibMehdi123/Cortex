'use client'

import { FaBookmark, FaBriefcase, FaClock, FaEnvelope, FaFileLines, FaGraduationCap, FaGripVertical, FaInbox, FaLandmark, FaLocationDot, FaMagnifyingGlass, FaPlus, FaRegBookmark, FaRotate, FaSpinner, FaTowerBroadcast, FaTrashCan, FaTriangleExclamation, FaUpRightFromSquare } from 'react-icons/fa6'
import { useEffect, useMemo, useState } from 'react'
import { api, fmtDate, daysUntil, useApi } from '@/lib/client'
import type { Opportunity, JobListing, ListingIndex, ListingFetchResult, Scholarship, ScholarshipIndex, ScholarshipFetchResult } from '@/lib/types'
import { timeAgo } from '@/lib/timeago'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { SkeletonCard, EmptyState } from '@/components/shared'
import { useUI } from '@/lib/nav-config'
import { useAutoSync } from '@/hooks/use-auto-sync'

const STAGES = [
  { key: 'saved', label: 'Saved', color: 'bg-zinc-400' },
  { key: 'applied', label: 'Applied', color: 'bg-primary' },
  { key: 'interview', label: 'Interview', color: 'bg-warning' },
  { key: 'offer', label: 'Offer', color: 'bg-success' },
  { key: 'rejected', label: 'Rejected', color: 'bg-danger' },
]

const CLASSIFICATION_STYLE: Record<string, string> = {
  opportunity: 'bg-primary/10 text-primary',
  rejection: 'bg-danger/10 text-danger',
  interview: 'bg-warning/10 text-warning',
  offer: 'bg-success/10 text-success',
  deadline: 'bg-danger/10 text-danger',
}

const TYPE_STYLE: Record<string, string> = {
  job: 'bg-primary/10 text-primary',
  internship: 'bg-warning/10 text-warning',
  research: 'bg-success/10 text-success',
}

// Discover role-group filter labels (server classifies titles into families).
const FAMILY_LABELS: Record<string, string> = {
  research: 'Research',
  engineering: 'Engineering',
  data: 'Data & AI',
  product: 'Product',
  design: 'Design',
  gtm: 'Sales & Marketing',
  ops: 'Operations',
  other: 'Other roles',
}

function companyAvatar(company: string) {
  let hash = 0
  for (let i = 0; i < company.length; i++) hash = (hash * 31 + company.charCodeAt(i)) >>> 0
  const hue = hash % 360
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
      style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 45%))` }}
      aria-hidden
    >
      {company.charAt(0).toUpperCase()}
    </span>
  )
}

export function CareerView() {
  const [tab, setTab] = useState<'pipeline' | 'discover' | 'scholarships'>('pipeline')

  return (
    <div className="anim-fade-up space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Career</h1>
          <p className="text-sm text-muted-foreground">
            {tab === 'pipeline'
              ? 'Internship & job pipeline.'
              : tab === 'discover'
                ? 'Live listings from authentic sources — save any into your pipeline.'
                : 'Masters & PhD scholarships, fellowships and funded programs, refreshed for you.'}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border bg-muted/40 p-1">
          <button
            onClick={() => setTab('pipeline')}
            className={cn(
              'flex min-h-[32px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors',
              tab === 'pipeline' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <FaBriefcase className="h-3.5 w-3.5" /> Pipeline
          </button>
          <button
            onClick={() => setTab('discover')}
            className={cn(
              'flex min-h-[32px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors',
              tab === 'discover' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <FaTowerBroadcast className="h-3.5 w-3.5" /> Discover
          </button>
          <button
            onClick={() => setTab('scholarships')}
            className={cn(
              'flex min-h-[32px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors',
              tab === 'scholarships' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <FaGraduationCap className="h-3.5 w-3.5" /> Scholarships
          </button>
        </div>
      </div>

      {tab === 'pipeline' ? <PipelineTab /> : tab === 'discover' ? <DiscoverTab /> : <ScholarshipsTab />}
    </div>
  )
}

function PipelineTab() {
  const { toast } = useToast()
  const setView = useUI((s) => s.setView)
  const { data, loading, reload } = useApi<{ opportunities: Opportunity[] }>('/api/opportunities')
  const [addOpen, setAddOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)

  async function scanGmail() {
    setScanning(true)
    try {
      const r = await api.post<{ scanned: number; imported: number; skipped: number; message?: string }>('/api/gmail/import')
      toast({
        title: r.imported > 0 ? `${r.imported} new applications from Gmail` : 'Nothing new in your inbox',
        description: r.message ?? `Scanned ${r.scanned} emails · ${r.skipped} already imported or irrelevant.`,
      })
      reload()
    } catch (e) {
      toast({
        title: 'Gmail scan failed',
        description: e instanceof Error && e.message.includes('not connected') ? 'Connect your Google account in Settings first.' : e instanceof Error ? e.message : 'Try again.',
        variant: 'destructive',
      })
      if (e instanceof Error && e.message.includes('not connected')) setView('settings')
    } finally {
      setScanning(false)
    }
  }

  async function moveStage(id: string, status: string) {
    try {
      await api.patch(`/api/opportunities/${id}`, { status })
      reload()
    } catch {
      toast({ title: 'Could not move card', variant: 'destructive' })
    }
  }

  const opportunities = data?.opportunities ?? []
  const nextDeadline = opportunities
    .filter((o) => o.deadline && o.status !== 'rejected' && o.status !== 'archived')
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())[0]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {nextDeadline?.deadline ? `Next deadline: ${nextDeadline.company} in ${Math.max(0, daysUntil(nextDeadline.deadline))}d.` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={scanGmail} disabled={scanning}>
            {scanning ? <FaSpinner className="mr-1.5 h-4 w-4 animate-spin" /> : <FaInbox className="mr-1.5 h-4 w-4" />}
            {scanning ? 'Scanning inbox…' : 'Scan Gmail'}
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <FaPlus className="mr-1.5 h-4 w-4" /> Add application
          </Button>
        </div>
      </div>

      {/* Gmail note */}
      <div className="flex items-start gap-2.5 rounded-xl border border-dashed bg-card px-4 py-3 text-xs text-muted-foreground">
        <FaEnvelope className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          <b className="text-foreground">Gmail, for real:</b> connect your Google account in Settings → Google account, then hit “Scan Gmail” —
          career emails from the last 60 days are classified (opportunity / rejection / interview / offer / deadline) and land on this board automatically.
          Manual paste still works via “Add application”.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} className="h-48" />)}
        </div>
      ) : opportunities.length === 0 ? (
        <EmptyState
          icon={<FaBriefcase className="h-5 w-5" />}
          title="Your pipeline is empty"
          description="Add applications manually or paste a job email — AI fills in company, role, deadline and stage for you."
          action={{ label: 'Add first application', onClick: () => setAddOpen(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {STAGES.map((stage) => {
            const cards = opportunities.filter((o) => o.status === stage.key)
            return (
              <div
                key={stage.key}
                className="rounded-xl border bg-muted/30 p-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragId) moveStage(dragId, stage.key)
                  setDragId(null)
                }}
              >
                <p className="flex items-center gap-2 px-1.5 pb-2 pt-1 text-xs font-semibold text-muted-foreground">
                  <span className={cn('h-2 w-2 rounded-full', stage.color)} />
                  {stage.label}
                  <span className="ml-auto text-[10px] font-normal">{cards.length}</span>
                </p>
                <div className="space-y-2">
                  {cards.map((o) => {
                    const dl = daysUntil(o.deadline)
                    return (
                      <Card
                        key={o.id}
                        draggable
                        onDragStart={() => setDragId(o.id)}
                        onDragEnd={() => setDragId(null)}
                        className={cn('group cursor-grab border transition-shadow hover:shadow-soft active:cursor-grabbing', dragId === o.id && 'opacity-50')}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start gap-2.5">
                            {companyAvatar(o.company)}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{o.company}</p>
                              <p className="truncate text-xs text-muted-foreground">{o.role}</p>
                            </div>
                            <FaGripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="text-[10px] capitalize">{o.type}</Badge>
                            {o.classification && o.classification !== 'opportunity' && (
                              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium capitalize', CLASSIFICATION_STYLE[o.classification])}>
                                {o.classification}
                              </span>
                            )}
                          </div>
                          {o.deadline && (
                            <p className={cn('mt-2 flex items-center gap-1 text-[10px] font-medium', dl !== null && dl < 0 ? 'text-danger' : dl !== null && dl <= 7 ? 'text-warning' : 'text-muted-foreground')}>
                              <FaClock className="h-3 w-3" />
                              {dl !== null && dl < 0 ? `${-dl}d overdue` : dl === 0 ? 'due today' : `${dl}d left`}
                              {fmtDate(o.deadline, { month: 'short', day: 'numeric' }) ? ` · ${fmtDate(o.deadline, { month: 'short', day: 'numeric' })}` : ''}
                            </p>
                          )}
                          {o.resume && (
                            <p className="mt-1 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                              <FaFileLines className="h-3 w-3" /> {o.resume}
                            </p>
                          )}
                          {o.nextAction && <p className="mt-1 line-clamp-1 text-[10px] italic text-muted-foreground">→ {o.nextAction}</p>}
                          <button
                            onClick={async () => {
                              await api.del(`/api/opportunities/${o.id}`)
                              reload()
                            }}
                            className="mt-1.5 flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                            aria-label="Delete application"
                          >
                            <FaTrashCan className="h-3 w-3" />
                          </button>
                        </CardContent>
                      </Card>
                    )
                  })}
                  {cards.length === 0 && <p className="py-5 text-center text-[10px] text-muted-foreground">Drag cards here</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AddApplicationDialog open={addOpen} onOpenChange={setAddOpen} onCreated={() => { reload(); setView('career') }} />
    </div>
  )
}

function AddApplicationDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [mode, setMode] = useState<'email' | 'manual'>('email')
  const [emailText, setEmailText] = useState('')
  const [parseBusy, setParseBusy] = useState(false)
  const [parsedNote, setParsedNote] = useState<string | null>(null)
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [type, setType] = useState('internship')
  const [status, setStatus] = useState('saved')
  const [deadline, setDeadline] = useState('')
  const [resume, setResume] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  async function parseEmail() {
    if (!emailText.trim()) return
    setParseBusy(true)
    setParsedNote(null)
    try {
      const { result } = await api.post<{
        result: { company: string; role: string; type: string; classification: string; deadline: string | null; nextAction: string | null; summary: string }
      }>('/api/opportunities/parse', { text: emailText })
      setCompany(result.company || '')
      setRole(result.role || '')
      setType(result.type || 'internship')
      setStatus(result.classification === 'rejection' ? 'rejected' : result.classification === 'offer' ? 'offer' : result.classification === 'interview' ? 'interview' : 'saved')
      setDeadline(result.deadline ?? '')
      setNotes([result.summary, result.nextAction ? `Next: ${result.nextAction}` : null].filter(Boolean).join('\n'))
      setParsedNote(result.summary)
      toast({ title: 'AI extracted the details', description: 'Review and save.' })
    } catch (e) {
      toast({ title: 'AI parse failed', description: e instanceof Error ? e.message : 'Fill the form manually.', variant: 'destructive' })
    } finally {
      setParseBusy(false)
    }
  }

  async function save() {
    if (!company.trim() || !role.trim()) {
      toast({ title: 'Company and role are required', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      await api.post('/api/opportunities', {
        company, role, type, status, resume, notes,
        deadline: deadline || undefined,
        source: mode === 'email' ? 'Gmail (pasted)' : 'manual',
      })
      setCompany(''); setRole(''); setDeadline(''); setResume(''); setNotes(''); setEmailText(''); setParsedNote(null)
      onOpenChange(false)
      onCreated()
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto scroll-thin sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add application</DialogTitle>
          <DialogDescription>Paste a job/internship email and let AI fill the form — or enter it manually.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1.5">
          <button onClick={() => setMode('email')} className={cn('flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors', mode === 'email' ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
            <FaTriangleExclamation className="h-3.5 w-3.5" /> Parse an email
          </button>
          <button onClick={() => setMode('manual')} className={cn('flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors', mode === 'manual' ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
            Manual entry
          </button>
        </div>

        {mode === 'email' && (
          <div className="space-y-2">
            <Textarea
              value={emailText}
              onChange={(e) => setEmailText(e.target.value)}
              placeholder={'From: careers@company.com\nSubject: Summer 2027 Internship — applications close Oct 1\n\nHi, we invite you to apply…'}
              className="min-h-[130px] font-mono text-xs"
              aria-label="Email text"
            />
            <Button variant="secondary" size="sm" onClick={parseEmail} disabled={parseBusy || !emailText.trim()} className="w-full">
              {parseBusy ? <FaSpinner className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FaEnvelope className="mr-1.5 h-3.5 w-3.5" />}
              Parse with AI
            </Button>
            {parsedNote && <p className="rounded-lg bg-success/10 px-3 py-2 text-xs text-success">{parsedNote}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="co">Company</Label>
            <Input id="co" value={company} onChange={(e) => setCompany(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="ro">Role</Label>
            <Input id="ro" value={role} onChange={(e) => setRole(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Type</Label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" aria-label="Type">
              {['internship', 'job', 'research', 'scholarship', 'event', 'referral'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <Label>Stage</Label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" aria-label="Stage">
              {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="dl">Deadline</Label>
            <Input id="dl" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="re">Resume version</Label>
            <Input id="re" value={resume} onChange={(e) => setResume(e.target.value)} placeholder="e.g. resume-swe-v3.pdf" className="mt-1" />
          </div>
        </div>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (AI fills from email)" className="min-h-[60px]" aria-label="Notes" />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>
            {busy && <FaSpinner className="mr-1.5 h-4 w-4 animate-spin" />} Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const TYPE_LABELS: Array<{ key: string; label: string }> = [
  { key: '', label: 'All' },
  { key: 'job', label: 'Jobs' },
  { key: 'internship', label: 'Internships' },
  { key: 'research', label: 'Research' },
]

function DiscoverTab() {
  const { toast } = useToast()
  const [type, setType] = useState('')
  const [family, setFamily] = useState('')
  const [source, setSource] = useState('')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [savedOnly, setSavedOnly] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // debounce the search box so we don't hit the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setQ(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const url = useMemo(() => {
    const p = new URLSearchParams()
    if (type) p.set('type', type)
    if (family) p.set('family', family)
    if (source) p.set('source', source)
    if (q.trim()) p.set('q', q.trim())
    if (savedOnly) p.set('saved', '1')
    const s = p.toString()
    return `/api/opportunities/listings${s ? `?${s}` : ''}`
  }, [type, family, source, q, savedOnly])

  const { data, loading, reload } = useApi<ListingIndex>(url)

  // Hybrid auto-sync: first visit (empty board) or data older than 3h quietly
  // refreshes in the background; the manual button always force-runs.
  const { autoFetching, lastFetchedAt, manualSync } = useAutoSync({
    key: 'jobs',
    statusEndpoint: '/api/opportunities/status',
    fetchEndpoint: '/api/opportunities/fetch',
    onAutoFetched: (r) => {
      const added = typeof r.added === 'number' ? r.added : 0
      if (added > 0) {
        reload()
        toast({ title: 'Listings refreshed', description: `${added} new opportunities arrived from official boards.` })
      }
    },
  })

  async function fetchListings() {
    setFetching(true)
    try {
      const r = await manualSync()
      if (!r) {
        toast({ title: 'Fetch failed', description: 'Try again in a moment.', variant: 'destructive' })
      } else {
        const added = typeof r.added === 'number' ? r.added : 0
        const sources = (r.sources as Array<{ name: string; ok: boolean; count: number }> | undefined) ?? []
        const ok = sources.filter((s) => s.ok).length
        toast({
          title: added > 0 ? `${added} new listings fetched` : 'Already up to date',
          description: `${(typeof r.total === 'number' ? r.total : 0)} listings on the board · ${ok}/${sources.length} sources responded.`,
        })
      }
      reload()
    } finally {
      setFetching(false)
    }
  }

  async function toggleSave(l: JobListing) {
    setBusyId(l.id)
    try {
      await api.patch(`/api/opportunities/listings/${l.id}`, { saved: !l.saved })
      if (!l.saved) toast({ title: 'Saved to pipeline', description: `${l.role} at ${l.company} now sits on your pipeline board.` })
      reload()
    } catch {
      toast({ title: 'Could not update listing', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const listings = data?.listings ?? []
  const counts = data?.counts ?? {}
  const total = data?.total ?? 0
  const roleFamilies = data?.roleFamilies ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Pulled live from official company ATS boards (Anthropic, Mistral AI, Databricks, Together AI, Scale AI, Figure AI, Imbue) and
          the RemoteOK & Remotive public job APIs. Refreshes automatically every few hours — or force a pull anytime.
        </p>
        <div className="flex items-center gap-2">
          {lastFetchedAt && !fetching && !autoFetching && <span className="hidden text-xs text-muted-foreground sm:inline">Updated {timeAgo(lastFetchedAt)}</span>}
          {autoFetching && <span className="hidden text-xs text-muted-foreground sm:inline">Refreshing in background…</span>}
          <Button onClick={fetchListings} disabled={fetching || autoFetching}>
            {(fetching || autoFetching) ? <FaSpinner className="mr-1.5 h-4 w-4 animate-spin" /> : <FaRotate className="mr-1.5 h-4 w-4" />}
            {fetching ? 'Fetching…' : 'Fetch latest'}
          </Button>
        </div>
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {TYPE_LABELS.map((t) => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                type === t.key ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {t.label}
              {t.key && counts[t.key] ? <span className="ml-1 text-[10px] opacity-70">{counts[t.key]}</span> : null}
            </button>
          ))}
          <button
            onClick={() => setSavedOnly(!savedOnly)}
            className={cn(
              'flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              savedOnly ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <FaBookmark className="h-3.5 w-3.5" /> Saved
          </button>
        </div>
        <div className="ml-auto flex w-full min-w-0 items-center gap-2 sm:w-auto">
          {data?.sources && data.sources.length > 0 && (
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="h-9 min-w-0 rounded-md border bg-background px-2 text-xs"
              aria-label="Filter by source"
            >
              <option value="">All sources</option>
              {data.sources.map((s) => (
                <option key={s.name} value={s.name}>{s.name} ({s.count})</option>
              ))}
            </select>
          )}
          <div className="relative min-w-0 flex-1 sm:w-44 sm:flex-none">
            <FaMagnifyingGlass className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search listings…"
              className="h-9 w-full pl-8 text-xs"
              aria-label="Search listings"
            />
          </div>
        </div>
      </div>

      {/* role filter — groups titles into families (Engineering, Research, …).
          Phones get a compact dropdown: 8+ pills wrap into 4+ rows on a 390px
          viewport and bury the listings. Desktop keeps the tappable pills. */}
      {roleFamilies.length > 0 && (
        <>
          <div className="flex items-center gap-2 sm:hidden">
            <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <FaBriefcase className="h-3 w-3" /> Role
            </span>
            <select
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs"
              aria-label="Filter by role family"
            >
              <option value="">All roles</option>
              {roleFamilies.map((f) => (
                <option key={f.family} value={f.family}>
                  {FAMILY_LABELS[f.family] ?? f.family} ({f.count})
                </option>
              ))}
            </select>
          </div>
          <div className="hidden flex-wrap items-center gap-1.5 sm:flex">
            <span className="mr-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <FaBriefcase className="h-3 w-3" /> Role
            </span>
            <button
              onClick={() => setFamily('')}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                family === '' ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              All roles
            </button>
            {roleFamilies.map((f) => (
              <button
                key={f.family}
                onClick={() => setFamily(family === f.family ? '' : f.family)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  family === f.family ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {FAMILY_LABELS[f.family] ?? f.family}
                <span className="ml-1 text-[10px] opacity-70">{f.count}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} className="h-32" />)}
        </div>
      ) : total === 0 ? (
        <EmptyState
          icon={autoFetching ? <FaSpinner className="h-5 w-5 animate-spin" /> : <FaTowerBroadcast className="h-5 w-5" />}
          title={autoFetching ? 'Fetching opportunities…' : 'No listings yet'}
          description={
            autoFetching
              ? 'Pulling live jobs, internships and research positions from official company boards and public job APIs — this runs automatically the first time you visit.'
              : 'Your board refreshes automatically every few hours, or hit “Fetch latest” to pull live jobs, internships and research positions from official company boards and public job APIs right now. Every card links to the real posting.'
          }
          action={autoFetching ? undefined : { label: fetching ? 'Fetching…' : 'Fetch opportunities', onClick: fetchListings }}
        />
      ) : listings.length === 0 ? (
        <EmptyState
          icon={<FaMagnifyingGlass className="h-5 w-5" />}
          title="Nothing matches these filters"
          description="Try a different role, type, source, or clear the search."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {listings.map((l) => (
            <Card key={l.id} className="group border transition-shadow hover:shadow-soft">
              <CardContent className="p-4">
                <div className="flex items-start gap-2.5">
                  {companyAvatar(l.company)}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug">{l.role}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{l.company}</p>
                  </div>
                  <button
                    onClick={() => toggleSave(l)}
                    disabled={busyId === l.id}
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors',
                      l.saved ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
                    )}
                    aria-label={l.saved ? 'Saved to pipeline' : 'Save to pipeline'}
                    title={l.saved ? 'Saved to pipeline' : 'Save to pipeline'}
                  >
                    {l.saved ? <FaBookmark className="h-3.5 w-3.5" /> : <FaRegBookmark className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium capitalize', TYPE_STYLE[l.type] ?? 'bg-muted text-muted-foreground')}>
                    {l.type}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{l.source}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <span className="flex min-w-0 items-center gap-1">
                    {l.location && <><FaLocationDot className="h-3 w-3 shrink-0" /><span className="truncate">{l.location}</span></>}
                    {l.publishedAt && <span className="shrink-0">· {timeAgo(l.publishedAt)}</span>}
                  </span>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
                  >
                    Apply <FaUpRightFromSquare className="h-3 w-3" />
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════ SCHOLARSHIPS TAB ═══════════════════════

const LEVEL_META: Record<string, { label: string; style: string }> = {
  masters: { label: 'Masters', style: 'bg-primary/10 text-primary' },
  phd: { label: 'PhD', style: 'bg-success/10 text-success' },
  other: { label: 'Opportunity', style: 'bg-muted text-muted-foreground' },
}

function ScholarshipsTab() {
  const { toast } = useToast()
  const [level, setLevel] = useState('')
  const [savedOnly, setSavedOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [fetching, setFetching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setQ(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const url = useMemo(() => {
    const p = new URLSearchParams()
    if (level) p.set('level', level)
    if (savedOnly) p.set('saved', '1')
    if (q.trim()) p.set('q', q.trim())
    const s = p.toString()
    return `/api/scholarships${s ? `?${s}` : ''}`
  }, [level, savedOnly, q])

  const { data, loading, reload } = useApi<ScholarshipIndex>(url)

  // Hybrid auto-sync (same contract as news/papers/jobs): first visit fetches
  // immediately, data older than 3h refreshes in the background.
  const { autoFetching, lastFetchedAt, manualSync } = useAutoSync({
    key: 'scholarships',
    statusEndpoint: '/api/scholarships/status',
    fetchEndpoint: '/api/scholarships/fetch',
    onAutoFetched: (r) => {
      const added = typeof r.added === 'number' ? r.added : 0
      if (added > 0) {
        reload()
        toast({ title: 'Scholarships refreshed', description: `${added} new funded programs and fellowships arrived.` })
      }
    },
  })

  async function fetchScholarships() {
    setFetching(true)
    try {
      const r = await manualSync()
      if (!r) {
        toast({ title: 'Fetch failed', description: 'Try again in a moment.', variant: 'destructive' })
      } else {
        const added = typeof r.added === 'number' ? r.added : 0
        const per = (r.perSource as Array<{ name: string; ok: boolean; count: number }> | undefined) ?? []
        const ok = per.filter((s) => s.ok).length
        toast({
          title: added > 0 ? `${added} new scholarships fetched` : 'Already up to date',
          description: `${typeof r.total === 'number' ? r.total : 0} opportunities on file · ${ok}/${per.length} sources responded.`,
        })
      }
      reload()
    } finally {
      setFetching(false)
    }
  }

  async function toggleSave(s: Scholarship) {
    setBusyId(s.id)
    try {
      await api.patch(`/api/scholarships/${s.id}`, { saved: !s.saved })
      if (!s.saved) toast({ title: 'Saved', description: 'Kept on your scholarships shortlist.' })
      reload()
    } catch {
      toast({ title: 'Could not update', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const items = data?.items ?? []
  const counts = data?.counts ?? {}
  const total = data?.total ?? 0
  const LEVELS = [
    { key: '', label: 'All' },
    { key: 'masters', label: 'Masters' },
    { key: 'phd', label: 'PhD' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Masters & PhD scholarships, fellowships and funded programs from Scholarships Corner, Fully Funded Scholarships and
          Opportunity Desk. The list refreshes itself every few hours — save anything worth applying to.
        </p>
        <div className="flex items-center gap-2">
          {lastFetchedAt && !fetching && !autoFetching && <span className="hidden text-xs text-muted-foreground sm:inline">Updated {timeAgo(lastFetchedAt)}</span>}
          {autoFetching && <span className="hidden text-xs text-muted-foreground sm:inline">Refreshing in background…</span>}
          <Button size="sm" className="h-9" onClick={fetchScholarships} disabled={fetching || autoFetching}>
            {(fetching || autoFetching) ? <FaSpinner className="mr-1.5 h-4 w-4 animate-spin" /> : <FaRotate className="mr-1.5 h-4 w-4" />}
            {fetching ? 'Fetching…' : 'Fetch latest'}
          </Button>
        </div>
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {LEVELS.map((l) => (
            <button
              key={l.key}
              onClick={() => setLevel(l.key)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                level === l.key ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {l.label}
              {l.key && counts[l.key] ? <span className="ml-1 text-[10px] opacity-70">{counts[l.key]}</span> : null}
            </button>
          ))}
          <button
            onClick={() => setSavedOnly(!savedOnly)}
            className={cn(
              'flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              savedOnly ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <FaBookmark className="h-3.5 w-3.5" /> Saved
          </button>
        </div>
        <div className="relative ml-auto">
          <FaMagnifyingGlass className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search scholarships…"
            className="h-9 w-44 pl-8 text-xs"
            aria-label="Search scholarships"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} className="h-36" />)}
        </div>
      ) : total === 0 ? (
        <EmptyState
          icon={autoFetching ? <FaSpinner className="h-5 w-5 animate-spin" /> : <FaGraduationCap className="h-5 w-5" />}
          title={autoFetching ? 'Fetching scholarships…' : 'No scholarships yet'}
          description={
            autoFetching
              ? 'Pulling masters & PhD scholarships, fellowships and funded programs from curated scholarship feeds — this runs automatically the first time you visit.'
              : 'Your list refreshes automatically every few hours, or hit “Fetch latest” to pull masters & PhD scholarships and funded programs from Scholarships Corner, Fully Funded Scholarships and Opportunity Desk right now.'
          }
          action={autoFetching ? undefined : { label: fetching ? 'Fetching…' : 'Fetch scholarships', onClick: fetchScholarships }}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FaMagnifyingGlass className="h-5 w-5" />}
          title="Nothing matches these filters"
          description="Try a different level or clear the search."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((s) => {
            const meta = LEVEL_META[s.level] ?? LEVEL_META.other
            return (
              <Card key={s.id} className="group border transition-shadow hover:shadow-soft">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', meta.style)}>
                      {meta.label}
                    </span>
                    <button
                      onClick={() => toggleSave(s)}
                      disabled={busyId === s.id}
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors',
                        s.saved ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
                      )}
                      aria-label={s.saved ? 'Saved' : 'Save scholarship'}
                      title={s.saved ? 'Saved' : 'Save to shortlist'}
                    >
                      {s.saved ? <FaBookmark className="h-3.5 w-3.5" /> : <FaRegBookmark className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block line-clamp-2 text-sm font-semibold leading-snug hover:text-primary"
                  >
                    {s.title}
                  </a>
                  {s.summary && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{s.summary}</p>}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {s.funding && (
                      <span className="flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                        <FaLandmark className="h-3 w-3" /> {s.funding}
                      </span>
                    )}
                    {s.country && (
                      <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        <FaLocationDot className="h-3 w-3" /> {s.country}
                      </span>
                    )}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{s.provider}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span>{timeAgo(s.createdAt)}</span>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
                    >
                      Apply <FaUpRightFromSquare className="h-3 w-3" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
