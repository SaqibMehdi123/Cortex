'use client'

import { FaBookOpen, FaLayerGroup, FaPlay, FaPlus, FaRotateLeft, FaSpinner, FaTrashCan } from 'react-icons/fa6'
import { useState } from 'react'
import { api, fmtDate } from '@/lib/client'
import type { Flashcard } from '@/lib/types'
import { useApi } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { previewLabels, type Grade } from '@/lib/sm2'
import { EmptyState, SkeletonCard } from '@/components/shared'
import { motion, AnimatePresence } from 'framer-motion'

const GRADE_STYLE: Record<Grade, { label: string; className: string }> = {
  again: { label: 'Again', className: 'bg-danger/90 hover:bg-danger text-white' },
  hard: { label: 'Hard', className: 'bg-warning/90 hover:bg-warning text-white' },
  good: { label: 'Good', className: 'bg-primary hover:bg-primary/90 text-primary-foreground' },
  easy: { label: 'Easy', className: 'bg-success/90 hover:bg-success text-white' },
}

export function FlashcardsView() {
  const { toast } = useToast()
  const { data, loading, reload } = useApi<{ cards: Flashcard[]; dueCount: number }>('/api/flashcards')
  const [reviewing, setReviewing] = useState(false)
  const [queue, setQueue] = useState<Flashcard[]>([])
  const [current, setCurrent] = useState<Flashcard | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)

  async function startReview() {
    try {
      const { cards } = await api.get<{ cards: Flashcard[] }>('/api/flashcards?mode=due')
      if (cards.length === 0) {
        toast({ title: 'Nothing due — come back later! 🎉' })
        return
      }
      setQueue(cards)
      setCurrent(cards[0])
      setFlipped(false)
      setReviewed(0)
      setReviewing(true)
    } catch {
      toast({ title: 'Could not load due cards', variant: 'destructive' })
    }
  }

  async function grade(g: Grade) {
    if (!current) return
    try {
      const { card } = await api.post<{ card: Flashcard }>('/api/flashcards/review', { flashcardId: current.id, grade: g })
      void card
      const rest = queue.slice(1)
      setReviewed((r) => r + 1)
      setFlipped(false)
      if (g === 'again') {
        // requeue at end
        setTimeout(() => {
          setQueue([...rest, { ...current, dueAt: new Date().toISOString() }])
          setCurrent([...rest, { ...current }][0] ?? null)
        }, 10)
      }
      if (rest.length === 0) {
        setReviewing(false)
        setCurrent(null)
        fireOnFinish()
        reload()
      } else {
        setQueue(rest)
        setTimeout(() => setCurrent(rest[0]), 10)
      }
    } catch {
      toast({ title: 'Review failed', variant: 'destructive' })
    }
  }

  function fireOnFinish() {
    // small celebration
    import('@/lib/confetti').then(({ fireConfetti }) => fireConfetti(60))
  }

  if (loading || !data) {
    return (
      <div className="space-y-4 pb-8">
        <SkeletonCard className="h-24" />
        <SkeletonCard className="h-64" />
      </div>
    )
  }

  const due = data.dueCount ?? data.cards.filter((c) => new Date(c.dueAt) <= new Date()).length

  return (
    <div className="anim-fade-up space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <FaLayerGroup className="h-6 w-6 text-primary" /> Flashcards
          </h1>
          <p className="text-sm text-muted-foreground">SM-2 spaced repetition — highlights become memory.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <FaPlus className="mr-1.5 h-4 w-4" /> New card
          </Button>
          <Button onClick={startReview} disabled={due === 0}>
            <FaPlay className="mr-1.5 h-4 w-4" /> Review {due > 0 && `(${due})`}
          </Button>
        </div>
      </div>

      {/* Due banner */}
      <Card className={cn('border', due > 0 ? 'border-primary/30 bg-sidebar-accent/40' : 'bg-card')}>
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <span className="text-2xl font-bold">{due}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{due > 0 ? `${due} card${due === 1 ? '' : 's'} due today` : 'All caught up!'}</p>
            <p className="text-sm text-muted-foreground">{due > 0 ? 'Clear the queue to keep your memory curve healthy.' : 'New reviews appear as intervals elapse. Create cards from highlights in the Reader.'}</p>
          </div>
          {due > 0 && (
            <Button onClick={startReview}>
              <FaPlay className="mr-1.5 h-4 w-4" /> Start review
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Card list */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.cards.length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <EmptyState
              icon={<FaLayerGroup className="h-5 w-5" />}
              title="No flashcards yet"
              description="Open any document in the Reader, select text, and tap “Flashcard” — the AI writes the question and answer for you."
            />
          </div>
        ) : (
          data.cards.slice(0, 24).map((c) => (
            <Card key={c.id} className="group transition-shadow hover:shadow-soft">
              <CardContent className="p-4">
                <p className="line-clamp-2 text-sm font-medium">{c.front}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.back}</p>
                <div className="mt-2.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                  {c.document && (
                    <span className="inline-flex items-center gap-1 truncate">
                      <FaBookOpen className="h-3 w-3" /> {c.document.title}
                    </span>
                  )}
                  <span className={cn('ml-auto shrink-0 rounded-full px-2 py-0.5', new Date(c.dueAt) <= new Date() ? 'bg-primary/10 text-primary' : 'bg-muted')}>
                    {new Date(c.dueAt) <= new Date() ? 'due now' : fmtDate(c.dueAt, { month: 'short', day: 'numeric' })}
                  </span>
                  <button
                    onClick={async () => {
                      await api.del(`/api/flashcards/${c.id}`)
                      reload()
                    }}
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    aria-label="Delete card"
                  >
                    <FaTrashCan className="h-3.5 w-3.5" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* ── Full-screen review overlay ── */}
      <AnimatePresence>
        {reviewing && current && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col bg-background"
          >
            <div className="flex items-center gap-3 px-5 py-4">
              <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Exit review" onClick={() => { setReviewing(false); setCurrent(null); reload() }}>
                <FaRotateLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1">
                <Progress value={queue.length ? (reviewed / (reviewed + queue.length)) * 100 : 100} className="h-1.5" />
              </div>
              <span className="text-xs text-muted-foreground">{reviewed} done · {queue.length} left</span>
            </div>

            <div className="flex flex-1 items-center justify-center px-5 pb-6">
              <div className="w-full max-w-xl" style={{ perspective: 1200 }}>
                <motion.div
                  key={current.id + String(flipped)}
                  initial={{ rotateY: 0, opacity: 0.9, scale: 0.98 }}
                  animate={{ rotateY: flipped ? 180 : 0, opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                  style={{ transformStyle: 'preserve-3d' }}
                  className="relative min-h-[300px] cursor-pointer sm:min-h-[340px]"
                  onClick={() => setFlipped((f) => !f)}
                >
                  {/* front */}
                  <div className={cn('absolute inset-0 flex flex-col items-center justify-center rounded-3xl border bg-card p-8 text-center shadow-soft', flipped && 'opacity-0')} style={{ backfaceVisibility: 'hidden' }}>
                    <span className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Question</span>
                    <p className="text-lg font-semibold leading-snug sm:text-xl">{current.front}</p>
                    <p className="mt-6 text-xs text-muted-foreground">tap to reveal</p>
                  </div>
                  {/* back */}
                  <div className={cn('absolute inset-0 flex flex-col items-center justify-center rounded-3xl border bg-sidebar-accent/30 p-8 text-center shadow-soft', !flipped && 'opacity-0')} style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                    <span className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Answer</span>
                    <p className="text-base leading-relaxed sm:text-lg">{current.back}</p>
                  </div>
                </motion.div>

                {/* grade buttons */}
                {flipped && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 grid grid-cols-4 gap-2">
                    {(['again', 'hard', 'good', 'easy'] as Grade[]).map((g) => {
                      const labels = previewLabels({ ease: current.ease, interval: current.interval, repetitions: current.repetitions, lapses: current.lapses })
                      return (
                        <button
                          key={g}
                          onClick={() => grade(g)}
                          className={cn('flex min-h-[56px] flex-col items-center justify-center rounded-xl text-sm font-semibold transition-transform active:scale-95', GRADE_STYLE[g].className)}
                        >
                          {GRADE_STYLE[g].label}
                          <span className="text-[10px] opacity-80">{labels[g]}</span>
                        </button>
                      )
                    })}
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <CreateCardDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => reload()} />
    </div>
  )
}

function CreateCardDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New flashcard</DialogTitle>
          <DialogDescription>A crisp question on the front, a tight answer on the back.</DialogDescription>
        </DialogHeader>
        <Textarea value={front} onChange={(e) => setFront(e.target.value)} placeholder="Front — e.g. What does SM-2 ease factor control?" className="min-h-[60px]" autoFocus aria-label="Front" />
        <Textarea value={back} onChange={(e) => setBack(e.target.value)} placeholder="Back — e.g. How quickly the interval grows after each successful review" className="min-h-[60px]" aria-label="Back" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={busy || !front.trim() || !back.trim()}
            onClick={async () => {
              setBusy(true)
              try {
                await api.post('/api/flashcards', { front, back })
                setFront(''); setBack('')
                onOpenChange(false)
                onCreated()
              } catch {
                toast({ title: 'Failed to create card', variant: 'destructive' })
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy && <FaSpinner className="mr-1.5 h-4 w-4 animate-spin" />} Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
