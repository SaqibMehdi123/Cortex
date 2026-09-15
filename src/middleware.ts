import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

// Gate the whole app behind a valid session:
//  - pages redirect to /login (with a ?next= hint back)
//  - API routes get a clean 401
// Excluded: the auth pages themselves, the auth endpoints, the Google OAuth
// integration routes (their callback must work independently), and static files.

const PUBLIC_PAGES = new Set(['/', '/login', '/signup', '/verify', '/forgot-password', '/privacy', '/terms', '/refund', '/pricing'])
const PUBLIC_APIS = [
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/google',
  '/api/auth/verify-email',
  '/api/auth/resend-code',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  // pre-login code screens check whether the server can deliver email at all
  '/api/auth/mail-status',
  // operator diagnostic — booleans only, never secrets (see src/app/api/ops/health)
  '/api/ops/health',
  // operator diagnostic — fixed public URL, no user input, rate-limited
  '/api/ops/url-import-probe',
  // the 9 AM scheduler has no session cookie — it authenticates itself with
  // CRON_SECRET inside the route (src/app/api/cron/morning), so the session
  // gate must not intercept it
  '/api/cron/morning',
  // daily feed sync (scholarships & exchange programmes) — same CRON_SECRET contract
  '/api/cron/feeds',
  // payment webhooks authenticate via provider signatures, not sessions
  '/api/billing/webhook',
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isApi = pathname.startsWith('/api')
  const isPublicApi = PUBLIC_APIS.some((p) => pathname.startsWith(p))
  if (isApi && isPublicApi) return NextResponse.next()

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  if (session) return NextResponse.next()

  if (isApi) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }
  if (PUBLIC_PAGES.has(pathname)) return NextResponse.next()

  const login = new URL('/login', req.url)
  if (pathname !== '/') login.searchParams.set('next', pathname)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: [
    // everything except Next internals, static assets, and the crawler/social
    // surface (robots, sitemap, PWA manifest, OG image) — those MUST be
    // reachable without a session or link previews and indexing break.
    // [0-9a-f]{32,64}.txt = IndexNow key files (Bing/DuckDuckGo fetch them
    // unauthenticated to validate instant-ping submissions).
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|logo.svg|sitemap.xml|manifest.webmanifest|opengraph-image|twitter-image|apple-icon|pdf.worker|[0-9a-f]{32,64}\\.txt).*)',
  ],
}
