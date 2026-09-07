'use client'

import { FaBookOpen, FaBorderAll, FaCheck, FaEllipsis, FaFileArrowUp, FaFileLines, FaLayerGroup, FaLink, FaList, FaMagnifyingGlass, FaNoteSticky, FaPaste, FaPlus, FaRegBookmark, FaSpinner, FaTrashCan, FaXmark } from 'react-icons/fa6'
import { useMemo, useState, useEffect, useCallback } from 'react'
import { api, fmtDate } from '@/lib/client'
import type { DocumentItem, Note, ShelfItem } from '@/lib/types'
import { useApi } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useUI } from '@/lib/nav-config'
import { EmptyState, SkeletonCard } from '@/components/shared'
import { cn } from '@/lib/utils'

const TYPE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  article: { label: 'Article', icon: <FaFileLines className="h-4 w-4" /> },
  paper: { label: 'Paper', icon: <FaFileLines className="h-4 w-4" /> },
  book: { label: 'Book', icon: <FaBookOpen className="h-4 w-4" /> },
  url: { label: 'Web', icon: <FaLink className="h-4 w-4" /> },
  text: { label: 'Text', icon: <FaFileLines className="h-4 w-4" /> },
  newsletter: { label: 'Newsletter', icon: <FaFileLines className="h-4 w-4" /> },
  other: { label: 'Doc', icon: <FaFileLines className="h-4 w-4" /> },
}

const STATUS_STYLES: Record<string, string> = {
  queued: 'border-zinc-400/40 text-zinc-500',
  reading: 'border-primary/40 text-primary',
  finished: 'border-success/50 text-success',
  paused: 'border-warning/50 text-warning',
}

// Book spines on a shelf card — height varies per slot, colour follows the
// book's reading status so a shelf reads like a real, filled bookcase.
const SPINE_HEIGHTS = ['h-7', 'h-10', 'h-6', 'h-9', 'h-11', 'h-8', 'h-9', 'h-6']
const SPINE_COLORS: Record<string, string> = {
  reading: 'bg-primary/70',
  finished: 'bg-success/60',
  queued: 'bg-zinc-400/60',
  paused: 'bg-warning/60',
}

