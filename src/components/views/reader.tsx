'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '@/lib/client'
import type { DocumentItem, Highlight, ChatMessage, Citation } from '@/lib/types'
import { useUI } from '@/lib/nav-config'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { splitCitationParts } from '@/lib/citations'
import ReactMarkdown from 'react-markdown'
import { PdfCanvasViewer, type PdfViewerHandle } from '@/components/pdf-viewer'
import {
  ArrowLeft, Send, Highlighter, StickyNote, Layers, Share2, Loader2,
  X, Trash2, CheckCircle2, BookOpen, FileText, PanelRightOpen, ExternalLink, Download, Sparkles,
  Quote, CornerDownRight,
} from 'lucide-react'

const HL_COLORS = ['yellow', 'green', 'blue', 'pink'] as const

// exact-page resume position per document (mirrored to the DB as lastPage)
const readerPageKey = (docId: string) => `cortex-reader-page:${docId}`

interface SelInfo {
  text: string
  x: number
  y: number
}

type PanelTab = 'summary' | 'highlights'

// ─── Assistant answer with live citation chips ──────────────────────
// [n] markers in the markdown become buttons that land the reader on the
// cited page (PDF) or passage (text). The Sources list under the answer
// shows each quoted passage with a page badge — every row is clickable too.
function CitedAnswer({
  content,
  citations,
  onCite,
}: {
  content: string
  citations: Citation[] | null
  onCite: (c: Citation) => void
}) {
  const mdClass =
    'space-y-2 text-sm leading-relaxed [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_li]:ml-4 [&_li]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal [&_p]:mb-2 [&_strong]:font-semibold [&_ul]:ml-4 [&_ul]:list-disc'

  if (!citations?.length) {
    return <div className={mdClass}><ReactMarkdown>{content}</ReactMarkdown></div>
  }

  // split content around citation markers (single [2] or combined [1, 3])
  const parts = splitCitationParts(content, citations)

  return (
    <div className={mdClass}>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <ReactMarkdown key={i}>{p}</ReactMarkdown>
        ) : (
          <button
            key={i}
            onClick={() => onCite(p)}
            title={p.page ? `Jump to page ${p.page}` : 'Jump to the cited passage'}
            className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full bg-primary/10 px-1 align-super text-[10px] font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            <Quote className="h-2.5 w-2.5" />
            {p.n}
          </button>
        )
      )}
      <div className="mt-2.5 space-y-1.5 border-t pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Sources</p>
        {citations.map((c) => (
          <button
            key={c.n}
            onClick={() => onCite(c)}
            title={c.page ? `Jump to page ${c.page}` : 'Jump to the cited passage'}
            className="group flex w-full items-start gap-2 rounded-lg border bg-muted/40 px-2 py-1.5 text-left transition-colors hover:border-primary/40 hover:bg-muted"
          >
            <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">{c.n}</span>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-[11px] leading-snug text-muted-foreground transition-colors [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [overflow:hidden] group-hover:text-foreground">{c.label}</span>
              {c.page ? (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-semibold text-primary">
                  <FileText className="h-2.5 w-2.5" /> Page {c.page}
                </span>
              ) : null}
            </span>
            <CornerDownRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Reader — opens INSIDE the app shell as a section ────────────────
// PDFs render through a pdf.js canvas viewer (mobile browsers don't render
// PDFs inside iframes — this works identically everywhere, original layout,
// images and fonts preserved); text documents use the comfortable
// reading column. The canvas owns the FULL width: AI chat lives ONLY in the
// floating popup (every Copilot icon toggles it, Sparkles ⇄ cross), while
// summary + highlights open on demand from the header panel button.
export function ReaderView() {
  const readerDocId = useUI((s) => s.readerDocId)
  const closeReader = useUI((s) => s.closeReader)
  const openReader = useUI((s) => s.openReader)
  const readerJumpPage = useUI((s) => s.readerJumpPage)
  const setReaderJumpPage = useUI((s) => s.setReaderJumpPage)
  const { toast } = useToast()

  const [doc, setDoc] = useState<(DocumentItem & { highlights: Highlight[] }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [selection, setSelection] = useState<SelInfo | null>(null)
  const [mode, setMode] = useState<'original' | 'text'>('original')
  const [panelTab, setPanelTab] = useState<PanelTab>('summary')
  const [panelOpen, setPanelOpen] = useState(false) // summary/highlights sheet
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
  const [confirmDelete, setConfirmDelete] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sessionStart = useRef<number>(Date.now())
  const lastLogged = useRef<number>(Date.now())
  const docIdRef = useRef<string | null>(null)
  const initialPdfPageRef = useRef(1)
  const pendingPageSave = useRef<{ page: number; pct: number | null } | null>(null)
  const pageSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restoredTextRef = useRef('')
  // citation jumps: imperative handle to the pdf viewer + external jump request
  const viewerRef = useRef<PdfViewerHandle | null>(null)
  const jumpNonce = useRef(0)
  const [pdfJump, setPdfJump] = useState<{ page: number; nonce: number } | null>(null)
  // Fullscreen reading (state lives in the pdf viewer) + the minimal AI chat
  // popup, driven by the shared `readerChatOpen` store flag: with a book open
  // the app-level Copilot icons open THIS instead of the right dock, and the
  // fullscreen overlay carries its own toggle (app chrome is covered there).
  // The popup reuses the rail's chat body — one conversation, every host.
  const [pdfFullscreen, setPdfFullscreen] = useState(false)
  const readerChatOpen = useUI((s) => s.readerChatOpen)
  const setReaderChatOpen = useUI((s) => s.setReaderChatOpen)

  const isPdf = !!doc?.filePath

  // Load document + chat
  useEffect(() => {
    if (!readerDocId) return
    setLoading(true)
    setMode('original')
    setPanelTab('summary')
    sessionStart.current = Date.now()
    lastLogged.current = Date.now()
    docIdRef.current = null
    initialPdfPageRef.current = 1
    restoredTextRef.current = ''
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
        docIdRef.current = d.document.id
        // resume position for PDFs: exact page from localStorage, DB lastPage as fallback
        if (d.document.filePath) {
          let p = 0
          try { p = Number(localStorage.getItem(readerPageKey(d.document.id)) ?? 0) || 0 } catch { /* ignore */ }
          if (!p) p = d.document.lastPage ?? 0
          const total = d.document.pageCount ?? 0
          if (total > 0 && p > total) p = total
          initialPdfPageRef.current = Math.max(1, p)
        }
        // opening a PDF counts as a reading session
        if (d.document.filePath && d.document.status === 'queued') {
          api.patch(`/api/documents/${d.document.id}`, { status: 'reading' }).catch(() => {})
        }
      })
      .catch(() => {
        // doc may be gone (or the persisted reader id went stale after reload)
        toast({ title: 'Failed to open document', variant: 'destructive' })
        closeReader()
      })
      .finally(() => setLoading(false))
  }, [readerDocId, toast, closeReader])

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

  // Scroll-driven progress (text mode only — page-based PDF scroll is tracked by the pdf.js viewer)
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

  // ── PDF page tracking: save the exact page the reader is on ──
  // localStorage immediately (same-device resume), DB lastPage+progress
  // debounced (cross-device resume + library progress bars)
  const flushPageSave = useCallback(() => {
    if (pageSaveTimer.current) {
      clearTimeout(pageSaveTimer.current)
      pageSaveTimer.current = null
    }
    const payload = pendingPageSave.current
    pendingPageSave.current = null
    const id = docIdRef.current
    if (!payload || !id) return
    const body: Record<string, number> = { lastPage: payload.page }
    if (payload.pct !== null) body.progress = payload.pct
    api.patch(`/api/documents/${id}`, body).catch(() => {})
  }, [])

  const handlePdfPageChange = useCallback((page: number) => {
    const id = docIdRef.current
    if (!id) return
    const total = doc?.pageCount ?? 0
    const raw = total > 0 ? Math.round((page / total) * 100) : null
    // progress only ever rises — re-reading an earlier page must not
    // regress the saved progress (local state or the DB)
    const pct = raw === null ? null : Math.min(100, Math.max(doc?.progress ?? 0, raw))
    try { localStorage.setItem(readerPageKey(id), String(page)) } catch { /* ignore */ }
    setDoc((d) => (d ? { ...d, lastPage: page, progress: pct ?? d.progress } : d))
    if (pct !== null) setManualProgress((m) => Math.max(m, pct))
    pendingPageSave.current = { page, pct }
    if (pageSaveTimer.current) clearTimeout(pageSaveTimer.current)
    pageSaveTimer.current = setTimeout(flushPageSave, 1500)
  }, [doc?.pageCount, doc?.progress, flushPageSave])

  // flush a pending page save when the reader closes/unmounts or doc switches
  useEffect(() => {
    return () => flushPageSave()
  }, [readerDocId, flushPageSave])

  // ── Citation jumps ────────────────────────────────────────────────
  // Jump the PDF viewer to a page. Covers both paths: a fresh mount (mode
  // switch — the mount resume effect re-reads initialPdfPageRef) and the
  // already-mounted viewer (jump nonce scrolls in place).
  const applyPdfJump = useCallback(
    (page: number) => {
      initialPdfPageRef.current = page
      jumpNonce.current += 1
      setPdfJump({ page, nonce: jumpNonce.current })
      setMode((m) => (m !== 'original' ? 'original' : m))
      // A deliberate jump IS the new reading position — record it here. The
      // viewer suppresses onPageChange around its own resume/settle, so a
      // jump that lands via a fresh mount would otherwise never be saved
      // and a reload would fall back to the stale pre-jump page.
      handlePdfPageChange(page)
    },
    [handlePdfPageChange]
  )

  // Best-effort page for citations stored before page tracking existed:
  // find the quoted passage in the content, convert its char offset to a
  // page proportionally.
  const estimateCitePage = useCallback(
    (c: Citation): number | null => {
      if (!doc?.pageCount || !doc.content) return null
      let off = c.charStart ?? null
      if (off == null && c.label) {
        const needle = c.label.replace(/…$/, '').slice(0, 60)
        if (needle) {
          const idx = doc.content.indexOf(needle)
          if (idx >= 0) off = idx
        }
      }
      if (off == null) return null
      return Math.min(doc.pageCount, Math.max(1, Math.round((off / doc.content.length) * doc.pageCount)))
    },
    [doc]
  )

  // Text documents: scroll the reading column to the cited passage and flash it
  const scrollToTextOffset = useCallback((off: number) => {
    const el = scrollRef.current
    if (!el) return
    const paras = el.querySelectorAll<HTMLElement>('[data-off]')
    let target: HTMLElement | null = null
    for (const p of Array.from(paras)) {
      if (Number(p.dataset.off ?? 0) <= off) target = p
      else break
    }
    target = target ?? (paras[0] as HTMLElement | undefined) ?? null
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.classList.remove('cite-flash')
    void target.offsetWidth // restart the animation on repeated clicks
    target.classList.add('cite-flash')
    window.setTimeout(() => target?.classList.remove('cite-flash'), 2400)
  }, [])

  // A citation was clicked (chip in the answer or a Sources row): land the
  // reader on the passage. PDFs jump instantly to the stored page estimate,
  // then get corrected to the page that really contains the passage
  // (text-layer search). Text documents scroll to the exact offset.
  const jumpToCitation = useCallback(
    async (c: Citation) => {
      if (!doc) return
      if (c.documentId && c.documentId !== doc.id) {
        openReader(c.documentId) // cited a different document — open it
        return
      }
      if (isPdf) {
        const estimate = c.page ?? estimateCitePage(c)
        if (estimate) applyPdfJump(estimate)
        // close the panel sheet so the landing page is actually visible
        setPanelOpen(false)
        const raw = (c.label ?? '').replace(/…$/, '').trim()
        if (raw.length >= 12 && viewerRef.current) {
          // Copilot labels carry a "Title — passage" prefix — try the raw
          // label first, then just the passage part
          let found = await viewerRef.current.locate(raw, estimate ?? undefined).catch(() => null)
          if (!found && raw.includes(' — ')) {
            found = await viewerRef.current
              .locate(raw.slice(raw.indexOf(' — ') + 3), estimate ?? undefined)
              .catch(() => null)
          }
          if (found && found !== estimate) applyPdfJump(found)
        }
      } else if (c.charStart != null) {
        setPanelOpen(false) // reveal the passage behind the sheet
        scrollToTextOffset(c.charStart)
      } else if (c.url) {
        window.open(c.url, '_blank')
      }
    },
    [doc, isPdf, openReader, applyPdfJump, estimateCitePage, scrollToTextOffset]
  )

  // Copilot handed us a citation jump (open the book straight at page N) —
  // consume it once the document is loaded. The viewer's jump effect replays
  // once `pdf` is ready, so this works even while the file is still loading.
  useEffect(() => {
    if (!readerJumpPage || !doc) return
    if (isPdf) applyPdfJump(readerJumpPage)
    setReaderJumpPage(null)
  }, [readerJumpPage, doc, isPdf, applyPdfJump, setReaderJumpPage])

  // ── Minimal AI popup (reader mode) ─────────────────────────────
  // The viewer reports fullscreen transitions. The popup itself is store-
  // driven and survives the normal ↔ fullscreen swap — same conversation,
  // only the anchor point changes.
  const handlePdfFullscreen = useCallback((fs: boolean) => {
    setPdfFullscreen(fs)
  }, [])

  // Esc while fullscreen: first press minimizes the AI popup (consumed), a
  // second press actually leaves fullscreen — handled by the viewer's guard
  const fsEscapeGuard = useCallback(() => {
    if (!useUI.getState().readerChatOpen) return false
    useUI.getState().setReaderChatOpen(false)
    return true
  }, [])

  // ── Text mode resume: scroll back to the saved progress position ──
  useEffect(() => {
    if (!doc) return
    if (isPdf && mode === 'original') return // the pdf viewer restores its own page
    const sig = `${doc.id}:${mode}`
    if (restoredTextRef.current === sig) return
    restoredTextRef.current = sig
    const el = scrollRef.current
    const pct = Math.min(100, Math.max(0, doc.progress))
    if (!el || pct <= 2) return
    const started = performance.now()
    let raf = 0
    let lastMax = -1
    let stableFrames = 0
    const tick = () => {
      const max = el.scrollHeight - el.clientHeight
      el.scrollTop = (pct / 100) * max
      stableFrames = max === lastMax ? stableFrames + 1 : 0
      lastMax = max
      if (stableFrames >= 8 || performance.now() - started > 1200) return
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [doc, mode, isPdf])

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
      toast({ title: 'Highlighted', description: 'Find it in the document panel (header icon).' })
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
    // char offset of every rendered paragraph — lets a citation click scroll
    // the text column to the exact cited passage
    const starts: number[] = []
    let cursor = 0
    for (const p of paragraphs) {
      const found = doc.content.indexOf(p, cursor)
      const start = found === -1 ? cursor : found
      starts.push(start)
      cursor = start + p.length
    }
    return paragraphs.map((p, i) => (
      <p key={i} data-off={starts[i]}>{renderWithHighlights(p)}</p>
    ))
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

  // ── Chat body (shared by the side rail AND the fullscreen AI popup) ──
  // One conversation, two hosts: messages, suggested prompts, the input box
  // and clickable citations behave identically in both.
  const chatBody = (
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
              <div className={cn('max-w-[92%] rounded-2xl px-3 py-2 text-sm', m.role === 'user' ? 'rounded-br-md bg-foreground text-background' : 'rounded-bl-md border bg-card')}>
                {m.role === 'user' ? (
                  m.content
                ) : (
                  <CitedAnswer content={m.content} citations={m.citations} onCite={jumpToCitation} />
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
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => setMindmapOpen(true)}
            aria-label="Create mindmap from this document"
            title="Create mindmap"
          >
            <Share2 className="h-4 w-4" />
          </Button>
          <Button size="icon" className="h-11 w-11 shrink-0" onClick={() => sendAI()} disabled={aiBusy || !aiInput.trim()} aria-label="Send question">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )

  // ── Document panel content (Summary + Highlights) ──
  // Opened on demand from the header button — one sheet for every
  // breakpoint. Chat is deliberately NOT here: it lives only in the popup.
  const panelBody = (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs value={panelTab} onValueChange={(v) => setPanelTab(v as PanelTab)} className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="border-b px-3 pt-2.5">
          <TabsList className="h-8 w-full justify-start rounded-none border-0 bg-transparent p-0">
            <TabsTrigger value="summary" className="h-8 rounded-none border-0 border-b-2 px-3 text-xs data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none">Summary</TabsTrigger>
            <TabsTrigger value="highlights" className="h-8 rounded-none border-0 border-b-2 px-3 text-xs data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none">
              Highlights{doc?.highlights.length ? ` · ${doc.highlights.length}` : ''}
            </TabsTrigger>
          </TabsList>
        </div>

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
              <p className="text-xs text-muted-foreground">{isPdf ? 'Tracks automatically from the page you are on — or set it here.' : 'Also advances automatically while you scroll.'}</p>
            </section>

            <section className="space-y-2 border-t pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Use it elsewhere</h3>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setMindmapOpen(true)}>
                  <Share2 className="h-3.5 w-3.5" /> Mindmap
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setPanelTab('highlights')}>
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
      className="anim-fade-up flex h-[calc(100dvh-184px)] min-h-[480px] flex-col lg:h-[calc(100dvh-88px)]"
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
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-danger"
              aria-label="Delete document"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              onClick={() => setPanelOpen(true)}
              aria-label="Open document panel (summary & highlights)"
              title="Summary & highlights"
            >
              <PanelRightOpen className="h-4 w-4" />
            </Button>
          </>
        )}
      </header>

      {/* ── Canvas ── */}
      <div className="flex min-h-0 flex-1 gap-0 pt-3">
        {/* The reading canvas owns the FULL width — the old side rail (with
            its always-visible mini chat) is gone; AI chat lives only in the
            floating popup. The canvas still stretches 48px lower (into main's
            bottom padding) so it uses the space the floating Quick capture /
            Copilot buttons would otherwise occupy — those buttons only float
            over the canvas corner, so the extra height stays overlap-free. */}
        <div className="flex min-w-0 flex-1 flex-col lg:-mb-12">
          {loading ? (
            <div className="flex-1 space-y-4 rounded-xl border bg-card p-8">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-muted" style={{ width: `${70 + ((i * 13) % 30)}%` }} />
              ))}
            </div>
          ) : isPdf && mode === 'original' ? (
            /* Embedded pdf.js viewer — canvas rendering works on every browser
               (mobile ones don't render PDFs in iframes) */
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
              {/* pdf.js canvas pages — zoom, page nav, lazy render; resumes at the last page read;
                  citation clicks jump here via the imperative handle */}
              <PdfCanvasViewer
                ref={viewerRef}
                url={fileUrl}
                initialPage={initialPdfPageRef.current}
                onPageChange={handlePdfPageChange}
                jump={pdfJump}
                onFullscreenChange={handlePdfFullscreen}
                escapeGuard={fsEscapeGuard}
                toolbarAction={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setMindmapOpen(true)}
                    aria-label="Create mindmap from this document"
                    title="Create mindmap"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                }
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
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{doc?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the document{isPdf ? ' and its stored PDF file' : ''}, including highlights, notes and chat history. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              onClick={async () => {
                if (!doc) return
                try {
                  await api.del(`/api/documents/${doc.id}`)
                  toast({ title: 'Document deleted' })
                  closeReader()
                } catch {
                  toast({ title: 'Delete failed', variant: 'destructive' })
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Document panel sheet — summary + highlights on demand (all
          breakpoints). Chat is NOT here: only the AI popup shows chat. */}
      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[400px]">
          <SheetHeader className="border-b p-3 pb-2.5">
            <SheetTitle className="truncate text-left text-sm">{doc?.title ?? 'Document'}</SheetTitle>
          </SheetHeader>
          {panelBody}
        </SheetContent>
      </Sheet>

      {/* ── Minimal AI chat popup (book open) ──
          Opens ONLY from a Copilot icon click: the app-level Copilot icons
          (mobile + desktop) toggle `readerChatOpen` while a book is open —
          Sparkles opens the popup, the cross minimizes it — so the right-side
          dock / full-screen sheet never fights the reader. One conversation
          everywhere (shared chatBody) and citation chips jump the pages
          behind it. The wrapper is pointer-events-none so the PDF underneath
          never loses scrolling or selection. */}
      {doc && readerChatOpen && createPortal(
        <div className={cn('pointer-events-none fixed inset-0', pdfFullscreen ? 'z-[70]' : 'z-40')}>
          <div
            className={cn(
              'anim-pop pointer-events-auto absolute flex w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-popover shadow-xl',
              // normal view: clear the floating Copilot / Quick-capture
              // buttons; fullscreen: sit just above the in-overlay toggle
              pdfFullscreen
                ? 'bottom-[4.25rem] right-4 h-[min(560px,calc(100dvh-7.5rem))] sm:right-5'
                : 'bottom-[13rem] right-4 h-[min(560px,calc(100dvh-15rem))] lg:bottom-[5.5rem] lg:right-5 lg:h-[min(560px,calc(100dvh-9rem))]',
            )}
            role="dialog"
            aria-label="AI chat"
          >
            <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
              <p className="shrink-0 text-xs font-semibold">Ask AI</p>
              <p className="min-w-0 flex-1 truncate text-right text-[10px] text-muted-foreground">{doc.title}</p>
              <button
                onClick={() => setReaderChatOpen(false)}
                aria-label="Minimize AI chat"
                title="Minimize"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">{chatBody}</div>
          </div>
        </div>,
        document.body
      )}

      {/* Fullscreen Copilot toggle — the app-level icons are covered by the
          immersive overlay, so fullscreen carries its own (same Sparkles
          icon): click opens the popup, the cross minimizes it */}
      {pdfFullscreen && doc && createPortal(
        <div className="pointer-events-none fixed inset-0 z-[70]">
          <button
            onClick={() => setReaderChatOpen(!readerChatOpen)}
            aria-label={readerChatOpen ? 'Minimize AI chat' : 'Open AI chat'}
            title={readerChatOpen ? 'Minimize AI chat' : 'Ask AI about this book'}
            className="pointer-events-auto absolute bottom-5 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95 sm:right-5"
          >
            {readerChatOpen ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
          </button>
        </div>,
        document.body
      )}

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
