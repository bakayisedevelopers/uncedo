import { Link } from 'react-router-dom';
import LegalPageShell, { LegalSection } from '../components/legal/LegalPageShell';

export default function TermsPage() {
  return (
    <LegalPageShell
      title="Terms and Conditions"
      updatedAt="21 November 2026"
      intro="These Terms and Conditions govern your use of Uncedo’s customer website, mobile apps, payment pages, and WhatsApp service channel. By creating an account, confirming a booking, or paying through Uncedo, you agree to these terms together with our Privacy Policy & POPIA Notice, Payment & Pricing Policy, and Refund Policy."
      contact="For help with a booking, cancellation, payment link, or dispute, use the in-app support option or contact Uncedo via our official WhatsApp support channel (wa.me/27605239926). Never share passwords, one-time codes, full card numbers, or CVVs."
    >
      <LegalSection title="1. About Uncedo and marketplace role">
        <p>
          “Uncedo”, “we”, and “us” refer to Uncedo, operated by <strong>Jabu Msiza</strong> in the Republic of South
          Africa. Uncedo provides a digital marketplace and dispatch platform connecting customers with independent service
          helpers. Unless expressly stated otherwise in writing, helpers are independent contractors and not employees
          or agents of Uncedo.
        </p>
      </LegalSection>

      <LegalSection title="2. Eligibility, accounts, and WhatsApp guest bookings">
        <p>
          You must be at least 18 years old (or legally authorised on behalf of a business) and supply accurate name,
          email, international WhatsApp/phone number, and service address details. You are responsible for keeping your
          login credentials and WhatsApp account secure.
        </p>
        <p>
          Eligible enquiries and bookings may also be submitted as a <strong>WhatsApp guest</strong> where supported.
          Guest activity is tied to that verified WhatsApp conversation and remains subject to these Terms (including
          quote confirmation, arrival verification, and cancellation fee billing). Matching a phone number alone never
          grants access to an existing Uncedo account—linking guest history requires completing Uncedo’s one-time
          verified account-link flow.
        </p>
      </LegalSection>

      <LegalSection title="3. Service quotes, travel fees, and booking fees">
        <p>
          Before you confirm a request, Uncedo calculates a transparent quote in South African Rand (ZAR) based on the
          selected service or bundle, your answers to dynamic intake questions, the service’s configured{' '}
          <strong>travel fee</strong> (or the R35 default travel fee where a service does not specify one), and an integer{' '}
          <strong>booking fee</strong> (1% of the service plus travel subtotal, rounded and capped between R1 and R5 when
          applicable). Full fee mechanics are detailed in our{' '}
          <Link className="font-bold text-brand underline" to="/payment-pricing-policy">
            Payment &amp; Pricing Policy
          </Link>
          .
        </p>
        <p>
          Quotes may expire if not confirmed within their validity window or if you change your service selections. A
          request becomes a confirmed booking only once you submit final confirmation and Uncedo records the confirmed
          pricing snapshot in our backend.
        </p>
      </LegalSection>

      <LegalSection title="4. Matching, arrival PIN verification, and service delivery">
        <p>
          Uncedo routes confirmed requests to eligible, verified, online helpers within the applicable dispatch radius,
          but helper availability or acceptance is never guaranteed. When a helper arrives at your service address, Uncedo
          issues a <strong>6-digit arrival PIN</strong> via WhatsApp/app notification. You must provide that PIN to the
          assigned helper so they can verify arrival and start work. Helpers may also capture proof-of-completion photos
          or record post-arrival waiting time where applicable.
        </p>
      </LegalSection>

      <LegalSection title="5. Payments (Card or Cash only — no EFT)">
        <p>
          When a service is completed, Uncedo presents the verified final payable amount on your secure{' '}
          <code>/payment</code> checkout link or in-app payment flow using one of two approved methods:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Pay by Card (Paystack):</strong> Pay via Paystack’s hosted checkout or confirm an explicit one-time
            payment using a previously saved card. Card payments are considered complete only after Uncedo verifies
            settlement directly with Paystack.
          </li>
          <li>
            <strong>Pay with Cash:</strong> Where enabled for completed service jobs, you may select Cash, pay the
            assigned helper directly in cash, and tap “I have paid the helper”. Cash payment is marked paid only once the
            assigned helper confirms receipt inside Uncedo’s helper app.
          </li>
        </ul>
        <p>
          <strong>Direct EFT / off-platform bank transfers are not supported</strong> for service completion or
          cancellation payments. Helpers must never solicit off-platform EFT transfers or bypass Uncedo payment flows.
        </p>
      </LegalSection>

      <LegalSection title="6. Cancellations and customer wallet debt">
        <p>
          Cancellation rules depend strictly on the status of your booking when Uncedo processes your cancellation:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>No cancellation fee (R0):</strong> Cancelling before a helper is assigned, <em>or</em> after a helper
            has accepted the offer but before the helper starts driving/traveling, incurs <strong>R0 cancellation fee
            and R0 booking fee</strong>.
          </li>
          <li>
            <strong>Post-driving cancellation fee:</strong> Cancelling once the assigned helper has started driving, is
            en route, or is buying resources (or after arrival / work started) incurs the applicable cancellation charge
            calculated from distance travelled (or the service travel fee once arrived) plus the integer booking fee, as
            displayed to you for confirmation before cancelling.
          </li>
          <li>
            <strong>Card-only settlement &amp; wallet debt:</strong> Cancellation fees are payable by <strong>card
            only</strong> (cash is not accepted for cancellations). If an automatic completion or cancellation charge
            fails, or no chargeable saved card is present, the unpaid amount is deducted against your Uncedo{' '}
            <strong>wallet balance</strong> as an outstanding debt and a secure card payment link is sent to you. Settling
            that link by card reverses and clears the wallet debt.
          </li>
        </ul>
        <p>
          Further detail appears in our{' '}
          <Link className="font-bold text-brand underline" to="/refund-policy">Refund &amp; Cancellation Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection title="7. WhatsApp automated assistance">
        <p>
          When you interact with Uncedo on WhatsApp, automated assistants may guide booking steps, answer questions, or
          share request updates. You may request human support where available. Automated messages are never treated as
          authoritative proof of payment, booking confirmation, cancellation terms, or account ownership—Uncedo’s backend
          records govern in every case.
        </p>
      </LegalSection>

      <LegalSection title="8. Acceptable use, safety, and suspension">
        <p>
          You must not commit fraud, harass or threaten helpers or staff, manipulate quotes or GPS/PIN verification,
          attempt to take confirmed bookings off-platform to evade fees, or misuse another user’s personal information.
          Uncedo may suspend or terminate accounts, cancel active requests, or withhold/offset disputed balances where
          reasonably necessary for safety, fraud prevention, or legal compliance.
        </p>
      </LegalSection>

      <LegalSection title="9. Liability, consumer rights, and governing law">
        <p>
          Nothing in these terms limits any non-waivable rights you hold under South Africa’s{' '}
          <strong>Consumer Protection Act 68 of 2008</strong> or <strong>POPIA</strong>. To the maximum extent permitted
          by law, Uncedo is not liable for indirect losses, third-party outages (such as network, WhatsApp, or Paystack
          downtime), or inaccurate information supplied by a user. These terms are governed by the laws of the Republic of
          South Africa.
        </p>
      </LegalSection>

      <LegalSection title="10. Related policies">
        <p>
          Please also review our{' '}
          <Link className="font-bold text-brand underline" to="/privacy-policy">Privacy Policy &amp; POPIA Notice</Link>,{' '}
          <Link className="font-bold text-brand underline" to="/payment-pricing-policy">Payment &amp; Pricing Policy</Link>,{' '}
          <Link className="font-bold text-brand underline" to="/refund-policy">Refund Policy</Link>, and{' '}
          <Link className="font-bold text-brand underline" to="/data-voice-policy">Data &amp; Location Policy</Link>.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