export function LibraryView() {
  const openReader = useUI((s) => s.openReader)
  const { toast } = useToast()
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [importOpen, setImportOpen] = useState(false)
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<DocumentItem | null>(null)

  // Shelves — named groups on the bookcase; a book sits on at most one.
  const [shelves, setShelves] = useState<ShelfItem[]>([])
  const [activeShelf, setActiveShelf] = useState<string | null>(null) // null = all books
  const [dragOverShelf, setDragOverShelf] = useState<string | null>(null)
  const [shelfDialog, setShelfDialog] = useState<{ mode: 'create' | 'rename'; shelf?: ShelfItem; assignDoc?: DocumentItem } | null>(null)
  const [shelfNameDraft, setShelfNameDraft] = useState('')
  const [confirmShelfDelete, setConfirmShelfDelete] = useState<ShelfItem | null>(null)

  const { data, loading, reload } = useApi<{ documents: DocumentItem[] }>(
    `/api/documents?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ''}${activeShelf ? `&shelf=${activeShelf}` : ''}`
  )
  const [allDocs, setAllDocs] = useState<DocumentItem[] | null>(null)

  const refreshAllDocs = useCallback(() => {
    api.get<{ documents: DocumentItem[] }>('/api/documents').then((d) => setAllDocs(d.documents)).catch(() => {})
  }, [])

  const loadShelves = useCallback(() => {
    api.get<{ shelves: ShelfItem[] }>('/api/shelves').then((d) => setShelves(d.shelves)).catch(() => {})
  }, [])

  useEffect(() => {
    refreshAllDocs()
    loadShelves()
  }, [refreshAllDocs, loadShelves])

  const shelfOf = (doc: DocumentItem) => shelves.find((s) => s.id === doc.shelfId) ?? null

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

  async function deleteDoc(doc: DocumentItem) {
    try {
      await api.del(`/api/documents/${doc.id}`)
      setConfirmDelete(null)
      refreshAllDocs()
      loadShelves()
      reload()
      toast({ title: 'Document deleted', description: `“${doc.title}” was removed from your library.` })
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' })
    }
  }

  // Put a book on a shelf (or take it off). Optimistic for the spine strip,
  // then the filtered list and counts are refreshed from the server.
  async function moveDoc(doc: DocumentItem, shelfId: string | null, name?: string) {
    setAllDocs((prev) => (prev ? prev.map((d) => (d.id === doc.id ? { ...d, shelfId } : d)) : prev))
    try {
      await api.patch(`/api/documents/${doc.id}`, { shelfId })
      reload()
      loadShelves()
      toast({
        title: shelfId ? 'Moved to shelf' : 'Removed from shelf',
        description: shelfId ? `“${doc.title}” now sits on “${name}”.` : `“${doc.title}” is no longer on a shelf.`,
      })
    } catch {
      refreshAllDocs()
      toast({ title: 'Move failed', variant: 'destructive' })
    }
  }

  async function submitShelfDialog() {
    if (!shelfDialog) return
    const name = shelfNameDraft.trim()
    if (!name) return
    try {
      if (shelfDialog.mode === 'create') {
        const d = await api.post<{ shelf: ShelfItem }>('/api/shelves', { name })
        setShelves((prev) => [...prev, d.shelf])
        if (shelfDialog.assignDoc) await moveDoc(shelfDialog.assignDoc, d.shelf.id, d.shelf.name)
        else toast({ title: 'Shelf added', description: `Drop books on “${name}” to fill it.` })
      } else if (shelfDialog.shelf) {
        const d = await api.patch<{ shelf: ShelfItem }>(`/api/shelves/${shelfDialog.shelf.id}`, { name })
        setShelves((prev) => prev.map((s) => (s.id === d.shelf.id ? d.shelf : s)))
        toast({ title: 'Shelf renamed', description: `It's now “${d.shelf.name}”.` })
      }
      setShelfDialog(null)
    } catch (e) {
      toast({ title: 'Something went wrong', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' })
    }
  }

  // Deleting a shelf never deletes books — Document.shelfId is SetNull, so
  // everything on it simply becomes unshelved.
  async function deleteShelf(shelf: ShelfItem) {
    try {
      await api.del(`/api/shelves/${shelf.id}`)
      setConfirmShelfDelete(null)
      setShelves((prev) => prev.filter((s) => s.id !== shelf.id))
      if (activeShelf === shelf.id) setActiveShelf(null)
      refreshAllDocs()
      reload()
      toast({ title: 'Shelf removed', description: 'Its books are still in your library — just unshelved.' })
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' })
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
              <FaBorderAll className="h-4 w-4" />
            </button>
            <button
              onClick={() => setLayout('list')}
              className={cn('flex h-9 w-9 items-center justify-center transition-colors', layout === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}
              aria-label="List view"
            >
              <FaList className="h-4 w-4" />
            </button>
          </div>
          <Button onClick={() => setImportOpen(true)}>
            <FaPlus className="mr-1.5 h-4 w-4" /> Import
          </Button>
        </div>
      </div>

      <Tabs defaultValue="documents" onValueChange={(v) => v === 'notes' && !notes && loadNotes()}>
        <TabsList>
          <TabsTrigger value="documents">Reading</TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5">
            <FaNoteSticky className="h-3.5 w-3.5" /> Notes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="mt-4 space-y-4">
          {/* Shelves — the bookcase. Click to browse a shelf, drop books on it to file them. */}
          {(shelves.length > 0 || (allDocs && allDocs.length > 0)) && (
            <section aria-label="Shelves" className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shelves</h2>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => { setShelfNameDraft(''); setShelfDialog({ mode: 'create' }) }}>
                  <FaPlus className="h-3 w-3" /> New shelf
                </Button>
              </div>
              <div className="-mx-1 flex items-stretch gap-2.5 overflow-x-auto px-1 pb-1.5">
                {/* All books — also the drop target to take a book off its shelf */}
                <button
                  type="button"
                  onClick={() => setActiveShelf(null)}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverShelf('all') }}
                  onDragLeave={() => setDragOverShelf((v) => (v === 'all' ? null : v))}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOverShelf(null)
                    const doc = (allDocs ?? []).find((d) => d.id === e.dataTransfer.getData('text/plain'))
                    if (doc && doc.shelfId) moveDoc(doc, null)
                  }}
                  title="Drop a book here to take it off its shelf"
                  className={cn(
                    'flex w-[132px] shrink-0 flex-col rounded-xl border p-2.5 text-left transition-all',
                    activeShelf === null ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/30' : 'hover:border-primary/40 hover:bg-muted/40',
                    dragOverShelf === 'all' && 'border-primary bg-primary/10 ring-1 ring-primary/40'
                  )}
                >
                  <span className="flex h-14 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
                    <FaBorderAll className="h-5 w-5" />
                  </span>
                  <span className="mt-2 flex items-baseline justify-between gap-1">
                    <span className="truncate text-xs font-semibold">All books</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{allDocs?.length ?? 0}</span>
                  </span>
                </button>
                {shelves.map((s) => {
                  const spineDocs = (allDocs ?? []).filter((d) => d.shelfId === s.id).slice(0, 8)
                  return (
                    <div
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setActiveShelf(activeShelf === s.id ? null : s.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setActiveShelf(activeShelf === s.id ? null : s.id)
                        }
                      }}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverShelf(s.id) }}
                      onDragLeave={() => setDragOverShelf((v) => (v === s.id ? null : v))}
                      onDrop={(e) => {
                        e.preventDefault()
                        setDragOverShelf(null)
                        const doc = (allDocs ?? []).find((d) => d.id === e.dataTransfer.getData('text/plain'))
                        if (doc && doc.shelfId !== s.id) moveDoc(doc, s.id, s.name)
                      }}
                      className={cn(
                        'group relative flex w-[132px] shrink-0 cursor-pointer flex-col rounded-xl border p-2.5 text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        activeShelf === s.id ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/30' : 'hover:border-primary/40 hover:bg-muted/40',
                        dragOverShelf === s.id && 'border-primary bg-primary/10 ring-1 ring-primary/40'
                      )}
                    >
                      {/* The books + the plank they sit on */}
                      <span className="flex h-14 items-end justify-center gap-[3px] rounded-md border-b-2 border-primary/30 bg-muted/40 px-2">
                        {spineDocs.length === 0 ? (
                          <span className="pb-1 text-[10px] italic text-muted-foreground">empty — drop a book</span>
                        ) : (
                          spineDocs.map((d, i) => (
                            <span
                              key={d.id}
                              title={d.title}
                              className={cn('w-[7px] rounded-t-[3px]', SPINE_HEIGHTS[i % SPINE_HEIGHTS.length], SPINE_COLORS[d.status] ?? 'bg-muted-foreground/40')}
                            />
                          ))
                        )}
                      </span>
                      <span className="mt-2 flex items-baseline justify-between gap-1">
                        <span className="truncate text-xs font-medium">{s.name}</span>
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{s._count?.documents ?? spineDocs.length}</span>
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1 h-6 w-6 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
                            aria-label={`Shelf options for ${s.name}`}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <FaEllipsis className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-44"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <DropdownMenuItem onClick={() => { setShelfNameDraft(s.name); setShelfDialog({ mode: 'rename', shelf: s }) }}>
                            Rename shelf
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-danger focus:text-danger" onClick={() => setConfirmShelfDelete(s)}>
                            Delete shelf
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Continue reading — pick up where you left off */}
          {reading.length > 0 && status === 'all' && !q && !activeShelf && (
            <section aria-label="Continue reading">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Continue reading</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              <FaMagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
              icon={<FaBookOpen className="h-5 w-5" />}
              title={q ? `No matches for “${q}”` : activeShelf ? 'This shelf is empty' : 'Import your first paper'}
              description={
                q
                  ? 'Try a different search — titles, authors, tags and summaries are all searched.'
                  : activeShelf
                    ? 'Drag a book onto this shelf, or open the shelf button on any book card to file it here.'
                    : "Paste a URL to any article or paper, paste raw text, or add a book you're reading. Ask AI questions about it once it's here."
              }
              action={activeShelf && !q ? undefined : { label: 'Import a document', onClick: () => setImportOpen(true) }}
            />
          ) : layout === 'grid' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.documents.map((doc) => (
                <div
                  key={doc.id}
                  role="button"
                  tabIndex={0}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', doc.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onClick={() => openReader(doc.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openReader(doc.id)
                    }
                  }}
                  className="group rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <Card className="h-full overflow-hidden pt-0 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-soft">
                    <div className="relative flex h-24 items-center justify-center bg-secondary">
                      <span className="font-display text-4xl leading-none text-foreground/25" aria-hidden>
                        {(doc.title.trim().charAt(0) || '·').toUpperCase()}
                      </span>
                      <span className="absolute bottom-2.5 left-3.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        {doc.filePath ? 'PDF' : TYPE_META[doc.type]?.label ?? 'Doc'}
                      </span>
                      <Badge variant="outline" className={cn('absolute left-2.5 top-2.5 bg-background/80 text-[10px] backdrop-blur', STATUS_STYLES[doc.status])}>
                        {doc.status === 'queued' ? 'read later' : doc.status}
                      </Badge>
                      {/* Move to shelf — also the touch fallback for drag & drop */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-[30px] top-1.5 h-7 w-7 bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
                            aria-label={`Move ${doc.title} to a shelf`}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <FaLayerGroup className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        {/* stopPropagation: portal events bubble through the React tree — a menu
                            click would otherwise re-trigger the wrapping card's onClick/onKeyDown */}
                        <DropdownMenuContent
                          align="end"
                          className="w-56"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <DropdownMenuLabel className="text-xs text-muted-foreground">Move to shelf</DropdownMenuLabel>
                          {doc.shelfId && (
                            <DropdownMenuItem onClick={() => moveDoc(doc, null)}>
                              <FaXmark className="mr-2 h-3.5 w-3.5" /> No shelf
                            </DropdownMenuItem>
                          )}
                          {shelves.map((s) => (
                            <DropdownMenuItem key={s.id} className="justify-between gap-2" onClick={() => doc.shelfId !== s.id && moveDoc(doc, s.id, s.name)}>
                              <span className="truncate">{s.name}</span>
                              {doc.shelfId === s.id && <FaCheck className="h-3 w-3 shrink-0 text-primary" />}
                            </DropdownMenuItem>
                          ))}
                          {shelves.length > 0 && <DropdownMenuSeparator />}
                          <DropdownMenuItem onClick={() => { setShelfNameDraft(''); setShelfDialog({ mode: 'create', assignDoc: doc }) }}>
                            <FaPlus className="mr-2 h-3.5 w-3.5" /> New shelf…
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1.5 top-1.5 h-7 w-7 bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
                        aria-label={`Delete ${doc.title}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDelete(doc)
                        }}
                      >
                        <FaTrashCan className="h-3.5 w-3.5" />
                      </Button>
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
                      {shelfOf(doc) && (
                        <div className="flex items-center gap-1.5 pt-0.5 text-[10px] text-muted-foreground">
                          <FaLayerGroup className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{shelfOf(doc)!.name}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              {data.documents.map((doc, i) => (
                <div
                  key={doc.id}
                  role="button"
                  tabIndex={0}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', doc.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onClick={() => openReader(doc.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openReader(doc.id)
                    }
                  }}
                  className={cn('group flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', i !== 0 && 'border-t')}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-primary">
                    {TYPE_META[doc.type]?.icon ?? TYPE_META.other.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {doc.author ?? TYPE_META[doc.type]?.label ?? 'Doc'}
                      {shelfOf(doc) && <> · on “{shelfOf(doc)!.name}”</>} · updated {fmtDate(doc.updatedAt)}
                    </p>
                  </div>
                  <div className="hidden w-32 items-center gap-2 sm:flex">
                    <Progress value={doc.progress} className="h-1.5" />
                    <span className="shrink-0 text-[10px] text-muted-foreground">{doc.progress}%</span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
                        aria-label={`Move ${doc.title} to a shelf`}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <FaLayerGroup className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-56"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Move to shelf</DropdownMenuLabel>
                      {doc.shelfId && (
                        <DropdownMenuItem onClick={() => moveDoc(doc, null)}>
                          <FaXmark className="mr-2 h-3.5 w-3.5" /> No shelf
                        </DropdownMenuItem>
                      )}
                      {shelves.map((s) => (
                        <DropdownMenuItem key={s.id} className="justify-between gap-2" onClick={() => doc.shelfId !== s.id && moveDoc(doc, s.id, s.name)}>
                          <span className="truncate">{s.name}</span>
                          {doc.shelfId === s.id && <FaCheck className="h-3 w-3 shrink-0 text-primary" />}
                        </DropdownMenuItem>
                      ))}
                      {shelves.length > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuItem onClick={() => { setShelfNameDraft(''); setShelfDialog({ mode: 'create', assignDoc: doc }) }}>
                        <FaPlus className="mr-2 h-3.5 w-3.5" /> New shelf…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
                    aria-label={`Delete ${doc.title}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfirmDelete(doc)
                    }}
                  >
                    <FaTrashCan className="h-3.5 w-3.5" />
                  </Button>
                  <Badge variant="outline" className={cn('shrink-0 text-[10px]', STATUS_STYLES[doc.status])}>
                    {doc.status === 'queued' ? 'later' : doc.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          {!notes ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[1, 2].map((i) => <SkeletonCard key={i} />)}
            </div>
          ) : notes.length === 0 ? (
            <EmptyState
              icon={<FaNoteSticky className="h-5 w-5" />}
              title="No quick-capture notes yet"
              description="Use the + button (or ⌘K) from anywhere to capture a note, voice memo or link. They land here."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                        <FaTrashCan className="h-3.5 w-3.5" />
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

      {/* Delete confirmation (grid + list) */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmDelete?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the document{confirmDelete?.filePath ? ' and its stored PDF file' : ''}, including highlights, notes and chat history. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              onClick={() => confirmDelete && deleteDoc(confirmDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create / rename a shelf */}
      <Dialog open={!!shelfDialog} onOpenChange={(v) => !v && setShelfDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{shelfDialog?.mode === 'rename' ? 'Rename shelf' : 'New shelf'}</DialogTitle>
            <DialogDescription>
              {shelfDialog?.mode === 'rename'
                ? 'The books stay right where they are — only the name changes.'
                : shelfDialog?.assignDoc
                  ? `Create a shelf and put “${shelfDialog.assignDoc.title}” on it.`
                  : 'Shelves group related books — a thesis, a course, a research thread.'}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={shelfNameDraft}
            onChange={(e) => setShelfNameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitShelfDialog() }}
            placeholder="Shelf name — e.g. Thesis reading"
            aria-label="Shelf name"
            autoFocus
            maxLength={60}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShelfDialog(null)}>Cancel</Button>
            <Button onClick={submitShelfDialog} disabled={!shelfNameDraft.trim()}>
              {shelfDialog?.mode === 'rename' ? 'Rename' : 'Create shelf'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete shelf — books always survive (they become unshelved) */}
      <AlertDialog open={!!confirmShelfDelete} onOpenChange={(v) => !v && setConfirmShelfDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete shelf “{confirmShelfDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The {confirmShelfDelete?._count?.documents ?? 0} book{confirmShelfDelete?._count?.documents === 1 ? '' : 's'} on this shelf stay in your library — they just become unshelved. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              onClick={() => confirmShelfDelete && deleteShelf(confirmShelfDelete)}
            >
              Delete shelf
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const { toast } = useToast()

  // Large PDFs are sent as a raw streamed body (up to 200 MB) — the server
  // pipes the bytes straight to disk, so nothing is buffered in memory. XHR is
  // used instead of fetch because it exposes real upload progress events.
  function uploadPdf(): Promise<void> {
    if (!file) return Promise.reject(new Error('Choose a PDF first'))
    return new Promise((resolve, reject) => {
      setUploadPct(0)
      const params = new URLSearchParams({ name: file.name })
      if (author.trim()) params.set('author', author.trim())
      if (tags.trim()) params.set('tags', tags.trim())
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `/api/documents/pdf/stream?${params.toString()}`)
      xhr.setRequestHeader('Content-Type', 'application/pdf')
      xhr.responseType = 'json'
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadPct(Math.min(99, Math.round((e.loaded / e.total) * 100)))
      }
      xhr.upload.onload = () => setUploadPct(100)
      xhr.onload = () => {
        const data = (xhr.response ?? {}) as { pages?: number; chars?: number; warning?: string; error?: string }
        if (xhr.status >= 200 && xhr.status < 300) {
          toast({
            title: 'PDF imported',
            description: data.warning
              ? data.warning
              : `${data.pages} pages — opens with its original layout in the viewer${data.chars ? ` · ${Math.round((data.chars ?? 0) / 1000)}k characters extracted for highlights & AI` : ''}.`,
          })
          resolve()
        } else {
          reject(new Error(data.error || `Upload failed (${xhr.status})`))
        }
      }
      xhr.onerror = () => reject(new Error('Upload failed — check your connection and try again'))
      xhr.onabort = () => reject(new Error('Upload cancelled'))
      xhr.send(file)
    })
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
      setUploadPct(null)
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
            <TabsTrigger value="pdf" className="gap-1.5"><FaFileArrowUp className="h-3.5 w-3.5" /> PDF</TabsTrigger>
            <TabsTrigger value="url" className="gap-1.5"><FaLink className="h-3.5 w-3.5" /> URL</TabsTrigger>
            <TabsTrigger value="paste" className="gap-1.5"><FaPaste className="h-3.5 w-3.5" /> Text</TabsTrigger>
            <TabsTrigger value="manual" className="gap-1.5"><FaFileLines className="h-3.5 w-3.5" /> Manual</TabsTrigger>
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
                <FaFileArrowUp className="h-6 w-6 text-primary" />
                {file ? (
                  <>
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB — click to change</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium">Drop a PDF here or click to browse</span>
                    <span className="text-xs text-muted-foreground">Up to 200 MB — big files are streamed to disk, with live progress · scans without text open in the viewer</span>
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
            <>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://arxiv.org/pdf/1706.03762 or any article URL" aria-label="Article URL" autoFocus />
              <p className="text-xs text-muted-foreground">
                Direct PDF links (arXiv, papers, reports…) are stored with their original layout and open in the embedded viewer. Other links are fetched as clean reading text.
              </p>
            </>
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
        {mode === 'pdf' && busy && uploadPct !== null && (
          <div className="space-y-1.5">
            <Progress value={uploadPct} aria-label="Upload progress" />
            <p className="text-xs text-muted-foreground">
              {uploadPct < 100
                ? <>Uploading… {uploadPct}% <span className="opacity-60">(large files stream straight to disk)</span></>
                : 'Upload complete — extracting text for highlights & AI…'}
            </p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy && uploadPct !== null && uploadPct < 100}>Cancel</Button>
          <Button onClick={submit} disabled={busy || (mode === 'pdf' && !file)}>
            {busy && <FaSpinner className="mr-1.5 h-4 w-4 animate-spin" />}
            <FaRegBookmark className="mr-1.5 h-4 w-4" />
            {mode === 'pdf'
              ? (busy
                ? (uploadPct !== null && uploadPct < 100 ? `Uploading ${uploadPct}%` : 'Extracting text…')
                : 'Upload & extract')
              : 'Add to library'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
