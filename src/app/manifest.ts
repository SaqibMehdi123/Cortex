import type { MetadataRoute } from 'next'
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site'

/** PWA manifest — makes Cortex installable and gives crawlers/OS a brand identity. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Personal Knowledge Workspace`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/app',
    display: 'standalone',
    background_color: '#f7f5f1',
    theme_color: '#14120f',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      // Android/Chrome install prompts want real PNG sizes; the maskable
      // variant keeps the glyph inside the 80% safe zone on round masks
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
