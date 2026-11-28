import { Link } from 'react-router-dom';
import LegalPageShell, { LegalSection } from '../components/legal/LegalPageShell';

export default function PaymentPricingPolicyPage() {
  return (
    <LegalPageShell
      title="Payment & Pricing Policy"
      updatedAt="27 November 2026"
      intro="This policy explains how Uncedo calculates customer quotes, travel fees, booking fees, post-arrival waiting charges, Paystack split settlements, wallet debt recovery, and monthly helper payouts in South African Rand (ZAR)."
      contact="For billing or payout questions, use the in-app support option or contact Uncedo via WhatsApp (wa.me/27605239926). Never share full card numbers, CVVs, or one-time PINs in support messages."
    >
      <LegalSection title="1. How customer quotes and waiting charges are calculated">
        <p>
          Every service booking quote in Uncedo is generated from the service catalogue and confirmed before dispatch:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Service subtotal:</strong> Calculated from the selected service or bundle base pricing and any
            required dynamic questionnaire options, quantity selections, or SAST schedule multipliers confirmed during
            intake.
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
            <strong>Post-arrival waiting fee (2 minutes free, then R1/min):</strong> When the assigned helper arrives at
            your location and sends the arrival alert, your first <strong>2 minutes</strong> are free so you can meet
            the helper and share your 6-digit arrival PIN. Once the 2-minute free grace window ends before work starts,
            Uncedo sends you a WhatsApp notification and waiting time is charged at <strong>R1 per minute</strong>{' '}
            (rounded to the nearest whole minute/Rand). Any accrued waiting fee is added to the completed total (or to
            the post-arrival cancellation fee if you cancel after arrival) and paid 100% to the helper.
          </li>
          <li>
            <strong>Confirmed total consistency:</strong> Your confirmed pre-dispatch total (service subtotal, travel
            fee, and booking fee) stays locked across dispatch and billing, adjusted only for post-arrival waiting
            charges or authorised service-credit discounts.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Approved payment methods (Card & Cash — no EFT)">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Paystack Card Checkout &amp; Automatic Split:</strong> New card details are entered exclusively on
            Paystack’s PCI-DSS compliant hosted page. If you are signed in as the verified request owner and opt in to
            save a card, Paystack stores the card and Uncedo retains only a reusable authorisation reference and masked
            summary (brand and last four digits). Card payments are routed through Paystack Split directly to verified
            helper subaccounts (after offsetting any negative helper wallet balance owed from cash commission) or held in
            the Uncedo platform account for wallet payout when split subaccount settlement is unavailable or deferred.
          </li>
          <li>
            <strong>Saved Cards:</strong> Stored cards still require your explicit confirmation for the exact request
            and payable amount before Paystack executes the charge.
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

      <LegalSection title="3. Overdue balances (23-hour recovery) & customer wallet debt">
        <p>
          If a completed service remains unpaid, Uncedo issues automated WhatsApp and in-app payment reminders and, if it
          is still unsettled after <strong>23 hours</strong> (or if an automatic completion or cancellation card charge
          fails), records the unpaid balance against your customer <strong>wallet ledger</strong> (including for
          verified WhatsApp guest numbers) while crediting the helper’s earned share to the helper wallet.
        </p>
        <p>
          Settling that balance via your secure card link immediately clears and reverses the customer wallet debt entry
          without double-crediting the helper. Uncedo restricts new service bookings across your linked accounts while
          any unpaid completed request, unpaid payable cancellation fee, or negative customer wallet balance remains open.
        </p>
      </LegalSection>

      <LegalSection title="4. Helper earnings, split settlements, and monthly 26th payouts">
        <p>
          For eligible completed jobs, helper payout amounts are calculated as <strong>75% of the service subtotal plus
          100% of the service travel fee and 100% of any accrued waiting fee</strong>, capped so helper payout never
          exceeds the confirmed customer total. Uncedo retains the remaining 25% service share plus the booking fee as
          platform commission.
        </p>
        <p>
          When a customer pays by card and the helper has an active Paystack payout subaccount, the helper share is
          settled automatically via Paystack Split (minus any negative cash-commission balance owed to Uncedo). Wallet
          earnings from unpaid/failed card charges or platform-hold fallback jobs are tracked in the server-authoritative
          helper wallet ledger and paid out automatically in ZAR on the <strong>26th of each month</strong> to the
          helper’s Paystack-verified South African bank account whenever the wallet balance exceeds R0.00 (subject to
          active Helper Agreement acceptance, verification status, and any pending dispute or chargeback adjustments).
        </p>
      </LegalSection>

      <LegalSection title="5. Related policies">
        <p>
          See also our <Link className="font-bold text-brand underline" to="/refund-policy">Refund &amp; Cancellation Policy</Link>,{' '}
          <Link className="font-bold text-brand underline" to="/terms">Terms and Conditions</Link>, and{' '}
          <Link className="font-bold text-brand underline" to="/privacy-policy">Privacy Policy &amp; POPIA Notice</Link>.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
