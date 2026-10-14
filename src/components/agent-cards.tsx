'use client'

// Apply Agent structured cards rendered inside the chat dock. Every card is
// interactive: the confirmation card saves corrections + confirms, the prefs
// card PATCHes preferences straight from chips, the checklist drives the
// draft state machine. Cards are self-contained — the server only persists
// state, the client drives the actions.

import { useState } from 'react'
import {
  FaArrowUpRightFromSquare,
  FaBolt,
  FaCheck,
  FaDownload,
  FaFileLines,
  FaLink,
  FaLocationDot,
  FaPaperclip,
  FaPencil,
  FaSpinner,
  FaXmark,
} from 'react-icons/fa6'
import { api } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type {
  ProfileConfirmationCard,
  PrefsPromptCard,
  ShortlistCard,
  ChecklistCard,
  ApprovalCard,
  PackageCard,
} from '@/lib/agent/types'
import { cn } from '@/lib/utils'

export function ProfileConfirmationCardView({
  card,
  onDone,
}: {
  card: ProfileConfirmationCard
  onDone?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [headline, setHeadline] = useState(card.headline ?? '')
  const [skills, setSkills] = useState(card.skills.join(', '))
  const [location, setLocation] = useState(card.location ?? '')
  const [workAuth, setWorkAuth] = useState(card.workAuth ?? '')
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      if (editing) {
        await api.patch('/api/agent/profile', {
          headline,
          skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
          location,
          workAuth,
        })
      }
      await api.post('/api/agent/chat', { message: 'Looks right' })
      setConfirmed(true)
      setEditing(false)
      onDone?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Profile from your CV</p>
        <button
          onClick={() => setEditing(!editing)}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted"
          disabled={confirmed}
        >
          <FaPencil className="h-3 w-3" /> {editing ? 'Done editing' : 'Edit'}
        </button>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{card.fileName}</p>

      <div className="mt-2.5 space-y-2 text-sm">
        {editing ? (
          <div className="space-y-2">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Headline</label>
              <Input value={headline} onChange={(e) => setHeadline(e.target.value)} className="mt-0.5 h-8 text-xs" />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Skills (comma separated)</label>
              <Input value={skills} onChange={(e) => setSkills(e.target.value)} className="mt-0.5 h-8 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Location</label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-0.5 h-8 text-xs" />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Work auth</label>
                <Input value={workAuth} onChange={(e) => setWorkAuth(e.target.value)} className="mt-0.5 h-8 text-xs" />
              </div>
            </div>
          </div>
        ) : (
          <>
            {card.headline && <p className="font-medium leading-snug">{card.headline}</p>}
            {card.skills.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {card.skills.slice(0, 12).map((s) => (
                  <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                    {s}
                  </span>
                ))}
              </div>
            )}
            {card.experience.length > 0 && (
              <div className="space-y-1">
                {card.experience.map((e, i) => (
                  <p key={i} className="text-xs leading-snug">
                    <span className="font-medium">{e.title}</span> · {e.company}
                    {e.span && <span className="text-muted-foreground"> — {e.span}</span>}
                  </p>
                ))}
              </div>
            )}
            {card.education.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {card.education.map((e) => `${e.degree} — ${e.school}`).join(' · ')}
              </p>
            )}
            {(card.location || card.workAuth) && (
              <p className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                {card.location && (
                  <span className="flex items-center gap-1">
                    <FaLocationDot className="h-3 w-3" /> {card.location}
                  </span>
                )}
                {card.workAuth && <span>{card.workAuth}</span>}
              </p>
            )}
            {Object.values(card.links ?? {}).some(Boolean) && (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <FaLink className="h-3 w-3" />
                {Object.entries(card.links ?? {})
                  .filter(([, v]) => Boolean(v))
                  .map(([k, v]) => (
                    <a key={k} href={v as string} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {k}
                    </a>
                  ))}
              </p>
            )}
          </>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t pt-2.5">
        {confirmed ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-success">
            <FaCheck className="h-3.5 w-3.5" /> Profile saved
          </p>
        ) : (
          <>
            <Button size="sm" onClick={confirm} disabled={busy} className="sheen">
              <FaCheck className="mr-1.5 h-3.5 w-3.5" /> {editing ? 'Save & confirm' : 'Looks right'}
            </Button>
            {!editing && <span className="text-[11px] text-muted-foreground">or tap Edit to fix anything</span>}
          </>
        )}
      </div>
    </div>
  )
}

