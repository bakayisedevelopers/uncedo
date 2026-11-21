import { Link } from 'react-router-dom';
import LegalPageShell, { LegalSection } from '../components/legal/LegalPageShell';

export default function PaymentPricingPolicyPage() {
  return (
    <LegalPageShell
      title="Payment & Pricing Policy"
      updatedAt="21 November 2026"
      intro="This policy explains how Uncedo calculates customer quotes, travel fees, booking fees, waiting charges, helper payouts, and settlement methods in South African Rand (ZAR)."
      contact="For billing or payout questions, use the in-app support option or contact Uncedo via WhatsApp (wa.me/27605239926). Never share full card numbers, CVVs, or one-time PINs in support messages."
    >
      <LegalSection title="1. How customer quotes are calculated">
        <p>
          Every service booking quote in Uncedo is generated from the service catalogue and confirmed before dispatch:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Service subtotal:</strong> Calculated from the selected service or bundle base pricing and any
            required dynamic questionnaire options or quantity selections you answer.
          </li>
          <li>
            <strong>Travel fee:</strong> Drawn directly from the service’s configured <code>travelFee</code> in the
            Uncedo service catalogue (defaulting to <strong>R35</strong> if no custom service travel fee is configured).
          </li>
          <li>
            <strong>Booking fee:</strong> Calculated as <strong>1% of the service subtotal plus travel fee</strong>,
            rounded to a whole-Rand integer and capped between <strong>R1 and R5</strong> when greater than zero.
          </li>
          <li>
            <strong>Confirmed total consistency:</strong> The total confirmed by you before dispatch (including service
            subtotal, service travel fee, and booking fee) is saved on the request so your final payable amount remains
            consistent across confirmation, active tracking, and completed billing (adjusted only for agreed extras such
            as post-arrival waiting charges where applicable).
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Approved payment methods (Card & Cash — no EFT)">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Paystack Card Checkout:</strong> New card details are entered exclusively on Paystack’s PCI-DSS
            compliant hosted page. If you are signed in as the verified request owner and opt in to save a card, Paystack
            stores the card and Uncedo retains only a reusable authorisation reference and masked summary (brand and last
            four digits). Saved-card payments still require your explicit confirmation for the exact request and amount.
          </li>
          <li>
            <strong>Cash (Completed Service Jobs Only):</strong> After a helper completes an on-site job, you may select
            Cash, hand the confirmed amount directly to the assigned helper, and mark payment as handed over. The request
            remains pending until the helper confirms receipt in the Helpers portal or app.
          </li>
          <li>
            <strong>No Direct EFT:</strong> Uncedo does not offer direct bank-to-bank EFT on completion or cancellation
            checkout pages.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Unpaid balances & customer wallet debt">
        <p>
          If an automatic completion or cancellation fee charge cannot be settled on a saved card (or no chargeable card
          is on file), Uncedo records the unpaid balance against your customer <strong>wallet ledger</strong> (including
          for verified WhatsApp guest numbers) and sends a secure card checkout link. Paying that balance clears and
          reverses the wallet debt entry. Uncedo may restrict new bookings while an unpaid wallet debt remains open.
        </p>
      </LegalSection>

      <LegalSection title="4. Helper earnings, platform share, and weekly payouts">
        <p>
          For eligible completed jobs, helper payout amounts are calculated as <strong>75% of the service subtotal plus
          the service travel fee</strong>, capped so helper payout never exceeds the confirmed customer total. Uncedo
          retains the remaining 25% service share plus the booking fee as platform commission.
        </p>
        <p>
          Helper earnings (and cash/commission adjustments) are tracked in the server-authoritative helper wallet ledger
          and paid weekly in ZAR to the helper’s Paystack-verified South African bank account (every Monday cycle),
          subject to active Helper Agreement acceptance, verification status, and any pending dispute or chargeback
          adjustments.
        </p>
      </LegalSection>

      <LegalSection title="5. Related policies">
        <p>
          See also our <Link className="font-bold text-brand underline" to="/refund-policy">Refund &amp; Cancellation Policy</Link> and{' '}
          <Link className="font-bold text-brand underline" to="/terms">Terms and Conditions</Link>.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
