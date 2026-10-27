import LegalPageShell, { LegalSection } from '../components/legal/LegalPageShell';

export default function TermsPage() {
  return (
    <LegalPageShell
      title="Terms and Conditions"
      updatedAt="26 October 2026"
      intro="These terms explain how Uncedo’s customer and helper services work when you use our website, mobile applications or WhatsApp channel. Please read them before creating an account, submitting a request or accepting work."
      contact="For help with these terms or a service request, use the support option in the Uncedo app or contact Uncedo through its official WhatsApp channel. Do not send passwords, one-time codes, full card details or security codes in a support message."
    >
      <LegalSection title="1. About Uncedo and these terms">
        <p>
          “Uncedo”, “we” and “us” refer to Uncedo, operated by Jabu Msiza, and the operator responsible for making the
          service available.
          Uncedo provides online tools that help customers find and request services from independent helpers. These
          terms apply to the Uncedo customer website, mobile applications and WhatsApp service, together with any
          service-specific terms shown before you confirm a request.
        </p>
        <p>
          The operator’s full registered legal name and formal contact details should be confirmed and published by the
          business. Where a specific service term conflicts with these general terms, the specific term shown for that
          service applies to that request.
        </p>
      </LegalSection>

      <LegalSection title="2. Who may use Uncedo">
        <p>
          You must provide information that is accurate and keep your sign-in credentials and verification codes secure.
          You are responsible for activity carried out through your account. Do not impersonate another person or use
          another person’s account or WhatsApp identity without authority.
        </p>
        <p>
          A person may make an eligible enquiry or service request as a WhatsApp guest where that feature is available.
          Guest activity is associated with the verified WhatsApp conversation and does not, by itself, create or grant
          access to an existing Firebase account. To connect guest history to an account, the account owner must complete
          the verification and linking steps offered by Uncedo. A matching phone number alone is not sufficient proof of
          account ownership.
        </p>
        <p>
          If a service request concerns a child, a parent or legal guardian should make or manage the request and provide
          only the information reasonably needed for that service.
        </p>
      </LegalSection>

      <LegalSection title="3. Customer requests, quotes and matching">
        <p>
          The services currently available are the services displayed in the Uncedo catalogue. You may be asked to answer
          service questions and provide a service location or other details needed to prepare a quote and find an eligible
          helper. A quote is based on the information you provide and the applicable catalogue and pricing rules. Review
          the request details and final amount before confirming. A quote may expire or need to be recalculated if its
          validity period ends or the request details change.
        </p>
        <p>
          Submitting a draft or asking for a quote does not confirm a booking. A request becomes confirmed only after
          Uncedo records the required confirmation. Helper availability is not guaranteed. Uncedo may attempt to match an
          eligible helper, but it does not promise that a helper will be available or accept the request.
        </p>
        <p>
          Keep your request information accurate and use the available account or WhatsApp workflows to update or cancel
          a request. Cancellation eligibility, any applicable charge and any refund are determined by the terms shown for
          that request and the state of the service when the cancellation is processed. Do not rely on an AI-generated
          explanation as a substitute for the confirmed request or payment record.
        </p>
      </LegalSection>

      <LegalSection title="4. Helpers and service delivery">
        <p>
          Helpers use Uncedo to create a profile, offer services where permitted, receive eligible requests and manage
          service work. Helpers must provide accurate information, complete any verification required for their role,
          follow applicable safety requirements and communicate respectfully with customers.
        </p>
        <p>
          Helpers are responsible for delivering the service they accept. Uncedo provides the marketplace and operational
          tools; it does not guarantee a particular service outcome, helper earnings, customer result or uninterrupted
          availability. Helper verification or an active profile is not a guarantee of future conduct or service quality.
        </p>
      </LegalSection>

      <LegalSection title="5. Payments">
        <p>
          The payment methods offered for a request depend on its status and the options shown by Uncedo. They may include
          cash or a direct electronic payment to the assigned helper, or a card payment through Paystack-hosted checkout.
          For a direct payment, the customer pays the assigned helper and the helper must confirm receipt through an
          authorised Uncedo workflow. A customer’s statement that payment was made is not, on its own, confirmation of
          receipt.
        </p>
        <p>
          Card payments are considered complete only after Uncedo verifies the result with the payment provider and
          updates the authoritative payment record. A browser redirect, chat message or screenshot is not proof of
          payment. Never send a full card number, CVV or one-time payment credential through WhatsApp or support chat.
        </p>
        <p>
          A saved payment method may be charged only through a flow that identifies the request and amount and obtains
          your explicit confirmation. Payment processing, refunds and any applicable fees follow the terms shown for the
          request and the authoritative payment record. Uncedo does not promise that a payment method, provider or payment
          attempt will always be available.
        </p>
      </LegalSection>

      <LegalSection title="6. WhatsApp, automated assistance and communications">
        <p>
          If you contact Uncedo through WhatsApp, the service may use automated systems to understand your message, provide
          approved information, retrieve authorised request details or guide you through supported workflows. You can ask
          for human support where available. Automated responses can be incomplete or unavailable; confirm important
          booking and payment information in the relevant Uncedo record or app.
        </p>
        <p>
          Do not use a chat response to authorise an action unless the Uncedo workflow clearly asks you to confirm it.
          Uncedo will not treat an AI-generated statement as proof of identity, payment, helper acceptance or a completed
          booking. WhatsApp messages outside the applicable customer-service window may require an approved message
          template, and delivery depends on Meta and the recipient’s WhatsApp account.
        </p>
      </LegalSection>

      <LegalSection title="7. Acceptable use and safety">
        <p>
          You must not use Uncedo to commit fraud, harass or threaten another person, submit unlawful or misleading
          content, interfere with the platform, bypass payment or matching safeguards, or access information that does
          not belong to you. Do not use a helper or customer’s private contact details for unrelated purposes.
        </p>
        <p>
          We may restrict, suspend or close access where reasonably necessary to protect users, investigate suspected
          misuse, comply with law or maintain platform security. Where appropriate, we may preserve records needed to
          investigate a safety, payment or service dispute.
        </p>
      </LegalSection>

      <LegalSection title="8. Service availability and changes">
        <p>
          Uncedo and third-party services may be interrupted, changed or unavailable. We may add, change or retire features
          and update these terms. The current version will be published here with its update date. If a material change
          requires renewed acceptance, Uncedo may ask you to review the updated terms before continuing to use the
          affected channel or feature.
        </p>
      </LegalSection>

      <LegalSection title="9. Liability and applicable law">
        <p>
          Nothing in these terms limits a right or remedy that cannot lawfully be limited. To the extent permitted by law,
          Uncedo is not responsible for losses caused by inaccurate information supplied by a user, a third-party service
          outage, or conduct outside Uncedo’s reasonable control. This does not exclude responsibility that applicable
          law does not allow us to exclude.
        </p>
        <p>
          These terms are governed by the laws of the Republic of South Africa, subject to mandatory consumer-protection
          and other legal rights. If you have a concern, contact Uncedo support first so it can be reviewed.
        </p>
      </LegalSection>

      <LegalSection title="10. Privacy">
        <p>
          Our <a className="font-bold text-brand underline" href="/privacy-policy">Privacy Policy</a> explains how Uncedo
          handles personal information, including information shared through WhatsApp, service requests, payment and
          support workflows, and how to exercise your rights under South African data-protection law.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
