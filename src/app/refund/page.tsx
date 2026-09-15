import { LegalShell, LegalSection, LegalList, legalMetadata } from '@/components/legal'
import { SUPPORT_EMAIL } from '@/lib/site'

export const metadata = legalMetadata(
  'Refund Policy',
  'When and how Cortex Pro payments can be refunded — the 14-day guarantee, renewals, Safepay and Lemon Squeezy paths, and how to cancel.',
  '/refund'
)

export default function RefundPage() {
  return (
    <LegalShell
      title="Refund Policy"
      updated="September 16, 2026"
      intro="We want Cortex Pro to earn its price every month. If it does not, this policy explains exactly when your money comes back and how to get it. It applies to all paid plans purchased through Lemon Squeezy (international) or Safepay (Pakistan), and is part of our Terms of Service."
    >
      <LegalSection n="01" title="The 14-day first-purchase guarantee">
        <p>
          Your first Pro purchase carries a no-questions-asked 14-day money-back guarantee. If
          Cortex is not for you, email <strong>{SUPPORT_EMAIL}</strong> from your account address
          within 14 days of the initial charge and we will refund it in full — you do not need to
          prove anything, fill a form or talk to a retention agent. One guarantee per customer; it
          applies to the first subscription payment (including student plans), not to renewals.
        </p>
      </LegalSection>

      <LegalSection n="02" title="Renewals and later payments">
        <p>
          Renewals and subsequent payments are refundable under two conditions, whichever you can
          claim:
        </p>
        <LegalList
          items={[
            <span key="1"><strong>Fair-use window:</strong> within 7 days of the renewal charge, if you have used fewer than 10 AI actions (copilot messages, summaries, cards or mind maps combined) during that billing period — essentially, you forgot to cancel and barely used it.</span>,
            <span key="2"><strong>Material change:</strong> within 14 days of a change that reduces the value of your plan (a feature you relied on is retired, or limits drop below what was published when you subscribed), pro-rated for the remaining time.</span>,
          ]}
        />
        <p>
          Outside those conditions renewals are not refundable, because the service has been
          delivered — but you can always cancel to stop future charges, and we will consider
          goodwill refunds for genuine hardship cases at our discretion.
        </p>
      </LegalSection>

      <LegalSection n="03" title="How to request a refund">
        <p>
          Write to {SUPPORT_EMAIL} from the email address on your Cortex account (this is how we
          match the request to the payment) with the word &ldquo;refund&rdquo; and, if you can, the
          date of the charge. No other detail is required for the first-purchase guarantee. We
          respond within 72 hours, usually much faster, and will either process the refund
          immediately or tell you plainly why not and what would change our answer.
        </p>
      </LegalSection>

      <LegalSection n="04" title="Where the money goes">
        <p>
          Refunds always return to the original payment method. Charges made through Lemon Squeezy
          are refunded by Lemon Squeezy to the card or wallet you paid with (their statement line
          will match the original charge); charges made through Safepay are refunded through the
          same card, wallet or bank channel used at purchase. Banks and wallets can take 5–10
          business days to display a completed refund — that part is outside our control. We cannot
          refund to a different account than the one that paid, as this is the primary fraud vector
          for digital goods.
        </p>
      </LegalSection>

      <LegalSection n="05" title="Cancellations and expiry">
        <p>
          Cancelling a subscription stops all future charges; your Pro benefits stay active until
          the end of the period you already paid for, and we do not refund that remaining time
          proactively. After expiry the account returns to the free plan — nothing in your workspace
          is deleted, and any content you created while on Pro remains yours. Deleting your account
          does not automatically refund the current period; if that is your intent, request the
          refund first (sections 01–02 apply as normal).
        </p>
      </LegalSection>

      <LegalSection n="06" title="Chargebacks">
        <p>
          Please talk to us before filing a chargeback. Chargebacks carry fixed fees that hurt a
          small independent service and typically take longer than a direct refund. Accounts with an
          open chargeback are suspended until it resolves; if a chargeback is decided in our favour
          because the request did not meet this policy, the account may remain closed for
          fraud-prevention reasons. In practice, honest refund requests by email are always the
          faster route.
        </p>
      </LegalSection>

      <LegalSection n="07" title="Statutory rights">
        <p>
          Nothing in this policy limits mandatory consumer rights you may have under the law of your
          country of residence, including rights around defective services and unfair contract
          terms. Where this policy and mandatory local law conflict, local law wins. Questions about
          any of this: {SUPPORT_EMAIL} — a human reads it.
        </p>
      </LegalSection>
    </LegalShell>
  )
}
