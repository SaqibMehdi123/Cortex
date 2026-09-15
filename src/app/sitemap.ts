import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

/**
 * The workspace is auth-gated and intentionally unindexed, so the sitemap
 * lists public marketing surface only. New public pages (e.g. a future
 * blog/guides section) should be added here as they ship.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    // public marketing + legal surface — indexable, no session required
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/refund`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
