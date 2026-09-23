'use client'

import { FaAt, FaBell, FaCalendarPlus, FaChrome, FaCopy, FaCrown, FaDesktop, FaDownload, FaEnvelope, FaFileCode, FaFileLines, FaGraduationCap, FaInbox, FaInfo, FaKey, FaMoon, FaPaperPlane, FaPalette, FaRightFromBracket, FaRotate, FaShieldHalved, FaSpinner, FaSun, FaUser } from 'react-icons/fa6'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/client'
import { useApi } from '@/lib/client'
import { useMounted } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTheme } from 'next-themes'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { GoogleStatus } from '@/lib/types'

interface SettingsData {
  id: string
  name: string
  theme: string
  digestTime: string
}

interface BillingStatus {
  plan: 'free' | 'pro'
  pro: boolean
  planExpiresAt: string | null
  billingProvider: string | null
}

export function SettingsView() {
  const { toast } = useToast()
  const { theme, setTheme } = useTheme()
  const { data } = useApi<{ setting: SettingsData }>('/api/settings')
  const { data: me } = useApi<{ user: { id: string; name: string; email: string } } | null>('/api/auth/me')
  const { data: billing, loading: billingLoading } = useApi<BillingStatus | null>('/api/billing/status')
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
      </div>

      {me?.user && <AccountCard user={me.user} />}
      <PlanCard billing={billing} loading={billingLoading} />
      <ProfileCard data={data?.setting} save={save} />
      <AppearanceCard mounted={mounted} theme={theme ?? 'system'} setTheme={setTheme} save={save} />
      <GoogleCard />
      <DigestCard email={me?.user?.email} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm"><FaDownload className="h-4 w-4 text-primary" /> Your data, your rules</CardTitle>
          <CardDescription>Privacy-first: export everything, anytime. Data lives in your own database.</CardDescription>
        </CardHeader>
        {/* stack on mobile — two labeled buttons side by side can't fit 390px */}
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <a href="/api/export?format=json" download className="sm:flex-1">
            <Button variant="outline" className="w-full"><FaFileCode className="mr-1.5 h-4 w-4" /> Export JSON</Button>
          </a>
          <a href="/api/export?format=md" download className="sm:flex-1">
            <Button variant="outline" className="w-full"><FaFileLines className="mr-1.5 h-4 w-4" /> Export Markdown</Button>
          </a>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
        <FaInfo className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Cortex syncs across your laptop and phone with the same account. Offline edits queue locally and resolve on reconnect — nothing is lost silently.</p>
      </div>
    </div>
  )
}

