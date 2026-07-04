import LegalPageShell, { LegalSection } from '../components/legal/LegalPageShell';

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      updatedAt="June 6, 2026"
      intro="This policy explains how Parakleo handles account data, tutoring requests, live session data, payment records, and safety review across the web and mobile apps."
      contact="privacy@parakleo.app"
    >
      <LegalSection title="1. Information we collect">
        <p>
          We collect account details such as name, email address, authentication data, role, profile photo, referral
          details, notification preferences, and support messages. Student profiles may include grade, curriculum, subject
          needs, class requests, uploaded attachments, wallet status, ratings, and session history. Tutor profiles may
          include subjects, grades taught, qualification evidence, payout banking details, verification status,
          availability, session history, ratings, and payout records.
        </p>
        <p>
          We also process usage and operational data such as sign-in events, device and browser information, IP-derived
          security signals, session timing, WebRTC connection metadata, screen sharing state, OCR extraction results,
          pricing quotes, payment status, wallet balances, notification delivery events, and admin audit activity.
        </p>
      </LegalSection>

      <LegalSection title="2. How we use information">
        <p>
          We use personal information to create and secure accounts, match students with tutors, verify tutor eligibility,
          generate pricing quotes, provide live sessions, process payments, manage wallets and outstanding balances, send
          service notifications, prevent fraud and abuse, resolve disputes, improve reliability, comply with legal duties,
          and keep users safe.
        </p>
      </LegalSection>

      <LegalSection title="3. Payments and pricing data">
        <p>
          Parakleo uses third-party payment providers to authorize and charge cards. We do not store full card numbers or
          CVV codes in our application database. We may store payment tokens, card brand, last four digits, expiry month
          and year, nickname, transaction IDs, authorization status, charge status, refund status, wallet balance, debt
          balance, and related metadata needed to operate the service.
        </p>
      </LegalSection>

      <LegalSection title="4. Voice, screen sharing, and attachments">
        <p>
          Live sessions may request microphone access for WebRTC calls. Tutors may share their screen during a class.
          Parakleo processes connection state, ICE candidate metadata, microphone permission status, and screen sharing
          state to connect and troubleshoot sessions. Parakleo does not intentionally record live voice calls or screen
          shares unless a specific recording feature is introduced and clearly disclosed.
        </p>
        <p>
          If a user uploads an image or attachment for class preparation, we may process it with OCR or similar extraction
          tools so tutors can understand the question. Uploaded files and extracted text may be stored with the request or
          session for service delivery, quality review, billing support, safety, and dispute handling.
        </p>
      </LegalSection>

      <LegalSection title="5. Sharing information">
        <p>
          We share information only as needed to operate Parakleo. This may include sharing class requests and session
          details between matched students and tutors, payment information with payment processors, authentication and
          hosting data with cloud providers, OCR data with extraction providers, notifications with email or messaging
          providers, and information with regulators, law enforcement, courts, or advisers where legally required or
          necessary to protect rights, safety, users, and the platform.
        </p>
      </LegalSection>

      <LegalSection title="6. Retention">
        <p>
          We keep account, profile, session, request, payment, payout, support, and audit records for as long as needed to
          provide Parakleo, meet financial and tax obligations, prevent abuse, resolve disputes, and comply with applicable
          law. Some payment and transaction records may need to be retained after account deletion. Where possible, we
          delete, anonymize, or restrict information that is no longer needed.
        </p>
      </LegalSection>

      <LegalSection title="7. Your choices and rights">
        <p>
          You may update your profile information in the app. You may request access, correction, deletion, restriction,
          objection, or account deletion by contacting us. We may need to verify your identity before acting on a request,
          and some requests may be limited by legal, fraud-prevention, safety, tax, payment, or dispute obligations.
        </p>
      </LegalSection>

      <LegalSection title="8. Security">
        <p>
          We use reasonable technical and organizational safeguards designed to protect personal information against loss,
          misuse, unauthorized access, disclosure, alteration, and destruction. No online service can guarantee absolute
          security, so users must keep account passwords private and notify us promptly about suspected unauthorized access.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
