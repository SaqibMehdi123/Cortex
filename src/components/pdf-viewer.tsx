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
//
// Text selection: the canvas is a bitmap, so an invisible pdf.js TextLayer
// (transparent, exactly-aligned text spans) is rendered on top of every page
// — that is what makes the text selectable and copyable.
//
// Fullscreen: the whole viewer can go immersive (fixed overlay above the
// whole app) via the toolbar button; X or Esc returns to the normal view.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, FileWarning, Maximize, X } from 'lucide-react'

// pdf.js TextLayer constructor (obtained from the dynamic module import —
// pdf.js must stay out of the SSR bundle)
type TextLayerCtor = typeof import('pdfjs-dist').TextLayer

const MAX_DPR = 2
const PAD = 12 // px padding around pages inside the scroll area
// Zoom multipliers over fit-width (1 = fit). Index moves with +/− buttons.
const ZOOMS = [0.5, 0.65, 0.8, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]
const DEFAULT_ZOOM_INDEX = 3

// Imperative API for the reader: jump to a page (citation clicks) and find
// which page actually contains a cited passage (searches the real text layer,
// correcting the proportional page estimate stored on citations).
export interface PdfViewerHandle {
  goToPage: (n: number) => void
  /** returns the 1-based page whose text contains `query`, or null */
  locate: (query: string, hintPage?: number) => Promise<number | null>
}

export const PdfCanvasViewer = forwardRef<
  PdfViewerHandle,
  {
    url: string
    className?: string
    /** page to open on (reading resume position) — only honoured once per mount */
    initialPage?: number
    /** fires whenever the top-most visible page changes while scrolling */
    onPageChange?: (page: number) => void
    /** external jump request (citation click) — bump `nonce` to trigger */
    jump?: { page: number; nonce: number } | null
    /** fullscreen state changes (the reader hosts its own AI panel above the
        immersive overlay and needs to know when it opens/closes) */
    onFullscreenChange?: (fullscreen: boolean) => void
    /** first chance at Esc while fullscreen — return true to consume it
        (e.g. minimize the AI popup) and keep fullscreen alive */
    escapeGuard?: () => boolean
    /** optional extra toolbar action (e.g. the reader's mindmap button),
        rendered right next to the fullscreen toggle */
    toolbarAction?: ReactNode
  }
