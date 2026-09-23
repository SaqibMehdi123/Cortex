/**
 * Landing-page FAQ — single source of truth shared by the visible FAQ
 * section (components/landing/closing.tsx) and the FAQPage JSON-LD emitted
 * on the landing route, so Google's rich results always match what users see.
 */
export interface FaqItem {
  q: string
  a: string
}

export const FAQS: FaqItem[] = [
  {
    q: 'Is Cortex free?',
    a: 'Yes — the whole workspace is free, forever, with no time limit: library, plans, goals, news, career, mindmaps, flashcards and analytics. Pro only lifts the things that cost real money to run — heavy AI usage and a bigger PDF library.',
  },
  {
    q: 'How does the Radar stay current?',
    a: 'The Radar refreshes automatically every few hours (and the first time you open it if the feed is stale). A manual force-refresh is always one click away.',
  },
  {
    q: 'Where does my data live?',
    a: 'Your workspace is fully isolated per account. Notes, reading and goals are yours alone, synced between laptop and phone.',
  },
  {
    q: 'Does it work on mobile?',
    a: 'Cortex is responsive with a dedicated mobile tab bar, and reading, reviews and capture all work offline — everything syncs when you reconnect.',
  },
  {
    q: 'Can I get a refund?',
    a: 'Yes — there is a 14-day guarantee on your first purchase. Email support@scrutinies.dev within 14 days of upgrading and you get your money back, no questions asked.',
  },
  {
    q: 'How do I cancel?',
    a: 'Anytime, in two minutes: use the manage link from your receipt email to cancel your subscription. You keep every Pro feature until the end of the period you already paid for.',
  },
]
