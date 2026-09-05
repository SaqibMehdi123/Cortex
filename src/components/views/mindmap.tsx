'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/client'
import type { Mindmap, MindmapNode } from '@/lib/types'
import { useApi } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { colorHex, EmptyState, SkeletonCard } from '@/components/shared'
import { useUI } from '@/lib/nav-config'
import {
  Share2, Plus, Trash2, Loader2, Sparkles, ZoomIn, ZoomOut, Maximize, Wand2,
  Download, FileCode, Palette, X,
} from 'lucide-react'

const NODE_W = 150
const NODE_H = 44

export function MindmapView() {
  const { toast } = useToast()
  const openReader = useUI((s) => s.openReader)
  const { data, loading, reload } = useApi<{ mindmaps: Mindmap[] }>('/api/mindmaps')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [nodes, setNodes] = useState<MindmapNode[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [genOpen, setGenOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 40, y: 40 })
  const [viewport, setViewport] = useState({ w: 800, h: 600 })

  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const panRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeMap = useMemo(() => data?.mindmaps.find((m) => m.id === activeId) ?? null, [data, activeId])

  useEffect(() => {
    if (!activeId && data?.mindmaps.length) {
      setActiveId(data.mindmaps[0].id)
      setNodes(data.mindmaps[0].nodes)
    }
  }, [data, activeId])

  useEffect(() => {
    if (activeMap) setNodes(activeMap.nodes)
  }, [activeMap?.id])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setViewport({ w: el.clientWidth, h: el.clientHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [activeId])

  // debounced autosave
  const scheduleSave = useCallback(
    (next: MindmapNode[]) => {
      if (!activeId) return
      setDirty(true)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        try {
          await api.patch(`/api/mindmaps/${activeId}`, { nodes: next })
          setDirty(false)
        } catch {}
      }, 700)
    },
    [activeId]
  )

  function updateNodes(next: MindmapNode[], save = true) {
    setNodes(next)
    if (save) scheduleSave(next)
  }

  // ── node drag ──
  function onNodePointerDown(e: React.PointerEvent, node: MindmapNode) {
    e.stopPropagation()
    setSelected(node.id)
    dragRef.current = { id: node.id, dx: (e.clientX - pan.x) / zoom - node.x, dy: (e.clientY - pan.y) / zoom - node.y }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  function onNodePointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return
    const nx = (e.clientX - pan.x) / zoom - dragRef.current.dx
    const ny = (e.clientY - pan.y) / zoom - dragRef.current.dy
    updateNodes(nodes.map((n) => (n.id === dragRef.current!.id ? { ...n, x: nx, y: ny } : n)))
  }
  function onNodePointerUp() {
    dragRef.current = null
  }

  // ── canvas pan ──
  function onCanvasPointerDown(e: React.PointerEvent) {
    if ((e.target as Element).tagName !== 'svg' && !(e.target as Element).classList.contains('canvas-bg')) return
    setSelected(null)
    panRef.current = { x: pan.x, y: pan.y, px: e.clientX, py: e.clientY }
  }
  function onCanvasPointerMove(e: React.PointerEvent) {
    if (!panRef.current) return
    setPan({ x: panRef.current.x + (e.clientX - panRef.current.px), y: panRef.current.y + (e.clientY - panRef.current.py) })
  }
  function onCanvasPointerUp() {
    panRef.current = null
  }

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom((z) => Math.min(2.2, Math.max(0.3, z - e.deltaY * 0.002)))
    },
    []
  )

  // ── auto layout: tidy tree ──
  function autoLayout() {
    const childrenOf = new Map<string | null, MindmapNode[]>()
    for (const n of nodes) {
      const key = n.parentId && nodes.some((o) => o.id === n.parentId) ? n.parentId : null
      if (!childrenOf.has(key)) childrenOf.set(key, [])
      childrenOf.get(key)!.push(n)
    }
    const next = new Map<string, { x: number; y: number }>()
    let leafCursor = 0
    const visit = (node: MindmapNode, depth: number): number => {
      const kids = childrenOf.get(node.id) ?? []
      let y: number
      if (kids.length === 0) {
        y = 90 + leafCursor * 78
        leafCursor++
      } else {
        const ys = kids.map((k) => visit(k, depth + 1))
        y = (Math.min(...ys) + Math.max(...ys)) / 2
      }
      next.set(node.id, { x: 100 + depth * 240, y })
      return y
    }
    for (const root of childrenOf.get(null) ?? []) visit(root, 0)
    updateNodes(nodes.map((n) => ({ ...n, ...(next.get(n.id) ?? {}) })))
    toast({ title: 'Auto-layout applied' })
  }

  // ── add / remove / recolor nodes ──
  function addChild(parent: MindmapNode) {
    const id = `n-${Date.now()}`
    updateNodes([
      ...nodes,
      { id, label: 'New idea', x: parent.x + 240, y: parent.y + (nodes.filter((n) => n.parentId === parent.id).length * 60), parentId: parent.id, color: 'zinc' },
    ])
    setSelected(id)
  }

  function reselectColor(color: string) {
    if (!selected) return
    updateNodes(nodes.map((n) => (n.id === selected ? { ...n, color } : n)))
  }

  function handleNodeClick(node: MindmapNode) {
    if (node.linkType === 'document' && node.linkId) {
      openReader(node.linkId)
    } else if (node.linkType === 'url' && node.linkUrl) {
      window.open(node.linkUrl, '_blank')
    }
  }

  // ── export ──
  function exportPNG() {
    const svg = svgRef.current
    if (!svg) return
    const clone = svg.cloneNode(true) as SVGSVGElement
    const bounds = getBounds()
    clone.setAttribute('width', String(bounds.w + 200))
    clone.setAttribute('height', String(bounds.h + 200))
    clone.setAttribute('viewBox', `${bounds.minX - 100} ${bounds.minY - 100} ${bounds.w + 200} ${bounds.h + 200}`)
    const xml = new XMLSerializer().serializeToString(clone)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = bounds.w + 200
      canvas.height = bounds.h + 200
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#0F0F10' : '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      const a = document.createElement('a')
      a.download = `${(activeMap?.title ?? 'mindmap').replace(/\s+/g, '-')}.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
    }
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`
  }

  function exportMarkdown() {
    const byParent = new Map<string | null, MindmapNode[]>()
    for (const n of nodes) {
      const key = n.parentId && nodes.some((o) => o.id === n.parentId) ? n.parentId : null
      if (!byParent.has(key)) byParent.set(key, [])
      byParent.get(key)!.push(n)
    }
    const lines: string[] = [`# ${activeMap?.title ?? 'Mindmap'}`, '']
    const walk = (parentId: string | null, depth: number) => {
      for (const n of byParent.get(parentId) ?? []) {
        lines.push(`${'  '.repeat(depth)}- ${n.label}`)
        walk(n.id, depth + 1)
      }
    }
    walk(null, 0)
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.download = `${(activeMap?.title ?? 'mindmap').replace(/\s+/g, '-')}.md`
    a.href = URL.createObjectURL(blob)
    a.click()
  }

  function getBounds() {
    const xs = nodes.map((n) => n.x)
    const ys = nodes.map((n) => n.y)
    const minX = Math.min(...xs, 0)
    const minY = Math.min(...ys, 0)
    const maxX = Math.max(...xs, 100) + NODE_W
    const maxY = Math.max(...ys, 100) + NODE_H
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
  }

  function fitView() {
    const b = getBounds()
    const zx = (viewport.w - 40) / b.w
    const zy = (viewport.h - 40) / b.h
    const z = Math.min(2.2, Math.max(0.3, Math.min(zx, zy)))
    setZoom(z)
    setPan({ x: -b.minX * z + 20, y: -b.minY * z + 20 })
  }

  if (loading) {
    return <div className="grid gap-4 pb-8 lg:grid-cols-3">{[1, 2, 3].map((i) => <SkeletonCard key={i} />)}</div>
  }

  if (!data || data.mindmaps.length === 0) {
    return (
      <div className="anim-fade-up space-y-4 pb-8">
        <Header onCreate={() => setGenOpen(true)} hasMaps={false} />
        <EmptyState
          icon={<Share2 className="h-5 w-5" />}
          title="Generate your first mindmap"
          description="Cortex can auto-generate a mindmap from any document in your library, from your notes, or from any topic you type."
          action={{ label: 'Generate with AI', onClick: () => setGenOpen(true) }}
        />
        <GenerateDialog open={genOpen} onOpenChange={setGenOpen} onCreated={(id) => { reload(); setActiveId(id) }} hasDocs={(data?.mindmaps.length ?? 0) >= 0} />
      </div>
    )
  }

  return (
    <div className="anim-fade-up space-y-3 pb-8">
      <Header onCreate={() => setGenOpen(true)} hasMaps />

      {/* map selector + toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={activeId ?? undefined}
          onValueChange={(v) => {
            setActiveId(v)
            const m = data.mindmaps.find((x) => x.id === v)
            setNodes(m?.nodes ?? [])
            setSelected(null)
            fitView()
          }}
        >
          <SelectTrigger className="w-[240px]" aria-label="Select mindmap">
            <SelectValue placeholder="Choose a map" />
          </SelectTrigger>
          <SelectContent>
            {data.mindmaps.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))} aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></Button>
          <span className="w-10 text-center text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(2.2, z + 0.15))} aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={fitView} aria-label="Fit view"><Maximize className="h-4 w-4" /></Button>
        </div>

        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={autoLayout}>
          <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Auto-layout
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportPNG}><Download className="mr-1.5 h-3.5 w-3.5" /> PNG</Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportMarkdown}><FileCode className="mr-1.5 h-3.5 w-3.5" /> Markdown</Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-danger"
          onClick={async () => {
            if (!activeId) return
            await api.del(`/api/mindmaps/${activeId}`)
            setActiveId(null)
            reload()
          }}
          aria-label="Delete map"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <span className="ml-auto text-[10px] text-muted-foreground">{dirty ? 'Saving…' : 'Saved'}</span>
      </div>

      {/* canvas */}
      <div
        ref={containerRef}
        className="relative h-[560px] touch-none overflow-hidden rounded-xl border bg-card sm:h-[620px]"
        onPointerDown={onCanvasPointerDown}
        onPointerMove={(e) => {
          onCanvasPointerMove(e)
          onNodePointerMove(e)
        }}
        onPointerUp={() => {
          onCanvasPointerUp()
          onNodePointerUp()
        }}
        onWheel={onWheel}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          className={cn('canvas-bg block', panRef.current ? 'cursor-grabbing' : 'cursor-grab')}
        >
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {/* edges */}
            {nodes.map((n) => {
              if (!n.parentId) return null
              const p = nodes.find((o) => o.id === n.parentId)
              if (!p) return null
              const x1 = p.x + NODE_W / 2
              const y1 = p.y + NODE_H
              const x2 = n.x + NODE_W / 2
              const y2 = n.y
              const cx = (x1 + x2) / 2
              return (
                <path
                  key={`e-${n.id}`}
                  d={`M ${x1} ${y1} C ${cx} ${y1 + 30}, ${cx} ${y2 - 30}, ${x2} ${y2}`}
                  fill="none"
                  stroke={colorHex(n.color ?? 'zinc')}
                  strokeOpacity={0.4}
                  strokeWidth={1.5}
                />
              )
            })}
            {/* nodes */}
            {nodes.map((n) => (
              <g
                key={n.id}
                transform={`translate(${n.x} ${n.y})`}
                onPointerDown={(e) => onNodePointerDown(e, n)}
                onClick={() => handleNodeClick(n)}
                style={{ cursor: 'grab' }}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  fill={selected === n.id ? colorHex(n.color ?? 'zinc') : 'var(--card)'}
                  stroke={selected === n.id ? colorHex(n.color ?? 'zinc') : colorHex(n.color ?? 'zinc')}
                  strokeOpacity={selected === n.id ? 1 : 0.45}
                  strokeWidth={1.5}
                />
                <foreignObject width={NODE_W} height={NODE_H}>
                  <div
                    className={cn('flex h-full items-center px-2 text-center text-[11px] font-medium leading-tight', selected === n.id ? 'text-white' : 'text-foreground')}
                    style={{ pointerEvents: 'none' }}
                  >
                    <span className="line-clamp-3 w-full">{n.label}</span>
                  </div>
                </foreignObject>
                {n.linkType && (
                  <circle cx={NODE_W - 6} cy={6} r={3.5} fill="#14B8A6" />
                )}
              </g>
            ))}
          </g>
        </svg>

        {/* node action bar */}
        {selected && (
          <div className="anim-pop absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 rounded-xl border bg-popover p-1.5 shadow-lg">
            <Palette className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
            {['indigo', 'teal', 'emerald', 'amber', 'rose', 'violet', 'zinc'].map((c) => (
              <button
                key={c}
                onClick={() => reselectColor(c)}
                className="h-5 w-5 rounded-full border border-white/30 transition-transform hover:scale-110"
                style={{ background: colorHex(c) }}
                aria-label={`Recolor ${c}`}
              />
            ))}
            <span className="mx-1 h-4 w-px bg-border" />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                const parent = nodes.find((n) => n.id === selected)
                if (parent) addChild(parent)
              }}
            >
              <Plus className="mr-1 h-3 w-3" /> Child
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-danger"
              onClick={() => {
                if (nodes.length <= 1) return
                updateNodes(nodes.filter((n) => n.id !== selected && n.parentId !== selected))
                setSelected(null)
              }}
            >
              <Trash2 className="mr-1 h-3 w-3" /> Delete
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelected(null)} aria-label="Deselect">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* rename input for selected */}
        {selected && (
          <div className="anim-pop absolute bottom-3 left-1/2 w-[280px] -translate-x-1/2">
            <Input
              value={nodes.find((n) => n.id === selected)?.label ?? ''}
              onChange={(e) => updateNodes(nodes.map((n) => (n.id === selected ? { ...n, label: e.target.value } : n)))}
              placeholder="Node label"
              className="h-9 text-center text-sm shadow-lg"
              aria-label="Rename node"
            />
          </div>
        )}

        {/* minimap */}
        {nodes.length > 3 && (
          <div className="absolute bottom-3 right-3 h-[90px] w-[140px] overflow-hidden rounded-lg border bg-background/90 backdrop-blur">
            <svg width="100%" height="100%">
              {(() => {
                const b = getBounds()
                const sx = 140 / b.w
                const sy = 90 / b.h
                const s = Math.min(sx, sy) * 0.9
                const ox = (140 - b.w * s) / 2
                const oy = (90 - b.h * s) / 2
                return (
                  <>
                    {nodes.map((n) => (
                      <rect
                        key={`mm-${n.id}`}
                        x={ox + n.x * s}
                        y={oy + n.y * s}
                        width={NODE_W * s}
                        height={NODE_H * s}
                        rx={2}
                        fill={colorHex(n.color ?? 'zinc')}
                        opacity={0.75}
                      />
                    ))}
                    <rect
                      x={ox - pan.x / zoom * s * 0 + ox}
                      y={oy}
                      width={Math.min(140, viewport.w / zoom * s)}
                      height={Math.min(90, viewport.h / zoom * s)}
                      fill="none"
                      stroke="var(--primary)"
                      strokeWidth={1}
                    />
                  </>
                )
              })()}
            </svg>
          </div>
        )}

        <p className="pointer-events-none absolute right-3 top-3 text-[10px] text-muted-foreground">drag to pan · ⌘/Ctrl+scroll to zoom</p>
      </div>

      <GenerateDialog open={genOpen} onOpenChange={setGenOpen} onCreated={(id) => { reload(); setActiveId(id); setTimeout(fitView, 400) }} hasDocs={!!data && data.mindmaps.length >= 0} />
    </div>
  )
}

