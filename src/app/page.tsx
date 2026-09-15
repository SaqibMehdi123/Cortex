import type { Metadata } from 'next'
import { getSessionUser } from '@/lib/auth-server'
import { Landing } from '@/components/landing/landing'
import { FAQS } from '@/lib/faq'
import { SITE_DESCRIPTION, SITE_FEATURES, SITE_NAME, SITE_TAGLINE, SITE_URL } from '@/lib/site'

// Public marketing landing page. Signed-in visitors still see it (so the page
// stays shareable) but every CTA points straight into the workspace at /app.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

/**
 * Structured data (schema.org) — lets Google render rich results (app info,
 * FAQ dropdowns) and unambiguously ties the domain to a product entity.
 * The FAQ entries are imported from the same module that renders the visible
 * FAQ section, so the markup can never drift from the page content.
 */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: 'en',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#app`,
      name: SITE_NAME,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      slogan: SITE_TAGLINE,
      featureList: SITE_FEATURES,
      isAccessibleForFree: true,
      // Both plans — lets Google show price context for the SoftwareApplication
      offers: [
        { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' },
        {
          '@type': 'Offer',
          name: 'Pro',
          price: '5',
          priceCurrency: 'USD',
          description:
            'Unlimited AI Copilot, summaries, flashcards & mind maps; 500-document library; instant job-alert emails. Students 50% off.',
        },
        {
          '@type': 'Offer',
          name: 'Pro Annual',
          price: '50',
          priceCurrency: 'USD',
          description:
            'The Pro plan billed once a year — two months free versus monthly ($4.17/mo effective). Students $25/yr after verification.',
        },
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${SITE_URL}/#faq`,
      mainEntity: FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
}

export default async function HomePage() {
  const user = await getSessionUser()
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Landing authed={!!user} firstName={user?.name?.split(' ')[0] ?? null} />
    </>
  )
}
