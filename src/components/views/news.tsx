'use client'

import { useMemo, useState } from 'react'
import { api, fmtDate } from '@/lib/client'
import type { NewsArticle } from '@/lib/types'
import { useApi } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { EmptyState, SkeletonCard } from '@/components/shared'
import { timeAgo } from '@/lib/timeago'
import {
  Radar, RefreshCw, BookmarkPlus, BookmarkCheck, ExternalLink, Settings2, Loader2, Plus, Trash2, Newspaper,
} from 'lucide-react'

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'company', label: 'Companies' },
  { key: 'research', label: 'Research' },
  { key: 'lab', label: 'Labs' },
  { key: 'newsletter', label: 'Newsletters' },
  { key: 'blog', label: 'Blogs' },
]

const SOURCE_HUES = [230, 173, 43, 142, 350, 262, 190, 20]

function sourceAvatar(source: string | null) {
  const name = source ?? 'Web'
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  const hue = SOURCE_HUES[hash % SOURCE_HUES.length]
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
      style={{ background: `hsl(${hue} 65% 55%)` }}
      aria-hidden
    >
      {name.replace(/^www\./, '').charAt(0).toUpperCase()}
    </span>
  )
}

export function NewsView() {
  const { toast } = useToast()
  const [category, setCategory] = useState('all')
  const [savedOnly, setSavedOnly] = useState(false)
  const [recency, setRecency] = useState('all')
  const [fetching, setFetching] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)

  const { data, loading, reload, setData } = useApi<{ articles: NewsArticle[] }>(
    `/api/news?category=${category}${savedOnly ? '&saved=1' : ''}`
  )

  const articles = useMemo(() => {
    if (!data) return []
    if (recency === 'all') return data.articles
    const cutoff = Date.now() - (recency === '24h' ? 1 : recency === '3d' ? 3 : 7) * 86_400_000
    return data.articles.filter((a) => !a.publishedAt || new Date(a.publishedAt).getTime() >= cutoff)
  }, [data, recency])

  async function fetchNews() {
    setFetching(true)
    try {
      const r = await api.post<{ totalNew: number }>('/api/news/fetch')
      toast({ title: `Fetched ${r.totalNew} new stories`, description: 'Summaries are attached to each article.' })
      reload()
    } catch {
      toast({ title: 'News fetch failed', description: 'Try again in a moment.', variant: 'destructive' })
    } finally {
      setFetching(false)
    }
  }

  async function toggleSave(a: NewsArticle) {
    const saved = !a.saved
    setData({ articles: articles.map((x) => (x.id === a.id ? { ...x, saved } : x)) })
    try {
      await api.patch(`/api/news/${a.id}`, { saved })
    } catch {
      setData({ articles: articles.map((x) => (x.id === a.id ? { ...x, saved: !saved } : x)) })
    }
  }

  async function markRead(a: NewsArticle) {
    try {
      await api.patch(`/api/news/${a.id}`, { read: true })
      setData({ articles: articles.map((x) => (x.id === a.id ? { ...x, read: true } : x)) })
    } catch {}
  }

  return (
    <div className="anim-fade-up space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Radar className="h-6 w-6 text-primary" /> News Radar
          </h1>
          <p className="text-sm text-muted-foreground">Labs, companies, researchers & newsletters — summarized in 3 lines.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={() => setSourcesOpen(true)}>
            <Settings2 className="mr-1.5 h-4 w-4" /> Sources
          </Button>
          <Button size="sm" className="h-9" onClick={fetchNews} disabled={fetching}>
            {fetching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
            Fetch latest
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={cn(
              'min-h-[36px] rounded-full border px-3.5 text-xs font-medium transition-colors',
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
            'min-h-[36px] rounded-full border px-3.5 text-xs font-medium transition-colors',
            savedOnly ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
          )}
        >
          <BookmarkCheck className="mr-1 inline h-3.5 w-3.5" /> Saved
        </button>
        <div className="ml-auto">
          <Select value={recency} onValueChange={setRecency}>
            <SelectTrigger className="h-9 w-[130px] text-xs" aria-label="Recency filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any time</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="3d">Last 3 days</SelectItem>
              <SelectItem value="7d">Last week</SelectItem>
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
          title="No stories here yet"
          description="Hit “Fetch latest” to pull fresh AI news from OpenAI, DeepMind, Anthropic, arXiv and top newsletters — each comes with a 3-line summary."
          action={{ label: 'Fetch latest now', onClick: fetchNews }}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {articles.map((a) => (
            <Card key={a.id} className={cn('group transition-all hover:shadow-soft', a.read && 'opacity-75')}>
              <CardContent className="flex gap-3 p-4">
                {sourceAvatar(a.source)}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{a.source ?? 'Web'}</span>
                    <span>·</span>
                    <span>{a.publishedAt ? timeAgo(a.publishedAt) : fmtDate(a.createdAt, { month: 'short', day: 'numeric' })}</span>
                    {!a.read && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="Unread" />}
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
          <DialogDescription>Add any blog, newsletter or X/Twitter account. The next fetch will include it.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name e.g. Simon Willison" aria-label="Source name" />
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="Source URL" />
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
