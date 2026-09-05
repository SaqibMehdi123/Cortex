'use client'

import { LayoutDashboard, Library, CalendarRange, Target, Radar, Briefcase, Share2, Layers, ChartLine, Settings } from 'lucide-react'
import type { ReactNode } from 'react'

export { useUI } from './store'

export type ViewKey =
  | 'dashboard'
  | 'library'
  | 'plans'
  | 'goals'
  | 'news'
  | 'career'
  | 'mindmap'
  | 'flashcards'
  | 'analytics'
  | 'settings'

export const NAV_ITEMS: {
  key: ViewKey
  label: string
  short: string
  icon: ReactNode
  group: 'workspace' | 'intelligence' | 'system'
}[] = [
  { key: 'dashboard', label: 'Dashboard', short: 'Home', icon: <LayoutDashboard className="h-4 w-4" />, group: 'workspace' },
  { key: 'library', label: 'Library', short: 'Read', icon: <Library className="h-4 w-4" />, group: 'workspace' },
  { key: 'plans', label: 'Plans', short: 'Plan', icon: <CalendarRange className="h-4 w-4" />, group: 'workspace' },
  { key: 'goals', label: 'Goals', short: 'Goals', icon: <Target className="h-4 w-4" />, group: 'workspace' },
  { key: 'news', label: 'News & Papers', short: 'Radar', icon: <Radar className="h-4 w-4" />, group: 'intelligence' },
  { key: 'career', label: 'Career', short: 'Career', icon: <Briefcase className="h-4 w-4" />, group: 'intelligence' },
  { key: 'mindmap', label: 'Mindmaps', short: 'Maps', icon: <Share2 className="h-4 w-4" />, group: 'intelligence' },
  { key: 'flashcards', label: 'Flashcards', short: 'Cards', icon: <Layers className="h-4 w-4" />, group: 'intelligence' },
  { key: 'analytics', label: 'Analytics', short: 'Stats', icon: <ChartLine className="h-4 w-4" />, group: 'intelligence' },
  { key: 'settings', label: 'Settings', short: 'More', icon: <Settings className="h-4 w-4" />, group: 'system' },
]

export const NAV_GROUP_LABELS: Record<string, string> = {
  workspace: 'Workspace',
  intelligence: 'Intelligence',
  system: 'System',
}

// Mobile bottom tab bar: Home, Read, Plan, Radar, More
export const MOBILE_TABS: { key: ViewKey | 'more'; label: string; icon: ReactNode }[] = [
  { key: 'dashboard', label: 'Home', icon: <LayoutDashboard className="h-5 w-5" /> },
  { key: 'library', label: 'Read', icon: <Library className="h-5 w-5" /> },
  { key: 'plans', label: 'Plan', icon: <CalendarRange className="h-5 w-5" /> },
  { key: 'news', label: 'Radar', icon: <Radar className="h-5 w-5" /> },
  { key: 'more', label: 'More', icon: <Layers className="h-5 w-5" /> },
]

export const VIEW_TITLES: Record<ViewKey, string> = {
  dashboard: 'Today',
  library: 'Library',
  plans: 'Plans',
  goals: 'Goals',
  news: 'News & Papers',
  career: 'Career',
  mindmap: 'Mindmaps',
  flashcards: 'Flashcards',
  analytics: 'Analytics',
  settings: 'Settings',
}
