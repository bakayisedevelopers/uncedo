import { ArrowLeft, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { WHATSAPP_CHAT_URL } from '../services/helperDataService';

const POLICY_TABS = [
  { path: '/privacy-policy', label: 'Privacy & POPIA' },
  { path: '/terms', label: 'Helper Terms' },
  { path: '/payment-pricing-policy', label: 'Payouts & Pricing' },
  { path: '/refund-policy', label: 'Cancellations & Refunds' },
  { path: '/data-voice-policy', label: 'Location & WhatsApp' },
];

const UPDATED_AT = '21 November 2026';

function PolicySection({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg sm:text-xl font-bold text-ink-900 tracking-tight">
        {title}
      </h2>
      <div className="space-y-3 text-sm text-ink-700 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function getPolicyMeta(policyKey) {
  switch (policyKey) {
    case 'terms':
      return {
        eyebrow: 'Uncedo Helpers Legal',
        title: 'Helper Terms & Conditions',
        intro: 'These Terms and Conditions govern service partners using Uncedo Helpers (web PWA, mobile app, and WhatsApp dispatch) alongside your signed Helper Agreement, our Privacy Policy & POPIA Notice, Payout Policy, and Cancellation Policy.',
      };
    case 'payment':
      return {
        eyebrow: 'Uncedo Helpers Financial Policy',
        title: 'Helper Payout, Pricing & Cash Policy',
        intro: 'This policy explains how customer quotes, service travel fees, helper payout splits (75% of subtotal plus travel fee), cash receipt verification, weekly Monday ZAR Paystack payouts, and wallet adjustments work.',
      };
    case 'refund':
      return {
        eyebrow: 'Uncedo Helpers Dispute & Cancellation Rules',
        title: 'Cancellation, Refund & Adjustment Policy',
        intro: 'This policy explains when customer cancellations carry R0 payout or partial travel compensation, what happens when a helper cancels, and how verified customer refunds or chargebacks adjust helper balances.',
      };
    case 'data':
      return {
        eyebrow: 'Uncedo Helpers Data & Telemetry',
        title: 'Location, Data & WhatsApp Policy',
        intro: 'This policy supplements Uncedo’s Privacy Policy & POPIA Notice by explaining live GPS dispatch tracking, route milestone telemetry, WhatsApp relay rules, PWA storage, and automated assistance limits.',
      };
    case 'privacy':
    default:
      return {
        eyebrow: 'POPIA Act 4 of 2013 Compliance',
        title: 'Helper Privacy Policy & POPIA Notice',
        intro: 'This Privacy Policy & POPIA Notice explains how Uncedo collects, processes, protects, shares, and retains helper personal and special personal information across onboarding, police-clearance vetting, Paystack bank verification, live GPS dispatch, payouts, and WhatsApp in accordance with South Africa’s Protection of Personal Information Act 4 of 2013 (POPIA).',
      };
  }
}

export function PolicyPage({ policyKey = 'privacy', user = null, onNavigate }) {
  const activePath =
    policyKey === 'terms'
      ? '/terms'
      : policyKey === 'payment'
        ? '/payment-pricing-policy'
        : policyKey === 'refund'
          ? '/refund-policy'
          : policyKey === 'data'
            ? '/data-voice-policy'
            : '/privacy-policy';

  const meta = getPolicyMeta(policyKey);
  const backPath = user ? '/profile/legal' : '/';
  const backLabel = user ? 'Back to Legal & Agreement' : 'Back to Uncedo Helpers';

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink-900">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => onNavigate(backPath)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-ink-700 hover:text-ink-900"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{backLabel}</span>
          </button>

          <a
            href="/"
            aria-label="Uncedo Helpers home"
            onClick={(e) => {
              e.preventDefault();
              onNavigate(user ? '/home' : '/');
            }}
            className="inline-flex items-center"
          >
            <img
              src="/helpers-wordmark.png"
              alt="Uncedo Helpers"
              referrerPolicy="no-referrer"
              className="h-8 w-auto object-contain shrink-0"
            />
          </a>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-8 py-8 sm:py-12 space-y-6">
        <nav aria-label="Helper policies" className="flex flex-wrap gap-2">
          {POLICY_TABS.map((tab) => {
            const active = tab.path === activePath;
            return (
              <button
                key={tab.path}
                type="button"
                onClick={() => onNavigate(tab.path)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors border ${
                  active
                    ? 'bg-tealbrand-600 border-tealbrand-600 text-white'
                    : 'bg-surface border-border text-ink-700 hover:bg-well'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <article className="rounded-[28px] border border-border bg-surface shadow-sm overflow-hidden">
          <div className="border-b border-border bg-tealbrand-50/40 px-6 py-7 sm:px-10 sm:py-9 space-y-3">
            <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.14em] text-tealbrand-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{meta.eyebrow}</span>
            </div>
            <h1 className="font-display text-2xl sm:text-4xl font-extrabold text-ink-900 tracking-tight">
              {meta.title}
            </h1>
            <p className="text-xs font-semibold text-ink-500">Last updated: {UPDATED_AT}</p>
            <p className="text-sm sm:text-base text-ink-700 leading-relaxed max-w-3xl pt-1">
              {meta.intro}
            </p>
          </div>

          <div className="px-6 py-7 sm:px-10 sm:py-9 space-y-8">
            {policyKey === 'privacy' && (
              <>
                <PolicySection title="1. Accountability & Responsible Party (POPIA Condition 1)">
                  <p>
                    Uncedo is operated by <strong>Jabu Msiza</strong> in the Republic of South Africa (“Uncedo”, “we”,
                    “us”). Uncedo is the Responsible Party under the Protection of Personal Information Act 4 of 2013
                    (POPIA) for helper and operational personal information processed through Uncedo Helpers.
                  </p>
                  <p>
                    To submit a POPIA access, correction, objection, or deletion request, or to reach Uncedo’s
                    Information Officer / privacy team, contact Uncedo via your helper profile support route or our
                    official WhatsApp channel (<code>wa.me/27605239926</code>) and request routing to the Information
                    Officer. Do not send passwords, one-time PINs, or full banking PINs in support chats.
                  </p>
                </PolicySection>

                <PolicySection title="2. Helper Personal & Special Personal Information Collected (Conditions 2 & s26–s33)">
                  <p>We limit collection to what is strictly necessary to onboard, vet, dispatch, and pay helpers:</p>
                  <ul className="list-disc space-y-2 pl-5">
                    <li>
                      <strong>Identity, profile &amp; contact details:</strong> Full legal name, individual or business
                      details, email address, international WhatsApp mobile number, home/dispatch base address, profile
                      headshot/selfie, and service portfolio photos.
                    </li>
                    <li>
                      <strong>Payout &amp; identity verification details:</strong> South African bank name, bank code,
                      cheque/savings account holder name and number, account type, and South African ID, passport, or
                      CIPC business registration number submitted securely for Paystack recipient verification and weekly
                      ZAR payouts.
                    </li>
                    <li>
                      <strong>Special Personal Information — Police Clearance Certificate (POPIA s26–s33):</strong> Your
                      SAPS police clearance PDF or scan contains criminal-behaviour verification data classified as
                      Special Personal Information under POPIA. It is uploaded with your explicit consent during
                      onboarding or renewal, stored encrypted in access-restricted private storage (
                      <code>helper-police-clearance-private/</code>) with object-hold safeguards, reviewed solely by
                      authorised Uncedo vetting administrators, never shared with customers or third-party AI tools, and
                      accessible only via short-lived authenticated preview links.
                    </li>
                    <li>
                      <strong>Signed Helper Agreement &amp; audit logs:</strong> Electronic acceptance checkbox, typed
                      legal name signature, timestamp, IP/user-agent audit fields, content SHA-256 hash, and generated
                      signed PDF copy.
                    </li>
                    <li>
                      <strong>Live GPS location &amp; dispatch activity:</strong> High-accuracy GPS coordinates and
                      reverse-geocoded street/city names collected <em>only</em> when you toggle Online or operate an
                      active trip, plus offer accept/decline logs, arrival PIN verifications, completion-proof photos,
                      ratings, wallet ledgers, and cash confirmation records.
                    </li>
                  </ul>
                </PolicySection>

                <PolicySection title="3. Lawful Grounds & Purpose Specification (Conditions 2, 3 & 4)">
                  <ul className="list-disc space-y-2 pl-5">
                    <li>
                      <strong>Contract performance &amp; onboarding:</strong> Reviewing your service offerings, storing
                      your signed Helper Agreement, matching nearby requests within the 50 km dispatch radius, routing
                      you to customer sites, verifying Paystack bank recipients, and executing Monday weekly ZAR
                      transfers.
                    </li>
                    <li>
                      <strong>Legal &amp; tax compliance:</strong> Retaining transaction, commission, payout, and signed
                      contract records required under South African commercial, accounting, and tax laws.
                    </li>
                    <li>
                      <strong>Safety, fraud prevention &amp; explicit consent:</strong> Vetting police clearances under
                      POPIA s26–s33 grounds, verifying customer 6-digit arrival PINs, confirming cash receipt, and
                      preventing off-platform evasion or impersonation. You may withdraw consent for future optional
                      processing, though statutory/contractual audit records may remain where legally required.
                    </li>
                  </ul>
                  <p>
                    Uncedo never sells helper personal information or uses helper vetting documents for unrelated
                    marketing.
                  </p>
                </PolicySection>

                <PolicySection title="4. Helper Obligations Regarding Customer Personal Information (POPIA)">
                  <p>
                    When you accept a request, Uncedo shares strictly limited customer details (service summary, customer
                    name/relay reference, and service address/pin). Under POPIA and your Helper Agreement, you are
                    legally bound to:
                  </p>
                  <ul className="list-disc space-y-1.5 pl-5">
                    <li>Use customer names, addresses, and job photos <strong>solely</strong> to complete that assigned Uncedo booking;</li>
                    <li>Never save, screenshot, export, publish, resell, or store customer details outside Uncedo;</li>
                    <li>Never contact customers off-platform after job completion or solicit direct EFT / off-platform payments; and</li>
                    <li>Report any suspected loss or unauthorised disclosure of customer information to Uncedo immediately.</li>
                  </ul>
                </PolicySection>

                <PolicySection title="5. Service Providers & Transborder Transfers (POPIA s72)">
                  <p>
                    Uncedo uses trusted infrastructure and payment partners including Google Cloud / Firebase (auth,
                    database, private storage, hosting), Paystack (bank account verification and ZAR payouts), and Meta
                    Platforms (WhatsApp Cloud API notifications and onboarding). Where data is processed outside South
                    Africa, transfers comply with POPIA section 72 safeguards such as contractual data-protection terms
                    or adequacy protections.
                  </p>
                </PolicySection>

                <PolicySection title="6. Information Quality, Retention & Honest Operational Controls (Condition 5)">
                  <p>
                    Keep your name, address, WhatsApp number, services, and bank details up to date under{' '}
                    <strong>Profile → Personal details</strong> and <strong>Payments → Bank payout destination</strong>.
                  </p>
                  <p>
                    Signed Helper Agreements, payout ledgers, and tax/audit records are retained as required for contract
                    enforcement and statutory periods. Police Clearance files remain under private Cloud Storage hold
                    protections during active vetting/audit retention. Temporary WhatsApp operational/media records carry
                    target expiry timestamps, though automated cleanup runs only when enabled in live environment flags
                    and bucket lifecycle policies; contact Uncedo support to request manual review or deletion where
                    permitted by law.
                  </p>
                </PolicySection>

                <PolicySection title="7. Security Safeguards & Breach Notification (Condition 7 & POPIA s22)">
                  <p>
                    Uncedo enforces HTTPS/TLS encryption, Firebase Authentication, server-side callable validation for
                    offer/status/payout writes, strict Firestore and Cloud Storage security rules, and private bucket
                    controls for police clearance and agreement PDFs. If a security compromise under POPIA section 22
                    occurs, Uncedo will notify the Information Regulator of South Africa and affected helpers as soon as
                    reasonably possible.
                  </p>
                </PolicySection>

                <PolicySection title="8. Your POPIA Rights, Automated Decisions (s71) & Regulator Complaints (Condition 8)">
                  <p>
                    Subject to identity verification and statutory retention rules, you may request confirmation of and
                    access to your records (s23), correction or deletion of inaccurate or unlawfully held data (s24),
                    objection to processing (s11(3)), or human administrator review of any moderation, police-clearance,
                    or automated dispatch/WhatsApp decision (s71).
                  </p>
                  <p>
                    You also have the right to complain to the <strong>Information Regulator of South Africa</strong> at{' '}
                    <a
                      className="font-bold text-tealbrand-700 underline"
                      href="https://inforegulator.org.za/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      inforegulator.org.za
                    </a>
                    .
                  </p>
                </PolicySection>
              </>
            )}

            {policyKey === 'terms' && (
              <>
                <PolicySection title="1. Relationship with Uncedo & Independent Contractor Status">
                  <p>
                    Uncedo Helpers connects independent, verified service providers with customers requesting services
                    through Uncedo’s mobile app, web portal, and WhatsApp channel. By registering or accepting offers, you
                    confirm that you act as an independent contractor—not an employee, partner, or agent of Uncedo
                    (operated by Jabu Msiza)—and that you are solely responsible for your own taxes, SARS filings,
                    equipment, licences, and statutory obligations.
                  </p>
                </PolicySection>

                <PolicySection title="2. Seven-Stage Verification & Readiness Rules">
                  <p>
                    To go online and accept dispatch offers, helpers must complete and maintain all verification
                    requirements: accurate profile &amp; WhatsApp phone linking, clear headshot selfie, admin-approved
                    service catalogue selections with genuine portfolio photos, acceptance of the current version of the
                    Uncedo Helper Agreement, approved Police Clearance Certificate (where required), and verified South
                    African bank payout details via Paystack.
                  </p>
                </PolicySection>

                <PolicySection title="3. Offer Acceptance, Live Status Honesty & 6-Digit Arrival PIN">
                  <ul className="list-disc space-y-2 pl-5">
                    <li>
                      <strong>Honest job progression:</strong> Only mark <em>Start Driving</em>,{' '}
                      <em>Buying Resources</em>, <em>Arrived</em>, <em>Work Started</em>, or <em>Completed</em> when you
                      genuinely reach each stage. False location spoofing or premature status updates may result in
                      suspension and payout forfeiture.
                    </li>
                    <li>
                      <strong>Arrival PIN verification:</strong> Upon arrival, obtain the 6-digit PIN from the customer’s
                      WhatsApp/app screen and enter it in Uncedo Helpers before beginning work.
                    </li>
                    <li>
                      <strong>Completion proof:</strong> Upload genuine proof-of-completion photos and notes where
                      requested to finalise billing.
                    </li>
                  </ul>
                </PolicySection>

                <PolicySection title="4. Strictly No Off-Platform Payments or Direct EFT Solicitation">
                  <p>
                    All confirmed jobs must be settled strictly through Uncedo’s approved checkout methods (
                    <strong>Paystack Card</strong> or helper-confirmed <strong>Cash</strong> inside Uncedo). Helpers are
                    strictly prohibited from requesting direct EFTs into private bank accounts, asking customers to cancel
                    and pay privately, or circumventing platform commission. Breach may result in immediate account
                    termination and payout withholding/offset.
                  </p>
                </PolicySection>

                <PolicySection title="5. Safety, Customer Property & Enforcement">
                  <p>
                    Treat every customer, household, and workplace with respect and care. Harassment, discrimination,
                    unsafe workmanship, theft, forged documents, or privacy violations are zero-tolerance offences. Uncedo
                    may pause dispatch, suspend accounts, or review disputed jobs at any time under South African law.
                  </p>
                </PolicySection>
              </>
            )}

            {policyKey === 'payment' && (
              <>
                <PolicySection title="1. Customer Total vs. Helper Payout Calculation">
                  <p>
                    Customers confirm a whole-Rand ZAR total upfront consisting of the service subtotal (base service and
                    answered option/quantity rules), the service’s configured <strong>travel fee</strong> (default R35 if
                    not custom-configured on the service), and an integer <strong>booking fee</strong> (1% of service +
                    travel subtotal, capped between R1 and R5).
                  </p>
                  <p>
                    Your displayed offer and completed-job helper payout is calculated as{' '}
                    <strong>75% of the service subtotal plus 100% of the service travel fee</strong>, always capped so
                    helper payout never exceeds the confirmed customer total. Uncedo retains the remaining 25% service
                    share plus the booking fee as platform commission.
                  </p>
                </PolicySection>

                <PolicySection title="2. Weekly Monday ZAR Payouts via Paystack">
                  <p>
                    Every Monday, Uncedo checks your single helper wallet balance. Whenever your wallet balance is
                    greater than R0.00, Paystack sends that amount to your verified South African cheque or savings
                    account and resets your wallet balance to R0.00 once the transfer succeeds. If a transfer fails or
                    is rejected, your wallet balance stays unchanged. When your balance is R0.00 or negative, no payout
                    transfer is initiated.
                  </p>
                </PolicySection>

                <PolicySection title="3. Cash Service Payments & Helper Confirmation Duty">
                  <p>
                    When a customer selects <strong>Pay with Cash</strong> after job completion and marks payment handed
                    over, the request appears under <strong>Payments → Cash Confirmations</strong>. Only tap{' '}
                    <em>Confirm Received</em> once you physically hold the full cash amount; tap <em>Not Received</em>{' '}
                    otherwise. Because you collected both your payout and Uncedo’s platform commission directly in cash,
                    Uncedo deducts the platform share from your wallet balance (which can temporarily make your balance
                    negative until offset by card jobs).
                  </p>
                </PolicySection>

                <PolicySection title="4. Failed Customer Charges & Commission Reconciliation">
                  <p>
                    Where a customer completion card charge fails and falls back to customer wallet debt, or where a
                    refund/chargeback occurs, your wallet summary reflects the authoritative backend ledger status until
                    settled or reconciled.
                  </p>
                </PolicySection>
              </>
            )}

            {policyKey === 'refund' && (
              <>
                <PolicySection title="1. Customer Cancellations">
                  <ul className="list-disc space-y-2 pl-5">
                    <li>
                      <strong>Pre-driving customer cancellation (R0):</strong> If a customer cancels before you start
                      driving (including while pending/matching or while the job is <em>accepted</em> before you tap
                      Start Driving), the customer owes R0 and helper payout for that cancelled job is <strong>R0</strong>.
                    </li>
                    <li>
                      <strong>Post-driving customer cancellation:</strong> If the customer cancels after you have
                      started driving, en route, or purchasing resources (or after arrival), Uncedo calculates the
                      applicable cancellation fee from verified distance travelled (or the service travel fee after
                      arrival) plus the booking fee and credits the helper’s eligible cancellation share once governed by
                      the backend cancellation ledger.
                    </li>
                  </ul>
                </PolicySection>

                <PolicySection title="2. Helper-Initiated Cancellations">
                  <p>
                    Only cancel an accepted job via the in-app cancel dialog (with a truthful reason) when genuinely
                    unable to complete it. A job cancelled by the assigned helper carries <strong>R0 payout</strong>, and
                    repeated or abusive last-minute cancellations may affect helper reliability standing and dispatch
                    eligibility.
                  </p>
                </PolicySection>

                <PolicySection title="3. Customer Refunds, Chargebacks & Wallet Adjustments">
                  <p>
                    If Uncedo approves a customer refund due to non-delivery, verified quality failure, duplicate card
                    billing, false status marking, or a card chargeback, Uncedo may deduct, reverse, or offset the
                    corresponding amount from your helper wallet balance. You may request human review of any adjustment
                    through Uncedo support.
                  </p>
                </PolicySection>
              </>
            )}

            {policyKey === 'data' && (
              <>
                <PolicySection title="1. Live GPS Tracking & Online Shift Controls">
                  <p>
                    While you are toggled <strong>Online</strong> using the central shift orb (or actively progressing a
                    job), Uncedo Helpers processes high-accuracy browser/device geolocation coordinates and reverse
                    geocoding so you appear within the 50 km service radius and customers can follow trip progress during
                    driving. Toggling <strong>Offline</strong> stops ongoing shift tracking updates and rejects stale
                    background pings from flipping you back online.
                  </p>
                </PolicySection>

                <PolicySection title="2. WhatsApp Notifications, Bridge Chat & Media">
                  <p>
                    Uncedo sends offer alerts, onboarding progression notices, agreement links, and payout updates to
                    your verified WhatsApp number, and provides an in-app job bridge chat so you and the customer can
                    coordinate without exposing unnecessary personal data. Do not ask customers for passwords, PINs
                    other than the Uncedo arrival verification flow, or card details.
                  </p>
                </PolicySection>

                <PolicySection title="3. PWA Offline Caching & Storage">
                  <p>
                    The Uncedo Helpers Progressive Web App caches static application shells and UI assets in your browser
                    for fast loading and displays an offline indicator when connectivity drops. Protected Firestore,
                    authentication, and live offer actions still require verified online server connectivity—do not rely
                    on offline cached views for live offer expiry or final payout balances.
                  </p>
                </PolicySection>

                <PolicySection title="4. Automated Systems & POPIA Alignment">
                  <p>
                    Automated dispatch matching and WhatsApp notifications strictly follow server-verified eligibility
                    and safety rules. For full details on your rights under POPIA (sections 23–25, s71 human review, and
                    s22 security notices), see our{' '}
                    <button
                      type="button"
                      onClick={() => onNavigate('/privacy-policy')}
                      className="font-bold text-tealbrand-700 underline"
                    >
                      Helper Privacy Policy &amp; POPIA Notice
                    </button>
                    .
                  </p>
                </PolicySection>
              </>
            )}

            <div className="rounded-2xl border border-tealbrand-600/20 bg-tealbrand-50/60 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-extrabold uppercase tracking-wider text-tealbrand-800">
                  POPIA &amp; Partner Support Contact
                </div>
                <p className="text-xs sm:text-sm text-ink-700 leading-relaxed">
                  Questions, POPIA access/deletion requests, or payout disputes? Message Uncedo Support on WhatsApp and
                  ask for our privacy / Information Officer or Helper Support team.
                </p>
              </div>
              <a
                href={WHATSAPP_CHAT_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-tealbrand-600 hover:bg-tealbrand-700 text-xs font-bold text-white shrink-0"
              >
                <span>Contact Support on WhatsApp</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </article>
      </main>
    </div>
  );
}
