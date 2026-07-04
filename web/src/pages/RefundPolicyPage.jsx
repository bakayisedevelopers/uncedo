import LegalPageShell, { LegalSection } from '../components/legal/LegalPageShell';

export default function RefundPolicyPage() {
  return (
    <LegalPageShell
      title="Refund and Cancellation Policy"
      updatedAt="June 6, 2026"
      intro="This policy explains how Parakleo handles refunds, cancellations, failed sessions, wallet credits, payment reversals, and tutor payout adjustments."
      contact="support@parakleo.app"
    >
      <LegalSection title="1. Wallet top-ups">
        <p>
          Wallet top-ups are intended for use on Parakleo tutoring sessions. If you add funds by mistake or add the wrong
          amount, contact support promptly with the transaction reference. Approved wallet refunds are returned to the
          original payment method where possible, less any unavoidable third-party payment, banking, chargeback, or fraud
          prevention costs that apply.
        </p>
      </LegalSection>

      <LegalSection title="2. Session cancellations">
        <p>
          A student may cancel a request before a tutor accepts it without a session charge. After a tutor accepts a
          request, Parakleo may charge a reasonable cancellation fee if the cancellation causes tutor loss, platform cost,
          or reserved session time. If a tutor cancels or does not attend, the student will not be charged for the tutor&apos;s
          missed session time and may receive a wallet credit or refund where a charge was already captured.
        </p>
      </LegalSection>

      <LegalSection title="3. Failed or poor-quality sessions">
        <p>
          If a session cannot reasonably proceed because of a verified Parakleo platform failure, duplicate charge,
          incorrect charge, tutor no-show, or tutor misconduct, Parakleo may issue a refund, partial refund, wallet credit,
          or session credit. If a problem is caused by the student&apos;s device, network, microphone permissions, late
          arrival, or cancellation, the session may remain chargeable.
        </p>
      </LegalSection>

      <LegalSection title="4. Disputes and review window">
        <p>
          Refund requests should be submitted within 7 days after the relevant transaction or session. Include the account
          email, session or transaction reference, amount, date, and a short explanation. Parakleo may review session
          timing, connection logs, messages, ratings, payment records, tutor attendance, and support history before
          deciding.
        </p>
      </LegalSection>

      <LegalSection title="5. Processing time">
        <p>
          Approved wallet credits are usually applied quickly. Card refunds depend on the payment provider and issuing bank
          and may take several business days after approval. The small card authorization charge used during verification is
          also refunded, but the timing depends on the payment provider and bank. Parakleo cannot control bank processing
          times after a refund is submitted.
        </p>
      </LegalSection>

      <LegalSection title="6. Tutor payout adjustments">
        <p>
          If a student refund, chargeback, duplicate charge, fraud event, or dispute affects a completed session, Parakleo
          may adjust the tutor payout for that session or offset the amount against future payouts, where permitted by law
          and the tutor terms.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