function PlanCard({ billing, loading }: { billing?: BillingStatus | null; loading?: boolean }) {
  // Tri-state: while /api/billing/status is in flight (or failed) we must NOT
  // render "Free" — a paying Pro user on a slow connection would see the wrong
  // plan and an upgrade CTA. Unknown plan → neutral "checking" state.
  const known = !loading && billing !== undefined
  const pro = billing?.pro === true
  const expiry = billing?.planExpiresAt
    ? new Date(billing.planExpiresAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <FaCrown className="h-4 w-4 text-primary" /> Plan
          <span
            className={cn(
              'ml-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]',
              !known ? 'animate-pulse text-muted-foreground/60' : pro ? 'border-primary/40 bg-primary/10 text-primary' : 'text-muted-foreground'
            )}
          >
            {!known ? '…' : pro ? 'Pro' : 'Free'}
          </span>
        </CardTitle>
        <CardDescription>
          {!known
            ? 'Checking your plan…'
            : pro
              ? `Pro is active${expiry ? ` — renews/holds until ${expiry}` : ''}. Thank you for backing an independent workspace.`
              : 'You are on Free — the whole workspace, unlimited, forever.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {!known
            ? null
            : pro
              ? 'Everything is unlimited on your plan. To cancel or manage billing, use the link in your receipt email — or contact support@scrutinies.dev.'
              : 'Pro only lifts what costs money to run: unlimited AI Copilot, summaries, cards & mind maps, and a 500-document library.'}
        </p>
        {known && !pro && (
          <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground sm:hidden">
            <FaGraduationCap className="h-3.5 w-3.5 text-primary" /> Students get 50% off Pro
          </p>
        )}
        {known && (
          <Button asChild variant={pro ? 'outline' : 'default'} className={cn('shrink-0', !pro && 'sheen')}>
            <Link href="/pricing">{pro ? 'View pricing' : 'See pricing & upgrade'}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function AccountCard({ user }: { user: { id: string; name: string; email: string } }) {
  const router = useRouter()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  async function signOut() {
    setBusy(true)
    try {
      await api.post('/api/auth/logout', {})
      router.replace('/login')
      router.refresh()
    } catch {
      toast({ title: 'Could not sign out', variant: 'destructive' })
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><FaShieldHalved className="h-4 w-4 text-primary" /> Account</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-hidden>
              {user.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><FaAt className="h-3 w-3" /> {user.email}</p>
            </div>
          </div>
          <Button variant="outline" onClick={signOut} disabled={busy}>
            {busy ? <FaSpinner className="mr-1.5 h-4 w-4 animate-spin" /> : <FaRightFromBracket className="mr-1.5 h-4 w-4" />}
            Sign out
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ProfileCard({ data, save }: { data?: SettingsData; save: (patch: Record<string, string>) => Promise<void> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><FaUser className="h-4 w-4 text-primary" /> Profile</CardTitle>
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
            {/* keyed by the loaded name so the field fills in once /api/settings
                resolves — an uncontrolled defaultValue set before data arrives
                renders an empty field that looks like lost data */}
            <Input key={data?.name ?? 'loading'} id="name" name="name" defaultValue={data?.name} className="mt-1" placeholder="Your name" disabled={!data} />
          </div>
          <Button type="submit" disabled={!data}>Save</Button>
        </form>
      </CardContent>
    </Card>
  )
}

function AppearanceCard({
  mounted, theme, setTheme, save,
}: {
  mounted: boolean
  theme: string
  setTheme: (t: string) => void
  save: (patch: Record<string, string>) => Promise<void>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><FaPalette className="h-4 w-4 text-primary" /> Appearance</CardTitle>
        <CardDescription>Follows your system preference by default. Dark mode is OLED-friendly.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          {([
            { key: 'light', label: 'Light', icon: <FaSun className="h-4 w-4" /> },
            { key: 'dark', label: 'Dark', icon: <FaMoon className="h-4 w-4" /> },
            { key: 'system', label: 'System', icon: <FaDesktop className="h-4 w-4" /> },
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
  )
}

type TestEmailResult = {
  delivered: boolean
  provider: string | null
  reason: string | null
  detail: string | null
  error?: string
}

function DigestCard({ email }: { email?: string }) {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestEmailResult | null>(null)

  async function sendTest() {
    setTesting(true)
    setResult(null)
    try {
      const r = await api.post<TestEmailResult>('/api/ops/test-email')
      setResult(r)
    } catch (e) {
      setResult({ delivered: false, provider: null, reason: null, detail: e instanceof Error ? e.message : 'Request failed', error: 'request' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><FaBell className="h-4 w-4 text-primary" /> Morning notification</CardTitle>
        <CardDescription>Your deadlines and reminders, in your inbox before the day starts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Delivery time</span>
          <span className="font-medium">Every morning · 09:00 (Asia/Karachi)</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="shrink-0 text-muted-foreground">Sent to</span>
          <span className="truncate font-medium" title={email}>{email ?? 'your account email'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button variant="outline" size="sm" onClick={sendTest} disabled={testing}>
            {testing ? <FaSpinner className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FaPaperPlane className="mr-1.5 h-3.5 w-3.5" />}
            {testing ? 'Sending…' : 'Send test email'}
          </Button>
          <span className="text-xs text-muted-foreground">verifies the same mail chain the 9 AM briefing uses</span>
        </div>
        {result && (
          <p className={cn('rounded-lg border px-3 py-2 text-xs leading-relaxed', result.delivered ? 'border-success/40 bg-success/10 text-success' : 'border-destructive/40 bg-destructive/10 text-destructive')}>
            {result.delivered
              ? `Sent via ${result.provider ?? 'mail'} — check your inbox (and the spam folder) for a “Cortex test email”.`
              : `Could NOT send (${result.provider ?? result.reason ?? 'no provider'})${result.detail ? `: ${result.detail}` : '.'} — this is why the 9 AM briefing may not arrive. Contact support@scrutinies.dev if this keeps happening.`}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Only sent when something is actually on your agenda — no empty pings.
        </p>
      </CardContent>
    </Card>
  )
}

// ─── Google OAuth (Gmail + Calendar) ─────────────────────────────────

function GoogleCard() {
  const { toast } = useToast()
  const { data: status, reload } = useApi<GoogleStatus>('/api/auth/google/status')
  const [busy, setBusy] = useState<string | null>(null)

  async function disconnect() {
    setBusy('disconnect')
    try {
      await api.del('/api/auth/google')
      toast({ title: 'Google account disconnected' })
      reload()
    } catch {
      toast({ title: 'Failed to disconnect', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  async function importGmail() {
    setBusy('gmail')
    try {
      const r = await api.post<{ scanned: number; imported: number; skipped: number; message?: string }>('/api/gmail/import')
      toast({
        title: r.imported > 0 ? `${r.imported} applications added to Career` : 'Nothing new to import',
        description: r.message ?? `Scanned ${r.scanned} recent emails · ${r.skipped} already imported or irrelevant.`,
      })
      reload()
    } catch (e) {
      toast({ title: 'Gmail import failed', description: e instanceof Error ? e.message : 'Try reconnecting.', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  async function pushCalendar() {
    setBusy('calendar')
    try {
      const r = await api.post<{ pushed: number; skipped: number; message?: string }>('/api/calendar/push')
      toast({
        title: r.pushed > 0 ? `${r.pushed} tasks added to Google Calendar` : 'Nothing to push',
        description: r.message ?? `${r.skipped} skipped (already scheduled or no due date).`,
      })
    } catch (e) {
      toast({ title: 'Calendar push failed', description: e instanceof Error ? e.message : 'Try reconnecting.', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  function copyRedirect() {
    if (status?.redirectUri) {
      navigator.clipboard.writeText(status.redirectUri)
      toast({ title: 'Redirect URI copied' })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><FaChrome className="h-4 w-4 text-primary" /> Google account</CardTitle>
        <CardDescription>Sync career emails and deadline tasks with Google.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!status ? (
          <div className="h-20 animate-pulse rounded-lg bg-muted" />
        ) : !status.configured ? (
          /* ── Setup guide ── */
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/5 p-3">
              <FaKey className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="text-xs leading-relaxed">
                <p className="font-medium text-foreground">Google sync isn&apos;t set up yet</p>
                <p className="mt-1 text-muted-foreground">
                  Google Calendar &amp; Gmail import need OAuth credentials configured by the site operator. Contact support@scrutinies.dev if this should be enabled for your account.
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer select-none font-medium text-foreground">Self-hosting? Show the one-time setup steps</summary>
                  <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-muted-foreground">
                    <li>Go to <span className="font-mono text-xs">console.cloud.google.com</span> → create/select a project.</li>
                    <li>APIs &amp; Services → Library → enable <b>Gmail API</b> and <b>Google Calendar API</b>.</li>
                    <li>OAuth consent screen → External → add yourself as a test user.</li>
                    <li>Credentials → Create OAuth client ID → <b>Web application</b>; add the redirect URI below.</li>
                    <li>Put the client ID &amp; secret into <span className="font-mono text-xs">.env</span> as <span className="font-mono text-xs">GOOGLE_CLIENT_ID</span> and <span className="font-mono text-xs">GOOGLE_CLIENT_SECRET</span>, then restart the app.</li>
                  </ol>
                </details>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2.5">
              <code className="min-w-0 flex-1 truncate text-xs">{status.redirectUri ?? 'https://your-app-url/api/auth/google/callback'}</code>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyRedirect} aria-label="Copy redirect URI">
                <FaCopy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Scopes requested: <span className="font-mono">gmail.readonly</span>, <span className="font-mono">calendar.readonly</span>, <span className="font-mono">calendar.events</span> — read-only mail, no deletion, no sending.</p>
          </div>
        ) : status.connected ? (
          /* ── Connected ── */
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success/15 text-success">
                <FaShieldHalved className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{status.email ?? 'Google account'}</p>
                <p className="text-xs text-muted-foreground">Connected · tokens auto-refresh</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={busy === 'disconnect'}>
                    <FaRightFromBracket className="mr-1.5 h-3.5 w-3.5" /> Disconnect
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect Google account?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Gmail application scans and Calendar pushes will stop working until you reconnect. Your existing Career entries and tasks are kept.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={disconnect}>Disconnect</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={importGmail} disabled={busy === 'gmail'}>
                {busy === 'gmail' ? <FaRotate className="mr-1.5 h-4 w-4 animate-spin" /> : <FaInbox className="mr-1.5 h-4 w-4" />}
                Scan inbox for applications
              </Button>
              <Button variant="outline" onClick={pushCalendar} disabled={busy === 'calendar'}>
                {busy === 'calendar' ? <FaRotate className="mr-1.5 h-4 w-4 animate-spin" /> : <FaCalendarPlus className="mr-1.5 h-4 w-4" />}
                Push deadline tasks to Calendar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              “Scan inbox” reads your 25 most recent inbox emails from the past 60 days and files career-relevant ones in Career. Re-running is safe — duplicates are skipped.
            </p>
          </div>
        ) : (
          /* ── Configured, not connected ── */
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Credentials detected. Connect your Google account to scan Gmail for applications and sync deadline tasks with Calendar.</p>
            <a href="/api/auth/google" className="block">
              <Button className="w-full"><FaChrome className="mr-2 h-4 w-4" /> Connect with Google</Button>
            </a>
            <p className="text-xs text-muted-foreground">You will be redirected to Google&apos;s consent screen and returned here.</p>
          </div>
        )}
        <div className="flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
          <FaEnvelope className="h-3.5 w-3.5" />
          No OAuth? Paste any email into Career → Add application for AI classification.
        </div>
      </CardContent>
    </Card>
  )
}
