'use client'

import { useState, useRef, useEffect } from 'react'
import { useUI } from '@/lib/nav-config'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/client'
import { useToast } from '@/hooks/use-toast'
import { StickyNote, Mic, Link2, ListTodo, Loader2, Square, Trash2 } from 'lucide-react'

// Minimal SpeechRecognition typing
interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

export function QuickCapture() {
  const captureOpen = useUI((s) => s.captureOpen)
  const captureType = useUI((s) => s.captureType)
  const setCaptureOpen = useUI((s) => s.setCaptureOpen)
  const { toast } = useToast()
  const [type, setType] = useState<'note' | 'voice' | 'url' | 'task'>('note')
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(true)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    if (captureOpen) setType(captureType)
  }, [captureOpen, captureType])

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) setVoiceSupported(false)
    return () => recognitionRef.current?.stop()
  }, [])

  const reset = () => {
    setContent('')
    setUrl('')
    setDueDate('')
  }

  const toggleMic = () => {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) {
      setVoiceSupported(false)
      return
    }
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.onresult = (e) => {
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) final += r[0].transcript
      }
      if (final) setContent((c) => (c ? `${c} ${final}` : final))
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }

  const submit = async () => {
    setBusy(true)
    try {
      if (type === 'url') {
        if (!url.trim()) throw new Error('Paste a link first')
        await api.post('/api/capture', { type: 'url', content: url.trim() })
      } else if (type === 'task') {
        if (!content.trim()) throw new Error('What is the task?')
        await api.post('/api/capture', { type: 'task', content: content.trim(), dueDate: dueDate || undefined })
      } else {
        if (!content.trim()) throw new Error('Write something first')
        await api.post('/api/capture', { type, content: content.trim() })
      }
      reset()
      setCaptureOpen(false)
      toast({ title: 'Captured', description: type === 'url' ? 'Saved to your read-later queue.' : type === 'task' ? 'Task added to your plan.' : 'Note saved to your library.' })
    } catch (e) {
      toast({
        title: 'Capture failed',
        description: e instanceof Error ? e.message : 'Please try again',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={captureOpen} onOpenChange={(open) => { if (!open) { recognitionRef.current?.stop(); setCaptureOpen(false) } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick capture</DialogTitle>
          <DialogDescription>Capture from anywhere — it syncs across your devices.</DialogDescription>
        </DialogHeader>

        <Tabs value={type} onValueChange={(v) => setType(v as 'note' | 'voice' | 'url' | 'task')}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="note" className="gap-1.5"><StickyNote className="h-3.5 w-3.5" /> Note</TabsTrigger>
            <TabsTrigger value="voice" className="gap-1.5"><Mic className="h-3.5 w-3.5" /> Voice</TabsTrigger>
            <TabsTrigger value="url" className="gap-1.5"><Link2 className="h-3.5 w-3.5" /> URL</TabsTrigger>
            <TabsTrigger value="task" className="gap-1.5"><ListTodo className="h-3.5 w-3.5" /> Task</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="min-h-[120px]">
          {type === 'url' ? (
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/great-article"
              aria-label="URL to read later"
              autoFocus
            />
          ) : (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={type === 'task' ? 'e.g. Finish resume draft' : type === 'voice' ? 'Your transcript appears here — or type' : 'Write a note…'}
              className="min-h-[110px]"
              aria-label="Capture content"
              autoFocus
            />
          )}
          {type === 'task' && (
            <div className="mt-2">
              <label className="text-xs text-muted-foreground">Due date (optional)</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1" />
            </div>
          )}
          {type === 'voice' && (
            <div className="mt-3 flex items-center gap-3">
              <Button
                type="button"
                variant={listening ? 'destructive' : 'secondary'}
                size="sm"
                onClick={toggleMic}
                disabled={!voiceSupported}
                className="min-h-[44px]"
              >
                {listening ? <><Square className="mr-1.5 h-3.5 w-3.5" /> Stop</> : <><Mic className="mr-1.5 h-3.5 w-3.5" /> Record</>}
              </Button>
              {listening && <span className="flex items-center gap-1.5 text-xs text-warning"><span className="h-2 w-2 animate-pulse rounded-full bg-warning" /> Listening…</span>}
              {!voiceSupported && <span className="text-xs text-muted-foreground">Voice input not supported here — just type instead.</span>}
              {content && (
                <Button type="button" variant="ghost" size="icon" className="ml-auto h-9 w-9" aria-label="Clear" onClick={() => setContent('')}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => { recognitionRef.current?.stop(); setCaptureOpen(false) }}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {type === 'url' ? 'Save to read later' : 'Capture'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
