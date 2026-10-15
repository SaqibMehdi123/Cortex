import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is for self-hosting (VPS/containers). On Vercel it is
  // unnecessary (Vercel builds and serves Next.js itself) — skip it there.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  // Cortex gates every route with middleware — without raising this, Next.js
  // truncates request bodies at its 10MB default and large PDF uploads arrive
  // silently cut off (broken viewer files, failed text extraction).
  experimental: {
    proxyClientMaxBodySize: "250mb",
  },
  // pdf-parse ships pdf.js internals — keep it out of the bundler.
  // The AWS SDK (Cloudflare R2) is external for the same reason: smaller
  // functions, no bundler edge cases with its native crypto dependencies.
  serverExternalPackages: ["pdf-parse", "@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // ── Security headers (every response) ──────────────────────────────────
  // Chosen to be strict where it cannot break the app:
  //   nosniff       — kills MIME-confusion on user-uploaded downloads
  //   frame denial  — clickjacking (app + login/checkout flows)
  //   referrer      — never leak full URLs (doc titles, ids) cross-origin
  //   permissions   — no camera/mic/geo surface for an embedded attacker
  //   CSP           — object/base-uri/frame-ancestors locked; script-src is
  //                   NOT restricted (Next.js hydration + inline handlers
  //                   require it — a strict script CSP needs a nonce plumbing
  //                   through every route and is a follow-up, not a safe
  //                   one-line change).
  async headers() {
    const csp = [
      "default-src 'self'",
      // 'unsafe-inline' on script-src is deliberate: Next.js hydration and the
      // JSON-LD block are inline scripts. The meaningful hardening here is
      // object-src 'none' + base-uri 'self' + frame-ancestors 'none' — a
      // nonce-based script CSP is a separate, larger change.
      "script-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "connect-src 'self' blob: https:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join('; ')
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
          { key: 'Content-Security-Policy', value: csp },
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
            : []),
        ],
      },
    ]
  },
};

export default nextConfig;
