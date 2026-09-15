import { LegalShell, LegalSection, LegalList, legalMetadata } from '@/components/legal'
import { CONTACT_EMAIL, SUPPORT_EMAIL } from '@/lib/site'

export const metadata = legalMetadata(
  'Privacy Policy',
  'How Cortex collects, uses, stores and protects your data — your library, notes, plans, Gmail import, AI processing and payment records.',
  '/privacy'
)

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated="September 16, 2026"
      intro="Cortex is a personal knowledge workspace — your reading, notes, plans, goals and career pipeline in one place. This policy explains, in plain language, what we collect, why we collect it, who touches it, and the controls you have. The short version: your workspace content is yours, we never sell it, and AI features only see it at the moment you ask for help with it."
    >
      <LegalSection n="01" title="Who we are">
        <p>
          Cortex (&ldquo;the service&rdquo;) is operated from Pakistan as part of the Scrutinies project,
          accessible at cortex.scrutinies.dev. For any privacy question, data request or complaint you
          can write to <strong>{SUPPORT_EMAIL}</strong>. Product and partnership enquiries go to{' '}
          <strong>{CONTACT_EMAIL}</strong>. We aim to acknowledge every request within 72 hours.
        </p>
      </LegalSection>

      <LegalSection n="02" title="What we collect">
        <p>The service stores the following categories of data, all tied to your account:</p>
        <LegalList
          items={[
            <strong key="a">Account data:</strong>,
            <span key="b" className="-mt-1 block">
              your name, email address, a salted hash of your password (never the password itself),
              and whether your email is verified. If you connect Google, we additionally store the
              OAuth tokens and connected Gmail address needed for the import features.
            </span>,
            <strong key="c">Workspace content:</strong>,
            <span key="d" className="-mt-1 block">
              documents and PDFs you upload, extracted text, highlights, notes, flashcards, mind
              maps, goals, milestones, tasks, plans, reminders, focus sessions, reading sessions, and
              the jobs, scholarships and articles you save or track.
            </span>,
            <strong key="e">Derived data:</strong>,
            <span key="f" className="-mt-1 block">
              AI-generated summaries, takeaways and answers you request; citation positions;
              spaced-repetition scheduling state (SM-2); usage counters that enforce free-plan limits.
            </span>,
            <strong key="g">Operational metadata:</strong>,
            <span key="h" className="-mt-1 block">
              timestamps of feed syncs, your learning timezone offset (to build day windows for the
              morning briefing), server logs, and rough country from your IP when you start a
              checkout (used only to route you to the right payment provider).
            </span>,
          ]}
        />
      </LegalSection>

      <LegalSection n="03" title="What we deliberately do not do">
        <LegalList
          items={[
            <span key="1">We do not sell, rent or trade your personal data — with anyone, ever.</span>,
            <span key="2">We do not run advertising or third-party tracking pixels inside the app.</span>,
            <span key="3">
              We do not use your library content to train AI models. Model providers process your
              prompts ephemerally to answer your request; they receive no instruction to retain it.
            </span>,
            <span key="4">
              We do not read your Gmail unless you explicitly connect it, and the connection is
              limited to read-only scopes used by the application-status and offer-detection import.
            </span>,
          ]}
        />
      </LegalSection>

      <LegalSection n="04" title="AI processing">
        <p>
          Features such as the Copilot, document Q&amp;A, summaries, flashcard and mind-map generation
          send a task-scoped snippet of your content (for example, the document you are asking about,
          or the highlight you selected) to a third-party large language model provider over an
          encrypted connection. Responses are stored in your workspace so you can revisit them.
          Prompts are not used to market to you, and the free daily/monthly limits are enforced with
          simple counters (day and month of use per feature) that contain no content.
        </p>
      </LegalSection>

      <LegalSection n="05" title="Email and the morning briefing">
        <p>
          We send transactional email — verification codes, password resets — and the optional daily
          morning briefing that summarises your own deadlines, reminders and upcoming horizons. The
          briefing is generated from your workspace each morning and sent to your account email
          address only. Outgoing mail is delivered through reputable email providers (currently
          Resend, SendGrid or SMTP relays) from our hello@scrutinies.dev address; replies and support
          requests are handled at {SUPPORT_EMAIL}. Every briefing links back to the app where you can
          adjust your agenda, and transactional email cannot be unsubscribed from while you hold an
          account because it authenticates critical actions.
        </p>
      </LegalSection>

      <LegalSection n="06" title="Third-party processors">
        <p>We rely on a small set of infrastructure providers. Each processes data only to deliver its function:</p>
        <LegalList
          items={[
            <span key="1"><strong>Vercel</strong> — application hosting, serverless functions, cron scheduling and edge network.</span>,
            <span key="2"><strong>Neon</strong> — managed PostgreSQL database where workspace data lives.</span>,
            <span key="3"><strong>Cloudflare</strong> — R2 object storage for uploaded PDFs; also DNS and email routing for the scrutinies.dev domain.</span>,
            <span key="4"><strong>Google</strong> — optional sign-in and read-only Gmail import, activated only by you.</span>,
            <span key="5"><strong>AI model providers</strong> — ephemeral processing for AI features you invoke.</span>,
            <span key="6"><strong>Email delivery providers</strong> — verification codes and briefings.</span>,
            <span key="7"><strong>Lemon Squeezy (Merchant of Record) and Safepay</strong> — payment processing for Pro subscriptions; they receive your billing email and payment details, never your workspace content.</span>,
          ]}
        />
      </LegalSection>

      <LegalSection n="07" title="Data retention and deletion">
        <p>
          Your workspace data is retained for as long as your account is active. Deleting an item
          (a document, note, task, or mind map) removes it and, where applicable, its stored file.
          You can export your library data from the app at any time. When you delete your account —
          or ask us to delete it via {SUPPORT_EMAIL} — workspace content, AI outputs and payment
          linkage on our side are removed within 30 days, except records we must keep for tax,
          fraud-prevention or legal-defence purposes (typically minimal billing identifiers held by
          our payment providers under their own policies).
        </p>
      </LegalSection>

      <LegalSection n="08" title="Security">
        <p>
          Passwords are stored as salted, iterated hashes and are never recoverable by staff.
          Traffic is encrypted in transit (HTTPS). Session cookies are signed and HTTP-only. PDFs in
          object storage are served through short-lived authenticated URLs rather than public links.
          Access to production systems is limited to the operator. No system is perfectly secure; if
          a breach affecting your data ever occurs, we will notify affected users promptly and
          describe what happened and what we did about it.
        </p>
      </LegalSection>

      <LegalSection n="09" title="Your rights and choices">
        <LegalList
          items={[
            <span key="1"><strong>Access &amp; portability</strong> — export your library and data from the app, or ask us for a copy at {SUPPORT_EMAIL}.</span>,
            <span key="2"><strong>Correction</strong> — edit any content in place; account email support at {SUPPORT_EMAIL}.</span>,
            <span key="3"><strong>Deletion</strong> — delete items or your whole account (see section 07).</span>,
            <span key="4"><strong>Objection to AI processing</strong> — AI features are opt-in per action; simply do not invoke them.</span>,
            <span key="5"><strong>Disconnect Google</strong> — revoke from the app&apos;s settings and from your Google Account security page.</span>,
          ]}
        />
        <p>
          If you are in the EEA, UK or another jurisdiction with statutory data-protection rights,
          you may also lodge a complaint with your local supervisory authority. We would appreciate
          the chance to fix things first — write to {SUPPORT_EMAIL}.
        </p>
      </LegalSection>

      <LegalSection n="10" title="Children">
        <p>
          Cortex is intended for students and professionals and is not directed at children under 13
          (or the equivalent minimum age in your jurisdiction). We do not knowingly create accounts
          for children. If you believe a child has registered, contact {SUPPORT_EMAIL} and we will
          remove the account and its data.
        </p>
      </LegalSection>

      <LegalSection n="11" title="Changes to this policy">
        <p>
          As the product grows (new AI features, new feed sources, new payment options) this policy
          will be updated to match. Material changes — anything that reduces your control or adds a
          new data category — will be announced in the app or by email before they take effect. The
          &ldquo;Last updated&rdquo; date above always reflects the current version, and previous
          versions are available on request.
        </p>
      </LegalSection>
    </LegalShell>
  )
}
