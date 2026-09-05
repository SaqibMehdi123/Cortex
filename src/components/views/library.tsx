'use client'

import { useMemo, useState, useEffect } from 'react'
import { api, fmtDate } from '@/lib/client'
import type { DocumentItem, Note } from '@/lib/types'
import { useApi } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useUI } from '@/lib/nav-config'
import { EmptyState, SkeletonCard } from '@/components/shared'
import { cn } from '@/lib/utils'
import {
  LayoutGrid, List, Plus, BookOpen, FileText, Search, Sparkles, Loader2,
  Link2, ClipboardPaste, Trash2, BookmarkPlus, StickyNote, FileText as FileIcon, FileUp,
} from 'lucide-react'

const TYPE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  article: { label: 'Article', icon: <FileIcon className="h-4 w-4" /> },
  paper: { label: 'Paper', icon: <FileIcon className="h-4 w-4" /> },
  book: { label: 'Book', icon: <BookOpen className="h-4 w-4" /> },
  url: { label: 'Web', icon: <Link2 className="h-4 w-4" /> },
  text: { label: 'Text', icon: <FileIcon className="h-4 w-4" /> },
  newsletter: { label: 'Newsletter', icon: <FileIcon className="h-4 w-4" /> },
  other: { label: 'Doc', icon: <FileIcon className="h-4 w-4" /> },
}

const STATUS_STYLES: Record<string, string> = {
  queued: 'border-zinc-400/40 text-zinc-500',
  reading: 'border-primary/40 text-primary',
  finished: 'border-success/50 text-success',
  paused: 'border-warning/50 text-warning',
}

