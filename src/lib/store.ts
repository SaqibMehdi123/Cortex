'use client'

import { create } from 'zustand'
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

export const useUI = create<UIState>((set) => ({
  view: 'dashboard',
  readerDocId: null,
  copilotOpen: false,
  captureOpen: false,
  captureType: 'note',
  commandOpen: false,
  sidebarCollapsed: false,
  mobileMoreOpen: false,
  focusTask: null,
  setView: (v) => set({ view: v, mobileMoreOpen: false, readerDocId: null }),
  openReader: (docId) => set({ readerDocId: docId }),
  closeReader: () => set({ readerDocId: null }),
  setCopilotOpen: (open) => set({ copilotOpen: open }),
  setCaptureOpen: (open, type) => set({ captureOpen: open, captureType: type ?? 'note' }),
  setCommandOpen: (open) => set({ commandOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setMobileMoreOpen: (open) => set({ mobileMoreOpen: open }),
  setFocusTask: (t) => set({ focusTask: t }),
}))