function Header({ onCreate, hasMaps }: { onCreate: () => void; hasMaps: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mindmaps</h1>
        <p className="text-sm text-muted-foreground">{hasMaps ? 'Drag nodes, recolor, auto-layout, export.' : 'Visual maps of your knowledge, auto-built.'}</p>
      </div>
      <Button onClick={onCreate}>
        <Sparkles className="mr-1.5 h-4 w-4" /> Generate
      </Button>
    </div>
  )
}

function GenerateDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: string) => void }) {
  const [mode, setMode] = useState<'topic' | 'document' | 'notes'>('topic')
  const [topic, setTopic] = useState('')
  const [documents, setDocuments] = useState<{ id: string; title: string }[]>([])
  const [docId, setDocId] = useState('')
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open && documents.length === 0) {
      api.get<{ documents: { id: string; title: string }[] }>('/api/documents').then((d) => setDocuments(d.documents)).catch(() => {})
    }
  }, [open, documents.length])

  async function generate() {
    setBusy(true)
    try {
      const body = mode === 'topic' ? { topic } : mode === 'document' ? { documentId: docId } : { source: 'notes' }
      const { mindmap } = await api.post<{ mindmap: Mindmap }>('/api/mindmaps/generate', body)
      toast({ title: 'Mindmap generated' })
      onOpenChange(false)
      setTopic('')
      onCreated(mindmap.id)
    } catch (e) {
      toast({ title: 'Generation failed', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate a mindmap</DialogTitle>
          <DialogDescription>From any topic, a document in your library, or an overview of your notes.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1.5">
          {(['topic', 'document', 'notes'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'min-h-[36px] flex-1 rounded-lg border text-xs font-medium capitalize transition-colors',
                mode === m ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {m}
            </button>
          ))}
        </div>
        {mode === 'topic' && (
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Transformer architectures" aria-label="Topic" autoFocus />
        )}
        {mode === 'document' && (
          <Select value={docId || undefined} onValueChange={setDocId}>
            <SelectTrigger aria-label="Choose document"><SelectValue placeholder="Pick a document…" /></SelectTrigger>
            <SelectContent>
              {documents.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {mode === 'notes' && <p className="text-sm text-muted-foreground">Will build a tree overview from your most recent quick-capture notes.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={generate} disabled={busy || (mode === 'topic' && !topic.trim()) || (mode === 'document' && !docId)}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            <Sparkles className="mr-1.5 h-4 w-4" /> Generate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
