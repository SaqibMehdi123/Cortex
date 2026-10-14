'use client'

// Settings → Apply Agent card: default CV picker, preference editor, and the
// one-click "delete my agent data" control required by the privacy rules.

import { useEffect, useState } from 'react'
import { FaFileLines, FaRobot, FaShieldHalved, FaSpinner, FaTrashCan } from 'react-icons/fa6'
import { api } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { ProfilePrefs, ReusableAnswer } from '@/lib/agent/types'

interface AgentProfilePayload {
  profile: {
    headline: string | null
    location: string | null
    workAuth: string | null
    salaryTarget: string | null
    skills: string[] | null
    prefs: ProfilePrefs | null
    answers: ReusableAnswer[] | null
  } | null
  resumes: { id: string; label: string; fileName: string; isDefault: boolean }[]
}

const FAMILY_OPTIONS = [
  { key: 'engineering', label: 'Engineering' },
  { key: 'data', label: 'Data' },
  { key: 'product', label: 'Product' },
  { key: 'design', label: 'Design' },
  { key: 'gtm', label: 'GTM / Sales' },
  { key: 'ops', label: 'Operations' },
  { key: 'research', label: 'Research' },
  { key: 'other', label: 'Other' },
]

export function AgentCard() {
  const { toast } = useToast()
  const [data, setData] = useState<AgentProfilePayload | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const profile = data?.profile ?? null
  const resumes = data?.resumes ?? []
  const defaultResume = resumes.find((r) => r.isDefault)

  // local editable mirror
  const [salary, setSalary] = useState('')
  const [locations, setLocations] = useState('')
  const [prefs, setPrefs] = useState<ProfilePrefs>({})
  const [atsOptIn, setAtsOptIn] = useState(false)

  useEffect(() => {
    api
      .get<AgentProfilePayload>('/api/agent/profile')
      .then((d) => {
        setData(d)
        setSalary(d.profile?.salaryTarget ?? '')
        setLocations((d.profile?.prefs?.locations ?? []).join(', '))
        setPrefs(d.profile?.prefs ?? {})
        setAtsOptIn(Boolean((d.profile?.prefs as { atsOptIn?: boolean } | null)?.atsOptIn))
      })
      .catch(() => setData({ profile: null, resumes: [] }))
  }, [])

  async function save(patch: Record<string, unknown>, message = 'Agent settings saved') {
    setSaving(true)
    try {
      const updated = await api.patch<AgentProfilePayload>('/api/agent/profile', patch)
      setData((prev) => (updated?.profile !== undefined ? { ...prev, profile: updated.profile, resumes: updated.resumes ?? prev?.resumes ?? [] } : prev))
      toast({ title: message })
    } catch (e) {
      toast({ title: (e as Error).message || 'Could not save', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  function toggleFamily(key: string) {
    const current = prefs.roleFamilies ?? []
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    setPrefs((p) => ({ ...p, roleFamilies: next }))
  }

  async function deleteAgentData() {
    setDeleting(true)
    try {
      await api.del('/api/agent/data')
      setData({ profile: null, resumes: [] })
      setSalary('')
      setLocations('')
      setPrefs({})
      toast({ title: 'Agent data deleted', description: 'CVs, profile, drafts and the agent chat were removed.' })
    } catch {
      toast({ title: 'Could not delete agent data', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <FaRobot className="h-4 w-4 text-primary" /> Apply Agent
        </CardTitle>
        <CardDescription>Grounds every application the agent prepares. Upload or replace CVs from the agent chat&apos;s paperclip.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* status line */}
        <div className="rounded-lg border bg-muted/40 p-3 text-xs">
          {profile ? (
            <>
              <p className="font-medium">{profile.headline || 'Profile saved'}</p>
              <p className="mt-0.5 text-muted-foreground">
                {(profile.skills ?? []).slice(0, 8).join(' · ') || 'No skills parsed yet'}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              No profile yet — open the Copilot dock, switch to <span className="font-medium text-foreground">Apply Agent</span> and attach your CV.
            </p>
          )}
        </div>

        {/* default CV */}
        {resumes.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs">Default CV</Label>
            <Select
              value={defaultResume?.id ?? ''}
              onValueChange={(id) => save({ defaultResumeId: id }, 'Default CV updated')}
            >
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pick a CV" /></SelectTrigger>
              <SelectContent>
                {resumes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    <span className="flex items-center gap-1.5"><FaFileLines className="h-3 w-3" /> {r.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* preferences */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs" htmlFor="agent-salary">Salary expectation</Label>
              <Input id="agent-salary" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="e.g. 80k PKR" className="mt-1 h-9 text-xs" />
            </div>
            <div>
              <Label className="text-xs" htmlFor="agent-locations">Locations (comma separated)</Label>
              <Input id="agent-locations" value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="Islamabad, Remote" className="mt-1 h-9 text-xs" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Work setting</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(['remote', 'hybrid_onsite', 'any'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setPrefs((p) => ({ ...p, remote: k }))}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium',
                    (prefs.remote ?? 'any') === k ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {k === 'remote' ? 'Remote only' : k === 'hybrid_onsite' ? 'Hybrid/onsite OK' : 'Any'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Target role families</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {FAMILY_OPTIONS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => toggleFamily(f.key)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium',
                    (prefs.roleFamilies ?? []).includes(f.key) ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {/* Tier B opt-in — honest experimental copy per the plan's guardrails */}
          <label className="flex items-start gap-2.5 rounded-lg border p-3 text-xs">
            <input
              type="checkbox"
              checked={atsOptIn}
              onChange={(e) => {
                setAtsOptIn(e.target.checked)
                save({ prefs: { atsOptIn: e.target.checked } }, e.target.checked ? 'Direct submissions enabled' : 'Direct submissions disabled')
              }}
              className="mt-0.5 h-3.5 w-3.5"
            />
            <span>
              <span className="font-medium">Allow direct submissions to Greenhouse &amp; Lever boards</span>
              <span className="mt-0.5 block text-muted-foreground">
                Experimental. Still only after you approve each application — but the agent fills and submits the form itself. Max 5/day; every submission is logged with a full audit snapshot; failures fall back to the manual package.
              </span>
            </span>
          </label>
          <Button size="sm" onClick={() => save({ salaryTarget: salary, prefs: { locations: locations.split(',').map((s) => s.trim()).filter(Boolean) } })} disabled={saving}>
            {saving && <FaSpinner className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save preferences
          </Button>
        </div>

        {/* danger zone */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium"><FaShieldHalved className="h-3.5 w-3.5 text-destructive" /> Delete my agent data</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Removes every CV, your profile, all drafts and the agent chat. Pipeline entries stay.</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={deleting || (!profile && resumes.length === 0)}>
                {deleting ? <FaSpinner className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FaTrashCan className="mr-1.5 h-3.5 w-3.5" />} Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all Apply Agent data?</AlertDialogTitle>
                <AlertDialogDescription>
                  Every CV file, your parsed profile, all application drafts and the agent conversation will be permanently removed. Your pipeline board and tasks are not touched. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={deleteAgentData}>Delete everything</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  )
}
