import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

/**
 * The workspace is auth-gated and intentionally unindexed, so the sitemap
 * lists public marketing surface only. New public pages (e.g. a future
 * blog/guides section) should be added here as they ship.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ]
}
