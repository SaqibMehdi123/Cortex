'use client'

import { useEffect } from 'react'
import { AppShell } from '@/components/app-shell'
import { CommandBar } from '@/components/command-bar'
import { CopilotDock } from '@/components/copilot-dock'
import { QuickCapture } from '@/components/quick-capture'
import { FocusTimer } from '@/components/focus-timer'
import { ReaderView } from '@/components/views/reader'
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
import { useUI, NAV_ITEMS } from '@/lib/nav-config'
import { useViewScroll } from '@/hooks/use-view-scroll'
import { useToast } from '@/hooks/use-toast'
import { clearApiCache } from '@/lib/client'

export default function Home() {
  const view = useUI((s) => s.view)
  const readerDocId = useUI((s) => s.readerDocId)
  const hydrated = useUI((s) => s.hydrated)
  const { toast } = useToast()

  // Reload / revisit → reopen the same section (and the same book if one was
  // open). Manual rehydration keeps the SSR markup identical to the first
  // client render, so it runs in an effect after hydration.
  useEffect(() => {
    // zustand's rehydrate() returns a thenable without .catch/.finally —
    // route it through a real promise first
    Promise.resolve()
      .then(() => useUI.persist.rehydrate())
      .catch(() => {})
      .finally(() => {
        const v = useUI.getState().view
        // guard against a stale/unknown view key from an older build
        if (!NAV_ITEMS.some((n) => n.key === v)) useUI.setState({ view: 'dashboard' })
        useUI.setState({ hydrated: true })
      })
  }, [])

  // Landing back from a payment provider's hosted checkout (success_url is
  // set at checkout time). Without this the query param was simply ignored —
  // the buyer landed on their last-viewed section with no confirmation at
  // all, and a cached plan status kept saying "Free" until a full reload.
  useEffect(() => {
    const billing = new URLSearchParams(window.location.search).get('billing')
    if (!billing) return
    // the param has served its purpose — keep the URL clean on refresh
    window.history.replaceState({}, '', window.location.pathname)
    if (billing === 'success') {
      // the webhook flips the plan server-side; drop the cached "Free" so
      // Settings → Plan reflects the purchase on the very next look
      clearApiCache('/api/billing/status')
      toast({
        title: 'Payment received — welcome to Pro',
        description: 'Your plan is being activated right now. Open Settings → Plan in a moment to confirm.',
      })
    } else if (billing === 'test') {
      toast({
        title: 'Test checkout complete — no payment was taken',
        description: 'BILLING_TEST_MODE is still enabled on this deployment. Remove it in Vercel and redeploy to take real payments.',
      })
    } else if (billing === 'canceled') {
      toast({ title: 'Checkout canceled', description: 'You were not charged — no plan changes were made.' })
    }
  }, [toast])

  // Keep + restore each view's scroll position across reloads and tab switches
  useViewScroll(readerDocId ? `reader:${readerDocId}` : `view:${view}`)

  return (
    <>
      <AppShell>
        {/* Reader is a section of the app (not a full-window overlay):
            the sidebar and site chrome stay visible around it. */}
        {readerDocId ? (
          <ReaderView />
        ) : !hydrated ? (
          // one quiet frame while the persisted view restores — avoids
          // flashing the dashboard when the user was somewhere else
          <div className="flex min-h-[50vh] items-center justify-center">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" aria-label="Loading" />
          </div>
        ) : (
          <>
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
          </>
        )}
      </AppShell>

      {/* Overlays */}
      <CopilotDock />
      <QuickCapture />
      <FocusTimer />
      <CommandBar />
    </>
  )
}
