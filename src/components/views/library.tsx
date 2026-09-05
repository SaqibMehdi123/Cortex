'use client'

import { useEffect, useRef, useState } from 'react'
import { api, useApi } from '@/lib/client'
import type { ChatMessage, DocumentItem } from '@/lib/types'
import { PageHeader, EmptyState, LoadingBlock, ErrorBlock, Tone } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import {
  Plus,
  Search,
  BookOpen,
  Sparkles,
  Send,
  Trash2,
  ArrowLeft,
  ExternalLink,
  Loader2,
  Eraser,
  Save,
} from 'lucide-react'
import Markdown from 'react-markdown'

const DOC_TYPES = ['article', 'paper', 'book', 'blog', 'newsletter', 'video', 'course', 'other']
const STATUSES = ['to-read', 'reading', 'finished', 'paused']

const emptyForm = {
  title: '',
  author: '',
  type: 'article',
  source: '',
  tags: '',
  status: 'reading',
  progress: 0,
  notes: '',
  content: '',
}

export function LibraryView() {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  const url = `/api/documents?${new URLSearchParams({ ...(query ? { q: query } : {}), status: statusFilter })}`
  const { data, loading, error, reload } = useApi<{ documents: DocumentItem[] }>(url, [query, statusFilter])

  const documents = data?.documents ?? []
  const selected = documents.find((d) => d.id === selectedId) ?? null

  async function addDocument() {
    if (!form.title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await api.post<{ document: DocumentItem }>('/api/documents', form)
      setAddOpen(false)
      setForm({ ...emptyForm })
      await reload()
      setSelectedId(res.document.id)
      toast({ title: 'Added to your library' })
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to add', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function patchDoc(id: string, body: Record<string, unknown>) {
    try {
      await api.patch(`/api/documents/${id}`, body)
      await reload()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Update failed', variant: 'destructive' })
    }
  }

  async function deleteDoc(id: string) {
    try {
      await api.del(`/api/documents/${id}`)
      setSelectedId(null)
      await reload()
      toast({ title: 'Removed from library' })
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Delete failed', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Reading Library" subtitle="Everything you're reading — with an AI tutor on call">
        <Button size="sm" onClick={() => { setForm({ ...emptyForm }); setAddOpen(true) }}>
          <Plus className="mr-1.5 h-4 w-4" /> Add reading
        </Button>
      </PageHeader>

      <div className={cn('grid gap-5', selected && documents.length > 0 ? 'lg:grid-cols-[340px_1fr]' : 'grid-cols-1')}>
        {/* List pane */}
        <div className={cn(selected && 'hidden lg:block')}>
          <div className="mb-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search title, author, tag…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s.replace('-', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <LoadingBlock rows={4} />
          ) : error ? (
            <ErrorBlock message={error} />
          ) : documents.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-8 w-8" />}
              title="Your library is empty"
              hint="Add a book, paper, article or newsletter. Paste its text and you can ask AI questions about it."
            />
          ) : (
            <ul className="space-y-2">
              {documents.map((d) => (
                <li key={d.id}>
                  <button
                    onClick={() => setSelectedId(d.id)}
                    className={cn(
                      'w-full rounded-xl border p-3.5 text-left transition-colors hover:bg-muted/60',
                      selectedId === d.id && 'border-primary/40 bg-primary/5'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-medium leading-snug">{d.title}</p>
                      <Tone>{d.type}</Tone>
                    </div>
                    {d.author && <p className="mt-0.5 truncate text-xs text-muted-foreground">{d.author}</p>}
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={d.progress} className="h-1.5 flex-1" />
                      <span className="text-[11px] tabular-nums text-muted-foreground">{d.progress}%</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <Badge variant="secondary" className="text-[10px] capitalize">
                        {d.status.replace('-', ' ')}
                      </Badge>
                      {d.content && <span className="text-[10px] text-muted-foreground">AI-ready</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detail pane */}
        {selected && (
          <div className="min-w-0">
            <button
              className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground lg:hidden"
              onClick={() => setSelectedId(null)}
            >
              <ArrowLeft className="h-4 w-4" /> Back to library
            </button>
            <DocumentDetail key={selected.id} doc={selected} onPatch={patchDoc} onDelete={deleteDoc} />
          </div>
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add to library</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="doc-title">Title *</Label>
              <Input
                id="doc-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Attention Is All You Need"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Author</Label>
                <Input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="Vaswani et al." />
              </div>
              <div className="grid gap-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Source URL</Label>
              <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="https://…" />
            </div>
            <div className="grid gap-1.5">
              <Label>Tags</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="ai, transformers, research" />
            </div>
            <div className="grid gap-1.5">
              <Label>Notes / key takeaways</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional — your own notes" />
            </div>
            <div className="grid gap-1.5">
              <Label>Paste content (optional, powers AI Q&A)</Label>
              <Textarea
                rows={5}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Paste the article text, paper content, chapter text… The AI will read this when you ask questions."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addDocument} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Detail + chat ──────────────────────────────────────────────────

function DocumentDetail({
  doc,
  onPatch,
  onDelete,
}: {
  doc: DocumentItem
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  // key={doc.id} on the parent remounts this component when switching documents,
  // so local state is initialized fresh from the doc — no sync effects needed.
  const [notes, setNotes] = useState(doc.notes ?? '')
  const [notesDirty, setNotesDirty] = useState(false)
  const [progress, setProgress] = useState(doc.progress)

  return (
    <div className="space-y-4">
      {/* Meta card */}
      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-snug">{doc.title}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {doc.author ?? 'Unknown author'} · <Tone>{doc.type}</Tone>
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {doc.source && (
              <Button variant="outline" size="sm" asChild>
                <a href={doc.source} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => onDelete(doc.id)} aria-label="Delete document">
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={doc.status} onValueChange={(v) => onPatch(doc.id, { status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s.replace('-', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Progress — {progress}%</Label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              onMouseUp={() => progress !== doc.progress && onPatch(doc.id, { progress })}
              onTouchEnd={() => progress !== doc.progress && onPatch(doc.id, { progress })}
              className="mt-2 accent-emerald-600"
              aria-label="Reading progress"
            />
          </div>
        </div>

        {doc.tags && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {doc.tags.split(',').map((t) => t.trim() && <Badge key={t} variant="secondary">{t}</Badge>)}
          </div>
        )}

        <div className="mt-4 grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">My notes</Label>
            {notesDirty && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={async () => {
                  await onPatch(doc.id, { notes })
                  setNotesDirty(false)
                  toast({ title: 'Notes saved' })
                }}
              >
                <Save className="mr-1 h-3 w-3" /> Save
              </Button>
            )}
          </div>
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value)
              setNotesDirty(true)
            }}
            placeholder="Key ideas, quotes, page numbers…"
          />
        </div>

        {doc.content && (
          <details className="mt-3 rounded-lg border bg-muted/40 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              Saved content used for AI Q&A ({Math.round(doc.content.length / 1000)}k chars)
            </summary>
            <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">{doc.content}</p>
          </details>
        )}
      </div>

      <ChatPanel doc={doc} />
    </div>
  )
}

function ChatPanel({ doc }: { doc: DocumentItem }) {
  const { data, reload } = useApi<{ messages: ChatMessage[] }>(`/api/chat?documentId=${doc.id}`, [doc.id])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMessages(data?.messages ?? [])
  }, [data])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  async function send(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || sending) return
    setInput('')
    setSending(true)
    setMessages((m) => [
      ...m,
      { id: `tmp-${Date.now()}`, documentId: doc.id, role: 'user', content: msg, createdAt: new Date().toISOString() },
    ])
    try {
      const res = await api.post<{ userMessage: ChatMessage; assistantMessage: ChatMessage }>('/api/chat', {
        documentId: doc.id,
        message: msg,
      })
      setMessages((m) => [...m.filter((x) => !x.id.startsWith('tmp-')), res.userMessage, res.assistantMessage])
      reload()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'AI failed to respond', variant: 'destructive' })
      setMessages((m) => m.filter((x) => !x.id.startsWith('tmp-')))
    } finally {
      setSending(false)
    }
  }

  async function clearChat() {
    await api.del(`/api/chat?documentId=${doc.id}`)
    setMessages([])
  }

  const suggestions = doc.content
    ? ['Summarize the key points', 'Explain the hardest concept simply', 'Quiz me on this material']
    : ['What should I look for when reading this?', 'Give me a quick overview of the topic']

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium leading-none">Ask AI about this</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {doc.content ? 'Answers grounded in the saved content' : 'Add content below the form for grounded answers'}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearChat} aria-label="Clear conversation">
            <Eraser className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="max-h-[380px] min-h-[180px] space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-4 text-center">
            <p className="text-sm text-muted-foreground">Start with one of these:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border bg-muted/50 px-3 py-1.5 text-xs transition-colors hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                  m.role === 'user'
                    ? 'rounded-br-md bg-primary text-primary-foreground'
                    : 'rounded-bl-md bg-muted prose-sm dark:prose-invert'
                )}
              >
                {m.role === 'assistant' ? (
                  <Markdown>{m.content}</Markdown>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t p-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Ask anything about this material…"
          aria-label="Ask AI"
        />
        <Button size="icon" onClick={() => send()} disabled={sending || !input.trim()} aria-label="Send question">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
