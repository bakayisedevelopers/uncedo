import LegalPageShell, { LegalSection } from '../components/legal/LegalPageShell';

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      updatedAt="26 October 2026"
      intro="This policy describes how Uncedo handles personal information when you use our customer and helper services through the website, mobile applications or WhatsApp. It is written with the Protection of Personal Information Act 4 of 2013 (POPIA) in mind."
      contact="For a privacy question or data-subject request, use the support option in the Uncedo app or contact Uncedo through its official WhatsApp channel and ask for the request to be routed to the person responsible for privacy. We may verify your identity before responding. Do not send passwords, one-time codes, full card details or security codes."
    >
      <LegalSection title="1. Who is responsible">
        <p>
          Uncedo is operated by Jabu Msiza. The operator responsible for providing Uncedo is the responsible party under
          POPIA and may use service providers acting on its behalf. The operator’s full registered legal name and the
          Information Officer’s direct contact details should be confirmed and published by the business. Until then, use
          the support route above to direct a request to the responsible party.
        </p>
      </LegalSection>

      <LegalSection title="2. Personal information we may handle">
        <p>
          Depending on how you use Uncedo, we may handle your name, email address, telephone or WhatsApp number, account
          identifiers, role, profile details, sign-in and verification records, service location, request details,
          questionnaire answers, quotes, booking and matching status, and communications with Uncedo or a helper.
        </p>
        <p>
          For customer requests, we may handle information needed to describe and deliver the requested service. For
          helpers, this may include service offerings, qualifications or verification material, availability, work
          history, ratings, earnings, wallet and commission records, payout details and payment-provider references.
          We also handle payment status, transaction references and limited card descriptors such as brand and last four
          digits where supported. Uncedo does not request or store your full card number or CVV in WhatsApp messages.
        </p>
        <p>
          If you use WhatsApp, we may process message text, interactive-button selections, message and delivery timestamps,
          conversation references and relevant account or request context. Supported attachments may be processed where
          the relevant feature is enabled. Do not send identity numbers, health information, payment credentials or other
          sensitive information unless Uncedo specifically asks for it through a suitable secure process.
        </p>
        <p>
          We may also process technical and security information such as device or browser details, service logs, failed
          operation codes, fraud-prevention signals and administrative audit records. We aim to limit the information
          collected to what is reasonably needed for the stated purposes.
        </p>
      </LegalSection>

      <LegalSection title="3. Why we use personal information">
        <p>
          We use information to create and secure accounts; verify identity and role; prepare service questions and quotes;
          match customers with eligible helpers; coordinate, update or cancel requests; confirm payments; account for
          helper earnings, commissions and payouts; provide customer and helper support; investigate disputes or misuse;
          maintain platform security; improve service reliability; and meet legal, tax, accounting and regulatory
          obligations.
        </p>
        <p>
          Where WhatsApp automated assistance is enabled, relevant message text and limited conversation or request
          context may be processed by automated systems to respond, retrieve authorised information or support a
          requested workflow. Automated summaries or responses are not the authoritative record of a booking, payment,
          identity or wallet balance. Those facts are checked against Uncedo’s backend records.
        </p>
        <p>
          We process information where needed to provide a service you request, to meet legal obligations, to protect
          legitimate safety and security interests, or on another lawful basis under POPIA. Where consent is the basis, you
          may withdraw it; withdrawal does not undo processing already lawfully carried out or processing required on
          another lawful basis.
        </p>
      </LegalSection>

      <LegalSection title="4. Who may receive information">
        <p>
          We may share the minimum information needed with the helper assigned to a request so the service can be delivered.
          We may also use service providers for cloud hosting and storage, account authentication, messaging, automated
          assistance, payment processing, notifications, security and technical support. Providers receive information
          only as needed for their role and under applicable contractual and legal safeguards.
        </p>
        <p>
          A payment provider may receive transaction information needed to process or verify a card payment. Uncedo does not
          receive your full card number or CVV through the hosted checkout. We do not expose payment credentials, OTPs or
          private account records to the conversational assistant.
        </p>
        <p>
          We may disclose information to a regulator, court, law-enforcement authority, professional adviser or another
          party where required or permitted by law, or where reasonably necessary to protect a person’s safety, prevent
          fraud or establish, exercise or defend legal rights.
        </p>
      </LegalSection>

      <LegalSection title="5. Processing outside South Africa">
        <p>
          Some service providers or their infrastructure may process or store information outside South Africa. Where
          personal information is transferred across borders, the responsible party must ensure that a condition in
          section 72 of POPIA is met, such as adequate protection, an applicable agreement or another lawful ground. The
          specific provider locations and transfer safeguards depend on the services configured for the feature you use.
        </p>
      </LegalSection>

      <LegalSection title="6. Guest requests and account linking">
        <p>
          An eligible WhatsApp guest request is associated with a WhatsApp identity and conversation reference so Uncedo
          can respond and manage the request. A guest record is separate from a Firebase-authenticated account. Uncedo
          does not give a person access to an existing account merely because the person supplies a matching telephone
          number. Where account linking is available, ownership must be established through the verification flow. Once
          successfully linked, eligible guest request history may be associated with that verified account. Requests that
          cannot be securely matched remain separate.
        </p>
      </LegalSection>

      <LegalSection title="7. Payments and financial records">
        <p>
          Uncedo may retain payment attempts, verified settlement status, transaction and receipt references, refund
          records, helper earnings, commission obligations, wallet ledger entries and payout outcomes. These records are
          used to reconcile payments, prevent duplicate charges or payouts, resolve disputes and meet legal accounting
          duties. A customer’s message or a successful browser redirect is not treated as proof of payment.
        </p>
        <p>
          A card is collected through the payment provider’s hosted interface. Where you explicitly choose to save a card
          and the payment provider supports it, Uncedo may retain a reusable authorisation reference and limited masked
          card details. You can request removal of an eligible saved payment method through the supported account or
          support workflow. No card is charged solely because an automated assistant suggested a payment option.
        </p>
      </LegalSection>

      <LegalSection title="8. Automated assistance and human review">
        <p>
          Automated assistance may classify a message, use approved service information, retrieve limited authorised
          account or request data, and help explain a result. Access to information and actions is controlled by backend
          permissions. The assistant is not allowed to approve payments, change wallet balances, link accounts or bypass
          required confirmations. You may request human support where available, and a support administrator may review
          relevant conversation and request information to resolve the issue.
        </p>
      </LegalSection>

      <LegalSection title="9. Retention and deletion">
        <p>
          We keep information for as long as reasonably necessary for the purpose for which it was collected, including
          service delivery, account security, financial reconciliation, legal duties, safety investigations and dispute
          handling. Financial and audit records may need to be retained after an account is closed. When information is no
          longer needed and no lawful retention ground applies, it should be securely deleted, de-identified or otherwise
          disposed of.
        </p>
        <p>
          Some temporary WhatsApp records are assigned target expiry periods. An expiry marker alone does not delete a
          record, and automated cleanup has not been verified as active for every record category in the current service.
          Some records may therefore remain until the relevant cleanup or an approved deletion process runs. This is a
          current operational limitation; contact support to make a request concerning your information.
        </p>
      </LegalSection>

      <LegalSection title="10. Security and incidents">
        <p>
          Uncedo uses technical and organisational safeguards intended to protect personal information against
          unauthorised access, loss, misuse, alteration or disclosure. Access is limited according to role and operational
          need. No internet service can guarantee perfect security. If a security compromise creates a risk as described
          by POPIA, the responsible party will notify the Information Regulator and affected data subjects as required by
          law.
        </p>
      </LegalSection>

      <LegalSection title="11. Your rights under POPIA">
        <p>
          Subject to applicable law and verification, you may ask for access to personal information, correction or
          deletion of inaccurate, excessive or unlawfully held information, details about how it is used, or objection to
          certain processing. You may also withdraw consent where processing is based on consent and complain to the
          Information Regulator. Some requests may be limited where information must be retained to meet legal duties,
          protect another person’s rights, complete a transaction or resolve a dispute.
        </p>
        <p>
          To exercise a right, contact Uncedo through the support route listed above and state what you are requesting.
          We may ask for reasonable proof of identity and enough details to locate the relevant account or conversation.
          Do not send your password, verification code or full payment credentials as proof.
        </p>
        <p>
          Information Regulator of South Africa: <a className="font-bold text-brand underline" href="https://inforegulator.org.za/" target="_blank" rel="noreferrer">inforegulator.org.za</a>.
        </p>
      </LegalSection>

      <LegalSection title="12. Children and special personal information">
        <p>
          Where a service request concerns a child, a parent or legal guardian should make or manage the request and
          provide only the information reasonably needed for the service. Uncedo should process children’s information or
          special personal information only on a lawful basis and with the safeguards required by POPIA.
        </p>
      </LegalSection>

      <LegalSection title="13. Changes to this policy">
        <p>
          We may update this policy when the service or applicable requirements change. The current version and date will
          appear on this page. If a material change requires renewed acceptance, Uncedo may ask you to review the updated
          policy before continuing to use the affected channel or feature.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
