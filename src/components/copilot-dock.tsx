'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useUI } from '@/lib/nav-config'
import { useUI as useUIStore } from '@/lib/store'
import { useMediaQuery } from '@/components/shared'
import { api } from '@/lib/client'
import { splitCitationParts } from '@/lib/citations'
import type { ChatMessage, Citation } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sparkles, Send, X, Quote, Trash2, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

const SUGGESTIONS = [
  'What did that paper say about attention?',
  'What should I focus on today?',
  'Which goals are at risk?',
  'Summarize what I read this week',
]

// Render assistant markdown and turn [n] citation markers into clickable chips
function MarkdownWithCitations({
  content,
  citations,
  onCite,
}: {
  content: string
  citations: Citation[] | null
  onCite?: (c: Citation) => void
}) {
  if (!citations?.length) {
    return (
      <div className="prose-sm space-y-2 text-sm leading-relaxed [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_li]:ml-4 [&_li]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal [&_p]:mb-2 [&_strong]:font-semibold [&_ul]:ml-4 [&_ul]:list-disc">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    )
  }

  // split content by citation markers (single [2] or combined [1, 3])
  const parts = splitCitationParts(content, citations)

  return (
    <div className="prose-sm space-y-2 text-sm leading-relaxed [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_li]:ml-4 [&_li]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal [&_p]:mb-2 [&_strong]:font-semibold [&_ul]:ml-4 [&_ul]:list-disc">
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <ReactMarkdown key={i}>{p}</ReactMarkdown>
        ) : (
          <button
            key={i}
            onClick={() => onCite?.(p)}
            title={p.page ? `Jump to page ${p.page}` : p.label}
            className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1 align-super text-[10px] font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            <Quote className="mr-0.5 h-2.5 w-2.5" />
            {p.n}
          </button>
        )
      )}
      <div className="mt-3 space-y-1.5 border-t pt-2">
        {citations.map((c) => (
          <button
            key={c.n}
            onClick={() => onCite?.(c)}
            title={c.page ? `Jump to page ${c.page}` : c.label}
            className="flex w-full items-start gap-1.5 rounded-lg bg-muted/60 px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
          >
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">{c.n}</span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2">{c.label}</span>
              {c.page ? (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-semibold text-primary">
                  Page {c.page}
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function CopilotDock() {
  const copilotOpen = useUI((s) => s.copilotOpen)
  const setCopilotOpen = useUI((s) => s.setCopilotOpen)
  const readerDocId = useUI((s) => s.readerDocId)
  const readerChatOpen = useUI((s) => s.readerChatOpen)
  const setReaderChatOpen = useUI((s) => s.setReaderChatOpen)
  const setView = useUI((s) => s.setView)
  const openReader = useUI((s) => s.openReader)
  const setReaderJumpPage = useUIStore((s) => s.setReaderJumpPage)
  const isMobile = useMediaQuery('(max-width: 1279px)')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!copilotOpen) return
    api.get<{ messages: ChatMessage[] }>('/api/copilot')
      .then((d) => setMessages(d.messages))
      .catch(() => {})
  }, [copilotOpen])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const send = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim()
      if (!msg || busy) return
      setInput('')
      setBusy(true)
      const optimistic: ChatMessage = { id: `tmp-${Date.now()}`, documentId: null, role: 'user', content: msg, citations: null, createdAt: new Date().toISOString() }
      setMessages((prev) => [...prev, optimistic])
      try {
        const d = await api.post<{ userMessage: ChatMessage; assistantMessage: ChatMessage }>('/api/copilot', { message: msg })
        setMessages((prev) => [...prev.filter((m) => m.id !== optimistic.id), d.userMessage, d.assistantMessage])
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: `err-${Date.now()}`, documentId: null, role: 'assistant', content: 'Sorry, I hit an error. Please try again.', citations: null, createdAt: new Date().toISOString() },
        ])
      } finally {
        setBusy(false)
      }
    },
    [input, busy]
  )

  const handleCite = useCallback(
    (c: Citation) => {
      if (c.documentId) {
        openReader(c.documentId)
        // land straight on the cited page — the reader consumes this once
        // the document has loaded
        if (c.page) setReaderJumpPage(c.page)
        setCopilotOpen(false)
      } else if (c.url) {
        window.open(c.url, '_blank')
      }
    },
    [openReader, setCopilotOpen, setReaderJumpPage]
  )

  const body = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Copilot</p>
          <p className="text-xs text-muted-foreground">Ask across your workspace</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Clear conversation"
          onClick={async () => {
            try {
              await api.del('/api/copilot')
              setMessages([])
            } catch {}
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        {/* Close — always visible. On <xl the dock renders inside a
            full-screen sheet, so this X is the only way back. */}
        <Button
          variant="ghost"
          size="icon"
          className="flex h-8 w-8 shrink-0"
          aria-label="Close Copilot"
          onClick={() => setCopilotOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="anim-fade-up space-y-4">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm font-semibold">Ask my second brain</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                I can see your documents, highlights, notes, goals, tasks, plans, career pipeline and news. Try one of these:
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[92%] rounded-2xl px-3.5 py-2.5',
                  m.role === 'user' ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border bg-card'
                )}
              >
                {m.role === 'user' ? (
                  <p className="whitespace-pre-wrap text-sm">{m.content}</p>
                ) : (
                  <MarkdownWithCitations content={m.content} citations={m.citations} onCite={handleCite} />
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Thinking across your workspace…
            </div>
          )}
        </div>
      </div>

      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Ask anything about your knowledge…"
            className="min-h-[44px] flex-1 resize-none"
            rows={1}
            aria-label="Message Copilot"
          />
          <Button size="icon" className="h-11 w-11 shrink-0" onClick={() => send()} disabled={busy || !input.trim()} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop right dock */}
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-30 hidden w-[380px] border-l bg-background transition-transform duration-200 ease-out xl:block',
          copilotOpen ? 'translate-x-0' : 'translate-x-full'
        )}
        aria-label="AI Copilot dock"
      >
        {body}
      </aside>

      {/* Mobile full-screen sheet */}
      <Sheet open={copilotOpen && isMobile} onOpenChange={setCopilotOpen}>
        <SheetContent side="right" className="block w-full max-w-full p-0 sm:max-w-full xl:hidden [&>button]:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>AI Copilot</SheetTitle>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>

      {/* Floating toggle (desktop, while the dock is closed). With a book
          open it behaves exactly like the fullscreen overlay toggle: the
          Copilot icon opens the minimal reader popup and turns into a cross
          while the popup is up (click again to minimize); without a book it
          opens the right-side Cortex Copilot dock. */}
      {!copilotOpen && (
        <button
          onClick={() => (readerDocId ? setReaderChatOpen(!readerChatOpen) : setCopilotOpen(true))}
          className={cn(
            'fixed bottom-6 right-6 z-30 hidden h-12 w-12 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95 xl:flex',
            readerDocId
              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
              : 'border bg-card text-primary shadow-soft'
          )}
          aria-label={readerDocId ? (readerChatOpen ? 'Minimize AI chat' : 'Open AI chat') : 'Open AI Copilot'}
          title={readerDocId ? (readerChatOpen ? 'Minimize AI chat' : 'Ask AI about this book') : 'Open AI Copilot'}
        >
          {readerDocId && readerChatOpen ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        </button>
      )}    </>
  )
}
