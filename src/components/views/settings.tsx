'use client'

import { api } from '@/lib/client'
import { useApi } from '@/lib/client'
import { useMounted } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTheme } from 'next-themes'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Sun, Moon, Monitor, Download, FileJson, FileText, CalendarDays, Mail, Info, Palette, User } from 'lucide-react'

interface SettingsData {
  id: string
  name: string
  theme: string
  digestTime: string
}

export function SettingsView() {
  const { toast } = useToast()
  const { theme, setTheme } = useTheme()
  const { data } = useApi<{ setting: SettingsData }>('/api/settings')
  const mounted = useMounted()

  async function save(patch: Record<string, string>) {
    try {
      await api.put('/api/settings', patch)
      toast({ title: 'Settings saved' })
    } catch {
      toast({ title: 'Failed to save settings', variant: 'destructive' })
    }
  }

  return (
    <div className="anim-fade-up mx-auto max-w-2xl space-y-4 pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Theme, digest, sync and data ownership.</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-primary" /> Profile</CardTitle>
          <CardDescription>Used for your daily greeting.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const form = new FormData(e.currentTarget)
              save({ name: String(form.get('name') ?? '') })
            }}
          >
            <div className="flex-1">
              <Label htmlFor="name">Display name</Label>
              <Input id="name" name="name" defaultValue={data?.setting.name} className="mt-1" placeholder="Your name" />
            </div>
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm"><Palette className="h-4 w-4 text-primary" /> Appearance</CardTitle>
          <CardDescription>Follows your system preference by default. Dark mode is OLED-friendly.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: 'light', label: 'Light', icon: <Sun className="h-4 w-4" /> },
              { key: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4" /> },
              { key: 'system', label: 'System', icon: <Monitor className="h-4 w-4" /> },
            ]).map((opt) => (
              <button
                key={opt.key}
                onClick={() => { setTheme(opt.key); save({ theme: opt.key }) }}
                className={cn(
                  'flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-xl border text-xs font-medium transition-colors',
                  mounted && theme === opt.key ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Daily digest */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm"><CalendarDays className="h-4 w-4 text-primary" /> Daily digest</CardTitle>
          <CardDescription>When your briefing (plan + news digest + deadlines) should be prepared each day.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const form = new FormData(e.currentTarget)
              save({ digestTime: String(form.get('digestTime') ?? '08:00') })
            }}
          >
            <div className="w-36">
              <Label htmlFor="digest">Digest time</Label>
              <Input id="digest" name="digestTime" type="time" defaultValue={data?.setting.digestTime ?? '08:00'} className="mt-1" />
            </div>
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>

      {/* Integrations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-primary" /> Integrations</CardTitle>
          <CardDescription>Gmail reading is available via the AI email parser; Google Calendar export below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Gmail (OAuth)</p>
              <p className="text-xs text-muted-foreground">
                Paste job-related emails into Career → Add application and the AI classifies them (opportunity / rejection / interview / offer / deadline).
                Full OAuth sync connects here once you provide Google API credentials.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Google Calendar sync</p>
              <p className="text-xs text-muted-foreground">Download tasks with deadlines as an .ics file and import to Google Calendar. Live two-way sync arrives with OAuth.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => {
                window.open('/api/export?format=json', '_blank')
                toast({ title: 'Tip: import the JSON deadlines into Calendar', description: 'Direct .ics export is coming with OAuth.' })
              }}
            >
              Get deadlines
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data ownership */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm"><Download className="h-4 w-4 text-primary" /> Your data, your rules</CardTitle>
          <CardDescription>Privacy-first: export everything, anytime. Data lives in your own database.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <a href="/api/export?format=json" download className="flex-1">
            <Button variant="outline" className="w-full"><FileJson className="mr-1.5 h-4 w-4" /> Export JSON</Button>
          </a>
          <a href="/api/export?format=md" download className="flex-1">
            <Button variant="outline" className="w-full"><FileText className="mr-1.5 h-4 w-4" /> Export Markdown</Button>
          </a>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Cortex syncs across your laptop and phone with the same account. Offline edits queue locally and resolve on reconnect — last write wins per field, so nothing is lost silently.</p>
      </div>
    </div>
  )
}
