import type { Metadata } from 'next'

/**
 * The workspace is the private, per-user product surface: nothing here has
 * search value, so the whole subtree is noindexed (robots.ts also disallows
 * /app for crawlers that honor it).
 */
export const metadata: Metadata = {
  title: 'Workspace',
  robots: { index: false, follow: false },
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return children
}
