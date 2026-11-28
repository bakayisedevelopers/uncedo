import { Link } from 'react-router-dom';
import LegalPageShell, { LegalSection } from '../components/legal/LegalPageShell';

export default function RefundPolicyPage() {
  return (
    <LegalPageShell
      title="Refund & Cancellation Policy"
      updatedAt="27 November 2026"
      intro="This policy sets out when cancellations are free, when travel and R1/min waiting cancellation fees apply, how unpaid wallet debt restricts new bookings, and how refunds or payment disputes are processed on Uncedo."
      contact="If you believe a charge, cancellation fee, or cash confirmation is incorrect, contact Uncedo support in-app or via WhatsApp (wa.me/27605239926) with your request reference."
    >
      <LegalSection title="1. Free customer cancellations (R0 fee)">
        <p>You will not be charged any cancellation fee or booking fee (<strong>R0 total</strong>) if you cancel:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Before any helper accepts your request (while pending, matching, offered, or scheduled); or</li>
          <li>
            After a helper accepts the job, provided the helper has <strong>not yet started driving or traveling</strong>{' '}
            towards your location.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Post-driving and post-arrival cancellation fees">
        <p>
          Once the assigned helper transitions the job to driving, en route, or purchasing resources (or after the helper
          has arrived or started work), cancelling compensates for travel incurred, waiting time, and platform allocation:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>While driving / en route / buying resources:</strong> Distance travelled (calculated at R4/km based on
            verified tracking progress) plus the request’s integer booking fee.
          </li>
          <li>
            <strong>After helper arrival or work started:</strong> The service’s full travel fee, any accrued post-arrival
            waiting fee after the <strong>2-minute free grace period at R1 per minute</strong> (you receive a WhatsApp
            alert when the 2 free minutes end and R1/min charging starts), plus the integer booking fee.
          </li>
        </ul>
        <p>
          Before your cancellation is finalised, Uncedo shows the exact calculated cancellation fee so you can review
          and confirm it. Cancellation fees are payable by <strong>card only</strong> (cash is not accepted); if no saved
          card succeeds, the unpaid fee is recorded in your wallet and new bookings remain blocked across your linked
          accounts until you settle the debt by card via your <code>/payment</code> link.
        </p>
      </LegalSection>

      <LegalSection title="3. Helper cancellations & no-shows">
        <p>
          If the assigned helper cancels a request before completion, you owe no cancellation fee for that helper
          cancellation and the cancelling helper receives <strong>R0 payout</strong>. Uncedo permanently excludes that
          cancelling helper from rematching onto the same request and automatically searches for another eligible helper
          (or lets you rebook).
        </p>
      </LegalSection>

      <LegalSection title="4. Duplicate charges, failed settlements, and refunds">
        <p>
          Uncedo verifies every card payment against Paystack’s backend transaction state before marking a request paid
          and uses idempotency protections to prevent duplicate charges. If a card settlement fails after an uncertain
          redirect, Uncedo reconciles the transaction first rather than charging twice.
        </p>
        <p>
          Approved card refunds are returned to the original Paystack payment method used for the transaction. Processing
          times depend on Paystack and the customer’s issuing South African bank (typically 3–7 business days once
          initiated). Where a Paystack refund or chargeback dispute is received, Uncedo records the dispute audit trail
          and reverses split debt recovery credits or restricts helper wallet reconciliation accordingly.
        </p>
      </LegalSection>

      <LegalSection title="5. Cash payment disputes">
        <p>
          If you selected Pay with Cash and paid the helper, the helper must confirm receipt in the Helpers app. If a
          helper marks cash as “Not Received”, the request returns to payment-method selection so you can resolve the
          dispute with support or pay by card if cash was not handed over.
        </p>
      </LegalSection>

      <LegalSection title="6. Consumer Protection Act & related policies">
        <p>
          Nothing in this policy limits statutory remedies available under South Africa’s Consumer Protection Act 68 of
          2008. See also our <Link className="font-bold text-brand underline" to="/payment-pricing-policy">Payment &amp; Pricing Policy</Link> and{' '}
          <Link className="font-bold text-brand underline" to="/terms">Terms and Conditions</Link>.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
