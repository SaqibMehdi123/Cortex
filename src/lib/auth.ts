// Cortex auth — accounts, password hashing and signed session cookies.
//
// Deliberately dependency-free: everything runs on the Web Crypto API, so the
// same helpers work in Node route handlers and in edge middleware. Passwords
// use PBKDF2-SHA256 (210k iterations) with a per-user random salt; sessions
// are stateless HMAC-signed tokens in an HttpOnly cookie.

export const SESSION_COOKIE = 'cortex_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

const PBKDF2_ITERATIONS = 210_000

function getSecret(): string {
  // Set AUTH_SECRET in production. The fallback keeps local development
  // frictionless — a lost laptop with a Cortex dev server on it is not a
  // threat model, but anyone deploying should pick a real secret.
  return process.env.AUTH_SECRET || 'cortex-local-dev-secret-change-me'
}

const enc = new TextEncoder()

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const byte of b) s += String.fromCharCode(byte)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''
  return Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0))
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return b64url(sig)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ─── Passwords ───────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    256,
  )
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(bits)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  const salt = fromB64url(parts[2])
  const expected = parts[3]
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    256,
  )
  return timingSafeEqual(b64url(bits), expected)
}

// ─── Verification codes (email verification & password reset) ───────

// Uniformly random 6-digit code (100000–999999) from the CSPRNG.
export function generateVerificationCode(): string {
  const buf = crypto.getRandomValues(new Uint32Array(1))
  return String(100000 + (buf[0] % 900000))
}

// Codes are stored hashed (SHA-256, peppered with AUTH_SECRET) so a leaked
// database copy never contains a usable code.
export async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`cortex-code:${getSecret()}:${code}`))
  return b64url(digest)
}

export const CODE_TTL_MINUTES = 10
export const CODE_MAX_ATTEMPTS = 5
export const CODE_RESEND_COOLDOWN_SECONDS = 60

// ─── Session tokens ──────────────────────────────────────────────────

export async function createSessionToken(userId: string): Promise<string> {
  const exp = Date.now() + SESSION_MAX_AGE * 1000
  const payload = `${userId}.${exp}`
  return `${payload}.${await hmac(payload)}`
}

export async function verifySessionToken(token: string | undefined | null): Promise<{ userId: string } | null> {
  if (!token) return null
  const idx = token.lastIndexOf('.')
  if (idx < 0) return null
  const payload = token.slice(0, idx)
  const sig = token.slice(idx + 1)
  const expected = await hmac(payload)
  if (!timingSafeEqual(sig, expected)) return null
  const [userId, expRaw] = payload.split('.')
  const exp = Number(expRaw)
  if (!userId || !Number.isFinite(exp) || exp < Date.now()) return null
  return { userId }
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE,
  secure: process.env.NODE_ENV === 'production',
}
