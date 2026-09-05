'use client'

import { useMemo, useState } from 'react'
import { api, fmtDate, useApi } from '@/lib/client'
import type { NewsArticle, Paper, FetchSourceResult } from '@/lib/types'
import { useUI } from '@/lib/nav-config'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { EmptyState, PageHeader, SkeletonCard } from '@/components/shared'
import { timeAgo } from '@/lib/timeago'
import {
  Radar, RefreshCw, BookmarkPlus, BookmarkCheck, ExternalLink, Settings2, Loader2, Plus, Trash2, Newspaper,
  FileText, Sparkles, ChevronDown, ChevronUp, TrendingUp, LibraryBig, FlaskConical, Lightbulb, Wrench, Target, CircleCheck, Search,
} from 'lucide-react'

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'company', label: 'Companies' },
  { key: 'lab', label: 'Labs' },
  { key: 'newsletter', label: 'Newsletters' },
  { key: 'blog', label: 'Blogs' },
]

const RANGES = [
  { key: 'all', label: 'Any time' },
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
]

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'web'
  }
}

function SourceFavicon({ url, source }: { url: string; source: string | null }) {
  const [failed, setFailed] = useState(false)
  const host = hostOf(url)
  const letter = (source ?? host).charAt(0).toUpperCase()
  if (failed) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold" aria-hidden>
        {letter}
      </span>
    )
  }
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`}
      alt=""
      width={32}
      height={32}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-8 w-8 shrink-0 rounded-lg border bg-white object-contain p-1"
    />
  )
}

// ═══════════════════════════════ NEWS TAB ═══════════════════════════════

function NewsTab() {
  const { toast } = useToast()
  const [category, setCategory] = useState('all')
  const [savedOnly, setSavedOnly] = useState(false)
  const [range, setRange] = useState('all')
  const [source, setSource] = useState('all')
  const [q, setQ] = useState('')
  const [fetching, setFetching] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)

  const { data, loading, reload, setData } = useApi<{ articles: NewsArticle[]; sources: { name: string; count: number }[] }>(
    `/api/news?category=${category}&range=${range}&source=${encodeURIComponent(source)}${savedOnly ? '&saved=1' : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`
  )

  const articles = data?.articles ?? []

  async function fetchNews() {
    setFetching(true)
    try {
      const r = await api.post<{ totalNew: number; perSource: FetchSourceResult[] }>('/api/news/fetch')
      const okSources = r.perSource.filter((s) => s.ok).length
      toast({
        title: `Fetched ${r.totalNew} new stories from real feeds`,
        description: `${okSources}/${r.perSource.length} sources responded. OpenAI, DeepMind, Hugging Face, TLDR AI, Import AI…`,
      })
      reload()
    } catch {
      toast({ title: 'News fetch failed', description: 'Try again in a moment.', variant: 'destructive' })
    } finally {
      setFetching(false)
    }
  }

  async function toggleSave(a: NewsArticle) {
    const saved = !a.saved
    setData({ ...(data ?? { articles: [], sources: [] }), articles: articles.map((x) => (x.id === a.id ? { ...x, saved } : x)) })
    try {
      await api.patch(`/api/news/${a.id}`, { saved })
    } catch {
      reload()
    }
  }

  async function markRead(a: NewsArticle) {
    if (a.read) return
    try {
      await api.patch(`/api/news/${a.id}`, { read: true })
      setData({ ...(data ?? { articles: [], sources: [] }), articles: articles.map((x) => (x.id === a.id ? { ...x, read: true } : x)) })
    } catch {}
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-9" onClick={fetchNews} disabled={fetching}>
          {fetching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
          Fetch latest
        </Button>
        <Button variant="outline" size="sm" className="h-9" onClick={() => setSourcesOpen(true)}>
          <Settings2 className="mr-1.5 h-4 w-4" /> Sources
        </Button>
        <div className="relative ml-auto w-full sm:w-52">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stories…" className="h-9 pl-9 text-xs" aria-label="Search news" />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={cn(
              'min-h-[32px] rounded-full border px-3 text-xs font-medium transition-colors',
              category === c.key ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            {c.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        <button
          onClick={() => setSavedOnly((v) => !v)}
          className={cn(
            'min-h-[32px] rounded-full border px-3 text-xs font-medium transition-colors',
            savedOnly ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
          )}
        >
          <BookmarkCheck className="mr-1 inline h-3.5 w-3.5" /> Saved
        </button>
        <div className="ml-auto flex items-center gap-2">
          {data && data.sources.length > 1 && (
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Filter by source">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {data.sources.map((s) => (
                  <SelectItem key={s.name} value={s.name}>{s.name} ({s.count})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="h-8 w-[120px] text-xs" aria-label="Time range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} className="h-32" />)}
        </div>
      ) : articles.length === 0 ? (
        <EmptyState
          icon={<Newspaper className="h-5 w-5" />}
          title={q || savedOnly || source !== 'all' ? 'Nothing matches these filters' : 'No stories fetched yet'}
          description={
            q || savedOnly || source !== 'all'
              ? 'Try widening the time range or clearing filters.'
              : 'Hit “Fetch latest” to pull real stories straight from OpenAI, DeepMind, Hugging Face, Microsoft Research, TLDR AI, Import AI and more — each with a 3-line AI digest.'
          }
          action={q || savedOnly || source !== 'all' ? undefined : { label: 'Fetch latest now', onClick: fetchNews }}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {articles.map((a) => (
            <Card key={a.id} className={cn('card-lift group overflow-hidden', a.read && 'opacity-70')}>
              <CardContent className="flex gap-3 p-4">
                <SourceFavicon url={a.url} source={a.source} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate font-semibold text-foreground">{a.source ?? hostOf(a.url)}</span>
                    <span>·</span>
                    <span className="shrink-0">{a.publishedAt ? timeAgo(a.publishedAt) : fmtDate(a.createdAt, { month: 'short', day: 'numeric' })}</span>
                    {!a.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                  </div>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => markRead(a)}
                    className="mt-1 block text-sm font-semibold leading-snug transition-colors group-hover:text-primary"
                  >
                    {a.title}
                  </a>
                  {a.summary && <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{a.summary}</p>}
                  <div className="mt-2.5 flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] capitalize">{a.category}</Badge>
                    <div className="ml-auto flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={a.saved ? 'Unsave' : 'Save to reading queue'} onClick={() => toggleSave(a)}>
                        {a.saved ? <BookmarkCheck className="h-4 w-4 text-primary" /> : <BookmarkPlus className="h-4 w-4" />}
                      </Button>
                      <a href={a.url} target="_blank" rel="noreferrer" onClick={() => markRead(a)} aria-label="Open article">
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SourcesDialog open={sourcesOpen} onOpenChange={setSourcesOpen} />
    </div>
  )
}

// ═══════════════════════════════ PAPERS TAB ══════════════════════════════

function PaperAnalysis({ paper }: { paper: Paper }) {
  const results = useMemo<string[]>(() => {
    if (!paper.results) return []
    try { return JSON.parse(paper.results) } catch { return [] }
  }, [paper.results])

  const sections = [
    { icon: <Wrench className="h-3.5 w-3.5" />, label: 'Problem it solves', body: paper.problem },
    { icon: <Lightbulb className="h-3.5 w-3.5" />, label: "What's new (innovation)", body: paper.innovation },
    { icon: <CircleCheck className="h-3.5 w-3.5" />, label: 'Key results', body: null, list: results },
    { icon: <Target className="h-3.5 w-3.5" />, label: 'Why it matters', body: paper.whyMatters },
  ].filter((s) => s.body || (s.list && s.list.length > 0))

  if (sections.length === 0) return null

  return (
    <div className="mt-3 space-y-3 rounded-xl border bg-muted/30 p-3.5">
      {sections.map((s) => (
        <div key={s.label}>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
            {s.icon} {s.label}
          </p>
          {s.body && <p className="mt-1 text-xs leading-relaxed text-foreground/90">{s.body}</p>}
          {s.list && s.list.length > 0 && (
            <ul className="mt-1 space-y-1">
              {s.list.map((r, i) => (
                <li key={i} className="flex gap-1.5 text-xs leading-relaxed text-foreground/90">
                  <span className="text-primary">▸</span> {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

function PaperCard({ paper, onUpdated }: { paper: Paper; onUpdated: (p: Paper) => void }) {
  const { toast } = useToast()
  const openReader = useUI((s) => s.openReader)
  const [expanded, setExpanded] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [savingLib, setSavingLib] = useState(false)
  const analyzed = Boolean(paper.analyzedAt)

  async function analyze() {
    setAnalyzing(true)
    try {
      const { paper: updated } = await api.post<{ paper: Paper }>(`/api/papers/${paper.id}/analyze`)
      onUpdated(updated)
      setExpanded(true)
      toast({ title: 'Analysis ready', description: 'Problem, innovation and key results extracted.' })
    } catch {
      toast({ title: 'Analysis failed', description: 'Try again in a moment.', variant: 'destructive' })
    } finally {
      setAnalyzing(false)
    }
  }

  async function saveToLibrary() {
    setSavingLib(true)
    try {
      const { document } = await api.post<{ document: { id: string } }>(`/api/papers/${paper.id}`)
      toast({ title: 'Saved to Library', description: 'Opening in Reader — highlight and ask AI about it.' })
      openReader(document.id)
    } catch {
      toast({ title: 'Could not save to Library', variant: 'destructive' })
    } finally {
      setSavingLib(false)
    }
  }

  async function toggleSaved() {
    const saved = !paper.saved
    onUpdated({ ...paper, saved })
    try {
      await api.patch(`/api/papers/${paper.id}`, { saved })
    } catch {}
  }

  return (
    <Card className="card-lift overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-secondary text-muted-foreground" aria-hidden>
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px]">
                <TrendingUp className="h-3 w-3" /> {paper.upvotes}
              </Badge>
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize">
                {paper.source === 'huggingface' ? 'HF Daily' : 'arXiv'}
              </Badge>
              <span>{paper.publishedAt ? timeAgo(paper.publishedAt) : fmtDate(paper.createdAt, { month: 'short', day: 'numeric' })}</span>
              {paper.authors && <span className="hidden truncate text-muted-foreground/70 sm:inline">· {paper.authors.split(', ').slice(0, 3).join(', ')}{paper.authors.split(', ').length > 3 ? ' et al.' : ''}</span>}
            </div>
            <a href={paper.url ?? `https://arxiv.org/abs/${paper.arxivId}`} target="_blank" rel="noreferrer" className="mt-1 block text-sm font-semibold leading-snug transition-colors hover:text-primary">
              {paper.title}
            </a>

            {analyzed && paper.tldr && (
              <p className="mt-2 flex gap-1.5 text-xs leading-relaxed text-muted-foreground">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>{paper.tldr}</span>
              </p>
            )}

            {!analyzed && (
              <Button variant="outline" size="sm" className="mt-2.5 h-7 text-xs" onClick={analyze} disabled={analyzing}>
                {analyzing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                {analyzing ? 'Reading the abstract…' : 'Analyze paper'}
              </Button>
            )}

            {analyzed && (
              <>
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-2 flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
                  aria-expanded={expanded}
                >
                  {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {expanded ? 'Hide breakdown' : 'Problem · Innovation · Results'}
                </button>
                {expanded && <PaperAnalysis paper={paper} />}
              </>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={saveToLibrary} disabled={savingLib}>
                {savingLib ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <LibraryBig className="mr-1.5 h-3.5 w-3.5" />}
                {paper.documentId ? 'Open in Reader' : 'Save to Library'}
              </Button>
              <a href={paper.pdfUrl ?? paper.url ?? '#'} target="_blank" rel="noreferrer">
                <Button variant="ghost" size="sm" className="h-7 text-xs">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> PDF
                </Button>
              </a>
              <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" aria-label={paper.saved ? 'Unbookmark' : 'Bookmark'} onClick={toggleSaved}>
                {paper.saved ? <BookmarkCheck className="h-4 w-4 text-primary" /> : <BookmarkPlus className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function PapersTab() {
  const { toast } = useToast()
  const [range, setRange] = useState('week')
  const [sort, setSort] = useState('date')
  const [savedOnly, setSavedOnly] = useState(false)
  const [q, setQ] = useState('')
  const [syncing, setSyncing] = useState(false)

  const { data, loading, reload, setData } = useApi<{ papers: Paper[] }>(
    `/api/papers?range=${range}&sort=${sort}${savedOnly ? '&saved=1' : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`
  )

  const papers = data?.papers ?? []

  async function syncPapers() {
    setSyncing(true)
    try {
      const r = await api.post<{ totalNew: number; analyzed: number }>('/api/papers/fetch')
      toast({
        title: `${r.totalNew} new papers from Hugging Face & arXiv`,
        description: r.analyzed > 0 ? `Top ${r.analyzed} community favorites were auto-analyzed (problem, innovation, results).` : undefined,
      })
      reload()
    } catch {
      toast({ title: 'Paper sync failed', description: 'Try again in a moment.', variant: 'destructive' })
    } finally {
      setSyncing(false)
    }
  }

  function updateOne(updated: Paper) {
    setData({ papers: papers.map((p) => (p.id === updated.id ? updated : p)) })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-9" onClick={syncPapers} disabled={syncing}>
          {syncing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
          Sync papers
        </Button>
        <p className="hidden text-xs text-muted-foreground sm:block">Hugging Face Daily Papers + arXiv cs.AI / cs.CL / cs.LG / cs.CV</p>
        <div className="relative ml-auto w-full sm:w-52">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search papers…" className="h-9 pl-9 text-xs" aria-label="Search papers" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={cn(
              'min-h-[32px] rounded-full border px-3 text-xs font-medium transition-colors',
              range === r.key ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            {r.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        <button
          onClick={() => setSavedOnly((v) => !v)}
          className={cn(
            'min-h-[32px] rounded-full border px-3 text-xs font-medium transition-colors',
            savedOnly ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
          )}
        >
          <BookmarkCheck className="mr-1 inline h-3.5 w-3.5" /> Saved
        </button>
        <div className="ml-auto">
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="Sort papers">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Newest first</SelectItem>
              <SelectItem value="upvotes">Top upvoted</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} className="h-36" />)}
        </div>
      ) : papers.length === 0 ? (
        <EmptyState
          icon={<FlaskConical className="h-5 w-5" />}
          title={q || savedOnly ? 'Nothing matches these filters' : 'No papers tracked yet'}
          description={
            q || savedOnly
              ? 'Try widening the time range or clearing filters.'
              : 'Sync to pull today\'s research papers straight from Hugging Face Daily Papers and fresh arXiv submissions. Every paper can be auto-analyzed: the problem it solves, the innovation it brings, and key results.'
          }
          action={q || savedOnly ? undefined : { label: 'Sync papers now', onClick: syncPapers }}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {papers.map((p) => <PaperCard key={p.id} paper={p} onUpdated={updateOne} />)}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════ SHELL ══════════════════════════════════

export function NewsView() {
  return (
    <div className="anim-fade-up space-y-5 pb-8">
      <PageHeader
        title="News & Papers"
        description="Real stories from labs & newsletters, plus fresh research from Hugging Face and arXiv."
      />
      <Tabs defaultValue="news">
        <TabsList>
          <TabsTrigger value="news" className="gap-1.5"><Newspaper className="h-3.5 w-3.5" /> News</TabsTrigger>
          <TabsTrigger value="papers" className="gap-1.5"><FlaskConical className="h-3.5 w-3.5" /> Papers</TabsTrigger>
        </TabsList>
        <TabsContent value="news" className="mt-4">
          <NewsTab />
        </TabsContent>
        <TabsContent value="papers" className="mt-4">
          <PapersTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SourcesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data, reload } = useApi<{ sources: { id: string; name: string; url: string; type: string }[] }>(open ? '/api/sources' : null)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [type, setType] = useState('blog')
  const { toast } = useToast()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Custom sources</DialogTitle>
          <DialogDescription>Add any blog or newsletter with an RSS feed. The next fetch will include it.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name e.g. Simon Willison" aria-label="Source name" />
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/feed" aria-label="Source URL" />
        </div>
        <div className="flex gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[140px]" aria-label="Source type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="blog">Blog</SelectItem>
              <SelectItem value="newsletter">Newsletter</SelectItem>
              <SelectItem value="x">X / Twitter</SelectItem>
              <SelectItem value="company">Company</SelectItem>
              <SelectItem value="lab">Lab</SelectItem>
            </SelectContent>
          </Select>
          <Button
            className="flex-1"
            onClick={async () => {
              if (!name.trim() || !url.trim()) return
              try {
                await api.post('/api/sources', { name: name.trim(), url: url.trim(), type })
                setName(''); setUrl('')
                reload()
                toast({ title: 'Source added' })
              } catch {
                toast({ title: 'Failed to add source', variant: 'destructive' })
              }
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add source
          </Button>
        </div>
        <div className="max-h-[240px] space-y-1.5 overflow-y-auto scroll-thin">
          {data?.sources.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <b>{s.name}</b> <span className="text-xs text-muted-foreground">({s.type})</span>
              </span>
              <button
                onClick={async () => {
                  await api.del(`/api/sources/${s.id}`)
                  reload()
                }}
                className="text-muted-foreground hover:text-danger"
                aria-label="Remove source"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
