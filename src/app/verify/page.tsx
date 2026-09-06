'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CortexLogo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, MailCheck, ArrowRight } from 'lucide-react'
import { api } from '@/lib/client'

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  )
}

function VerifyForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [hint] = useState(params.get('hint') ?? '')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  // Resend cooldown ticker (starts at 60 right after signup redirects here).
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((c) => c - 1), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  useEffect(() => {
    setCooldown(45)
  }, [])

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await api.post<{ alreadyVerified?: boolean }>('/api/auth/verify-email', { email, code })
      if (res.alreadyVerified) {
        router.replace('/')
      } else {
        router.replace('/')
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.')
      setBusy(false)
    }
  }

  async function resend() {
    setError(null)
    setBusy(true)
    try {
      const res = await api.post<{ devCode?: string }>('/api/auth/resend-code', { email, purpose: 'email_verify' })
      if (res.devCode) setDevCode(res.devCode)
      setCooldown(60)
    } catch (err) {
      // 429 cooldown — show it, but a previously sent code may still be valid.
      setError(err instanceof Error ? err.message : 'Could not resend.')
    } finally {
      setBusy(false)
    }
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <CortexLogo size={30} className="text-foreground" />
          <p className="text-sm text-muted-foreground">One quick check, then you're in.</p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-soft">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <MailCheck className="h-5 w-5 text-primary" />
          </div>
          <h1 className="font-display text-xl">Check your email</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            We sent a 6-digit code{emailOk ? <> to <span className="font-medium text-foreground">{email}</span></> : ''}. It expires in 10 minutes.
          </p>
          {hint && <p className="mt-2 rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">{hint}</p>}

          <form onSubmit={verify} className="mt-5 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="code">Verification code</Label>
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

            {devCode && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                Dev mode — email delivery isn't configured on this server, so here is your code:{' '}
                <span className="font-mono font-bold tracking-widest">{devCode}</span>
              </p>
            )}
            {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

            <Button type="submit" disabled={busy || code.length !== 6 || !emailOk} className="w-full">
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-1.5 h-4 w-4" />}
              Verify & continue
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>Didn't get it?</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-primary"
              disabled={busy || cooldown > 0 || !emailOk}
              onClick={resend}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send a new code'}
            </Button>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Wrong email?{' '}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Sign up again
          </Link>
        </p>
      </div>
    </div>
  )
}
