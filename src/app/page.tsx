import { getSessionUser } from '@/lib/auth-server'
import { Landing } from '@/components/landing/landing'

// Public marketing landing page. Signed-in visitors still see it (so the page
// stays shareable) but every CTA points straight into the workspace at /app.
export default async function HomePage() {
  const user = await getSessionUser()
  return <Landing authed={!!user} firstName={user?.name?.split(' ')[0] ?? null} />
}
