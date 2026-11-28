import { Link } from 'react-router-dom';
import LegalPageShell, { LegalSection } from '../components/legal/LegalPageShell';

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy & POPIA Notice"
      updatedAt="27 November 2026"
      intro="This Privacy Policy and POPIA Notice explains how Uncedo collects, uses, stores, shares, secures, and disposes of personal information across the Uncedo website, customer and helper applications, web payment pages, and WhatsApp service channel in compliance with the Protection of Personal Information Act 4 of 2013 (POPIA) of South Africa."
      contact="To submit a POPIA access, correction, deletion, or objection request, or to reach our Information Officer / privacy team, use the in-app support option or contact Uncedo through our official WhatsApp support channel (wa.me/27605239926) and request routing to the Information Officer. We verify identity before acting on any request. Never send passwords, one-time codes, full card numbers, or CVVs."
    >
      <LegalSection title="1. Accountability and responsible party (POPIA Condition 1)">
        <p>
          Uncedo is operated by <strong>Jabu Msiza</strong> in the Republic of South Africa (“Uncedo”, “we”, “us”). As the
          Responsible Party under POPIA, Uncedo determines why and how personal information is processed when you use our
          platform and holds our authorised service providers (“Operators”) to written confidentiality and security
          obligations.
        </p>
        <p>
          Privacy enquiries, PAIA/POPIA requests, and complaints directed to Uncedo’s Information Officer should be sent
          through the in-app support workflow or our official WhatsApp support channel with enough account or request
          context to locate your record.
        </p>
      </LegalSection>

      <LegalSection title="2. Personal information we collect and minimality (Condition 2)">
        <p>
          We collect only personal information that is adequate, relevant, and not excessive for delivering requested
          services, managing accounts, verifying safety, and settling payments:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Identity, contact &amp; account records:</strong> Full name, email address, international WhatsApp or
            telephone number, Firebase user identifier (UID), account role (customer or helper), individual or business
            account details (including business name, category, and email), and account discovery source.
          </li>
          <li>
            <strong>Service requests, quotes &amp; verification:</strong> Service categories, intake questionnaire answers,
            calculated quotes (service subtotal, service travel fee, integer booking fee, and post-arrival waiting fees at
            R1/min after the 2-minute free grace period), booking status, 6-digit arrival PIN verification events,
            completion-proof photos uploaded for a job, ratings, and support tickets.
          </li>
          <li>
            <strong>Location &amp; live GPS tracking:</strong> Customer service address and coordinates needed to quote,
            match, and navigate to the job. For active helpers, live GPS coordinates and reverse-geocoded street/city
            locations are processed while the helper is online or on an active trip and stop when the helper goes offline.
          </li>
          <li>
            <strong>Payment &amp; wallet records:</strong> Payment status, Paystack transaction, split settlement, and
            receipt references, masked card descriptors (brand and last four digits) with reusable Paystack authorisation
            tokens where you explicitly consent to save a card, customer wallet ledger entries (including failed-charge or
            23-hour overdue debt balances and card-settlement reversals), cash payment confirmations, and helper Paystack
            split or monthly 26th ZAR bank payout records. Uncedo never collects or stores your full card number or CVV and
            never accepts card details over WhatsApp.
          </li>
          <li>
            <strong>Special personal information &amp; helper vetting (POPIA s26–s33):</strong> For helpers applying to
            deliver services, Uncedo collects a profile headshot/selfie, work portfolio images, banking/identity
            verification references (South African ID, passport, or business registration number verified via Paystack
            recipient verification), and a <strong>Police Clearance Certificate</strong>. Police clearance files contain
            sensitive criminal-record verification data and are stored in access-restricted private verification storage,
            reviewed solely by authorised Uncedo administrators, and never displayed publicly or sent to AI models.
          </li>
          <li>
            <strong>WhatsApp, automated assistance &amp; technical logs:</strong> WhatsApp message content, interactive
            button choices, delivery timestamps, supported media attachments where enabled, device/browser telemetry,
            error/audit logs, and short-lived session storage keys required for security and checkout integrity.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Lawful grounds and purpose specification (Conditions 2 & 3)">
        <p>We process personal information under POPIA section 11 only where a lawful justification applies:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Performance of a contract or pre-contract steps:</strong> Preparing quotes, matching customers with
            eligible nearby helpers, issuing arrival PINs, coordinating job progress, verifying Paystack card or cash
            payments, managing cancellation fees, and executing helper payouts.
          </li>
          <li>
            <strong>Compliance with legal obligations:</strong> Financial reconciliation, tax/SARS accounting records,
            fraud and anti-abuse prevention, and regulatory or court compliance.
          </li>
          <li>
            <strong>Legitimate safety and platform interests:</strong> Helper vetting, live dispatch safety, preventing
            duplicate charges or off-platform payment evasion, and securing user accounts and one-time links.
          </li>
          <li>
            <strong>Explicit consent (which you may withdraw):</strong> Saving a reusable Paystack card token for faster
            future checkout, submitting special personal information such as a Police Clearance Certificate during helper
            onboarding, or optional media/marketing communications. Withdrawing consent does not invalidate prior lawful
            processing or prevent retention required by law.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Further processing limitation & openness (Conditions 4 & 6)">
        <p>
          Uncedo does not sell, rent, or trade your personal information to third parties for unrelated marketing. Any
          further processing is strictly compatible with the purpose for which the information was originally collected
          (for example, using a request and payment record to resolve a dispute, calculate a helper payout, or investigate
          a safety incident).
        </p>
        <p>
          Notices linking to this Privacy Policy and our{' '}
          <Link className="font-bold text-brand underline" to="/terms">Terms of Service</Link>,{' '}
          <Link className="font-bold text-brand underline" to="/payment-pricing-policy">Payment &amp; Pricing Policy</Link>,
          and <Link className="font-bold text-brand underline" to="/refund-policy">Refund Policy</Link> are surfaced across
          sign-up, customer account, payment checkout, and footer links.
        </p>
      </LegalSection>

      <LegalSection title="5. Cookies, browser storage, and capability links">
        <p>
          Uncedo uses essential browser storage rather than third-party advertising trackers: Firebase Authentication local
          persistence to keep signed-in users authenticated, <code>sessionStorage</code> on the <code>/payment</code> page
          to retain your single-session payment reference after scrubbing sensitive tokens from the URL bar, and strict{' '}
          <code>no-store</code> / <code>no-referrer</code> headers on payment and account-linking routes so one-time
          capability links are not leaked via browser referrers.
        </p>
      </LegalSection>

      <LegalSection title="6. Who may receive personal information">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Assigned helpers or customers:</strong> Once a job offer is accepted, Uncedo shares only the minimum
            job details required for fulfilment (such as service summary, service location, arrival status, and relayed
            updates). Helpers are contractually bound under our Helper Agreement and POPIA not to copy, export, contact
            off-platform, or misuse customer personal information.
          </li>
          <li>
            <strong>Authorised service providers (Operators):</strong> Google Cloud and Firebase (hosting, authentication,
            Firestore, Realtime Database, and Storage), Paystack (hosted card checkout, card tokenization, South African bank
            account verification, and ZAR helper transfers), Meta Platforms (WhatsApp Cloud API delivery), and configured
            AI assistance providers acting strictly under Uncedo’s backend permission controls.
          </li>
          <li>
            <strong>Law enforcement &amp; regulators:</strong> Where required by South African law, court order, subpoena, or
            to protect vital safety and prevent fraud.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Transborder information flows (POPIA section 72)">
        <p>
          Cloud infrastructure, payment, messaging, and AI service providers used by Uncedo (including Google Cloud,
          Firebase, Meta WhatsApp Cloud API, and Paystack) may store or process data on servers located outside South
          Africa. When cross-border transfers occur, Uncedo relies on POPIA section 72 safeguards—such as binding
          contractual data-protection commitments, adequate statutory protections, or necessity to perform your requested
          international communication or transaction.
        </p>
      </LegalSection>

      <LegalSection title="8. Guest WhatsApp requests & account linking">
        <p>
          Eligible WhatsApp guest requests are linked to the verified WhatsApp phone number and conversation reference so
          Uncedo can manage bookings, cancellations, and card payment links. Guest records remain separate from
          Firebase-authenticated accounts. Uncedo never grants access to an existing account solely because a phone number
          matches; ownership must be verified via a one-time expiring WhatsApp link before guest history can be linked.
        </p>
      </LegalSection>

      <LegalSection title="9. Automated processing & human review (POPIA section 71)">
        <p>
          Where WhatsApp automated assistance is enabled, AI systems may classify enquiries, summarise approved service
          rules, or retrieve authorised booking status on your behalf. Automated assistants cannot approve payments,
          modify wallet debt or helper balances, alter bookings without required confirmations, or grant account access.
          Authoritative pricing, cancellation fees, payments, and payout decisions are enforced by Uncedo’s backend
          servers, and you may always request human administrator review for any dispute, moderation decision, or account
          action.
        </p>
      </LegalSection>

      <LegalSection title="10. Information quality, retention, and 30-day account deletion (Condition 5)">
        <p>
          You can review and update your customer name, service address, account type, and contact details at any time on
          your <Link className="font-bold text-brand underline" to="/account">Account page</Link> or through supported
          WhatsApp/in-app flows.
        </p>
        <p>
          <strong>Self-service account deletion &amp; 30-day reactivation window:</strong> You may request account
          deletion from your Account page or via a verified one-time 30-minute WhatsApp link. Deletion cannot be scheduled
          while you have an active service request, an unpaid completed or cancelled job, or a negative wallet debt
          balance. Once scheduled, your account enters a <strong>30-day pending-deletion grace period</strong> during
          which you may reactivate it. If you do not reactivate within 30 days, Uncedo permanently deletes your active
          user profile, authentication login, and WhatsApp account link, while <strong>imprinting</strong> your name,
          verified contact details, and deletion timestamp solely onto existing historical service requests, financial
          payment records, and support tickets (creating no new records if none existed) so Uncedo can meet South
          African tax, accounting, fraud-prevention, and dispute-resolution obligations.
        </p>
        <p>
          We retain those financial, booking, wallet-debt, payout, and audit records for as long as needed for service
          delivery, dispute resolution, fraud prevention, and statutory South African tax and accounting periods. Helper
          Police Clearance Certificates are held in private storage with object-hold safeguards to preserve vetting and
          audit integrity unless lawful destruction is required and approved.
        </p>
        <p>
          Certain temporary WhatsApp operational and media records carry target expiry timestamps; however, scheduled
          automated cleanup only executes when retention-cleanup flags and Cloud Storage bucket lifecycle rules are
          explicitly active in the live environment. Where automatic deletion has not yet run, records remain protected in
          access-restricted backend storage until manual or scheduled deletion—contact support at any time to exercise a
          deletion request.
        </p>
      </LegalSection>

      <LegalSection title="11. Security safeguards and breach notification (Conditions 7 & s22)">
        <p>
          Uncedo protects personal information using HTTPS/TLS encryption in transit, Firebase Authentication, strict
          role-based Firestore and Cloud Storage security rules, server-side authority for financial and wallet writes,
          hashed arrival PIN verification, and tokenized payment credentials.
        </p>
        <p>
          If there are reasonable grounds to believe that personal information has been accessed or acquired by an
          unauthorised person (a security compromise under section 22 of POPIA), Uncedo will notify the{' '}
          <strong>Information Regulator of South Africa</strong> and affected data subjects as soon as reasonably possible,
          providing steps you can take to mitigate potential harm.
        </p>
      </LegalSection>

      <LegalSection title="12. Data subject participation and your POPIA rights (Condition 8)">
        <p>Subject to identity verification and applicable statutory exceptions under POPIA sections 23–25, you have the right to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Request confirmation of whether Uncedo holds your personal information and obtain a copy or description of it;</li>
          <li>Request correction, updating, or deletion of inaccurate, irrelevant, excessive, outdated, or unlawfully held data;</li>
          <li>Object on reasonable grounds to processing (section 11(3)), or object at any time to direct marketing;</li>
          <li>Withdraw previously granted consent where processing relies solely on consent;</li>
          <li>Request human intervention or challenge decisions made solely by automated processing (section 71);</li>
          <li>
            Lodge a complaint with the <strong>Information Regulator of South Africa</strong> if you are unsatisfied with how
            Uncedo handles your personal information:{' '}
            <a className="font-bold text-brand underline" href="https://inforegulator.org.za/" target="_blank" rel="noreferrer">
              inforegulator.org.za
            </a>
            .
          </li>
        </ul>
        <p>
          Some deletion requests may be deferred or limited where active jobs remain open or where retention is legally
          required (for example, unpaid completed/cancelled request balances, unpaid wallet-debt settlement records,
          statutory tax records, imprinted transaction audit histories, or active safety investigations).
        </p>
      </LegalSection>

      <LegalSection title="13. Children's personal information (POPIA sections 34–35)">
        <p>
          Uncedo accounts are intended for adults (18 years or older) or legally authorised business representatives. We do
          not knowingly permit children to create accounts independently. Any service request involving a child must be
          placed and managed by a parent or legal guardian, providing only the minimum information necessary.
        </p>
      </LegalSection>

      <LegalSection title="14. Updates to this policy">
        <p>
          We may update this Privacy Policy and POPIA Notice as Uncedo’s features, payment flows, or legal requirements
          evolve. The latest effective date is shown at the top of this page, and material changes may require renewed
          notice or acceptance before continued use.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
