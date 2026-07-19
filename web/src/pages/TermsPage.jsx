import LegalPageShell, { LegalSection } from '../components/legal/LegalPageShell';

export default function TermsPage() {
  return (
    <LegalPageShell
      title="Terms of Service"
      updatedAt="June 6, 2026"
      intro="These Terms govern use of Parakleo by students, tutors, and administrators. By creating an account, signing in, requesting a class, accepting a class, joining a session, adding a payment method, or receiving a payout, you agree to these Terms and the linked policies."
      contact="legal@parakleo.app"
    >
      <LegalSection title="1. Accounts and eligibility">
        <p>
          You must provide accurate account, profile, payment, and payout information. Students are responsible for class
          requests they submit and payment methods they add. Tutors must provide truthful qualification, subject, grade,
          availability, banking, and identity-related information. Parakleo may reject, suspend, restrict, or terminate
          accounts where information is false, unsafe, abusive, unlawful, or creates risk for users or the platform.
        </p>
      </LegalSection>

      <LegalSection title="2. Tutoring marketplace">
        <p>
          Parakleo provides tools for students to request tutoring and for tutors to accept suitable requests. Tutors are
          independent service providers and are not employees of Parakleo unless a separate written agreement says
          otherwise. Students and tutors remain responsible for their own conduct, preparation, punctuality, communication,
          and lawful use of the service.
        </p>
      </LegalSection>

      <LegalSection title="3. Conduct rules">
        <p>
          Users must not harass, threaten, discriminate, impersonate others, share illegal content, request academic fraud,
          bypass Parakleo payments, misuse screen sharing or microphone access, upload malicious files, scrape the service,
          or interfere with platform security. Tutors must teach within their verified capability and treat students
          professionally. Students must use sessions for lawful learning support.
        </p>
      </LegalSection>

      <LegalSection title="4. Payments, pricing, and refunds">
        <p>
          Session pricing, wallet funding, card authorization, outstanding debt, platform fees, tutor payouts,
          cancellations, refunds, and disputes are governed by the Payment and Pricing Policy and Refund Policy. Pricing
          quotes can expire or be adjusted before confirmation if request details or pricing conditions change. Failed
          charges may create a wallet debt balance that must be settled before further service use.
        </p>
      </LegalSection>

      <LegalSection title="5. Live sessions and technology">
        <p>
          Parakleo may use WebRTC, microphone access, screen sharing, notifications, OCR, and third-party infrastructure to
          provide sessions. Users are responsible for stable internet, compatible devices, and granting required
          permissions. Parakleo may not be liable for failures caused by unsupported devices, blocked networks,
          third-party outages, user settings, or interruptions outside Parakleo&apos;s reasonable control.
        </p>
      </LegalSection>

      <LegalSection title="6. Content and intellectual property">
        <p>
          Users keep ownership of content they submit, such as questions, images, documents, messages, and profile
          material. Users grant Parakleo the rights needed to host, display, process, transmit, extract text from, moderate,
          and use that content to provide, secure, support, and improve the service. Users must have permission to upload
          any content they submit.
        </p>
      </LegalSection>

      <LegalSection title="7. Suspension and termination">
        <p>
          Parakleo may suspend or terminate access for policy violations, fraud risk, non-payment, chargebacks, unsafe
          conduct, legal requests, repeated disputes, or platform abuse. Users remain responsible for amounts owed before
          suspension or termination.
        </p>
      </LegalSection>

      <LegalSection title="8. Disclaimers and liability">
        <p>
          Parakleo is provided on an as-is and as-available basis to the extent permitted by law. We do not guarantee any
          specific academic outcome, tutor availability, uninterrupted session, or error-free service. Nothing in these
          Terms excludes liability that cannot be excluded under applicable law.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
