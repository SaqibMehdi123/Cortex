'use client'

import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  BookOpen,
  Target,
  Newspaper,
  MailCheck,
  Share2,
  NotebookPen,
} from 'lucide-react'

export type ViewKey = 'dashboard' | 'library' | 'goals' | 'news' | 'opportunities' | 'mindmap'

export const NAV_ITEMS: {
  key: ViewKey
  label: string
  short: string
  icon: React.ReactNode
}[] = [
  { key: 'dashboard', label: 'Dashboard', short: 'Home', icon: <LayoutDashboard className="h-4 w-4" /> },
  { key: 'library', label: 'Reading Library', short: 'Library', icon: <BookOpen className="h-4 w-4" /> },
  { key: 'goals', label: 'Goals & Plans', short: 'Plans', icon: <Target className="h-4 w-4" /> },
  { key: 'news', label: 'AI News', short: 'News', icon: <Newspaper className="h-4 w-4" /> },
  { key: 'opportunities', label: 'Opportunities', short: 'Jobs', icon: <MailCheck className="h-4 w-4" /> },
  { key: 'mindmap', label: 'Mindmaps', short: 'Maps', icon: <Share2 className="h-4 w-4" /> },
]

export function AppShell({
  current,
  onNavigate,
  children,
}: {
  current: ViewKey
  onNavigate: (v: ViewKey) => void
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-muted/40">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-background lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <NotebookPen className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Second Brain</p>
            <p className="text-xs text-muted-foreground">Personal knowledge hub</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              aria-current={current === item.key ? 'page' : undefined}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                'min-h-[44px] hover:bg-muted',
                current === item.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground'
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="border-t px-5 py-4">
          <p className="text-xs text-muted-foreground">
            One place for your reading, plans, news and career — synced across devices.
          </p>
        </div>
      </aside>

      {/* Mobile top header */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <NotebookPen className="h-4 w-4" />
        </div>
        <p className="text-sm font-semibold">Second Brain</p>
      </header>

      {/* Main content */}
      <main className="px-4 pb-24 pt-4 sm:px-6 lg:ml-60 lg:px-8 lg:pb-10 lg:pt-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden"
        aria-label="Bottom navigation"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-6">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              aria-current={current === item.key ? 'page' : undefined}
              className={cn(
                'flex min-h-[56px] flex-col items-center justify-center gap-1 py-1.5 text-[10px] font-medium transition-colors',
                current === item.key ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              {item.icon}
              {item.short}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
