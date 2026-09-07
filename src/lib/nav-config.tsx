'use client'

import { FaBook, FaBriefcase, FaBullseye, FaCalendarWeek, FaChartLine, FaGaugeHigh, FaGear, FaLayerGroup, FaShareNodes, FaTowerBroadcast } from 'react-icons/fa6'
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
  { key: 'dashboard', label: 'Dashboard', short: 'Home', icon: <FaGaugeHigh className="h-4 w-4" />, group: 'workspace' },
  { key: 'library', label: 'Library', short: 'Read', icon: <FaBook className="h-4 w-4" />, group: 'workspace' },
  { key: 'plans', label: 'Plans', short: 'Plan', icon: <FaCalendarWeek className="h-4 w-4" />, group: 'workspace' },
  { key: 'goals', label: 'Goals', short: 'Goals', icon: <FaBullseye className="h-4 w-4" />, group: 'workspace' },
  { key: 'news', label: 'News & Papers', short: 'Radar', icon: <FaTowerBroadcast className="h-4 w-4" />, group: 'intelligence' },
  { key: 'career', label: 'Career', short: 'Career', icon: <FaBriefcase className="h-4 w-4" />, group: 'intelligence' },
  { key: 'mindmap', label: 'Mindmaps', short: 'Maps', icon: <FaShareNodes className="h-4 w-4" />, group: 'intelligence' },
  { key: 'flashcards', label: 'Flashcards', short: 'Cards', icon: <FaLayerGroup className="h-4 w-4" />, group: 'intelligence' },
  { key: 'analytics', label: 'Analytics', short: 'Stats', icon: <FaChartLine className="h-4 w-4" />, group: 'intelligence' },
  { key: 'settings', label: 'Settings', short: 'More', icon: <FaGear className="h-4 w-4" />, group: 'system' },
]

export const NAV_GROUP_LABELS: Record<string, string> = {
  workspace: 'Workspace',
  intelligence: 'Intelligence',
  system: 'System',
}

// Mobile bottom tab bar: Home, Read, Plan, FaTowerBroadcast, More
export const MOBILE_TABS: { key: ViewKey | 'more'; label: string; icon: ReactNode }[] = [
  { key: 'dashboard', label: 'Home', icon: <FaGaugeHigh className="h-5 w-5" /> },
  { key: 'library', label: 'Read', icon: <FaBook className="h-5 w-5" /> },
  { key: 'plans', label: 'Plan', icon: <FaCalendarWeek className="h-5 w-5" /> },
  { key: 'news', label: 'Radar', icon: <FaTowerBroadcast className="h-5 w-5" /> },
  { key: 'more', label: 'More', icon: <FaLayerGroup className="h-5 w-5" /> },
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
