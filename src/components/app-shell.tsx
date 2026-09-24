'use client'

import { FaBell, FaBullseye, FaChartLine, FaChevronDown, FaCircleCheck, FaClock, FaCrown, FaGear, FaIndent, FaLayerGroup, FaMagnifyingGlass, FaMoon, FaOutdent, FaPlus, FaRightFromBracket, FaShareNodes, FaSpinner, FaSun, FaTriangleExclamation, FaWandMagicSparkles, FaXmark } from 'react-icons/fa6'
import { cn } from '@/lib/utils'
import { useUI, type ViewKey, type NavChild, NAV_ITEMS, MOBILE_TABS, NAV_GROUP_LABELS } from '@/lib/nav-config'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { api, useApi } from '@/lib/client'
import { useIdleLogout } from '@/hooks/use-idle-logout'
import { Button } from '@/components/ui/button'
import type { DashboardData } from '@/lib/types'
import { recurrenceLabel } from '@/lib/reminder-span'
import { hasTimePart } from '@/lib/plan-span'
import { CortexMark } from '@/components/logo'
import { PomodoroPill } from '@/components/focus-timer'
import {
  Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
  Popover, PopoverContent, PopoverTrigger,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui'

const MORE_ITEMS: { key: ViewKey; label: string; icon: React.ReactNode }[] = [
  { key: 'goals', label: 'Goals', icon: <FaBullseye className="h-5 w-5" /> },
  { key: 'mindmap', label: 'Mindmaps', icon: <FaShareNodes className="h-5 w-5" /> },
  { key: 'flashcards', label: 'Flashcards', icon: <FaLayerGroup className="h-5 w-5" /> },
  { key: 'analytics', label: 'Analytics', icon: <FaChartLine className="h-5 w-5" /> },
  { key: 'settings', label: 'Settings', icon: <FaGear className="h-5 w-5" /> },
]

// Career & News & Papers get their own labeled rows in the More sheet so a
// phone user can jump straight to Discover / Scholarships / Papers too.
const MOBILE_SUB_SECTIONS: { view: ViewKey; label: string; children: NavChild[] }[] = [
  { view: 'career', label: 'Career', children: NAV_ITEMS.find((i) => i.key === 'career')?.children ?? [] },
  { view: 'news', label: 'News & Papers', children: NAV_ITEMS.find((i) => i.key === 'news')?.children ?? [] },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  // /app is middleware-gated behind a valid session, so arming the idle
  // guard unconditionally here is safe — every render of this shell implies
  // a signed-in user. 30 idle minutes → warning toast → auto sign-out.
  useIdleLogout()
  const view = useUI((s) => s.view)
  const setView = useUI((s) => s.setView)
  const sidebarCollapsed = useUI((s) => s.sidebarCollapsed)
  const toggleSidebar = useUI((s) => s.toggleSidebar)
  const setCommandOpen = useUI((s) => s.setCommandOpen)
  const setCaptureOpen = useUI((s) => s.setCaptureOpen)
  const setCopilotOpen = useUI((s) => s.setCopilotOpen)
  const copilotOpen = useUI((s) => s.copilotOpen)
  const readerDocId = useUI((s) => s.readerDocId)
  const setReaderMindmapOpen = useUI((s) => s.setReaderMindmapOpen)
  const mobileMoreOpen = useUI((s) => s.mobileMoreOpen)
  const setMobileMoreOpen = useUI((s) => s.setMobileMoreOpen)
  const setCareerTab = useUI((s) => s.setCareerTab)
  const setNewsTab = useUI((s) => s.setNewsTab)
  const careerTab = useUI((s) => s.careerTab)
  const newsTab = useUI((s) => s.newsTab)
  const [mobileNotifOpen, setMobileNotifOpen] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const [online, setOnline] = useState(true)
  const [synced, setSynced] = useState(true)

  useEffect(() => {
    const update = () => {
      const isOnline = navigator.onLine
      setOnline(isOnline)
      if (!isOnline) {
        setSynced(false)
      } else {
        const t = setTimeout(() => setSynced(true), 800)
        return () => clearTimeout(t)
      }
    }
    const handler = () => {
      const cleanup = update()
      void cleanup
    }
    window.addEventListener('online', handler)
    window.addEventListener('offline', handler)
    return () => {
      window.removeEventListener('online', handler)
      window.removeEventListener('offline', handler)
    }
  }, [])

  const [notifData, setNotifData] = useState<DashboardData | null>(null)
  const [notifFailed, setNotifFailed] = useState(false)
  const notifFetchedAt = useRef(0)

  const loadNotif = useCallback(() => {
    notifFetchedAt.current = Date.now()
    api.get<DashboardData>('/api/dashboard').then((d) => {
      setNotifData(d)
      setNotifFailed(false)
    }).catch(() => setNotifFailed(true))
  }, [])

  useEffect(() => {
    // cache the badge payload for 60s — the dashboard already fetches the same
    // data, so re-hitting /api/dashboard on every view switch was pure waste
    if (notifData && Date.now() - notifFetchedAt.current < 60_000) return
    loadNotif()
  }, [view, loadNotif, notifData])

  // ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setCommandOpen])

  const dueFlashcards = notifData?.briefing.dueFlashcards ?? 0
  const urgentDeadlines = notifData?.deadlines.filter((d) => d.daysLeft <= 2).length ?? 0
  const remindersToday = notifData?.todayReminders?.length ?? 0
  const dueTodayCount = notifData?.todayTasks.length ?? 0
  // badge = everything that needs attention today (the same rows the
  // notification panel lists first) — not the whole day agenda
  const notifCount = dueFlashcards + urgentDeadlines + remindersToday + dueTodayCount
  const collapsed = sidebarCollapsed
  // platform-aware shortcut hint (⌘ on Apple devices, Ctrl elsewhere)
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('min-h-screen bg-background', !online && 'pt-9')}>
        {/* Offline banner — the pt on the wrapper below keeps it from
            painting over the mobile header */}
        {!online && (
          <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-warning py-1.5 text-xs font-medium text-white">
            <FaTriangleExclamation className="h-3.5 w-3.5" /> Offline — changes will sync when you reconnect
          </div>
        )}

        {/* ── Desktop sidebar ── */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-30 hidden flex-col border-r bg-sidebar transition-[width] duration-200 lg:flex',
            collapsed ? 'w-16' : 'w-[232px]'
          )}
        >
          {/* Heading: mark + wordmark (controls live at the bottom, before sync) */}
          <div className={cn('flex items-center gap-2 px-4 pb-4 pt-5', collapsed && 'justify-center px-0')}>
            <CortexMark size={collapsed ? 26 : 27} className="text-foreground" />
            {!collapsed && (
              <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
                <span className="font-display text-[1.35rem] leading-none">Cortex</span>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              </div>
            )}
            {collapsed && <span className="sr-only">Cortex</span>}
          </div>

          <div className={cn('px-3 pb-3', collapsed && 'px-2')}>
            <button
              onClick={() => setCommandOpen(true)}
              className={cn(
                'flex min-h-[36px] w-full items-center gap-2 rounded-lg border bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground',
                collapsed && 'justify-center px-0'
              )}
              aria-label="Search everything (Ctrl+K)"
            >
              <FaMagnifyingGlass className="h-3.5 w-3.5 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Search…</span>
                  <kbd className="rounded border bg-muted px-1 py-0.5 text-[10px] font-medium">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
                </>
              )}
            </button>
          </div>

          <nav className={cn('scroll-thin flex-1 space-y-0.5 overflow-y-auto px-2 pb-2', collapsed && 'px-1.5')} aria-label="Main">
            {(['workspace', 'intelligence', 'system'] as const).map((group) => {
              const items = NAV_ITEMS.filter((i) => i.group === group)
              if (items.length === 0) return null
              return (
                <div key={group} className={cn(collapsed ? 'pb-2' : 'pb-3')}>
                  {!collapsed && (
                    <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
                      {NAV_GROUP_LABELS[group]}
                    </p>
                  )}
                  {collapsed && group !== 'workspace' && <div className="mx-2 mb-2 border-t" />}
                  {items.map((item) =>
                    item.children ? (
                      <NavDropdown key={item.key} item={item} collapsed={collapsed} active={view === item.key} />
                    ) : (
                      <Tooltip key={item.key}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setView(item.key)}
                            aria-current={view === item.key ? 'page' : undefined}
                            className={cn(
                              'group relative flex min-h-[36px] w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-150',
                              collapsed && 'justify-center px-0',
                              view === item.key
                                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            )}
                          >
                            {view === item.key && (
                              <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-primary" aria-hidden />
                            )}
                            <span className={cn(view === item.key && 'text-primary')}>{item.icon}</span>
                            {!collapsed && item.label}
                            {!collapsed && item.key === 'flashcards' && dueFlashcards > 0 && (
                              <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                                {dueFlashcards}
                              </span>
                            )}
                          </button>
                        </TooltipTrigger>
                        {collapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
                      </Tooltip>
                    )
                  )}
                </div>
              )
            })}
          </nav>

          <div className="space-y-1 border-t px-2 py-3">
            <Popover>
              <PopoverTrigger asChild>
                <button aria-label={`Notifications${notifCount > 0 ? ` (${notifCount})` : ''}`} className={cn('relative flex min-h-[36px] w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', collapsed && 'justify-center px-0')}>
                  <FaBell className="h-4 w-4" />
                  {!collapsed && 'Notifications'}
                  {notifCount > 0 && (
                    <span className={cn('absolute top-1.5 rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-white', collapsed ? 'right-1' : 'right-2')}>
                      {notifCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent side="right" align="start" className="w-80 p-0">
                <NotificationPanel data={notifData} failed={notifFailed} onRetry={loadNotif} />
              </PopoverContent>
            </Popover>

            {/* Collapse + dark mode — under Notifications, before sync */}
            <button
              onClick={toggleSidebar}
              className={cn('flex min-h-[36px] w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', collapsed && 'justify-center px-0')}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <FaIndent className="h-4 w-4" /> : <FaOutdent className="h-4 w-4" />}
              {!collapsed && 'Collapse'}
            </button>

            <button
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className={cn('flex min-h-[36px] w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', collapsed && 'justify-center px-0')}
              aria-label="Toggle dark mode"
            >
              {/* CSS-only swap: no hydration mismatch (next-themes sets .dark on <html>) */}
              <FaSun className="hidden h-4 w-4 dark:block" />
              <FaMoon className="h-4 w-4 dark:hidden" />
              {!collapsed && (
                <>
                  <span className="hidden dark:inline">Light mode</span>
                  <span className="dark:hidden">Dark mode</span>
                </>
              )}
            </button>

            <SidebarSyncRow collapsed={collapsed} online={online} synced={synced} />

            <UserChip collapsed={collapsed} />
          </div>
        </aside>

        {/* ── Main content ── */}
        <main
          className={cn(
            'overflow-x-clip px-4 pb-28 pt-16 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8 transition-[margin,padding] duration-200',
            collapsed ? 'lg:ml-16' : 'lg:ml-[232px]',
            copilotOpen && 'xl:mr-[380px]'
          )}
        >
          <div className="mx-auto max-w-[1200px]">{children}</div>
        </main>

        {/* ── Mobile top bar ── */}
        <header className="fixed inset-x-0 top-0 z-30 flex items-center gap-2 border-b bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
          <div className="flex flex-1 items-center gap-2">
            <CortexMark size={22} className="text-foreground" />
            <span className="font-display text-xl leading-none">Cortex</span>
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
          </div>
          {!online && <FaTriangleExclamation className="h-4 w-4 text-warning" aria-label="Offline" />}
          {/* Notifications — same panel as the desktop sidebar, in a bottom
              sheet (the desktop popover is too cramped on a phone) */}
          <Sheet open={mobileNotifOpen} onOpenChange={setMobileNotifOpen}>
            <SheetTrigger asChild>
              <button
                className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`Notifications${notifCount > 0 ? ` (${notifCount})` : ''}`}
              >
                <FaBell className="h-4 w-4" />
                {notifCount > 0 && <span className="absolute right-1 top-1 flex h-2 w-2"><span className="h-2 w-2 rounded-full bg-danger" /></span>}
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8 [&>button]:hidden">
              <SheetHeader className="flex-row items-center justify-between p-0 pb-2 pt-4">
                <SheetTitle className="text-left">Notifications</SheetTitle>
                <SheetClose
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <FaXmark className="h-4.5 w-4.5" />
                </SheetClose>
              </SheetHeader>
              <NotificationPanel data={notifData} failed={notifFailed} onRetry={loadNotif} onNavigate={() => setMobileNotifOpen(false)} />
            </SheetContent>
          </Sheet>
          <button
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Toggle dark mode"
          >
            <FaSun className="hidden h-4 w-4 dark:block" />
            <FaMoon className="h-4 w-4 dark:hidden" />
          </button>
          <button
            onClick={() => setCommandOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-lg border bg-muted px-2.5 text-xs text-muted-foreground"
            aria-label="Search"
          >
            <FaMagnifyingGlass className="h-3.5 w-3.5" /> Search
          </button>
        </header>

        {/* ── Mobile bottom tabs ── */}
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden"
          aria-label="Bottom navigation"
        >
          <div className="grid grid-cols-5">
            {MOBILE_TABS.map((tab) =>
              tab.key === 'more' ? (
                <Sheet key={tab.key} open={mobileMoreOpen} onOpenChange={setMobileMoreOpen}>
                  <SheetTrigger asChild>
                    <button
                      aria-label="More sections"
                      aria-current={['goals', 'career', 'mindmap', 'flashcards', 'analytics', 'settings'].includes(view) ? 'page' : undefined}
                      className={cn(
                        'flex min-h-[56px] flex-col items-center justify-center gap-1 py-1.5 text-[10px] font-medium transition-colors',
                        ['goals', 'career', 'mindmap', 'flashcards', 'analytics', 'settings'].includes(view) ? 'text-primary' : 'text-muted-foreground'
                      )}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-6 [&>button]:hidden">
                    {/* title + close share one flex row → perfectly aligned */}
                    <SheetHeader className="flex-row items-center justify-between p-0 pb-2 pt-4">
                      <SheetTitle className="text-left">More</SheetTitle>
                      <SheetClose
                        aria-label="Close"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <FaXmark className="h-4.5 w-4.5" />
                      </SheetClose>
                    </SheetHeader>
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-3">
                        {MORE_ITEMS.map((item) => (
                          <button
                            key={item.key}
                            onClick={() => setView(item.key)}
                            className={cn(
                              'flex min-h-[76px] flex-col items-center justify-center gap-2 rounded-xl border bg-card p-3 text-xs font-medium transition-colors active:bg-muted',
                              view === item.key && 'border-primary/50 bg-sidebar-accent text-sidebar-accent-foreground'
                            )}
                          >
                            {item.icon}
                            {item.label}
                          </button>
                        ))}
                      </div>
                      {MOBILE_SUB_SECTIONS.map((section) => (
                        <div key={section.view} className="space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">{section.label}</p>
                          <div className={cn('grid gap-2', section.children.length > 2 ? 'grid-cols-3' : 'grid-cols-2')}>
                            {section.children.map((child) => {
                              const active = view === section.view && (section.view === 'career' ? careerTab === child.tab : newsTab === child.tab)
                              return (
                                <button
                                  key={child.tab}
                                  onClick={() => {
                                    if (section.view === 'career') setCareerTab(child.tab as 'pipeline' | 'discover' | 'scholarships')
                                    if (section.view === 'news') setNewsTab(child.tab as 'news' | 'papers')
                                    setView(section.view)
                                  }}
                                  className={cn(
                                    'flex min-h-[52px] items-center justify-center gap-1.5 rounded-xl border bg-card px-2 text-xs font-medium transition-colors active:bg-muted',
                                    active && 'border-primary/50 bg-sidebar-accent text-sidebar-accent-foreground'
                                  )}
                                >
                                  {child.icon}
                                  {child.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </SheetContent>
                </Sheet>
              ) : (
                <button
                  key={tab.key}
                  onClick={() => setView(tab.key as ViewKey)}
                  aria-current={view === tab.key ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[56px] flex-col items-center justify-center gap-1 py-1.5 text-[10px] font-medium transition-colors',
                    view === tab.key ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              )
            )}
          </div>
        </nav>

        {/* ── Mobile floating action stack ──
            Pomodoro pill (while minimized) on top, then mindmap (only
            while a book is open), the AI chat toggle, quick capture at
            the bottom — one shared column, so the pill can never cover
            the capture “+” */}
        <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-3 lg:hidden">
          <PomodoroPill />
          {readerDocId && <ReaderMindmapButton />}
          <ChatToggleButton />
          <button
            onClick={() => setCaptureOpen(true)}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95"
            aria-label="Quick capture"
          >
            <FaPlus className="h-6 w-6" />
          </button>
        </div>

        {/* ── Desktop floating action stack (same vertical order) — shifts
            left of the Copilot dock while it is open so all actions stay
            reachable; swaps to icon buttons to keep the column narrow.
            lg:flex (not xl:) so the pomodoro pill and quick capture also
            exist on laptop widths where the bottom tab bar is gone. */}
        <div
          className={cn(
            'fixed bottom-6 z-30 hidden flex-col items-end gap-3 transition-all duration-200 lg:flex',
            copilotOpen ? 'right-[400px]' : 'right-6'
          )}
        >
          <PomodoroPill />
          {readerDocId && <ReaderMindmapButton />}
          <ChatToggleButton />
          <button
            onClick={() => setCaptureOpen(true)}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95"
            aria-label="Quick capture"
            title="Quick capture"
          >
            <FaPlus className="h-5 w-5" />
          </button>
        </div>
      </div>
    </TooltipProvider>
  )
}

/* ── Floating-stack buttons (mobile + desktop share the same look) ──
   ReaderMindmapButton: only rendered while a book is open; asks the
   mounted reader (one-shot store flag) to open its "Add to mindmap"
   dialog. ChatToggleButton: book open → toggles the minimal reader
   popup (FaWandMagicSparkles ⇄ cross, same as the fullscreen overlay toggle);
   no book → opens the Cortex Copilot dock / sheet. */
function ReaderMindmapButton() {
  const setReaderMindmapOpen = useUI((s) => s.setReaderMindmapOpen)
  return (
    <button
      onClick={() => setReaderMindmapOpen(true)}
      className="flex h-12 w-12 items-center justify-center rounded-full border bg-card shadow-soft transition-transform active:scale-95 xl:hover:scale-105"
      aria-label="Create mindmap from this document"
      title="Create mindmap"
    >
      <FaShareNodes className="h-5 w-5 text-muted-foreground" />
    </button>
  )
}

function ChatToggleButton() {
  const readerDocId = useUI((s) => s.readerDocId)
  const readerChatOpen = useUI((s) => s.readerChatOpen)
  const setReaderChatOpen = useUI((s) => s.setReaderChatOpen)
  const setCopilotOpen = useUI((s) => s.setCopilotOpen)
  return (
    <button
      onClick={() => (readerDocId ? setReaderChatOpen(!readerChatOpen) : setCopilotOpen(true))}
      className={cn(
        'flex h-12 w-12 items-center justify-center rounded-full transition-transform active:scale-95 xl:hover:scale-105',
        readerDocId
          ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
          : 'border bg-card shadow-soft'
      )}
      aria-label={readerDocId ? (readerChatOpen ? 'Minimize AI chat' : 'Open AI chat') : 'Open AI Copilot'}
      title={readerDocId ? (readerChatOpen ? 'Minimize AI chat' : 'Ask AI about this book') : 'Open AI Copilot'}
    >
      {readerDocId && readerChatOpen ? (
        <FaXmark className="h-5 w-5" />
      ) : (
        <FaWandMagicSparkles className={cn('h-5 w-5', !readerDocId && 'text-muted-foreground')} />
      )}
    </button>
  )
}

function NotificationPanel({ data, failed, onRetry, onNavigate }: { data: DashboardData | null; failed?: boolean; onRetry?: () => void; onNavigate?: () => void }) {
  const setView = useUI((s) => s.setView)
  const go = (v: Parameters<typeof setView>[0]) => {
    setView(v)
    onNavigate?.()
  }
  if (failed) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Couldn&apos;t load notifications.</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>Try again</Button>
      </div>
    )
  }
  if (!data) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>
  const { deadlines, briefing, todayTasks, todayReminders } = data
  const reminders = todayReminders ?? []
  const nothing = deadlines.length === 0 && briefing.dueFlashcards === 0 && reminders.length === 0 && todayTasks.length === 0
  return (
    <div className="max-h-[420px] overflow-y-auto scroll-thin">
      <div className="border-b px-4 py-3 text-sm font-semibold">Notifications</div>
      {nothing && (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">All clear — nothing urgent.</div>
      )}
      {briefing.dueFlashcards > 0 && (
        <button onClick={() => go('flashcards')} className="flex w-full items-center gap-3 border-b px-4 py-3 text-left text-sm transition-colors hover:bg-muted">
          <FaLayerGroup className="h-4 w-4 shrink-0 text-primary" />
          <span><b>{briefing.dueFlashcards}</b> flashcards due for review</span>
        </button>
      )}
      {/* reminders for today — the same rows the 9 AM email carries */}
      {reminders.map((r) => (
        <button
          key={`rem-${r.id}`}
          onClick={() => go('plans')}
          className="flex w-full items-start gap-3 border-b px-4 py-3 text-left text-sm transition-colors last:border-0 hover:bg-muted"
        >
          <FaBell className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span className="min-w-0">
            <span className="block truncate font-medium">{r.title}</span>
            <span className="block text-xs text-muted-foreground">Reminder · {recurrenceLabel(r.recurrence, r.startDate)}</span>
          </span>
        </button>
      ))}
      {/* individual + plan tasks due today — mirrors the email's "Due today" */}
      {todayTasks.map((t) => (
        <button
          key={`task-${t.id}`}
          onClick={() => go('plans')}
          className="flex w-full items-start gap-3 border-b px-4 py-3 text-left text-sm transition-colors last:border-0 hover:bg-muted"
        >
          <FaClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block truncate font-medium">{t.title}</span>
            <span className="block text-xs text-muted-foreground">
              Due today{t.dueDate && hasTimePart(t.dueDate) ? ` · ${new Date(t.dueDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
              {t.plan?.title ? ` · ${t.plan.title}` : ''}
            </span>
          </span>
        </button>
      ))}
      {deadlines.map((d) => (
        <button
          key={d.kind + d.id}
          onClick={() => go(d.kind === 'opportunity' ? 'career' : d.kind === 'goal' ? 'goals' : 'plans')}
          className="flex w-full items-start gap-3 border-b px-4 py-3 text-left text-sm transition-colors last:border-0 hover:bg-muted"
        >
          <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', d.daysLeft < 0 ? 'bg-danger' : d.daysLeft <= 2 ? 'bg-warning' : 'bg-muted-foreground/40')} />
          <span className="min-w-0">
            <span className="block truncate font-medium">{d.title}</span>
            <span className={cn('text-xs', d.daysLeft < 0 ? 'font-medium text-danger' : 'text-muted-foreground')}>
              {d.daysLeft < 0 ? `${-d.daysLeft}d overdue` : d.daysLeft === 0 ? 'Due today' : `in ${d.daysLeft} days`}
              {d.subtitle ? ` · ${d.subtitle}` : ''}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

/* ── Sidebar nav dropdown (Career / News & Papers) ──
   The trigger no longer navigates — it opens a menu whose entries jump
   straight to the sub-page (Pipeline, Discover, Scholarships, News, Papers),
   so the user never has to open the view first and then pick a tab. */
function NavDropdown({ item, collapsed, active }: { item: (typeof NAV_ITEMS)[number]; collapsed: boolean; active: boolean }) {
  const setView = useUI((s) => s.setView)
  const setCareerTab = useUI((s) => s.setCareerTab)
  const setNewsTab = useUI((s) => s.setNewsTab)

  const openChild = (child: NavChild) => {
    if (item.key === 'career') setCareerTab(child.tab as 'pipeline' | 'discover' | 'scholarships')
    if (item.key === 'news') setNewsTab(child.tab as 'news' | 'papers')
    setView(item.key)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-current={active ? 'page' : undefined}
          aria-haspopup="menu"
          className={cn(
            'group relative flex min-h-[36px] w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-150 outline-none',
            collapsed && 'justify-center px-0',
            active
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          {active && (
            <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-primary" aria-hidden />
          )}
          <span className={cn(active && 'text-primary')}>{item.icon}</span>
          {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
          {!collapsed ? (
            <FaChevronDown className="h-3 w-3 shrink-0 opacity-50 transition-transform group-data-[state=open]:rotate-180" />
          ) : (
            <span className="sr-only">{item.label} menu</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={collapsed ? 'right' : 'bottom'} align={collapsed ? 'start' : 'start'} sideOffset={4} className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{item.label}</DropdownMenuLabel>
        {item.children?.map((child) => (
          <DropdownMenuItem key={child.tab} onSelect={() => openChild(child)} className="gap-2.5 text-[13px]">
            <span className="text-primary">{child.icon}</span>
            {child.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Sidebar sync row: offline/syncing stay functional; the resting
// ─── "All synced" slot becomes a plan-aware chip — Free users get a
// ─── centered Upgrade capsule, Pro users get a quiet gold "Pro" chip.
// ─── Gold (--chart-2) is the app-wide crown accent, so Pro reads as Pro
// ─── in the sidebar, the user chip and Settings alike ────────────────

function SidebarSyncRow({ collapsed, online, synced }: { collapsed: boolean; online: boolean; synced: boolean }) {
  const router = useRouter()
  // Shares the module-level cache with UserChip / Settings → Plan — one
  // fetch, consistent plan everywhere. data===null → unknown (still loading
  // or status endpoint unavailable) → keep the plain "All synced" indicator.
  const { data: billing } = useApi<{ pro?: boolean } | null>('/api/billing/status')
  const pro = billing?.pro === true
  const proKnown = billing != null

  const base = cn(
    'flex min-h-[32px] items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground',
    collapsed && 'justify-center px-0'
  )

  // Offline / syncing / unknown plan → the functional sync indicator
  if (!online || !synced || !proKnown) {
    return (
      <div className={base} aria-live="polite">
        {!online ? (
          <FaTriangleExclamation className="h-4 w-4 text-warning" aria-label="Offline" />
        ) : synced ? (
          <FaCircleCheck className="h-4 w-4 text-success" aria-label="Synced" />
        ) : (
          <FaSpinner className="h-4 w-4 animate-pulse text-warning" aria-label="Syncing" />
        )}
        {!collapsed && <span>{!online ? 'Offline mode' : synced ? 'All synced' : 'Syncing…'}</span>}
      </div>
    )
  }

  if (pro) {
    // Pro: ONE gold capsule — crown + "Pro" as a single centered chip,
    // sized to sit quietly between Dark mode and the user chip.
    return (
      <div className="flex justify-center">
        <button
          onClick={() => router.push('/pricing')}
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-full border border-chart-2/35 bg-chart-2/10 font-semibold uppercase tracking-[0.1em] text-chart-2 transition-colors hover:bg-chart-2/20',
            collapsed ? 'h-8 w-8' : 'min-h-[30px] px-3.5 py-1 text-[11px]'
          )}
          title="Cortex Pro is active"
          aria-label="Cortex Pro is active"
        >
          <FaCrown className={cn('shrink-0', collapsed ? 'h-3.5 w-3.5' : 'h-3 w-3')} aria-hidden />
          {!collapsed && 'Pro'}
        </button>
      </div>
    )
  }

  // Free: the resting slot becomes a centered Upgrade capsule
  return (
    <div className="flex justify-center">
      <button
        onClick={() => router.push('/pricing')}
        className={cn(
          'flex items-center justify-center gap-1.5 rounded-full bg-primary font-semibold text-primary-foreground shadow-sm transition-all duration-150 hover:shadow-md active:scale-[0.97]',
          collapsed ? 'h-8 w-8' : 'min-h-[30px] px-3.5 py-1 text-[11.5px]'
        )}
        title="Upgrade to Cortex Pro"
        aria-label="Upgrade to Cortex Pro"
      >
        <FaCrown className={cn('shrink-0', collapsed ? 'h-3.5 w-3.5' : 'h-3 w-3')} aria-hidden />
        {!collapsed && 'Upgrade'}
      </button>
    </div>
  )
}

function UserChip({ collapsed }: { collapsed: boolean }) {
  const router = useRouter()
  const setView = useUI((s) => s.setView)
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)
  const [busy, setBusy] = useState(false)
  // Shares the module-level cache with Settings → Plan — one fetch, consistent
  // badge everywhere. Only a TRUE pro flag renders the crown (an in-flight or
  // failed status check never badges a paying user down, it just hides it).
  const { data: billing } = useApi<{ pro?: boolean } | null>('/api/billing/status')
  const pro = billing?.pro === true

  useEffect(() => {
    let cancelled = false
    api.get<{ user: { name: string; email: string } }>('/api/auth/me')
      .then((d) => {
        if (!cancelled) setUser(d.user)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function signOut(e: React.MouseEvent) {
    e.stopPropagation()
    setBusy(true)
    try {
      await api.post('/api/auth/logout', {})
      // forget where this user left off (view, open book, scroll positions)
      try {
        useUI.persist.clearStorage()
        for (const store of [sessionStorage, localStorage]) {
          Object.keys(store)
            .filter((k) => k.startsWith('cortex-scroll:') || k.startsWith('cortex-reader-page:'))
            .forEach((k) => store.removeItem(k))
        }
      } catch { /* storage unavailable */ }
      router.replace('/login')
      router.refresh()
    } catch {
      setBusy(false)
    }
  }

  if (!user) return null
  const initial = user.name.charAt(0).toUpperCase()

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setView('settings')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setView('settings')
        }
      }}
      className={cn(
        'group mt-1 flex cursor-pointer items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2 transition-colors hover:bg-muted',
        collapsed && 'justify-center border-transparent bg-transparent px-0 hover:bg-transparent',
      )}
      title={collapsed ? `${user.name} — sign out` : undefined}
    >
      <span className={cn('relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground')} aria-hidden>
        {initial}
        {collapsed && pro && (
          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-background bg-primary text-primary-foreground" title="Cortex Pro">
            <FaCrown className="h-2 w-2" />
          </span>
        )}
      </span>
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-xs font-semibold">{user.name}</span>
              {pro && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-chart-2/35 bg-chart-2/10 px-1.5 py-px font-mono text-[8.5px] font-semibold uppercase tracking-[0.12em] text-chart-2" title="Cortex Pro">
                  <FaCrown className="h-2 w-2" /> Pro
                </span>
              )}
            </span>
            <span className="block truncate text-[10px] text-muted-foreground">{user.email}</span>
          </span>
          <button
            onClick={signOut}
            disabled={busy}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
            aria-label="Sign out"
          >
            {busy ? <FaSpinner className="h-3.5 w-3.5 animate-spin" /> : <FaRightFromBracket className="h-3.5 w-3.5" />}
          </button>
        </>
      )}
    </div>
  )
}
