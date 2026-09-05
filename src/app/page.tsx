'use client'

import { AppShell } from '@/components/app-shell'
import { CommandBar } from '@/components/command-bar'
import { CopilotDock } from '@/components/copilot-dock'
import { QuickCapture } from '@/components/quick-capture'
import { FocusTimer } from '@/components/focus-timer'
import { Reader } from '@/components/views/reader'
import { DashboardView } from '@/components/views/dashboard'
import { LibraryView } from '@/components/views/library'
import { PlansView } from '@/components/views/plans'
import { GoalsView } from '@/components/views/goals'
import { NewsView } from '@/components/views/news'
import { CareerView } from '@/components/views/career'
import { MindmapView } from '@/components/views/mindmap'
import { FlashcardsView } from '@/components/views/flashcards'
import { AnalyticsView } from '@/components/views/analytics'
import { SettingsView } from '@/components/views/settings'
import { useUI } from '@/lib/nav-config'

export default function Home() {
  const view = useUI((s) => s.view)
  const readerDocId = useUI((s) => s.readerDocId)

  return (
    <>
      <AppShell>
        {view === 'dashboard' && <DashboardView />}
        {view === 'library' && <LibraryView />}
        {view === 'plans' && <PlansView />}
        {view === 'goals' && <GoalsView />}
        {view === 'news' && <NewsView />}
        {view === 'career' && <CareerView />}
        {view === 'mindmap' && <MindmapView />}
        {view === 'flashcards' && <FlashcardsView />}
        {view === 'analytics' && <AnalyticsView />}
        {view === 'settings' && <SettingsView />}
      </AppShell>

      {/* Overlays */}
      {readerDocId && <Reader />}
      <CopilotDock />
      <QuickCapture />
      <FocusTimer />
      <CommandBar />
    </>
  )
}
