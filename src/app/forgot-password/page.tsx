'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CortexLogo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, KeyRound, ArrowRight, CheckCircle2, MailWarning } from 'lucide-react'
import { api } from '@/lib/client'

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  )
}

type Step = 'request' | 'reset' | 'done'

function ForgotPasswordForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [step, setStep] = useState<Step>('request')
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [mailIssue, setMailIssue] = useState<'not_configured' | 'send_failed' | null>(null)
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((c) => c - 1), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  // Warn up-front when this server can't send email at all.
  useEffect(() => {
    api
      .get<{ configured: boolean }>('/api/auth/mail-status')
      .then((s) => {
        if (!s.configured) setMailIssue('not_configured')
      })
      .catch(() => {})
  }, [])

  // Step 1 — request a reset code.
  async function requestReset(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await api.post<{
        sent?: boolean
        emailSent?: boolean
        emailError?: 'not_configured' | 'send_failed'
        devCode?: string
      }>('/api/auth/forgot-password', { email })
      if (res.devCode) setDevCode(res.devCode)
      setMailIssue(res.emailSent === false ? (res.emailError ?? 'send_failed') : null)
      setStep('reset')
      setCooldown(60)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the code.')
    } finally {
      setBusy(false)
    }
  }

  // Step 2 — code + new password.
  async function doReset(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await api.post('/api/auth/reset-password', { email, code, newPassword })
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the password.')
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setError(null)
    setBusy(true)
    try {
      const res = await api.post<{
        emailSent?: boolean
        emailError?: 'not_configured' | 'send_failed'
        devCode?: string
      }>('/api/auth/resend-code', { email, purpose: 'password_reset' })
      if (res.devCode) setDevCode(res.devCode)
      setMailIssue(res.emailSent === false ? (res.emailError ?? 'send_failed') : null)
      setCooldown(60)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <CortexLogo size={30} className="text-foreground" />
          <p className="text-sm text-muted-foreground">Get back into your workspace.</p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-soft">
          {step === 'request' && (
            <>
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <KeyRound className="h-5 w-5 text-primary" />
              </div>
              <h1 className="font-display text-xl">Forgot your password?</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Enter your email and we'll send a 6-digit code to reset it.
              </p>
              <form onSubmit={requestReset} className="mt-5 space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1"
                  />
                </div>
                {mailIssue === 'not_configured' && (
                  <div className="rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-600 dark:text-amber-400">
                    <span className="font-semibold">Heads up — email isn't set up on this server yet.</span> The reset
                    code can't be delivered until a mail provider is configured (see{' '}
                    <span className="font-mono">EMAIL-SETUP.md</span> on the server). For local testing the code is
                    printed in the server log.
                  </div>
                )}
                {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-1.5 h-4 w-4" />}
                  Send reset code
                </Button>
              </form>
            </>
          )}

          {step === 'reset' && (
            <>
              <h1 className="font-display text-xl">Enter the code</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>. It expires in 10 minutes.
              </p>
              <form onSubmit={doReset} className="mt-5 space-y-4">
                <div>
                  <Label htmlFor="code">Reset code</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="mt-1 text-center font-mono text-lg tracking-[0.45em]"
                  />
                </div>
                <div>
                  <Label htmlFor="newPassword">New password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="confirm">Confirm new password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat it"
                    className="mt-1"
                  />
                </div>

                {mailIssue === 'not_configured' && (
                  <div className="rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-600 dark:text-amber-400">
                    <span className="font-semibold">Email isn't set up on this server yet.</span> No code can arrive
                    until a mail provider is added — put <span className="font-mono">RESEND_API_KEY</span> or SMTP
                    credentials in the server's <span className="font-mono">.env</span> (see{' '}
                    <span className="font-mono">EMAIL-SETUP.md</span>) and then send a new code. For local testing the
                    code is printed in the server log.
                  </div>
                )}
                {mailIssue === 'send_failed' && (
                  <div className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2.5 text-xs leading-relaxed text-danger">
                    <MailWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>The email couldn't be sent — the mail provider rejected it. Check the server's mail settings and try again.</span>
                  </div>
                )}
                {devCode && (
                  <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                    Dev fallback (AUTH_DEV_CODE_FALLBACK=true) — your code:{' '}
                    <span className="font-mono font-bold tracking-widest">{devCode}</span>
                  </p>
                )}
                {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

                <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
                  {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-1.5 h-4 w-4" />}
                  Reset password
                </Button>
              </form>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>Didn't get it?</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-primary"
                  disabled={busy || cooldown > 0}
                  onClick={resend}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send a new code'}
                </Button>
              </div>
            </>
          )}

          {step === 'done' && (
            <>
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <h1 className="font-display text-xl">Password updated</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Your password has been changed. Sign in with the new one.
              </p>
              <Button className="mt-5 w-full" onClick={() => router.replace('/login')}>
                Go to sign in
              </Button>
            </>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Remembered it?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
