// ─── Shared types ───────────────────────────────────────────────────

export interface DocumentItem {
  id: string
  title: string
  author: string | null
  type: string
  source: string | null
  notes: string | null
  content: string | null
  status: string // to-read | reading | finished | paused
  progress: number
  tags: string | null
  createdAt: string
  updatedAt: string
}

export interface ChatMessage {
  id: string
  documentId: string | null
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface Step {
  id: string
  goalId: string
  title: string
  done: boolean
  order: number
}

export interface Goal {
  id: string
  title: string
  description: string | null
  category: string
  deadline: string | null
  status: string // active | completed | paused
  color: string
  steps: Step[]
}

export interface GoalLite {
  id: string
  title: string
  color: string
}

export interface Plan {
  id: string
  timeframe: 'day' | 'week' | 'month'
  title: string
  notes: string | null
  dueDate: string | null
  done: boolean
  goalId: string | null
  goal: GoalLite | null
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

export interface Opportunity {
  id: string
  company: string
  role: string
  type: string
  sender: string | null
  source: string | null
  url: string | null
  status: string // new | applied | interview | offer | rejected | archived
  deadline: string | null
  notes: string | null
}

export interface MindmapNode {
  id: string
  label: string
  x: number
  y: number
  parentId: string | null
  color?: string
}

export interface Mindmap {
  id: string
  title: string
  goalId: string | null
  goal: GoalLite | null
  nodes: MindmapNode[]
}

export interface DashboardGoal {
  id: string
  title: string
  category: string
  color: string
  deadline: string | null
  progress: number
  stepsDone: number
  stepsTotal: number
  nextStep: string | null
}

export interface DashboardData {
  todayPlans: Plan[]
  goals: DashboardGoal[]
  documents: DocumentItem[]
  opportunities: Opportunity[]
  stats: {
    unreadNews: number
    openPlans: number
    activeOpportunities: number
    totalDocs: number
    finishedDocs: number
    totalSteps: number
    totalStepsDone: number
  }
}
