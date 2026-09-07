'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ViewKey } from './nav-config'

interface UIState {
  view: ViewKey
  readerDocId: string | null
  copilotOpen: boolean
  captureOpen: boolean
  captureType: 'note' | 'voice' | 'url' | 'task'
  commandOpen: boolean
  sidebarCollapsed: boolean
  mobileMoreOpen: boolean
  focusTask: { id: string; title: string; goalId?: string | null } | null
  /** true once the persisted slice (view / readerDocId) has been restored on this tab */
  hydrated: boolean
  setView: (v: ViewKey) => void
  openReader: (docId: string) => void
  closeReader: () => void
  setCopilotOpen: (open: boolean) => void
  setCaptureOpen: (open: boolean, type?: 'note' | 'voice' | 'url' | 'task') => void
  setCommandOpen: (open: boolean) => void
  toggleSidebar: () => void
  setMobileMoreOpen: (open: boolean) => void
  setFocusTask: (t: { id: string; title: string; goalId?: string | null } | null) => void
}

// `view` + `readerDocId` + sidebarCollapsed survive a reload so the workspace
// reopens exactly where the user left it (same section, same open book).
// Transient overlays (copilot, capture, command bar, mobile sheet…) stay
// session-only. Rehydration is manual (skipHydration) so SSR markup always
// matches the first client render — page.tsx triggers it in an effect.
export const useUI = create<UIState>()(
  persist(
    (set) => ({
      view: 'dashboard',
      readerDocId: null,
      copilotOpen: false,
      captureOpen: false,
      captureType: 'note',
      commandOpen: false,
      sidebarCollapsed: false,
      mobileMoreOpen: false,
      focusTask: null,
      hydrated: false,
      setView: (v) => set({ view: v, mobileMoreOpen: false, readerDocId: null }),
      openReader: (docId) => set({ readerDocId: docId }),
      closeReader: () => set({ readerDocId: null }),
      setCopilotOpen: (open) => set({ copilotOpen: open }),
      setCaptureOpen: (open, type) => set({ captureOpen: open, captureType: type ?? 'note' }),
      setCommandOpen: (open) => set({ commandOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileMoreOpen: (open) => set({ mobileMoreOpen: open }),
      setFocusTask: (t) => set({ focusTask: t }),
    }),
    {
      name: 'cortex-ui',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        view: s.view,
        readerDocId: s.readerDocId,
        sidebarCollapsed: s.sidebarCollapsed,
      }),
    }
  )
)
