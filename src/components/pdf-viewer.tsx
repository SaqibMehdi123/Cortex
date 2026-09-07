'use client'

// Canvas-based PDF renderer (pdf.js) for the Reader.
//
// Why not an <iframe src="*.pdf"> like before? Desktop browsers render PDFs
// inside iframes, but mobile Chrome and iOS Safari DO NOT — they show a blank
// box or hand the file to the OS viewer, yanking the user out of the app.
// pdf.js rasterises pages to <canvas>, which behaves identically on every
// browser, so the same component serves desktop and mobile.
//
// Features: continuous vertical scroll, fit-width default with zoom steps,
// prev/next page, lazy page rendering + bitmap eviction (a 300-page book
// never holds more than a handful of page bitmaps in memory).

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, FileWarning } from 'lucide-react'

const MAX_DPR = 2
const PAD = 12 // px padding around pages inside the scroll area
// Zoom multipliers over fit-width (1 = fit). Index moves with +/− buttons.
const ZOOMS = [0.5, 0.65, 0.8, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]
const DEFAULT_ZOOM_INDEX = 3

export function PdfCanvasViewer({ url, className }: { url: string; className?: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState(false)
  const [containerWidth, setContainerWidth] = useState(0)
  const [ratio, setRatio] = useState(1.414) // page width/height — A4-ish until known
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX)
  const [currentPage, setCurrentPage] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])

  const numPages = pdf?.numPages ?? 0
  const zoom = ZOOMS[zoomIndex]
  // Page CSS width from the observed container (content box — the scroll
  // area's own padding is already excluded); zoom scales beyond fit-width.
  const pageWidth = Math.max(80, Math.round(containerWidth * zoom))

  // ── Load the document (dynamic import keeps pdf.js out of the SSR bundle) ──
  useEffect(() => {
    let cancelled = false
    // pdf.js v6: destroy() lives on the loading task, not the document proxy
    let loadTask: { destroy: () => Promise<void> } | null = null
    setPdf(null)
    setError(false)
    setCurrentPage(1)
    setZoomIndex(DEFAULT_ZOOM_INDEX)
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const task = pdfjs.getDocument({ url })
        loadTask = task
        const loaded = await task.promise
        if (cancelled) return
        const p1 = await loaded.getPage(1)
        if (cancelled) return
        const vp = p1.getViewport({ scale: 1 })
        setRatio(vp.width / vp.height)
        setPdf(loaded)
      } catch {
        if (!cancelled) setError(true)
      }
    })()
    return () => {
      cancelled = true
      loadTask?.destroy().catch(() => {})
    }
  }, [url])

  // ── Track container width (re-attach after the loading branch swaps in the
  // scroll container — on first mount the ref is still null) ──
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setContainerWidth(Math.round(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [pdf])

  // ── Current page from scroll position (cheapest accurate-enough way) ──
  const onScroll = useCallback(() => {
    const sc = scrollRef.current
    if (!sc || numPages === 0) return
    const probe = sc.scrollTop + sc.clientHeight * 0.3
    let page = 1
    for (let i = 0; i < pageRefs.current.length; i++) {
      const el = pageRefs.current[i]
      if (el && el.offsetTop <= probe) page = i + 1
    }
    setCurrentPage(page)
  }, [numPages])

  const scrollToPage = useCallback((n: number) => {
    const target = Math.min(Math.max(1, n), numPages)
    const el = pageRefs.current[target - 1]
    const sc = scrollRef.current
    if (el && sc) sc.scrollTo({ top: el.offsetTop - PAD / 2, behavior: 'smooth' })
  }, [numPages])

  if (error) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center', className)}>
        <FileWarning className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">Could not render this PDF</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          The file may be corrupted or password-protected. You can still open or save it with the buttons above.
        </p>
      </div>
    )
  }

  if (!pdf) {
    return (
      <div className={cn('flex min-h-0 flex-1 items-center justify-center', className)}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading PDF…
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-0.5 border-b bg-background/95 px-1.5 py-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => scrollToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          onClick={() => scrollToPage(1)}
          className="min-w-[64px] rounded px-1 text-center text-xs tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Back to first page"
          aria-label={`Page ${currentPage} of ${numPages}`}
        >
          {currentPage} / {numPages}
        </button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => scrollToPage(currentPage + 1)} disabled={currentPage >= numPages} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoomIndex((i) => Math.max(0, i - 1))} disabled={zoomIndex === 0} aria-label="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <button
          onClick={() => setZoomIndex(DEFAULT_ZOOM_INDEX)}
          className="min-w-[44px] rounded px-1 text-center text-xs tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Reset to fit width"
          aria-label="Reset zoom to fit width"
        >
          {Math.round(zoom * 100)}%
        </button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoomIndex((i) => Math.min(ZOOMS.length - 1, i + 1))} disabled={zoomIndex === ZOOMS.length - 1} aria-label="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      {/* Pages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scroll-thin min-h-0 flex-1 overflow-auto bg-muted/40 p-3"
      >
        <div className="mx-auto flex w-fit min-w-full flex-col items-center gap-2">
          {Array.from({ length: numPages }, (_, i) => (
            <PdfPage
              key={i}
              pdf={pdf}
              pageNumber={i + 1}
              width={pageWidth}
              ratio={i === 0 ? ratio : null}
              fallbackRatio={ratio}
              ref={(el) => { pageRefs.current[i] = el }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── One page: placeholder until scrolled near, canvas bitmap once rendered ───
function PdfPage({
  pdf, pageNumber, width, ratio, fallbackRatio, ref,
}: {
  pdf: PDFDocumentProxy
  pageNumber: number
  width: number
  ratio: number | null          // known only after this page's viewport is fetched
  fallbackRatio: number
  ref: (el: HTMLDivElement | null) => void
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const taskRef = useRef<{ cancel: () => void } | null>(null)
  const [near, setNear] = useState(pageNumber <= 2) // render first pages eagerly
  const [need, setNeed] = useState(0)               // bumped on re-entry after eviction
  const [painted, setPainted] = useState(false)

  const displayRatio = ratio ?? fallbackRatio
  const displayHeight = Math.round(width / displayRatio)

  // Lazy visibility — render shortly before the page scrolls into view,
  // blank far-away bitmaps to keep memory flat on long books.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            setNear(true)
            setNeed((n) => n + 1)
          } else {
            const c = canvasRef.current
            // free the bitmap — CSS size keeps the layout intact
            if (c && c.width > 1) {
              c.width = 1
              c.height = 1
              setPainted(false)
            }
          }
        }
      },
      { rootMargin: '900px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // (Re)render whenever size/zoom changes or the page re-enters the zone.
  useEffect(() => {
    if (!near || width < 20) return
    let cancelled = false
    ;(async () => {
      try {
        const page = await pdf.getPage(pageNumber)
        if (cancelled) return
        const base = page.getViewport({ scale: 1 })
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
        const viewport = page.getViewport({ scale: (width / base.width) * dpr })
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = `${width}px`
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`
        const task = page.render({ canvas, canvasContext: ctx, viewport })
        taskRef.current = task
        await task.promise
        if (!cancelled) setPainted(true)
      } catch {
        // RenderingCancelledException during zoom churn — ignore
      }
    })()
    return () => {
      cancelled = true
      try { taskRef.current?.cancel() } catch { /* already done */ }
    }
  }, [near, need, width, pdf, pageNumber])

  return (
    <div
      ref={(el) => {
        wrapRef.current = el
        ref(el)
      }}
      data-page={pageNumber}
      className="relative shrink-0 overflow-hidden rounded-md border bg-white shadow-soft dark:bg-white"
      style={painted ? undefined : { width, height: displayHeight }}
    >
      <canvas ref={canvasRef} className="block" aria-label={`Page ${pageNumber}`} />
      {!painted && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs tabular-nums text-neutral-400">{pageNumber}</span>
        </div>
      )}
    </div>
  )
}
