'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { api, useApi } from '@/lib/client'
import type { Mindmap, MindmapNode } from '@/lib/types'
import { PageHeader, EmptyState, LoadingBlock, ErrorBlock, paletteOf } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { Plus, Trash2, Share2, Loader2, Network, Wand2, GitBranch, Type } from 'lucide-react'

const NODE_W = 170
const NODE_H = 44
const CANVAS_W = 2000
const CANVAS_H = 1200

// Defensive: nodes may arrive as an array or a JSON string depending on the API path
function parseNodes(raw: unknown): MindmapNode[] {
  let list: unknown = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch {
      list = []
    }
  }
  return Array.isArray(list) ? (list as MindmapNode[]) : []
}

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

export function MindmapView() {
  const { data, loading, error, reload } = useApi<{ mindmaps: Mindmap[] }>('/api/mindmaps')
  const [userSelectedId, setUserSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const mindmaps = data?.mindmaps ?? []
  // Derive the active map during render: fall back to the first map when
  // nothing is selected yet or the selected map was deleted — no effect needed.
  const current = mindmaps.find((m) => m.id === userSelectedId) ?? mindmaps[0] ?? null

  async function createMap() {
    if (!newTitle.trim()) return
    try {
      const res = await api.post<{ mindmap: Mindmap }>('/api/mindmaps', {
        title: newTitle.trim(),
        nodes: [{ id: 'root', label: newTitle.trim(), x: 900, y: 560, parentId: null, color: 'emerald' }],
      })
      setCreateOpen(false)
      setNewTitle('')
      await reload()
      setUserSelectedId(res.mindmap.id)
      toast({ title: 'Mindmap created' })
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to create', variant: 'destructive' })
    }
  }

  async function deleteMap(id: string) {
    await api.del(`/api/mindmaps/${id}`)
    setUserSelectedId(null)
    reload()
    toast({ title: 'Mindmap deleted' })
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Mindmaps" subtitle="Branch out ideas — link them to goals and see the big picture">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New mindmap
        </Button>
      </PageHeader>

      {loading ? (
        <LoadingBlock rows={3} />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : mindmaps.length === 0 ? (
        <EmptyState
          icon={<Share2 className="h-8 w-8" />}
          title="No mindmaps yet"
          hint='Create one — e.g. "AI Internship Plan" — then branch it: skills → projects → applications. Drag nodes anywhere.'
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {mindmaps.map((m) => (
              <button
                key={m.id}
                onClick={() => setUserSelectedId(m.id)}
                className={cn(
                  'group flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                  current?.id === m.id ? 'border-primary/40 bg-primary/10 text-primary' : 'bg-card hover:bg-muted'
                )}
              >
                <span className={cn('h-2 w-2 rounded-full', paletteOf(m.goal?.color).dot)} />
                {m.title}
                <Trash2
                  className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteMap(m.id)
                  }}
                />
              </button>
            ))}
          </div>
          {current && <MindmapEditor key={current.id} mindmap={current} />}
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New mindmap</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5 py-1">
            <Label>Title</Label>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createMap()}
              placeholder="e.g. AI Internship Plan"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createMap}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Editor ─────────────────────────────────────────────────────────

function MindmapEditor({ mindmap }: { mindmap: Mindmap }) {
  const [nodes, setNodes] = useState<MindmapNode[]>(() => {
    const parsed = parseNodes(mindmap.nodes)
    return parsed.length
      ? parsed
      : [{ id: 'root', label: mindmap.title, x: 900, y: 560, parentId: null, color: 'emerald' }]
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [title, setTitle] = useState(mindmap.title)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragState = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null)

  const selectedNode = nodes.find((n) => n.id === selected) ?? null

  function scheduleSave(next: MindmapNode[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await api.patch(`/api/mindmaps/${mindmap.id}`, { nodes: next, title })
      } catch (e) {
        toast({ title: e instanceof Error ? e.message : 'Save failed', variant: 'destructive' })
      }
    }, 600)
  }

  function updateNodes(next: MindmapNode[], save = true) {
    setNodes(next)
    if (save) scheduleSave(next)
  }

  function addChild(parent: MindmapNode) {
    const colors = ['emerald', 'amber', 'rose', 'violet', 'cyan', 'orange']
    const siblingCount = nodes.filter((n) => n.parentId === parent.id).length
    const node: MindmapNode = {
      id: uid(),
      label: 'New idea',
      x: Math.min(CANVAS_W - NODE_W - 20, parent.x + NODE_W + 90),
      y: Math.max(20, Math.min(CANVAS_H - NODE_H - 20, parent.y + (siblingCount % 3 - 1) * 90 + (siblingCount % 2 ? 30 : -10))),
      parentId: parent.id,
      color: colors[siblingCount % colors.length],
    }
    updateNodes([...nodes, node])
    setSelected(node.id)
    setEditingId(node.id)
    setEditLabel(node.label)
  }

  function removeNode(id: string) {
    if (id === 'root') {
      toast({ title: 'The root node cannot be deleted' })
      return
    }
    // remove node and descendants
    const doomed = new Set([id])
    let grew = true
    while (grew) {
      grew = false
      for (const n of nodes) {
        if (n.parentId && doomed.has(n.parentId) && !doomed.has(n.id)) {
          doomed.add(n.id)
          grew = true
        }
      }
    }
    const next = nodes.filter((n) => !doomed.has(n.id))
    updateNodes(next)
    setSelected(null)
  }

  function commitLabel() {
    if (!editingId) return
    updateNodes(nodes.map((n) => (n.id === editingId ? { ...n, label: editLabel.trim() || n.label } : n)))
    setEditingId(null)
  }

  // ── Auto tidy: simple horizontal tree layout ──
  function tidy() {
    const childrenOf = new Map<string | null, MindmapNode[]>()
    for (const n of nodes) {
      const list = childrenOf.get(n.parentId) ?? []
      list.push(n)
      childrenOf.set(n.parentId, list)
    }
    const next = new Map<string, { x: number; y: number }>()
    const root = nodes.find((n) => n.id === 'root') ?? nodes[0]
    let cursorY = 200

    function place(node: MindmapNode, depth: number): number {
      const children = childrenOf.get(node.id) ?? []
      if (children.length === 0) {
        const y = cursorY
        cursorY += NODE_H + 46
        next.set(node.id, { x: 250 + depth * 260, y })
        return y
      }
      const ys = children.map((c) => place(c, depth + 1))
      const y = (Math.min(...ys) + Math.max(...ys)) / 2
      next.set(node.id, { x: 250 + depth * 260, y })
      return y
    }

    if (root) {
      next.set(root.id, { x: 250, y: place(root, 0) === 0 ? 560 : next.get(root.id)?.y ?? 560 })
      // ensure root x
      const r = next.get(root.id)!
      next.set(root.id, { ...r, x: 180 })
      updateNodes(nodes.map((n) => (next.has(n.id) ? { ...n, x: Math.round(next.get(n.id)!.x), y: Math.round(next.get(n.id)!.y) } : n)))
    }
  }

  // ── Drag handling (pointer events → works with touch) ──
  function onPointerDown(e: React.PointerEvent, node: MindmapNode) {
    if (editingId === node.id) return
    (e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragState.current = { id: node.id, startX: e.clientX, startY: e.clientY, origX: node.x, origY: node.y }
    setSelected(node.id)
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragState.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    const x = Math.max(0, Math.min(CANVAS_W - NODE_W, d.origX + dx))
    const y = Math.max(0, Math.min(CANVAS_H - NODE_H, d.origY + dy))
    setNodes((ns) => ns.map((n) => (n.id === d.id ? { ...n, x, y } : n)))
  }

  function onPointerUp() {
    if (dragState.current) {
      dragState.current = null
      scheduleSave(nodes)
    }
  }

  const edges = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    return nodes
      .filter((n) => n.parentId && byId.has(n.parentId))
      .map((n) => {
        const p = byId.get(n.parentId!)!
        return { from: p, to: n }
      })
  }, [nodes])

  return (
    <div className="rounded-xl border bg-card">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Network className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => scheduleSave(nodes)}
            className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 text-sm font-semibold outline-none hover:bg-muted focus:bg-muted"
            aria-label="Mindmap title"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={tidy} className="h-8 text-xs">
            <Wand2 className="mr-1 h-3.5 w-3.5" /> Tidy
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={!selectedNode}
            onClick={() => selectedNode && addChild(selectedNode)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Child node
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={!selectedNode}
            onClick={() => {
              if (selectedNode) {
                setEditingId(selectedNode.id)
                setEditLabel(selectedNode.label)
              }
            }}
          >
            <Type className="mr-1 h-3.5 w-3.5" /> Rename
          </Button>
        </div>
      </div>

      {/* Hint bar */}
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <GitBranch className="h-3 w-3" /> Drag nodes to arrange · select a node, then add a child
        </span>
        <span>{nodes.length} nodes · autosaves</span>
      </div>

      {/* Canvas */}
      <div className="overflow-auto rounded-b-xl" style={{ height: 480 }}>
        <div className="relative" style={{ width: CANVAS_W, height: CANVAS_H }}>
          <svg className="absolute inset-0 h-full w-full" width={CANVAS_W} height={CANVAS_H} aria-hidden>
            {edges.map(({ from, to }) => {
              const x1 = from.x + NODE_W
              const y1 = from.y + NODE_H / 2
              const x2 = to.x
              const y2 = to.y + NODE_H / 2
              const mx = (x1 + x2) / 2
              return (
                <path
                  key={`${from.id}-${to.id}`}
                  d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="text-muted-foreground/40"
                />
              )
            })}
          </svg>

          {nodes.map((n) => {
            const pal = paletteOf(n.color)
            const isRoot = n.id === 'root'
            return (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                aria-label={`Node ${n.label}`}
                onPointerDown={(e) => onPointerDown(e, n)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onDoubleClick={() => {
                  setEditingId(n.id)
                  setEditLabel(n.label)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setEditingId(n.id)
                    setEditLabel(n.label)
                  }
                  if (e.key === 'Delete') removeNode(n.id)
                }}
                className={cn(
                  'absolute flex select-none items-center justify-center rounded-xl border-2 px-2 text-center shadow-sm transition-shadow',
                  isRoot ? 'font-semibold shadow-md' : 'text-xs',
                  selected === n.id ? 'ring-2 ring-primary/50 border-primary/50' : 'cursor-grab active:cursor-grabbing'
                )}
                style={{
                  left: n.x,
                  top: n.y,
                  width: isRoot ? NODE_W + 50 : NODE_W,
                  height: isRoot ? NODE_H + 10 : NODE_H,
                  background: 'hsl(var(--card))',
                  borderColor: selected === n.id ? undefined : `hsl(var(--border))`,
                }}
              >
                {editingId === n.id ? (
                  <input
                    autoFocus
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onBlur={commitLabel}
                    onKeyDown={(e) => e.key === 'Enter' && commitLabel()}
                    className="w-full rounded bg-background px-1 text-center text-xs outline-none ring-1 ring-primary"
                    aria-label="Edit node label"
                  />
                ) : (
                  <span className={cn('pointer-events-none line-clamp-2 w-full px-1 leading-tight', pal.text)}>
                    {n.label}
                  </span>
                )}
                <span className={cn('absolute -left-0.5 -top-0.5 h-2.5 w-2.5 rounded-full', pal.dot)} aria-hidden />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
