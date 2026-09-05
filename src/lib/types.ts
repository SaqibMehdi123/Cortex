// ─── Shared types (Cortex v2) ───────────────────────────────────────

export interface DocumentItem {
  id: string
  title: string
  author: string | null
  type: string
  source: string | null
  notes: string | null
  content: string | null
  status: string // queued | reading | finished | paused
  progress: number
  tags: string | null
  summary: string | null
  takeaways: string | null
  lastReadAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Highlight {
  id: string
  documentId: string
  text: string
  color: string // yellow | green | blue | pink
  note: string | null
  position: number
  createdAt: string
}

export interface Citation {
  n: number
  label: string
  documentId?: string | null
  url?: string | null
}

export interface ChatMessage {
  id: string
  documentId: string | null
  role: 'user' | 'assistant'
  content: string
  citations: Citation[] | null
  createdAt: string
}

export interface Note {
  id: string
  title: string | null
  content: string
  source: string // typed | voice | url | capture
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  title: string
  status: string // todo | doing | done
  priority: string // low | med | high
  dueDate: string | null
  estimate: number
  focusMinutes: number
  order: number
  milestoneId: string | null
  goalId: string | null
  planId: string | null
  goal?: GoalLite | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Milestone {
  id: string
  goalId: string
  title: string
  done: boolean
  dueDate: string | null
  order: number
  completedAt: string | null
  tasks?: Task[]
}

export interface GoalLite {
  id: string
  title: string
  color: string
}

export interface Goal {
  id: string
  title: string
  description: string | null
  category: string
  deadline: string | null
  status: string // active | completed | paused
  color: string
  streak: number
  lastCompletedAt: string | null
  completedAt: string | null
  milestones: Milestone[]
  velocity?: number[] // milestones completed per week (last 8)
}

export interface Plan {
  id: string
  timeframe: 'year' | 'month' | 'week' | 'day'
  title: string
  notes: string | null
  startDate: string | null
  endDate: string | null
  done: boolean
  goalId: string | null
  goal: GoalLite | null
  parentId: string | null
  children?: Plan[]
  tasks: Task[]
}

export interface NewsArticle {
  id: string
  title: string
  source: string | null
  url: string
  summary: string | null
  category: string
  publishedAt: string | null
  read: boolean
  saved: boolean
}

export interface CustomSource {
  id: string
  name: string
  url: string
  type: string
  enabled: boolean
}

export interface Opportunity {
  id: string
  company: string
  role: string
  type: string
  classification: string // opportunity | rejection | interview | offer | deadline
  sender: string | null
  source: string | null
  url: string | null
  status: string // saved | applied | interview | offer | rejected | archived
  deadline: string | null
  nextAction: string | null
  resume: string | null
  notes: string | null
}

export interface MindmapNode {
  id: string
  label: string
  x: number
  y: number
  parentId: string | null
  color?: string
  linkType?: string | null // document | task | goal | url | null
  linkId?: string | null
  linkUrl?: string | null
}

export interface Mindmap {
  id: string
  title: string
  goalId: string | null
  goal: GoalLite | null
  nodes: MindmapNode[]
}

export interface Flashcard {
  id: string
  front: string
  back: string
  documentId: string | null
  document?: { id: string; title: string } | null
  highlightId: string | null
  ease: number
  interval: number
  repetitions: number
  lapses: number
  dueAt: string
  lastReviewedAt: string | null
}

export interface ReadingSessionItem {
  id: string
  documentId: string
  minutes: number
  day: string
}

export interface FocusSessionItem {
  id: string
  taskId: string | null
  goalId: string | null
  minutes: number
  startedAt: string
}

export interface DashboardData {
  greetingName: string
  todayTasks: Task[]
  todayPlans: Plan[]
  goals: {
    id: string
    title: string
    category: string
    color: string
    deadline: string | null
    progress: number
    milestonesDone: number
    milestonesTotal: number
    streak: number
    nextMilestone: string | null
  }[]
  newsDigest: NewsArticle[]
  deadlines: {
    id: string
    kind: 'task' | 'opportunity' | 'goal'
    title: string
    subtitle: string | null
    date: string
    daysLeft: number
  }[]
  briefing: {
    dueFlashcards: number
    nextBestTask: Task | null
    atRiskGoals: { id: string; title: string; reason: string }[]
    focusMinutesToday: number
    readMinutesToday: number
    unreadNews: number
    tasksDoneToday: number
    tasksTotalToday: number
    streakBest: number
  }
  continueReading: DocumentItem[]
}

export interface AnalyticsData {
  range: 'week' | 'month'
  days: {
    day: string
    readingMinutes: number
    tasksCompleted: number
    focusMinutes: number
  }[]
  velocity: { week: string; completed: number }[]
  totals: {
    readingMinutes: number
    tasksCompleted: number
    focusMinutes: number
    flashcardsReviewed: number
    activeGoals: number
    docsFinished: number
  }
}

export interface SearchResults {
  documents: { id: string; title: string; status: string }[]
  notes: { id: string; title: string | null; content: string }[]
  tasks: { id: string; title: string; status: string; dueDate: string | null }[]
  goals: { id: string; title: string; color: string }[]
  plans: { id: string; title: string; timeframe: string }[]
  news: { id: string; title: string; url: string }[]
  opportunities: { id: string; company: string; role: string; status: string }[]
}
