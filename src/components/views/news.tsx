'use client'

import { useState } from 'react'
import { api, useApi, fmtDate } from '@/lib/client'
import type { NewsArticle } from '@/lib/types'
import { PageHeader, EmptyState, LoadingBlock, ErrorBlock, Tone } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import {
  RefreshCw,
  Newspaper,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Trash2,
  Plus,
  Loader2,
  Sparkles,
} from 'lucide-react'

const CATEGORIES = ['company', 'research', 'lab', 'newsletter', 'blog']
const CATEGORY_TONE: Record<string, string> = {
  company: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  research: 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300',
  lab: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300',
  newsletter: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  blog: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
}

export function NewsView() {
  const [filter, setFilter] = useState('all')
  const [category, setCategory] = useState('all')
  const [fetching, setFetching] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const { data, loading, error, reload } = useApi<{ articles: NewsArticle[] }>(
    `/api/news?filter=${filter}`,
    [filter]
  )
  const articles = data?.articles ?? []
  const filtered = category === 'all' ? articles : articles.filter((a) => a.category === category)
  const unread = articles.filter((a) => !a.read).length

  async function fetchNews() {
    setFetching(true)
    try {
      const res = await api.post<{ totalNew: number }>('/api/news/fetch')
      await reload()
      toast({
        title: res.totalNew > 0 ? `Found ${res.totalNew} new articles` : 'You are all caught up',
        description: 'Fresh from AI labs, companies and researchers.',
      })
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Fetch failed', variant: 'destructive' })
    } finally {
      setFetching(false)
    }
  }

  async function markRead(a: NewsArticle) {
    await api.patch(`/api/news/${a.id}`, { read: true })
    reload()
  }

  async function toggleSave(a: NewsArticle) {
    await api.patch(`/api/news/${a.id}`, { saved: !a.saved })
    reload()
  }

  async function remove(id: string) {
    await api.del(`/api/news/${id}`)
    reload()
  }

  async function clearUnsaved() {
    await api.del('/api/news')
    reload()
    toast({ title: 'Cleared feed (kept saved items)' })
  }

  return (
    <div className="space-y-5">
      <PageHeader title="AI News" subtitle="What OpenAI, DeepMind, Anthropic, researchers & labs just shipped">
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Add article
        </Button>
        <Button size="sm" onClick={fetchNews} disabled={fetching}>
          {fetching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
          {fetching ? 'Scanning the web…' : 'Fetch latest news'}
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">
              All
            </TabsTrigger>
            <TabsTrigger value="unread">
              Unread {unread > 0 && <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{unread}</span>}
            </TabsTrigger>
            <TabsTrigger value="saved">Saved</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {articles.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearUnsaved} className="text-muted-foreground">
              Clear feed
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingBlock rows={5} />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Newspaper className="h-8 w-8" />}
          title={filter === 'saved' ? 'No saved articles' : 'Feed is empty'}
          hint='Click "Fetch latest news" to scan the web for fresh AI announcements, papers and lab posts. Articles you save are kept.'
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <article
              key={a.id}
              className={cn(
                'group rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40',
                !a.read && 'border-l-4 border-l-primary'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Tone className={cn('capitalize', CATEGORY_TONE[a.category] ?? '')}>
                      {a.category}
                    </Tone>
                    {a.source && <span className="truncate text-xs text-muted-foreground">{a.source}</span>}
                    {a.publishedAt && (
                      <span className="text-xs text-muted-foreground">· {fmtDate(a.publishedAt, { month: 'short', day: 'numeric' })}</span>
                    )}
                  </div>
                  <h3 className={cn('mt-1.5 text-sm font-medium leading-snug', a.read && 'text-muted-foreground')}>
                    <a href={a.url} target="_blank" rel="noreferrer" className="hover:underline" onClick={() => markRead(a)}>
                      {a.title}
                    </a>
                  </h3>
                  {a.summary && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.summary}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => toggleSave(a)}
                    aria-label={a.saved ? 'Unsave' : 'Save'}
                  >
                    {a.saved ? <BookmarkCheck className="h-4 w-4 text-primary" /> : <Bookmark className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                    <a href={a.url} target="_blank" rel="noreferrer" aria-label="Open article">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => remove(a.id)}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <AddArticleDialog open={addOpen} onOpenChange={setAddOpen} onSaved={reload} />
    </div>
  )
}

function AddArticleDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({ title: '', url: '', source: '', category: 'blog' })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.title.trim() || !form.url.trim()) {
      toast({ title: 'Title and URL are required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await api.post('/api/news', form)
      onOpenChange(false)
      setForm({ title: '', url: '', source: '', category: 'blog' })
      onSaved()
      toast({ title: 'Article saved' })
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to save', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save an article</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid gap-1.5">
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>URL *</Label>
            <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Source</Label>
              <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="e.g. OpenAI" />
            </div>
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
          </div>
          <p className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 shrink-0" /> Tip: paste interesting articles here so they stay in your hub even if the feed moves on.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
