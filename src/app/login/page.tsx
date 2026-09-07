'use client'

import { FaArrowRight, FaSpinner } from 'react-icons/fa6'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CortexLogo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/client'

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [needsVerification, setNeedsVerification] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNeedsVerification(false)
    setBusy(true)
    try {
      await api.post('/api/auth/login', { email, password })
      const next = params.get('next')
      router.replace(next && next.startsWith('/') ? next : '/app')
      router.refresh()
    } catch (err) {
      // 403 = the account never finished email verification — offer a way out.
      if ((err as { status?: number }).status === 403) setNeedsVerification(true)
      setError(err instanceof Error ? err.message : 'Could not sign in.')
      setBusy(false)
    }
  }

  async function sendVerifyCode() {
    setBusy(true)
    try {
      // 429 (cooldown) is fine — a previously sent code may still be valid.
      await api.post('/api/auth/resend-code', { email: email.trim().toLowerCase(), purpose: 'email_verify' }).catch(() => {})
      router.push(`/verify?email=${encodeURIComponent(email.trim().toLowerCase())}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <CortexLogo size={30} className="text-foreground" />
          <p className="text-sm text-muted-foreground">Your reading, plans and goals — in one place.</p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-soft">
          <h1 className="font-display text-xl">Welcome back</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Sign in to your workspace.</p>

          <form onSubmit={submit} className="mt-5 space-y-4">
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
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1"
              />
            </div>

            {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
            {needsVerification && (
              <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={sendVerifyCode}>
                Send a verification code
              </Button>
            )}

            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-primary hover:underline">
                Forgot password?
              </Link>
            </div>

            <Button type="submit" disabled={busy} className="w-full">
              {busy ? <FaSpinner className="mr-1.5 h-4 w-4 animate-spin" /> : <FaArrowRight className="mr-1.5 h-4 w-4" />}
              Sign in
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          New to Cortex?{' '}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}
