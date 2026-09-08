import type { Metadata } from 'next'

/**
 * All four layout files under auth routes exist purely to attach noindex
 * metadata — these are client-component pages that cannot export metadata
 * themselves, and sign-in funnels must never appear in search results.
 */
export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