>(function PdfCanvasViewer({ url, className, initialPage = 1, onPageChange, jump, onFullscreenChange, escapeGuard, toolbarAction }, ref) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState(false)
  const [containerWidth, setContainerWidth] = useState(0)
  const [ratio, setRatio] = useState(1.414) // page width/height — A4-ish until known
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX)
  const [currentPage, setCurrentPage] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [TextLayerCls, setTextLayerCls] = useState<TextLayerCtor | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  const jumpedRef = useRef(false)
  const lastReportedPage = useRef(0)
  // while a deliberate (citation) jump is animating, intermediate scroll
  // positions must not be reported as the reading position
  const jumpSettleUntil = useRef(0)
  // sync mirror of the top-most page (read inside the ResizeObserver callback
  // where state would be stale)
  const currentPageRef = useRef(1)
  // page to restore after a container reflow (dock open/close, window resize)
  const pendingKeepPage = useRef<number | null>(null)
  // keep the latest callback without re-binding the scroll handler
  const onPageChangeRef = useRef(onPageChange)
  onPageChangeRef.current = onPageChange
  // same pattern for the fullscreen host callbacks (the reader passes fresh
  // closures every render; the Esc listener must not re-subscribe for them)
  const onFullscreenChangeRef = useRef(onFullscreenChange)
  onFullscreenChangeRef.current = onFullscreenChange
  const escapeGuardRef = useRef(escapeGuard)
  escapeGuardRef.current = escapeGuard

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
    jumpedRef.current = false
    lastReportedPage.current = 0
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
        // wrap in an updater fn — React would CALL a bare class stored via
        // setState ("cannot be invoked without 'new'")
        setTextLayerCls(() => pdfjs.TextLayer)
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
  // scroll container — on first mount the ref is still null; `fullscreen` is
  // a dep because the portal swap mounts a fresh scroll node to observe) ──
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (!w) return
      const next = Math.round(w)
      if (next === containerWidth) return
      if (containerWidth > 0) {
        // the reflow will move every page — remember which one is on screen
        // so it can be held in place after the new width applies
        pendingKeepPage.current = currentPageRef.current
      }
      setContainerWidth(next)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [pdf, containerWidth, fullscreen])

  // ── Hold the current page across container reflows ──
  // Opening the Copilot dock / collapsing the sidebar / resizing the window
  // changes the page width; without this the browser preserves the raw
  // scrollTop and the reader silently drifts to a different page. Painted
  // pages resize asynchronously (each canvas re-renders in its own effect),
  // so the target offset is re-applied every frame until heights settle.
  useEffect(() => {
    if (!pdf || containerWidth <= 0) return
    const keep = pendingKeepPage.current
    if (keep == null) return
    pendingKeepPage.current = null
    const target = Math.min(Math.max(1, keep), pdf.numPages)
    const sc = scrollRef.current
    if (!sc) return
    // the reflow scroll noise must not be reported as a new reading position
    jumpSettleUntil.current = Date.now() + 1600
    let raf = 0
    const started = performance.now()
    let lastMax = -1
    let stable = 0
    const tick = () => {
      const el = pageRefs.current[target - 1]
      if (el) {
        sc.scrollTop = el.offsetTop - PAD / 2
        const max = sc.scrollHeight - sc.clientHeight
        stable = max === lastMax ? stable + 1 : 0
        lastMax = max
      }
      if (stable >= 10 || performance.now() - started > 1200) {
        lastReportedPage.current = target
        currentPageRef.current = target
        setCurrentPage(target)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [pdf, containerWidth])

  // ── Resume: jump to the initial page once the layout is real ──
  // Wait for the container width (ResizeObserver) — before that, pages lay
  // out at the 80px minimum and offsetTop is garbage, so the jump would land
  // on the wrong page and a scroll event could clobber the saved position.
  useEffect(() => {
    if (!pdf || jumpedRef.current || containerWidth <= 0) return
    const n = Math.min(Math.max(1, Math.round(initialPage)), pdf.numPages)
    if (n <= 1) { jumpedRef.current = true; return }
    jumpedRef.current = true
    // one frame so the page placeholders (fixed heights) have final offsetTop
    const raf = requestAnimationFrame(() => {
      const el = pageRefs.current[n - 1]
      const sc = scrollRef.current
      if (el && sc) {
        sc.scrollTo({ top: el.offsetTop - PAD / 2 })
        lastReportedPage.current = n
        currentPageRef.current = n
        setCurrentPage(n)
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [pdf, containerWidth, initialPage])

  // ── Current page from scroll position (cheapest accurate-enough way) ──
  const onScroll = useCallback(() => {
    const sc = scrollRef.current
    if (!sc || numPages === 0) return
    // during a resume / citation jump / reflow settle window every position
    // is mid-flight noise: hold the deliberate target in the toolbar and the
    // mirror refs — canvases resize asynchronously and probes would land on
    // pages we are merely flying over
    if (Date.now() <= jumpSettleUntil.current) return
    const probe = sc.scrollTop + sc.clientHeight * 0.3
    let page = 1
    for (let i = 0; i < pageRefs.current.length; i++) {
      const el = pageRefs.current[i]
      if (el && el.offsetTop <= probe) page = i + 1
    }
    setCurrentPage(page)
    currentPageRef.current = page
    // don't report until the resume jump has settled — pre-jump scroll noise
    // (layout reflow) would otherwise overwrite the saved reading position.
    // A fresh deliberate jump silences reports for its animation window too.
    if (
      jumpedRef.current &&
      page !== lastReportedPage.current &&
      Date.now() > jumpSettleUntil.current
    ) {
      lastReportedPage.current = page
      onPageChangeRef.current?.(page)
    }
  }, [numPages])

  const scrollToPage = useCallback((n: number) => {
    const target = Math.min(Math.max(1, n), numPages)
    const el = pageRefs.current[target - 1]
    const sc = scrollRef.current
    if (el && sc) sc.scrollTo({ top: el.offsetTop - PAD / 2, behavior: 'smooth' })
  }, [numPages])

  // ── Immersive fullscreen ──
  // The whole viewer is portaled to <body> while fullscreen: app wrappers use
  // entrance animations (`anim-fade-up`, fill-mode both) and any element with
  // a transform animation is a containing block for position:fixed — the
  // overlay would pin inside the content column. A body-level portal anchors
  // to the viewport for real and floats above every app chrome (z-[60] vs
  // z-40 quick-capture/Copilot FABs, z-50 banner). Component state (loaded
  // pdf, page, zoom) survives the portal swap; the ResizeObserver below
  // re-observes the fresh scroll node and the keep-page logic re-lands the
  // current page on both transitions.
  const exitFullscreen = useCallback(() => setFullscreen(false), [])
  const enterFullscreen = useCallback(() => setFullscreen(true), [])
  const toggleFullscreen = useCallback(
    () => (fullscreen ? exitFullscreen() : enterFullscreen()),
    [fullscreen, enterFullscreen, exitFullscreen],
  )
  // Esc returns to the normal view — unless a guard consumes it first (the
  // reader minimizes its fullscreen AI popup on the first Esc, fullscreen
  // itself leaves on the next one)
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (escapeGuardRef.current?.()) return
        exitFullscreen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen, exitFullscreen])

  // Report fullscreen transitions after commit — covers every path (toolbar
  // button, Esc) so the host can mount/unmount its overlay panel in step
  useEffect(() => {
    onFullscreenChangeRef.current?.(fullscreen)
  }, [fullscreen])

  // ── Citation jump (in place, while mounted) ──
  // Runs when the nonce changes AND again once `pdf` arrives, so a request
  // made before the document finished loading is not lost. The reader saves
  // the jump target itself; here we only silence intermediate reports while
  // the smooth scroll animates (a mid-animation probe would otherwise
  // overwrite the saved page with a page we are merely flying over).
  useEffect(() => {
    if (!jump || !pdf) return
    lastReportedPage.current = jump.page
    jumpSettleUntil.current = Date.now() + 1500
    scrollToPage(jump.page)
    // sync the toolbar with the real landing page once the animation ends —
    // no further scroll events fire on their own, so without this the page
    // indicator would stay stale until the user scrolls again
    const t = setTimeout(() => {
      const sc = scrollRef.current
      if (!sc) return
      const probe = sc.scrollTop + sc.clientHeight * 0.3
      let page = 1
      for (let i = 0; i < pageRefs.current.length; i++) {
        const el = pageRefs.current[i]
        if (el && el.offsetTop <= probe) page = i + 1
      }
      lastReportedPage.current = page
      currentPageRef.current = page
      setCurrentPage(page)
    }, 1100)
    return () => clearTimeout(t)
  }, [jump, pdf, scrollToPage])

  // ── Text-layer search for citation landing pages ──
  const pageTextCache = useRef<Map<number, string>>(new Map())
  const getPageText = useCallback(
    async (n: number): Promise<string> => {
      const cached = pageTextCache.current.get(n)
      if (cached !== undefined) return cached
      const page = await pdf!.getPage(n)
      const tc = await page.getTextContent()
      let out = ''
      for (const item of tc.items as { str?: string }[]) {
        if (typeof item.str === 'string') out += item.str + ' '
      }
      const t = normForMatch(out)
      pageTextCache.current.set(n, t)
      return t
    },
    [pdf]
  )

  const locate = useCallback(
    async (query: string, hintPage?: number): Promise<number | null> => {
      if (!pdf) return null
      const q = normForMatch(query).slice(0, 140)
      if (q.length < 12) return null // too short to match reliably
      const sq = squash(q)
      const total = pdf.numPages
      const has = async (n: number) => {
        if (n < 1 || n > total) return false
        try {
          return squash(await getPageText(n)).includes(sq)
        } catch {
          return false
        }
      }
      const start = hintPage && hintPage >= 1 && hintPage <= total ? hintPage : 1
      // widening rings around the hint — the stored page is a proportional
      // estimate, so the true page is usually within a handful of pages
      if (await has(start)) return start
      for (let r = 1; r <= 40; r++) {
        if (start - r >= 1 && (await has(start - r))) return start - r
        if (start + r <= total && (await has(start + r))) return start + r
      }
      // last resort: full sweep (rare — estimate was far off)
      for (let n = 1; n <= total; n++) {
        if (Math.abs(n - start) <= 40) continue
        if (await has(n)) return n
      }
      return null
    },
    [pdf, getPageText]
  )

  useImperativeHandle(ref, () => ({ goToPage: scrollToPage, locate }), [scrollToPage, locate])

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

  const tree = (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col bg-background',
        // Immersive reading: portaled to <body> — true viewport anchor, above
        // every app chrome. The keep-page logic re-lands the current page
        // after the swap.
        fullscreen && 'fixed inset-0 z-[60]',
        className,
      )}
    >
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
        {/* Host-provided action sits right next to the fullscreen toggle */}
        {toolbarAction}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7"
          onClick={toggleFullscreen}
          aria-label={fullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen'}
          title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
        >
          {fullscreen ? <X className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
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
              TextLayerCls={TextLayerCls}
              ref={(el) => { pageRefs.current[i] = el }}
            />
          ))}
        </div>
      </div>
    </div>
  )

  // Fullscreen: render the same element tree at <body> level (see the
  // fullscreen comment above for why a body-level anchor is required)
  return fullscreen ? createPortal(tree, document.body) : tree
})

