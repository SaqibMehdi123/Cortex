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
    a: 'Yes — free while in beta. Create an account with email or Google and every module is unlocked: library, plans, goals, radar, career, mindmaps, flashcards and analytics.',
  },
  {
    q: 'How does the radar stay current?',
    a: 'It fetches the moment you open it, then quietly refreshes in the background whenever the digest is older than three hours. A manual force-refresh is always one click away.',
  },
  {
    q: 'Where does my data live?',
    a: 'Your workspace is fully isolated per account. Notes, reading and goals are yours alone, synced between laptop and phone.',
  },
  {
    q: 'Does it work on mobile?',
    a: 'Cortex is responsive with a dedicated mobile tab bar, and reading, reviews and capture all work offline — everything syncs when you reconnect.',
  },
]
