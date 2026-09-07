'use client'

import { cn } from '@/lib/utils'
import { useUI, type ViewKey, NAV_ITEMS, MOBILE_TABS, NAV_GROUP_LABELS } from '@/lib/nav-config'
import { PanelLeftClose, PanelLeftOpen, Search, Sparkles, Plus, Bell, WifiOff, CheckCircle2, Loader2, Zap, Target, Share2, Layers, ChartLine, Settings, LogOut, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { api } from '@/lib/client'
import type { DashboardData } from '@/lib/types'
import { CortexMark } from '@/components/logo'
import {
  Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
  Popover, PopoverContent, PopoverTrigger,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui'

const MORE_ITEMS: { key: ViewKey; label: string; icon: React.ReactNode }[] = [
  { key: 'goals', label: 'Goals', icon: <Target className="h-5 w-5" /> },
  { key: 'career', label: 'Career', icon: <Zap className="h-5 w-5" /> },
  { key: 'mindmap', label: 'Mindmaps', icon: <Share2 className="h-5 w-5" /> },
  { key: 'flashcards', label: 'Flashcards', icon: <Layers className="h-5 w-5" /> },
  { key: 'analytics', label: 'Analytics', icon: <ChartLine className="h-5 w-5" /> },
  { key: 'settings', label: 'Settings', icon: <Settings className="h-5 w-5" /> },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const view = useUI((s) => s.view)
  const setView = useUI((s) => s.setView)
  const sidebarCollapsed = useUI((s) => s.sidebarCollapsed)
  const toggleSidebar = useUI((s) => s.toggleSidebar)
  const setCommandOpen = useUI((s) => s.setCommandOpen)
  const setCaptureOpen = useUI((s) => s.setCaptureOpen)
  const setCopilotOpen = useUI((s) => s.setCopilotOpen)
  const copilotOpen = useUI((s) => s.copilotOpen)
  const mobileMoreOpen = useUI((s) => s.mobileMoreOpen)
  const setMobileMoreOpen = useUI((s) => s.setMobileMoreOpen)
  const { resolvedTheme, setTheme } = useTheme()
  const [online, setOnline] = useState(true)
  const [synced, setSynced] = useState(true)
  const [notifData, setNotifData] = useState<DashboardData | null>(null)

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

  useEffect(() => {
    let cancelled = false
    api.get<DashboardData>('/api/dashboard').then((d) => {
      if (!cancelled) setNotifData(d)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [view])

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
  const notifCount = dueFlashcards + urgentDeadlines
  const collapsed = sidebarCollapsed

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-background">
        {/* Offline banner */}
        {!online && (
          <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-warning py-1.5 text-xs font-medium text-white">
            <WifiOff className="h-3.5 w-3.5" /> Offline — changes will sync when you reconnect
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
              <Search className="h-3.5 w-3.5 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Search…</span>
                  <kbd className="rounded border bg-muted px-1 py-0.5 text-[10px] font-medium">⌘K</kbd>
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
                  {items.map((item) => (
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
                  ))}
                </div>
              )
            })}
          </nav>

          <div className="space-y-1 border-t px-2 py-3">
            <Popover>
              <PopoverTrigger asChild>
                <button aria-label="Notifications" className={cn('relative flex min-h-[36px] w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', collapsed && 'justify-center px-0')}>
                  <Bell className="h-4 w-4" />
                  {!collapsed && 'Notifications'}
                  {notifCount > 0 && (
                    <span className={cn('absolute top-1.5 rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-white', collapsed ? 'right-1' : 'right-2')}>
                      {notifCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent side="right" align="start" className="w-80 p-0">
                <NotificationPanel data={notifData} />
              </PopoverContent>
            </Popover>

            {/* Collapse + dark mode — under Notifications, before sync */}
            <button
              onClick={toggleSidebar}
              className={cn('flex min-h-[36px] w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', collapsed && 'justify-center px-0')}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              {!collapsed && 'Collapse'}
            </button>

            <button
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className={cn('flex min-h-[36px] w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', collapsed && 'justify-center px-0')}
              aria-label="Toggle dark mode"
            >
              {/* CSS-only swap: no hydration mismatch (next-themes sets .dark on <html>) */}
              <Sun className="hidden h-4 w-4 dark:block" />
              <Moon className="h-4 w-4 dark:hidden" />
              {!collapsed && (
                <>
                  <span className="hidden dark:inline">Light mode</span>
                  <span className="dark:hidden">Dark mode</span>
                </>
              )}
            </button>

            <div className={cn('flex min-h-[32px] items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground', collapsed && 'justify-center px-0')} aria-live="polite">
              {!online ? (
                <WifiOff className="h-4 w-4 text-warning" aria-label="Offline" />
              ) : synced ? (
                <CheckCircle2 className="h-4 w-4 text-success" aria-label="Synced" />
              ) : (
                <Loader2 className="h-4 w-4 animate-pulse text-warning" aria-label="Syncing" />
              )}
              {!collapsed && <span>{!online ? 'Offline mode' : synced ? 'All synced' : 'Syncing…'}</span>}
            </div>

            <UserChip collapsed={collapsed} />
          </div>
        </aside>

        {/* ── Main content ── */}
        <main
          className={cn(
            'px-4 pb-28 pt-16 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8 transition-[margin,padding] duration-200',
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
          {!online && <WifiOff className="h-4 w-4 text-warning" aria-label="Offline" />}
          <button
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Toggle dark mode"
          >
            <Sun className="hidden h-4 w-4 dark:block" />
            <Moon className="h-4 w-4 dark:hidden" />
          </button>
          <button
            onClick={() => setCommandOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-lg border bg-muted px-2.5 text-xs text-muted-foreground"
            aria-label="Search"
          >
            <Search className="h-3.5 w-3.5" /> Search
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
                        <X className="h-4.5 w-4.5" />
                      </SheetClose>
                    </SheetHeader>
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

        {/* ── Mobile FABs ── */}
        <div className="fixed bottom-20 right-4 z-40 flex flex-col gap-3 lg:hidden">
          <button
            onClick={() => setCopilotOpen(true)}
            className="flex h-12 w-12 items-center justify-center rounded-full border bg-card shadow-soft transition-transform active:scale-95"
            aria-label="Open AI Copilot"
          >
            <Sparkles className="h-5 w-5 text-muted-foreground" />
          </button>
          <button
            onClick={() => setCaptureOpen(true)}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95"
            aria-label="Quick capture"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>

        {/* ── Desktop quick capture ── */}
        <button
          onClick={() => setCaptureOpen(true)}
          className={cn(
            'fixed bottom-6 z-30 hidden h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:shadow-xl active:scale-95 xl:flex',
            copilotOpen ? 'right-[400px]' : 'right-[88px]'
          )}
        >
          <Plus className="h-4 w-4" /> Quick capture
        </button>
      </div>
    </TooltipProvider>
  )
}

function NotificationPanel({ data }: { data: DashboardData | null }) {
  const setView = useUI((s) => s.setView)
  if (!data) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>
  const { deadlines, briefing } = data
  return (
    <div className="max-h-[420px] overflow-y-auto scroll-thin">
      <div className="border-b px-4 py-3 text-sm font-semibold">Notifications</div>
      {briefing.dueFlashcards > 0 && (
        <button onClick={() => setView('flashcards')} className="flex w-full items-center gap-3 border-b px-4 py-3 text-left text-sm transition-colors hover:bg-muted">
          <Layers className="h-4 w-4 shrink-0 text-primary" />
          <span><b>{briefing.dueFlashcards}</b> flashcards due for review</span>
        </button>
      )}
      {deadlines.length === 0 && briefing.dueFlashcards === 0 && (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">All clear — nothing urgent.</div>
      )}
      {deadlines.map((d) => (
        <button
          key={d.kind + d.id}
          onClick={() => setView(d.kind === 'opportunity' ? 'career' : d.kind === 'goal' ? 'goals' : 'plans')}
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

// ─── Signed-in account chip (sidebar bottom) ─────────────────────────

function UserChip({ collapsed }: { collapsed: boolean }) {
  const router = useRouter()
  const setView = useUI((s) => s.setView)
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)
  const [busy, setBusy] = useState(false)

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
      onKeyDown={(e) => e.key === 'Enter' && setView('settings')}
      className={cn(
        'group mt-1 flex cursor-pointer items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2 transition-colors hover:bg-muted',
        collapsed && 'justify-center border-transparent bg-transparent px-0 hover:bg-transparent',
      )}
      title={collapsed ? `${user.name} — sign out` : undefined}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" aria-hidden>
        {initial}
      </span>
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">{user.name}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{user.email}</span>
          </span>
          <button
            onClick={signOut}
            disabled={busy}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
            aria-label="Sign out"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
          </button>
        </>
      )}
    </div>
  )
}
