'use client'

import { FaArrowTrendUp, FaBookOpen, FaBullseye, FaGraduationCap, FaLayerGroup, FaListCheck, FaStopwatch } from 'react-icons/fa6'
import { useState } from 'react'
import { useApi } from '@/lib/client'
import type { AnalyticsData } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SkeletonCard } from '@/components/shared'
import { cn } from '@/lib/utils'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip as ReTooltip, CartesianGrid,
} from 'recharts'

export function AnalyticsView() {
  const [range, setRange] = useState<'week' | 'month'>('week')
  const { data, loading } = useApi<AnalyticsData>(`/api/analytics?range=${range}`, [range])

  if (loading || !data) {
    return (
      <div className="space-y-4 pb-8">
        <SkeletonCard className="h-24" />
        <SkeletonCard className="h-72" />
        <SkeletonCard className="h-72" />
      </div>
    )
  }

  const chartDays = data.days.map((d) => ({
    ...d,
    label: new Date(`${d.day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    focusHours: +(d.focusMinutes / 60).toFixed(2),
    readingHours: +(d.readingMinutes / 60).toFixed(2),
  }))

  const tiles = [
    { label: 'Reading time', value: `${Math.round(data.totals.readingMinutes / 60 * 10) / 10}h`, icon: <FaBookOpen className="h-4 w-4" />, color: 'text-primary' },
    { label: 'Tasks completed', value: data.totals.tasksCompleted, icon: <FaListCheck className="h-4 w-4" />, color: 'text-success' },
    { label: 'Focus hours', value: `${Math.round(data.totals.focusMinutes / 60 * 10) / 10}h`, icon: <FaStopwatch className="h-4 w-4" />, color: 'text-warning' },
    { label: 'Cards reviewed', value: data.totals.flashcardsReviewed, icon: <FaLayerGroup className="h-4 w-4" />, color: 'text-teal-500' },
    { label: 'Active goals', value: data.totals.activeGoals, icon: <FaBullseye className="h-4 w-4" />, color: 'text-violet-500' },
    { label: 'Docs finished', value: data.totals.docsFinished, icon: <FaGraduationCap className="h-4 w-4" />, color: 'text-cyan-500' },
  ]

  return (
    <div className="anim-fade-up space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">Reading, tasks, focus and goal velocity.</p>
        </div>
        <div className="overflow-hidden rounded-lg border">
          {(['week', 'month'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn('min-h-[36px] px-4 text-xs font-medium capitalize transition-colors', r === 'month' && 'border-l', range === r ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <Card key={t.label} className="transition-shadow hover:shadow-soft">
            <CardContent className="p-4">
              <div className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', t.color)}>
                {t.icon} {t.label}
              </div>
              <p className="mt-1.5 text-xl font-bold">{t.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* reading */}
      <Card className="transition-shadow hover:shadow-soft">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FaBookOpen className="h-4 w-4 text-primary" /> Reading time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartDays} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="readGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2F6B57" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#2F6B57" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit="h" />
                <ReTooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }} />
                <Area type="monotone" dataKey="readingHours" name="Reading (h)" stroke="#2F6B57" strokeWidth={2} fill="url(#readGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* tasks */}
        <Card className="transition-shadow hover:shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FaListCheck className="h-4 w-4 text-success" /> Tasks completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartDays} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <ReTooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }} />
                  <Bar dataKey="tasksCompleted" name="Tasks" fill="#22C55E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* focus */}
        <Card className="transition-shadow hover:shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FaStopwatch className="h-4 w-4 text-warning" /> Focus hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartDays} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="focusGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit="h" />
                  <ReTooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }} />
                  <Area type="monotone" dataKey="focusHours" name="Focus (h)" stroke="#F59E0B" strokeWidth={2} fill="url(#focusGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* velocity */}
      <Card className="transition-shadow hover:shadow-soft">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FaArrowTrendUp className="h-4 w-4 text-primary" /> Goal velocity — milestones completed per week
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.velocity} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <ReTooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }} />
                <Line type="monotone" dataKey="completed" name="Milestones" stroke="#2F6B57" strokeWidth={2.5} dot={{ r: 3, fill: '#2F6B57' }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
