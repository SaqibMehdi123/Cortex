import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

/**
 * Only the marketing landing page is meant for search results — every
 * workspace/auth route is behind authentication and returns identical or
 * empty content to crawlers, so it is explicitly disallowed here (and also
 * carries noindex metadata as a second belt-and-braces layer).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/app', '/api', '/login', '/signup', '/verify', '/forgot-password'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