// normalize for citation matching: lowercase, strip punctuation, collapse
// whitespace (the stored content and the pdf.js text layer disagree on line
// breaks, hyphenation and spacing — comparing the squashed alphanumeric forms
// is robust to all of that)
function normForMatch(s: string) {
  return s
    .replace(/\u00ad/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
// even stricter: letters+digits only — survives "con- trol" vs "control"
const squash = (s: string) => s.replace(/[^a-z0-9]/g, '')

// ─── One page: placeholder until scrolled near, canvas bitmap once rendered ───
// An invisible pdf.js TextLayer is laid out on top of the bitmap so the text
// is selectable and copyable — the canvas alone is just a picture.
function PdfPage({
  pdf, pageNumber, width, ratio, fallbackRatio, TextLayerCls, ref,
}: {
  pdf: PDFDocumentProxy
  pageNumber: number
  width: number
  ratio: number | null          // known only after this page's viewport is fetched
  fallbackRatio: number
  TextLayerCls: TextLayerCtor | null
  ref: (el: HTMLDivElement | null) => void
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const taskRef = useRef<{ cancel: () => void } | null>(null)
  const textWrapRef = useRef<HTMLDivElement | null>(null)
  const tlRef = useRef<InstanceType<TextLayerCtor> | null>(null)
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
            // drop the text spans too — rebuilt on re-entry
            try { tlRef.current?.cancel() } catch { /* already settled */ }
            textWrapRef.current?.replaceChildren()
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
        if (cancelled) return
        setPainted(true)

        // Text layer for selection & copy — laid out with the CSS-pixel
        // viewport (NOT the dpr-scaled bitmap viewport) so the transparent
        // spans align exactly over the painted canvas at any zoom.
        const tw = textWrapRef.current
        if (tw && TextLayerCls) {
          const cssVp = page.getViewport({ scale: width / base.width })
          try { tlRef.current?.cancel() } catch { /* already settled */ }
          tw.replaceChildren()
          tw.style.setProperty('--total-scale-factor', String(cssVp.scale))
          const tl = new TextLayerCls({
            textContentSource: page.streamTextContent(),
            container: tw,
            viewport: cssVp,
          })
          tlRef.current = tl
          try { await tl.render() } catch { /* cancelled by zoom churn / eviction */ }
        }
      } catch {
        // RenderingCancelledException during zoom churn — ignore
      }
    })()
    return () => {
      cancelled = true
      try { taskRef.current?.cancel() } catch { /* already done */ }
      try { tlRef.current?.cancel() } catch { /* already done */ }
    }
  }, [near, need, width, pdf, pageNumber, TextLayerCls])

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
      {/* invisible, exactly-aligned text spans — make the page text selectable/copyable */}
      <div ref={textWrapRef} className="textLayer" aria-hidden="true" />
      {!painted && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-xs tabular-nums text-neutral-400">{pageNumber}</span>
        </div>
      )}
    </div>
  )
}