export function LibraryView() {
  const openReader = useUI((s) => s.openReader)
  const { toast } = useToast()
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [importOpen, setImportOpen] = useState(false)
  const [notes, setNotes] = useState<Note[] | null>(null)

  const { data, loading, reload } = useApi<{ documents: DocumentItem[] }>(
    `/api/documents?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ''}`
  )
  const [allDocs, setAllDocs] = useState<DocumentItem[] | null>(null)

  useEffect(() => {
    api.get<{ documents: DocumentItem[] }>('/api/documents').then((d) => setAllDocs(d.documents)).catch(() => {})
  }, [])

  const reading = useMemo(
    () => (allDocs ?? []).filter((d) => d.status === 'reading' && d.progress > 0).sort((a, b) => (b.lastReadAt ?? b.updatedAt).localeCompare(a.lastReadAt ?? a.updatedAt)).slice(0, 4),
    [allDocs]
  )

  async function loadNotes() {
    try {
      const d = await api.get<{ notes: Note[] }>('/api/notes')
      setNotes(d.notes)
    } catch {
      toast({ title: 'Failed to load notes', variant: 'destructive' })
    }
  }

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    data?.documents.forEach((d) => d.tags?.split(',').forEach((t) => t.trim() && tags.add(t.trim())))
    return Array.from(tags).slice(0, 10)
  }, [data])

  return (
    <div className="anim-fade-up space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Library</h1>
          <p className="text-sm text-muted-foreground">Everything you&apos;re reading — papers, articles, books.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden overflow-hidden rounded-lg border sm:flex">
            <button
              onClick={() => setLayout('grid')}
              className={cn('flex h-9 w-9 items-center justify-center transition-colors', layout === 'grid' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setLayout('list')}
              className={cn('flex h-9 w-9 items-center justify-center transition-colors', layout === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <Button onClick={() => setImportOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Import
          </Button>
        </div>
      </div>

      <Tabs defaultValue="documents" onValueChange={(v) => v === 'notes' && !notes && loadNotes()}>
        <TabsList>
          <TabsTrigger value="documents">Reading</TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5">
            <StickyNote className="h-3.5 w-3.5" /> Notes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="mt-4 space-y-4">
          {/* Continue reading — pick up where you left off */}
          {reading.length > 0 && status === 'all' && !q && (
            <section aria-label="Continue reading">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Continue reading</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {reading.map((doc) => (
                  <button key={doc.id} onClick={() => openReader(doc.id)} className="text-left">
                    <Card className="card-lift h-full">
                      <CardContent className="space-y-2 p-4">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[10px] capitalize">{doc.filePath ? 'PDF' : doc.type}</Badge>
                          {doc.author && <span className="truncate">{doc.author}</span>}
                        </div>
                        <p className="line-clamp-2 text-sm font-semibold leading-snug">{doc.title}</p>
                        <div className="flex items-center gap-2 pt-1">
                          <Progress value={doc.progress} className="h-1.5" />
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{doc.progress}%</span>
                        </div>
                      </CardContent>
                    </Card>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search library…" className="pl-9" aria-label="Search documents" />
            </div>
            <div className="flex gap-1.5">
              {['all', 'queued', 'reading', 'finished'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    'min-h-[36px] rounded-full border px-3.5 text-xs font-medium capitalize transition-colors',
                    status === s ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {s === 'queued' ? 'read later' : s}
                </button>
              ))}
            </div>
          </div>

          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((t) => (
                <button key={t} onClick={() => setQ(t)} className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
                  #{t}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
            </div>
          ) : !data || data.documents.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-5 w-5" />}
              title={q ? `No matches for “${q}”` : 'Import your first paper'}
              description="Paste a URL to any article or paper, paste raw text, or add a book you're reading. Ask AI questions about it once it's here."
              action={{ label: 'Import a document', onClick: () => setImportOpen(true) }}
            />
          ) : layout === 'grid' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.documents.map((doc) => (
                <button key={doc.id} onClick={() => openReader(doc.id)} className="group text-left">
                  <Card className="h-full overflow-hidden pt-0 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-soft">
                    <div className="relative flex h-24 items-center justify-center bg-secondary">
                      <span className="font-display text-4xl leading-none text-foreground/25" aria-hidden>
                        {(doc.title.trim().charAt(0) || '·').toUpperCase()}
                      </span>
                      <span className="absolute bottom-2.5 left-3.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        {doc.filePath ? 'PDF' : TYPE_META[doc.type]?.label ?? 'Doc'}
                      </span>
                      <Badge variant="outline" className={cn('absolute right-2.5 top-2.5 bg-background/80 text-[10px] backdrop-blur', STATUS_STYLES[doc.status])}>
                        {doc.status === 'queued' ? 'read later' : doc.status}
                      </Badge>
                    </div>
                    <CardContent className="space-y-2 p-4">
                      <p className="line-clamp-2 text-sm font-semibold leading-snug">{doc.title}</p>
                      {doc.author && <p className="text-xs text-muted-foreground">{doc.author}</p>}
                      {doc.summary && <p className="line-clamp-2 text-xs text-muted-foreground">{doc.summary}</p>}
                      <div className="flex items-center gap-2 pt-1">
                        <Progress value={doc.progress} className="h-1.5" />
                        <span className="shrink-0 text-[10px] text-muted-foreground">{doc.progress}%</span>
                      </div>
                      {doc.tags && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {doc.tags.split(',').slice(0, 3).map((t) => (
                            <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{t.trim()}</span>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              {data.documents.map((doc, i) => (
                <button
                  key={doc.id}
                  onClick={() => openReader(doc.id)}
                  className={cn('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50', i !== 0 && 'border-t')}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-primary">
                    {TYPE_META[doc.type]?.icon ?? TYPE_META.other.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.author ?? TYPE_META[doc.type]?.label ?? 'Doc'} · updated {fmtDate(doc.updatedAt)}
                    </p>
                  </div>
                  <div className="hidden w-32 items-center gap-2 sm:flex">
                    <Progress value={doc.progress} className="h-1.5" />
                    <span className="shrink-0 text-[10px] text-muted-foreground">{doc.progress}%</span>
                  </div>
                  <Badge variant="outline" className={cn('shrink-0 text-[10px]', STATUS_STYLES[doc.status])}>
                    {doc.status === 'queued' ? 'later' : doc.status}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          {!notes ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[1, 2].map((i) => <SkeletonCard key={i} />)}
            </div>
          ) : notes.length === 0 ? (
            <EmptyState
              icon={<StickyNote className="h-5 w-5" />}
              title="No quick-capture notes yet"
              description="Use the + button (or ⌘K) from anywhere to capture a note, voice memo or link. They land here."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {notes.map((n) => (
                <Card key={n.id} className="group relative">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{n.title ?? (n.source === 'voice' ? 'Voice memo' : 'Note')}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Delete note"
                        onClick={async () => {
                          await api.del(`/api/notes/${n.id}`)
                          setNotes(notes.filter((x) => x.id !== n.id))
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="mt-1.5 line-clamp-5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{n.content}</p>
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                      {n.source === 'voice' && <span className="rounded-full bg-muted px-1.5 py-0.5">voice</span>}
                      {fmtDate(n.createdAt, { month: 'short', day: 'numeric' })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={() => { reload(); toast({ title: 'Added to library' }) }} />
    </div>
  )
}

function ImportDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (v: boolean) => void; onImported: () => void }) {
  const [mode, setMode] = useState<'pdf' | 'url' | 'paste' | 'manual'>('pdf')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [type, setType] = useState('article')
  const [tags, setTags] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const { toast } = useToast()

  async function uploadPdf() {
    if (!file) throw new Error('Choose a PDF first')
    const form = new FormData()
    form.append('file', file)
    if (author.trim()) form.append('author', author.trim())
    if (tags.trim()) form.append('tags', tags.trim())
    const res = await fetch('/api/documents/pdf', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'PDF extraction failed')
    toast({ title: 'PDF imported', description: `${data.pages} pages — opens with its original layout in the viewer${data.chars ? ` · ${Math.round((data.chars ?? 0) / 1000)}k characters extracted for highlights & AI` : ''}.` })
  }

  async function submit() {
    setBusy(true)
    try {
      if (mode === 'pdf') {
        await uploadPdf()
      } else if (mode === 'url') {
        if (!url.trim()) throw new Error('Paste a link first')
        await api.post('/api/documents', { title: url, source: url.trim(), autoExtract: true, status: 'queued', type: 'url' })
      } else if (mode === 'paste') {
        if (!title.trim()) throw new Error('Give it a title')
        if (!content.trim()) throw new Error('Paste some content')
        await api.post('/api/documents', { title, author, type, tags, content, status: 'reading' })
      } else {
        if (!title.trim()) throw new Error('Give it a title')
        await api.post('/api/documents', { title, author, type, tags, status: 'reading' })
      }
      setUrl(''); setTitle(''); setAuthor(''); setTags(''); setContent(''); setFile(null)
      onOpenChange(false)
      onImported()
    } catch (e) {
      toast({ title: 'Import failed', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import to library</DialogTitle>
          <DialogDescription>PDFs open in an embedded viewer with their original layout intact — text is also extracted for highlights &amp; AI. Web articles are fetched automatically.</DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="pdf" className="gap-1.5"><FileUp className="h-3.5 w-3.5" /> PDF</TabsTrigger>
            <TabsTrigger value="url" className="gap-1.5"><Link2 className="h-3.5 w-3.5" /> URL</TabsTrigger>
            <TabsTrigger value="paste" className="gap-1.5"><ClipboardPaste className="h-3.5 w-3.5" /> Text</TabsTrigger>
            <TabsTrigger value="manual" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Manual</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="space-y-3">
          {mode === 'pdf' ? (
            <>
              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f && f.name.toLowerCase().endsWith('.pdf')) setFile(f)
                }}
                className={cn(
                  'flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors',
                  dragOver ? 'border-primary bg-primary/5' : 'hover:border-primary/50 hover:bg-muted/40'
                )}
              >
                <FileUp className="h-6 w-6 text-primary" />
                {file ? (
                  <>
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB — click to change</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium">Drop a PDF here or click to browse</span>
                    <span className="text-xs text-muted-foreground">Text is extracted server-side — scans without text are not supported</span>
                  </>
                )}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  aria-label="Choose PDF file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author (optional)" aria-label="Author" />
                <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, comma separated" aria-label="Tags" />
              </div>
            </>
          ) : mode === 'url' ? (
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://arxiv.org/abs/…" aria-label="Article URL" autoFocus />
          ) : (
            <>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" />
              {mode === 'paste' ? (
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste the full text here — the AI will use it to answer questions." className="min-h-[140px]" aria-label="Content" />
              ) : (
                <p className="text-xs text-muted-foreground">You can paste the content later from the reader to enable AI Q&amp;A.</p>
              )}
            </>
          )}
          {mode === 'url' && (
            <div className="grid grid-cols-2 gap-3">
              <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author (optional)" aria-label="Author" />
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, comma separated" aria-label="Tags" />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || (mode === 'pdf' && !file)}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            <BookmarkPlus className="mr-1.5 h-4 w-4" />
            {mode === 'pdf' ? (busy ? 'Extracting text…' : 'Upload & extract') : 'Add to library'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
