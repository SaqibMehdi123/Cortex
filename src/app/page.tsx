'use client'

import { useState } from 'react'
import { AppShell, ViewKey } from '@/components/app-shell'
import { DashboardView } from '@/components/views/dashboard'
import { LibraryView } from '@/components/views/library'
import { GoalsView } from '@/components/views/goals'
import { NewsView } from '@/components/views/news'
import { OpportunitiesView } from '@/components/views/opportunities'
import { MindmapView } from '@/components/views/mindmap'

export default function Home() {
  const [view, setView] = useState<ViewKey>('dashboard')

  function navigate(v: ViewKey) {
    setView(v)
    window.scrollTo({ top: 0 })
  }

  return (
    <AppShell current={view} onNavigate={navigate}>
      {view === 'dashboard' && <DashboardView onNavigate={navigate} />}
      {view === 'library' && <LibraryView />}
      {view === 'goals' && <GoalsView />}
      {view === 'news' && <NewsView />}
      {view === 'opportunities' && <OpportunitiesView />}
      {view === 'mindmap' && <MindmapView />}
    </AppShell>
  )
}