export function PrefsPromptCardView({
  card,
  onPicked,
}: {
  card: PrefsPromptCard
  onPicked?: () => void
}) {
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [busyKey, setBusyKey] = useState<string | null>(null)

  async function pick(fieldKey: 'remote' | 'types', value: string, label: string) {
    setBusyKey(fieldKey)
    try {
      if (fieldKey === 'remote') {
        await api.patch('/api/agent/profile', { prefs: { remote: value } })
      } else {
        await api.patch('/api/agent/profile', { prefs: { types: value.split(',') } })
      }
      setPicked((p) => ({ ...p, [fieldKey]: label }))
      await api.post('/api/agent/chat', { message: label })
      onPicked?.()
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-sm font-semibold">Quick preferences</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Tap what fits — salary can be typed as a message (e.g. &ldquo;80k PKR&rdquo;), everything is editable later in Settings.
      </p>
      <div className="mt-2.5 space-y-2.5">
        {card.fields.map((f) => (
          <div key={f.key}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{f.label}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {f.options.map((o) => {
                const chosen = picked[f.key] === o.label
                return (
                  <button
                    key={o.value}
                    onClick={() => pick(f.key as 'remote' | 'types', o.value, o.label)}
                    disabled={busyKey === f.key || Boolean(picked[f.key])}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      chosen ? 'border-success bg-success/10 text-success' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {chosen ? '✓ ' : ''}
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Attachment chip for user messages that carry a CV upload. */
export function AttachmentChip({ name }: { name: string }) {
  return (
    <span className="mt-1 flex items-center gap-1.5 rounded-lg bg-white/15 px-2 py-1 text-[11px] font-medium">
      <FaPaperclip className="h-3 w-3" />
      <span className="max-w-[200px] truncate">{name}</span>
    </span>
  )
}

export function ShortlistCardView({ card, onPrepare }: { card: ShortlistCard; onPrepare?: (listingId: string) => void }) {
  const [busyId, setBusyId] = useState<string | null>(null)

  async function prepare(listingId: string) {
    setBusyId(listingId)
    try {
      await api.post('/api/agent/drafts', { listingId })
      onPrepare?.(listingId)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-sm font-semibold">Top {card.items.length} for you</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{card.scoredCount} listings scored against your profile</p>
      <div className="mt-2.5 space-y-2">
        {card.items.map((item) => (
          <div key={item.listingId} className="rounded-lg border p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-snug">{item.role}</p>
                <p className="truncate text-xs text-muted-foreground">{item.company} · {item.source}</p>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
                  item.score >= 80 ? 'bg-success/15 text-success' : item.score >= 70 ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'
                )}
              >
                {item.score}%
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.why}</p>
            <div className="mt-2 flex items-center gap-2">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                View posting <FaArrowUpRightFromSquare className="h-2.5 w-2.5" />
              </a>
              <button
                onClick={() => prepare(item.listingId)}
                disabled={busyId === item.listingId}
                className="ml-auto flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {busyId === item.listingId ? <FaSpinner className="h-3 w-3 animate-spin" /> : <FaFileLines className="h-3 w-3" />}
                Prepare application
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChecklistCardView({
  card,
  onDone,
}: {
  card: ChecklistCard
  onDone?: () => void
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<'save' | 'cover' | 'approve' | 'ats' | 'skip' | null>(null)
  const [coverLetter, setCoverLetter] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveAnswers(withCoverLetter: boolean) {
    const payload = Object.entries(answers)
      .filter(([, v]) => v.trim())
      .map(([question, answer]) => ({ question, answer }))
    if (payload.length === 0 && !withCoverLetter && card.missing.length > 0) return
    setBusy('save')
    setError(null)
    try {
      if (payload.length > 0) {
        await api.post(`/api/agent/drafts/${card.draftId}/answer`, { answers: payload })
      }
      if (withCoverLetter) {
        setBusy('cover')
        await api.post(`/api/agent/drafts/${card.draftId}/cover-letter`, {})
      }
      onDone?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function approve(mode: 'manual' | 'ats') {
    setBusy(mode === 'ats' ? 'ats' : 'approve')
    setError(null)
    try {
      await api.post(`/api/agent/drafts/${card.draftId}/approve`, { mode })
      onDone?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function skip() {
    setBusy('skip')
    try {
      await api.post(`/api/agent/drafts/${card.draftId}/skip`, {})
      onDone?.()
    } finally {
      setBusy(null)
    }
  }

  const ready = card.missing.length === 0

  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-sm font-semibold">
        Application checklist — {card.role} @ {card.company}
      </p>
      {card.answered.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">
            {card.answered.length} answers ready from your profile — review
          </summary>
          <div className="mt-1.5 space-y-1.5">
            {card.answered.map((a, i) => (
              <div key={i} className="rounded-lg bg-muted/50 p-2 text-[11px] leading-relaxed">
                <p className="font-medium text-foreground">{a.question}</p>
                <p className="mt-0.5 text-muted-foreground">{a.answer}</p>
                <span className="mt-0.5 inline-block rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-semibold text-primary">{a.source}</span>
              </div>
            ))}
          </div>
        </details>
      )}
      {card.missing.length > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Still needed</p>
          {card.missing.map((question) => (
            <div key={question}>
              <label className="text-xs font-medium">{question}</label>
              <Input
                value={answers[question] ?? ''}
                onChange={(e) => setAnswers((p) => ({ ...p, [question]: e.target.value }))}
                className="mt-1 h-8 text-xs"
                placeholder="Your answer…"
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-success">
          <FaCheck className="h-3.5 w-3.5" /> Everything answered — ready for approval
        </p>
      )}
      <label className="mt-3 flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={coverLetter}
          onChange={(e) => setCoverLetter(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        Also draft a cover letter (opt-in, ≤350 words)
      </label>
      {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t pt-2.5">
        {!ready ? (
          <Button size="sm" onClick={() => saveAnswers(coverLetter)} disabled={busy !== null || Object.values(answers).every((v) => !v.trim())}>
            {(busy === 'save' || busy === 'cover') && <FaSpinner className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save answers{coverLetter ? ' + letter' : ''}
          </Button>
        ) : (
          <>
            <Button size="sm" onClick={() => approve('manual')} disabled={busy !== null} className="sheen">
              {busy === 'approve' ? <FaSpinner className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FaCheck className="mr-1.5 h-3.5 w-3.5" />}
              Approve — hand me the package
            </Button>
            {card.atsSupported && (
              <Button size="sm" variant="outline" onClick={() => approve('ats')} disabled={busy !== null}>
                {busy === 'ats' ? <FaSpinner className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FaBolt className="mr-1.5 h-3.5 w-3.5" />}
                Submit directly
              </Button>
            )}
          </>
        )}
        <Button size="sm" variant="ghost" onClick={skip} disabled={busy !== null}>
          <FaXmark className="mr-1.5 h-3.5 w-3.5" /> Skip
        </Button>
      </div>
    </div>
  )
}

export function ApprovalCardView({ card, onDone }: { card: ApprovalCard; onDone?: () => void }) {
  const [busy, setBusy] = useState<'approve' | 'skip' | 'submitted' | null>(null)
  const [phase, setPhase] = useState<'approval' | 'handed_over' | 'done'>('approval')

  async function act(kind: 'approve' | 'skip') {
    setBusy(kind)
    try {
      await api.post(`/api/agent/drafts/${card.draftId}/${kind}`, {})
      if (kind === 'approve') setPhase('handed_over')
      onDone?.()
    } finally {
      setBusy(null)
    }
  }

  async function confirmSubmitted() {
    setBusy('submitted')
    try {
      await api.post(`/api/agent/drafts/${card.draftId}/submitted`, {})
      setPhase('done')
      onDone?.()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-sm font-semibold">
        {phase === 'done' ? 'Submitted' : phase === 'handed_over' ? 'Package handed over' : 'Approve application'} — {card.role} @ {card.company}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        {card.answersCount} form answers · CV: {card.resumeLabel}
        {card.coverLetter ? ' · cover letter attached' : ''} · I never invent answers — every line traces to your profile or what you typed.
      </p>

      {phase === 'approval' && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t pt-2.5">
          <Button size="sm" onClick={() => act('approve')} disabled={busy !== null} className="sheen">
            {busy === 'approve' ? <FaSpinner className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FaCheck className="mr-1.5 h-3.5 w-3.5" />}
            Approve &amp; prepare package
          </Button>
          <Button size="sm" variant="ghost" onClick={() => act('skip')} disabled={busy !== null}>
            <FaXmark className="mr-1.5 h-3.5 w-3.5" /> Skip
          </Button>
        </div>
      )}

      {phase === 'handed_over' && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t pt-2.5">
          <a
            href={`/api/agent/drafts/${card.draftId}/package`}
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <FaDownload className="h-3 w-3" /> Download package
          </a>
          {card.url && (
            <a
              href={card.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <FaArrowUpRightFromSquare className="h-3 w-3" /> Open application
            </a>
          )}
          <Button size="sm" onClick={confirmSubmitted} disabled={busy !== null}>
            {busy === 'submitted' ? <FaSpinner className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FaCheck className="mr-1.5 h-3.5 w-3.5" />}
            I submitted it
          </Button>
        </div>
      )}

      {phase === 'done' && (
        <p className="mt-2.5 border-t pt-2.5 text-xs text-success">
          Pipeline updated to Applied — a follow-up task is set for next week.
        </p>
      )}
    </div>
  )
}

export function PackageCardView({ card }: { card: PackageCard }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-sm font-semibold">
        {card.role} @ {card.company}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{card.message}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {card.packageUrl && (
          <a href={card.packageUrl} className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
            <FaDownload className="h-3 w-3" /> Package
          </a>
        )}
        {card.applyUrl && (
          <a href={card.applyUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
            <FaArrowUpRightFromSquare className="h-3 w-3" /> Job posting
          </a>
        )}
      </div>
    </div>
  )
}
