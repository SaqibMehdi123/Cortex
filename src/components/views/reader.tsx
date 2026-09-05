'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/client'
import type { DocumentItem, Highlight, ChatMessage, Citation } from '@/lib/types'
import { useUI } from '@/lib/nav-config'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import {
  ArrowLeft, Send, Highlighter, StickyNote, Layers, Share2, Loader2,
  X, Trash2, CheckCircle2, BookOpen, FileText, PanelRightOpen, ExternalLink, Download, Sparkles,
} from 'lucide-react'

const HL_COLORS = ['yellow', 'green', 'blue', 'pink'] as const

interface SelInfo {
  text: string
  x: number
  y: number
}

type RailTab = 'chat' | 'summary' | 'highlights'

// ─── Reader — opens INSIDE the app shell as a section ────────────────
// PDFs render in an embedded browser-native viewer (original layout,
// images and fonts preserved); text documents use the comfortable
// reading column. A side rail holds AI chat, summary and highlights.
export function ReaderView() {
  const readerDocId = useUI((s) => s.readerDocId)
  const closeReader = useUI((s) => s.closeReader)
  const { toast } = useToast()

  const [doc, setDoc] = useState<(DocumentItem & { highlights: Highlight[] }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [selection, setSelection] = useState<SelInfo | null>(null)
  const [mode, setMode] = useState<'original' | 'text'>('original')
  const [railTab, setRailTab] = useState<RailTab>('chat')
  const [railOpen, setRailOpen] = useState(false) // mobile drawer
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
  const [manualProgress, setManualProgress] = useState(0)

  const contentRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sessionStart = useRef<number>(Date.now())
  const lastLogged = useRef<number>(Date.now())

  const isPdf = !!doc?.filePath

  // Load document + chat
  useEffect(() => {
    if (!readerDocId) return
    setLoading(true)
    setMode('original')
    setRailTab('chat')
    sessionStart.current = Date.now()
    lastLogged.current = Date.now()
    Promise.all([
      api.get<{ document: DocumentItem & { highlights: Highlight[] } }>(`/api/documents/${readerDocId}`),
      api.get<{ messages: ChatMessage[] }>(`/api/chat?documentId=${readerDocId}`),
      api.get<{ mindmaps: { id: string; title: string }[] }>('/api/mindmaps'),
    ])
      .then(([d, m, mm]) => {
        setDoc(d.document)
        setManualProgress(d.document.progress)
        setMessages(m.messages)
        setMindmaps(mm.mindmaps)
        // opening a PDF counts as a reading session
        if (d.document.filePath && d.document.status === 'queued') {
          api.patch(`/api/documents/${d.document.id}`, { status: 'reading' }).catch(() => {})
        }
      })
      .catch(() => toast({ title: 'Failed to open document', variant: 'destructive' }))
      .finally(() => setLoading(false))
  }, [readerDocId, toast])

  // Log reading time every minute
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
      const minutes = Math.round((Date.now() - lastLogged.current) / 60000)
      if (minutes >= 1) {
        api.post('/api/reading-sessions', { documentId: readerDocId, minutes }).catch(() => {})
      }
    }
  }, [readerDocId, doc])

  // Scroll-driven progress (text mode only — the native PDF viewer can't expose scroll)
  const onScroll = useCallback(() => {
    if (mode !== 'text') return
    const el = scrollRef.current
    if (!el || !doc) return
    const pct = Math.min(100, Math.round((el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)) * 100))
    if (pct > doc.progress) {
      setDoc({ ...doc, progress: pct })
      api.patch(`/api/documents/${doc.id}`, { progress: pct, status: doc.status === 'queued' ? 'reading' : doc.status }).catch(() => {})
    }
  }, [doc, mode])

  // Selection handling (text mode / extracted text)
  useEffect(() => {
    const handler = () => {
      if (mode !== 'text') return setSelection(null)
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
  }, [mode])

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
      toast({ title: 'Highlighted', description: 'Find it in the Highlights tab of the side panel.' })
    } catch {
      toast({ title: 'Could not save highlight', variant: 'destructive' })
    }
  }

  function renderContent() {
    if (!doc?.content) {
      return (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 font-medium">No extractable text</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            This PDF has no machine-readable text (likely a scan). Paste its text to unlock highlighting and AI Q&amp;A.
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

    const paragraphs = doc.content.split(/\n{1,}/)
    return paragraphs.map((p, i) => <p key={i}>{renderWithHighlights(p)}</p>)
  }

  function renderWithHighlights(text: string) {
    const highlights = doc!.highlights
    if (highlights.length === 0) return text
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

  async function makeFlashcard(highlightId?: string) {
    if (!doc) return
    const target = highlightId ?? lastHighlightId
    if (!target) return
    setFlashcardBusy(true)
    try {
      await api.post('/api/flashcards', { generate: true, highlightId: target })
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

  async function toggleFinished() {
    if (!doc) return
    const finished = doc.status === 'finished'
    const { document: updated } = await api.patch<{ document: DocumentItem }>(`/api/documents/${doc.id}`, {
      status: finished ? 'reading' : 'finished',
      progress: finished ? doc.progress : 100,
    })
    setDoc({ ...doc, ...updated, highlights: doc.highlights })
    setManualProgress(updated.progress)
    if (!finished) toast({ title: 'Marked as finished' })
  }

  async function saveManualProgress(v: number) {
    if (!doc) return
    setManualProgress(v)
    const { document: updated } = await api.patch<{ document: DocumentItem }>(`/api/documents/${doc.id}`, {
      progress: v,
      status: doc.status === 'queued' ? 'reading' : doc.status,
    })
    setDoc({ ...doc, ...updated, highlights: doc.highlights })
  }

  const takeaways = useMemo<string[]>(() => {
    if (!doc?.takeaways) return []
    try { return JSON.parse(doc.takeaways) } catch { return [] }
  }, [doc?.takeaways])

  if (!readerDocId) return null

  const fileUrl = doc ? `/api/documents/${doc.id}/file` : ''

  // ── Side rail content (shared between desktop aside and mobile sheet) ──
  const rail = (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs value={railTab} onValueChange={(v) => setRailTab(v as RailTab)} className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="border-b px-3 pt-2.5">
          <TabsList className="h-8 w-full justify-start rounded-none border-0 bg-transparent p-0">
            <TabsTrigger value="chat" className="h-8 rounded-none border-0 border-b-2 px-3 text-xs data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none">Ask AI</TabsTrigger>
            <TabsTrigger value="summary" className="h-8 rounded-none border-0 border-b-2 px-3 text-xs data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none">Summary</TabsTrigger>
            <TabsTrigger value="highlights" className="h-8 rounded-none border-0 border-b-2 px-3 text-xs data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none">
              Highlights{doc?.highlights.length ? ` · ${doc.highlights.length}` : ''}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Chat */}
        <TabsContent value="chat" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
          <div className="flex h-full flex-col">
            <ScrollArea className="scroll-thin min-h-0 flex-1 px-4 py-4">
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
                    <div className={cn('max-w-[88%] rounded-2xl px-3 py-2 text-sm', m.role === 'user' ? 'rounded-br-md bg-foreground text-background' : 'rounded-bl-md border bg-card')}>
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
                                  <span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[9px] font-bold">{c.n}</span>
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
                <Button size="icon" className="h-11 w-11 shrink-0" onClick={() => sendAI()} disabled={aiBusy || !aiInput.trim()} aria-label="Send question">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Summary + progress */}
        <TabsContent value="summary" className="mt-0 min-h-0 flex-1 overflow-y-auto scroll-thin data-[state=inactive]:hidden">
          <div className="space-y-5 px-4 py-4">
            <section>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI summary</h3>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={summarize} disabled={summarizing || !doc?.content}>
                  {summarizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {doc?.summary ? 'Regenerate' : 'Generate'}
                </Button>
              </div>
              {doc?.summary ? (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{doc.summary}</p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">{doc?.content ? 'No summary yet — generate one from the extracted text.' : 'This document has no extracted text, so it cannot be summarized.'}</p>
              )}
              {takeaways.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {takeaways.map((t, i) => (
                    <li key={i} className="flex gap-2 text-sm"><span className="mt-0.5 text-success">✓</span><span>{t}</span></li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2 border-t pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Progress</h3>
              <div className="flex items-center gap-3">
                <Slider
                  value={[manualProgress]}
                  onValueChange={([v]) => setManualProgress(v)}
                  onValueCommit={([v]) => saveManualProgress(v)}
                  max={100}
                  step={1}
                  aria-label="Reading progress"
                />
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{manualProgress}%</span>
              </div>
              <p className="text-xs text-muted-foreground">{isPdf ? 'Set manually — the embedded viewer keeps its own scroll.' : 'Also advances automatically while you scroll.'}</p>
            </section>

            <section className="space-y-2 border-t pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Use it elsewhere</h3>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setMindmapOpen(true)}>
                  <Share2 className="h-3.5 w-3.5" /> Mindmap
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setRailTab('highlights')}>
                  <Highlighter className="h-3.5 w-3.5" /> From a highlight
                </Button>
              </div>
            </section>
          </div>
        </TabsContent>

        {/* Highlights */}
        <TabsContent value="highlights" className="mt-0 min-h-0 flex-1 overflow-y-auto scroll-thin data-[state=inactive]:hidden">
          <div className="space-y-3 px-4 py-4">
            {mode === 'original' && isPdf && (
              <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                Tip: switch to <button onClick={() => setMode('text')} className="font-semibold underline underline-offset-2">Text mode</button> to select passages and highlight them.
              </p>
            )}
            {(doc?.highlights.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                {isPdf && mode === 'original'
                  ? 'Open Text mode, select any passage and pick a color — highlights show up here.'
                  : 'Select any passage in the text and pick a color — highlights show up here.'}
              </p>
            ) : (
              doc!.highlights.map((h) => (
                <div key={h.id} className="group rounded-lg border bg-card p-3">
                  <div className="flex items-start gap-2">
                    <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', {
                      'bg-yellow-400/80': h.color === 'yellow',
                      'bg-green-500/70': h.color === 'green',
                      'bg-blue-500/60': h.color === 'blue',
                      'bg-pink-500/60': h.color === 'pink',
                    })} />
                    <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground/90 line-clamp-4">{h.text}</p>
                    <button
                      onClick={async () => {
                        await api.del(`/api/highlights/${h.id}`)
                        setDoc({ ...doc!, highlights: doc!.highlights.filter((x) => x.id !== h.id) })
                      }}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                      aria-label="Delete highlight"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {h.note && <p className="mt-1.5 border-l-2 border-border pl-2 text-xs italic text-muted-foreground">{h.note}</p>}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => makeFlashcard(h.id)}
                      disabled={flashcardBusy}
                      className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {flashcardBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Layers className="h-3 w-3" />} Flashcard
                    </button>
                    <button
                      onClick={() => {
                        setNoteDialogFor(h.id)
                        setNoteText(h.note ?? '')
                      }}
                      className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <StickyNote className="h-3 w-3" /> {h.note ? 'Edit note' : 'Note'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )

  return (
    <div
      className="anim-fade-up flex h-[calc(100dvh-232px)] min-h-[480px] flex-col lg:h-[calc(100dvh-128px)]"
      data-reader
    >

      {/* ── Reader header ── */}
      <header className="flex flex-wrap items-center gap-2 border-b pb-2.5">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={closeReader} aria-label="Back to library">
          <ArrowLeft className="h-4.5 w-4.5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{doc?.title ?? 'Loading…'}</p>
          <p className="truncate text-xs text-muted-foreground">
            {doc?.author ? `${doc.author} · ` : ''}
            {isPdf ? `${doc?.pageCount ?? '?'} pages · ${doc?.fileName ?? 'PDF'}` : doc?.type}
          </p>
        </div>

        {isPdf && doc?.content && (
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'original' | 'text')}>
            <TabsList className="h-8">
              <TabsTrigger value="original" className="h-6 gap-1.5 px-2.5 text-xs"><FileText className="h-3.5 w-3.5" /> Original PDF</TabsTrigger>
              <TabsTrigger value="text" className="h-6 gap-1.5 px-2.5 text-xs"><BookOpen className="h-3.5 w-3.5" /> Text</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {doc && (
          <>
            <Button variant="outline" size="sm" className="hidden h-8 gap-1.5 text-xs sm:flex" onClick={toggleFinished}>
              <CheckCircle2 className={cn('h-3.5 w-3.5', doc.status === 'finished' && 'text-success')} />
              {doc.status === 'finished' ? 'Reopen' : 'Finish'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs lg:hidden"
              onClick={() => setRailOpen(true)}
              aria-label="Open AI panel"
            >
              <PanelRightOpen className="h-4 w-4" /> AI
            </Button>
          </>
        )}
      </header>

      {/* ── Content split ── */}
      <div className="flex min-h-0 flex-1 gap-0 pt-3">
        {/* Main reading section */}
        <div className="flex min-w-0 flex-1 flex-col lg:pr-3">
          {loading ? (
            <div className="flex-1 space-y-4 rounded-xl border bg-card p-8">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-muted" style={{ width: `${70 + ((i * 13) % 30)}%` }} />
              ))}
            </div>
          ) : isPdf && mode === 'original' ? (
            /* Embedded browser-PDF window — a section of the page, native rendering */
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-muted/40 shadow-soft">
              <div className="flex items-center gap-2 border-b bg-background/95 px-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{doc?.fileName ?? doc?.title}</p>
                <Badge variant="outline" className="hidden shrink-0 text-[10px] sm:inline-flex">{doc?.pageCount ?? '?'} pages</Badge>
                <a href={fileUrl} target="_blank" rel="noreferrer" className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Open PDF in new tab">
                  <ExternalLink className="h-3 w-3" /> Open
                </a>
                <a href={fileUrl} download={doc?.fileName ?? undefined} className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Download PDF">
                  <Download className="h-3 w-3" /> Save
                </a>
              </div>
              {/* Native browser PDF viewer — zoom, thumbnails, search just work */}
              <iframe
                src={fileUrl}
                title={`PDF viewer — ${doc?.title ?? 'document'}`}
                className="min-h-0 w-full flex-1 bg-muted/40"
              />
            </div>
          ) : (
            /* Text reading column (articles, extracted text, pasted content) */
            <div ref={scrollRef} onScroll={onScroll} className="scroll-thin min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="mx-auto max-w-[680px] px-1 py-4 sm:px-2">
                {doc?.summary && (
                  <div className="anim-pop mb-8 rounded-xl border bg-card p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
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
                <div className="mt-6 flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                  <span>— end of document —</span>
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs sm:hidden" onClick={toggleFinished}>
                    <CheckCircle2 className={cn('h-3.5 w-3.5', doc?.status === 'finished' && 'text-success')} />
                    {doc?.status === 'finished' ? 'Reopen' : 'Finish'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* progress strip (text mode) */}
          {(!isPdf || mode === 'text') && doc && (
            <div className="mt-2 flex items-center gap-3">
              <Progress value={doc.progress} className="h-1" />
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{doc.progress}%</span>
            </div>
          )}
        </div>

        {/* Desktop side rail */}
        <aside className="hidden w-[360px] shrink-0 flex-col overflow-hidden rounded-xl border bg-card lg:flex" aria-label="Document AI panel">
          {rail}
        </aside>
      </div>

      {/* Mobile side rail sheet */}
      <Sheet open={railOpen} onOpenChange={setRailOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[400px]">
          <SheetHeader className="border-b p-3 pb-2.5">
            <SheetTitle className="truncate text-left text-sm">{doc?.title ?? 'Document'}</SheetTitle>
          </SheetHeader>
          {rail}
        </SheetContent>
      </Sheet>

      {/* ── Floating selection toolbar (text mode) ── */}
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
            className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
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
            <DialogTitle>{noteDialogFor === 'new' ? 'Attach a note' : 'Edit note'}</DialogTitle>
            <DialogDescription className="line-clamp-2">
              {noteDialogFor === 'new' ? selection?.text : doc?.highlights.find((h) => h.id === noteDialogFor)?.text}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Your thought on this passage…" className="min-h-[100px]" autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNoteDialogFor(null)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!doc) return
                try {
                  if (noteDialogFor === 'new') {
                    const text = selection?.text ?? ''
                    if (text) {
                      const position = Math.max(0, doc.content?.indexOf(text.slice(0, 60)) ?? 0)
                      const { highlight } = await api.post<{ highlight: Highlight }>('/api/highlights', { documentId: doc.id, text, color: 'blue', note: noteText, position })
                      setDoc({ ...doc, highlights: [...doc.highlights, highlight] })
                      setLastHighlightId(highlight.id)
                    }
                  } else if (noteDialogFor) {
                    await api.patch(`/api/highlights/${noteDialogFor}`, { note: noteText })
                    setDoc({
                      ...doc,
                      highlights: doc.highlights.map((h) => (h.id === noteDialogFor ? { ...h, note: noteText } : h)),
                    })
                  }
                  setNoteDialogFor(null)
                  setSelection(null)
                  window.getSelection()?.removeAllRanges()
                  toast({ title: 'Note saved' })
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
              <SelectItem value="__new">Generate new mindmap from this document</SelectItem>
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
