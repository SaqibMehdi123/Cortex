'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/client'
import type { DocumentItem, Highlight, ChatMessage, Citation } from '@/lib/types'
import { useUI } from '@/lib/nav-config'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import {
  ArrowLeft, Sparkles, Send, Highlighter, StickyNote, Layers, Share2, Loader2,
  X, Trash2, CheckCircle2, BookOpen,
} from 'lucide-react'

const HL_COLORS = ['yellow', 'green', 'blue', 'pink'] as const

interface SelInfo {
  text: string
  x: number
  y: number
}

export function Reader() {
  const readerDocId = useUI((s) => s.readerDocId)
  const closeReader = useUI((s) => s.closeReader)
  const { toast } = useToast()

  const [doc, setDoc] = useState<(DocumentItem & { highlights: Highlight[] }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [selection, setSelection] = useState<SelInfo | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [aiInput, setAiInput] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [noteDialogFor, setNoteDialogFor] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [mindmapOpen, setMindmapOpen] = useState(false)
  const [mindmaps, setMindmaps] = useState<{ id: string; title: string }[]>([])
  const [mindmapChoice, setMindmapChoice] = useState<string>('__new')
  const [lastHighlightId, setLastHighlightId] = useState<string | null>(null)
  const [flashcardBusy, setFlashcardBusy] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sessionStart = useRef<number>(Date.now())
  const lastLogged = useRef<number>(Date.now())

  // Load document + chat
  useEffect(() => {
    if (!readerDocId) return
    setLoading(true)
    sessionStart.current = Date.now()
    lastLogged.current = Date.now()
    Promise.all([
      api.get<{ document: DocumentItem & { highlights: Highlight[] } }>(`/api/documents/${readerDocId}`),
      api.get<{ messages: ChatMessage[] }>(`/api/chat?documentId=${readerDocId}`),
      api.get<{ mindmaps: { id: string; title: string }[] }>('/api/mindmaps'),
    ])
      .then(([d, m, mm]) => {
        setDoc(d.document)
        setMessages(m.messages)
        setMindmaps(mm.mindmaps)
      })
      .catch(() => toast({ title: 'Failed to open document', variant: 'destructive' }))
      .finally(() => setLoading(false))
  }, [readerDocId, toast])

  // Log reading time every minute + update lastReadAt
  useEffect(() => {
    if (!readerDocId || !doc) return
    const interval = setInterval(async () => {
      const minutes = Math.round((Date.now() - lastLogged.current) / 60000)
      if (minutes >= 1) {
        lastLogged.current = Date.now()
        try {
          await api.post('/api/reading-sessions', { documentId: readerDocId, minutes })
        } catch {}
      }
    }, 60000)
    return () => {
      clearInterval(interval)
      // flush remainder on unmount
      const minutes = Math.round((Date.now() - lastLogged.current) / 60000)
      if (minutes >= 1) {
        api.post('/api/reading-sessions', { documentId: readerDocId, minutes }).catch(() => {})
      }
    }
  }, [readerDocId, doc])

  // Scroll-driven progress
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || !doc) return
    const pct = Math.min(100, Math.round((el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)) * 100))
    if (pct > doc.progress) {
      setDoc({ ...doc, progress: pct })
      api.patch(`/api/documents/${doc.id}`, { progress: pct, status: doc.status === 'queued' ? 'reading' : doc.status }).catch(() => {})
    }
  }, [doc])

  // Selection handling
  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !contentRef.current) return setSelection(null)
      const text = sel.toString().trim()
      if (text.length < 2) return setSelection(null)
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      setSelection({ text, x: rect.left + rect.width / 2, y: rect.top })
    }
    document.addEventListener('mouseup', handler)
    document.addEventListener('touchend', handler)
    return () => {
      document.removeEventListener('mouseup', handler)
      document.removeEventListener('touchend', handler)
    }
  }, [])

  async function addHighlight(color: (typeof HL_COLORS)[number]) {
    if (!selection || !doc) return
    const text = selection.text
    const position = doc.content?.indexOf(text.slice(0, 60)) ?? 0
    setSelection(null)
    window.getSelection()?.removeAllRanges()
    try {
      const { highlight } = await api.post<{ highlight: Highlight }>('/api/highlights', {
        documentId: doc.id, text, color, position: Math.max(0, position),
      })
      setDoc({ ...doc, highlights: [...doc.highlights, highlight] })
      setLastHighlightId(highlight.id)
      toast({ title: 'Highlighted', description: 'Turn it into a flashcard or mindmap node anytime.' })
    } catch {
      toast({ title: 'Could not save highlight', variant: 'destructive' })
    }
  }

  function renderContent() {
    if (!doc?.content) {
      return (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 font-medium">No text content yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            This entry is metadata-only (e.g. a PDF or book). Paste its text below to unlock highlighting and AI Q&amp;A.
          </p>
          <Textarea
            className="mx-auto mt-4 min-h-[160px] max-w-xl text-left"
            placeholder="Paste the full text…"
            aria-label="Paste document text"
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && doc) {
                api.patch(`/api/documents/${doc.id}`, { content: v }).then(() => setDoc({ ...doc, content: v }))
              }
            }}
          />
        </div>
      )
    }

    // Render paragraphs, wrapping highlighted ranges via simple text matching per paragraph
    const paragraphs = doc.content.split(/\n{1,}/)
    return paragraphs.map((p, i) => <p key={i}>{renderWithHighlights(p)}</p>)
  }

  function renderWithHighlights(text: string) {
    const highlights = doc!.highlights
    if (highlights.length === 0) return text
    // find highlight that is contained in this text (first match wins)
    for (const h of highlights) {
      const idx = text.indexOf(h.text.slice(0, Math.min(h.text.length, 80)))
      if (idx !== -1 && h.text.length <= text.length + 20) {
        const end = idx + h.text.length
        return (
          <>
            {text.slice(0, idx)}
            <mark className={cn('hl-' + h.color)} title={h.note ?? undefined}>
              {text.slice(idx, Math.min(end, text.length))}
            </mark>
            {text.slice(Math.min(end, text.length))}
          </>
        )
      }
    }
    return text
  }

  async function summarize() {
    if (!doc) return
    setSummarizing(true)
    try {
      const { document: updated } = await api.post<{ document: DocumentItem }>(`/api/documents/${doc.id}/summarize`)
      setDoc({ ...doc, ...updated, highlights: doc.highlights })
      toast({ title: 'Summary ready' })
    } catch (e) {
      toast({ title: 'Summary failed', description: e instanceof Error ? e.message : 'No text content?', variant: 'destructive' })
    } finally {
      setSummarizing(false)
    }
  }

  async function sendAI(text?: string) {
    const msg = (text ?? aiInput).trim()
    if (!msg || !doc || aiBusy) return
    setAiInput('')
    setAiBusy(true)
    setMessages((prev) => [...prev, { id: `tmp-${Date.now()}`, documentId: doc.id, role: 'user', content: msg, citations: null, createdAt: new Date().toISOString() }])
    try {
      const d = await api.post<{ assistantMessage: ChatMessage }>('/api/chat', { documentId: doc.id, message: msg })
      setMessages((prev) => [...prev, d.assistantMessage])
    } catch {
      toast({ title: 'AI request failed', variant: 'destructive' })
    } finally {
      setAiBusy(false)
    }
  }

  async function makeFlashcard() {
    if (!doc || !lastHighlightId) return
    setFlashcardBusy(true)
    try {
      await api.post('/api/flashcards', { generate: true, highlightId: lastHighlightId })
      toast({ title: 'Flashcard created', description: 'Find it in Flashcards for spaced review.' })
    } catch {
      toast({ title: 'Flashcard generation failed', variant: 'destructive' })
    } finally {
      setFlashcardBusy(false)
    }
  }

  async function addToMindmap() {
    if (!doc) return
    try {
      if (mindmapChoice === '__new') {
        await api.post('/api/mindmaps/generate', { documentId: doc.id })
        toast({ title: 'Mindmap generated', description: 'Open Mindmaps to explore it.' })
      } else {
        // add node to chosen map
        const maps = await api.get<{ mindmaps: { id: string; nodes: { x: number; y: number }[] }[] }>('/api/mindmaps')
        const target = maps.mindmaps.find((m) => m.id === mindmapChoice)
        const maxY = target?.nodes.reduce((mx, n) => Math.max(mx, n.y), 0) ?? 0
        const nodes = target?.nodes ?? []
        await api.patch(`/api/mindmaps/${mindmapChoice}`, {
          nodes: [
            ...nodes,
            { id: `n-${Date.now()}`, label: doc.title.slice(0, 40), x: 120, y: maxY + 90, parentId: null, color: 'teal', linkType: 'document', linkId: doc.id },
          ],
        })
        toast({ title: 'Added to mindmap' })
      }
      setMindmapOpen(false)
    } catch {
      toast({ title: 'Mindmap update failed', variant: 'destructive' })
    }
  }

  const takeaways = useMemo<string[]>(() => {
    if (!doc?.takeaways) return []
    try { return JSON.parse(doc.takeaways) } catch { return [] }
  }, [doc?.takeaways])

  if (!readerDocId) return null

  return (
    <div className="fixed inset-0 z-40 flex bg-background" role="dialog" aria-label="Reader">
      {/* ── Main reading column ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center gap-2 border-b px-3 py-2.5 sm:px-5">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={closeReader} aria-label="Back to library">
            <ArrowLeft className="h-4.5 w-4.5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{doc?.title ?? 'Loading…'}</p>
            {doc?.author && <p className="truncate text-xs text-muted-foreground">{doc.author}</p>}
          </div>
          {doc && (
            <>
              <Button variant="outline" size="sm" className="hidden h-8 text-xs sm:flex" onClick={summarize} disabled={summarizing}>
                {summarizing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                Summarize
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={async () => {
                  const finished = doc.status === 'finished'
                  const { document: updated } = await api.patch<{ document: DocumentItem }>(`/api/documents/${doc.id}`, {
                    status: finished ? 'reading' : 'finished',
                    progress: finished ? doc.progress : 100,
                  })
                  setDoc({ ...doc, ...updated, highlights: doc.highlights })
                  if (!finished) toast({ title: 'Marked as finished 🎉' })
                }}
              >
                <CheckCircle2 className={cn('mr-1.5 h-3.5 w-3.5', doc.status === 'finished' && 'text-success')} />
                {doc.status === 'finished' ? 'Reopen' : 'Finish'}
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={() => setAiOpen((v) => !v)}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Ask AI
              </Button>
            </>
          )}
        </header>
        {doc && (
          <div className="flex items-center gap-3 border-b px-4 py-1.5 sm:px-6">
            <Progress value={doc.progress} className="h-1" />
            <span className="shrink-0 text-[10px] text-muted-foreground">{doc.progress}%</span>
          </div>
        )}

        {/* Content */}
        <div ref={scrollRef} onScroll={onScroll} className="scroll-thin relative flex-1 overflow-y-auto" style={{ transition: 'scroll 150ms ease' }}>
          <div className={cn('mx-auto px-5 py-8 sm:px-8', aiOpen ? 'max-w-none' : 'max-w-[680px]')}>
            {loading ? (
              <div className="space-y-4 py-8">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-4 animate-pulse rounded bg-muted" style={{ width: `${70 + ((i * 13) % 30)}%` }} />
                ))}
              </div>
            ) : (
              <>
                {/* Summary block */}
                {doc?.summary && (
                  <div className="anim-pop mb-8 rounded-xl border bg-card p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                      <Sparkles className="h-3.5 w-3.5" /> AI summary
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{doc.summary}</p>
                    {takeaways.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {takeaways.map((t, i) => (
                          <li key={i} className="flex gap-2 text-sm"><span className="text-success">✓</span><span>{t}</span></li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div ref={contentRef} className="reading-prose">
                  {doc && renderContent()}
                </div>
                <p className="mt-12 text-center text-xs text-muted-foreground">— end —</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Ask AI side panel ── */}
      {aiOpen && doc && (
        <aside className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-background sm:w-[400px]" aria-label="Document AI chat">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="flex-1 text-sm font-semibold">Ask AI about this document</p>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Clear chat"
              onClick={async () => {
                await api.del(`/api/chat?documentId=${doc.id}`)
                setMessages([])
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Close chat" onClick={() => setAiOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="scroll-thin flex-1 px-4 py-4">
            <div className="space-y-3">
              {messages.length === 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Ask anything — answers cite the document.</p>
                  {['Summarize the key argument', 'What methodology was used?', 'Explain the hardest concept simply'].map((s) => (
                    <button key={s} onClick={() => sendAI(s)} className="block w-full rounded-lg border bg-card px-3 py-2 text-left text-xs transition-colors hover:bg-muted">
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[88%] rounded-2xl px-3 py-2 text-sm', m.role === 'user' ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border bg-card')}>
                    {m.role === 'user' ? (
                      m.content
                    ) : (
                      <>
                        <div className="[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2 [&_strong]:font-semibold [&_ul]:ml-4 [&_ul]:list-disc">
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>
                        {m.citations?.length ? (
                          <div className="mt-2 space-y-1 border-t pt-2">
                            {m.citations.map((c: Citation) => (
                              <p key={c.n} className="text-[10px] leading-snug text-muted-foreground">
                                <span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">{c.n}</span>
                                {c.label}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              ))}
              {aiBusy && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the document…
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="border-t p-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendAI()
                  }
                }}
                placeholder="Ask about this document…"
                className="min-h-[44px] flex-1 resize-none"
                rows={1}
                aria-label="Ask AI"
              />
              <Button size="icon" className="h-11 w-11" onClick={() => sendAI()} disabled={aiBusy || !aiInput.trim()} aria-label="Send question">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </aside>
      )}

      {/* ── Floating selection toolbar ── */}
      {selection && (
        <div
          className="anim-pop fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-xl border bg-popover p-1.5 shadow-lg"
          style={{ left: selection.x, top: selection.y - 8 }}
          role="toolbar"
          aria-label="Highlight actions"
        >
          {HL_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => addHighlight(c)}
              className={cn('h-7 w-7 rounded-full border-2 transition-transform hover:scale-110', {
                'bg-yellow-400/80': c === 'yellow',
                'bg-green-500/70': c === 'green',
                'bg-blue-500/60': c === 'blue',
                'bg-pink-500/60': c === 'pink',
              })}
              aria-label={`Highlight ${c}`}
            />
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          <button
            onClick={() => {
              setNoteDialogFor('new')
              setNoteText('')
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Add note to highlight"
          >
            <StickyNote className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              addHighlight('yellow').then(() => setMindmapOpen(true))
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Add to mindmap"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              addHighlight('yellow').then(() => makeFlashcard())
            }}
            className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-primary transition-colors hover:bg-muted"
            disabled={flashcardBusy}
          >
            {flashcardBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />} Flashcard
          </button>
        </div>
      )}

      {/* Note dialog */}
      <Dialog open={noteDialogFor !== null} onOpenChange={(v) => !v && setNoteDialogFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Attach a note</DialogTitle>
            <DialogDescription className="line-clamp-2">{selection?.text ?? doc?.highlights.find((h) => h.id === lastHighlightId)?.text}</DialogDescription>
          </DialogHeader>
          <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Your thought on this passage…" className="min-h-[100px]" autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNoteDialogFor(null)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!doc) return
                try {
                  // save selection as highlight with note
                  const text = selection?.text ?? ''
                  if (text) {
                    const position = Math.max(0, doc.content?.indexOf(text.slice(0, 60)) ?? 0)
                    const { highlight } = await api.post<{ highlight: Highlight }>('/api/highlights', { documentId: doc.id, text, color: 'blue', note: noteText, position })
                    setDoc({ ...doc, highlights: [...doc.highlights, highlight] })
                    setLastHighlightId(highlight.id)
                  } else if (lastHighlightId) {
                    await api.patch(`/api/highlights/${lastHighlightId}`, { note: noteText })
                    setDoc({
                      ...doc,
                      highlights: doc.highlights.map((h) => (h.id === lastHighlightId ? { ...h, note: noteText } : h)),
                    })
                  }
                  setNoteDialogFor(null)
                  setSelection(null)
                  window.getSelection()?.removeAllRanges()
                  toast({ title: 'Note attached' })
                } catch {
                  toast({ title: 'Failed to save note', variant: 'destructive' })
                }
              }}
            >
              Save note
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mindmap dialog */}
      <Dialog open={mindmapOpen} onOpenChange={setMindmapOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add to mindmap</DialogTitle>
            <DialogDescription>Append this document to an existing map, or auto-generate a fresh one from its content.</DialogDescription>
          </DialogHeader>
          <Select value={mindmapChoice} onValueChange={setMindmapChoice}>
            <SelectTrigger aria-label="Choose mindmap">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__new">✨ Generate new mindmap from this document</SelectItem>
              {mindmaps.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMindmapOpen(false)}>Cancel</Button>
            <Button onClick={addToMindmap}>
              <Share2 className="mr-1.5 h-4 w-4" /> Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
