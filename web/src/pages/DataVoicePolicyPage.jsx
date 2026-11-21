import { Link } from 'react-router-dom';
import LegalPageShell, { LegalSection } from '../components/legal/LegalPageShell';

export default function DataVoicePolicyPage() {
  return (
    <LegalPageShell
      title="Data, Location & WhatsApp Policy"
      updatedAt="21 November 2026"
      intro="This policy supplements Uncedo’s Privacy Policy & POPIA Notice by explaining how location telemetry, WhatsApp messaging, attachments, and automated systems operate across Uncedo."
      contact="Questions or opt-out/deletion enquiries regarding location or WhatsApp data can be sent via Uncedo in-app support or official WhatsApp (wa.me/27605239926)."
    >
      <LegalSection title="1. Location & live GPS tracking">
        <p>
          Customers provide a service address or pin so Uncedo can confirm service availability and guide the assigned
          helper to the correct property. Active helpers share high-accuracy GPS coordinates only while toggled{' '}
          <strong>Online</strong> or actively progressing a matched job (dispatch within a 50 km radius and customer route
          tracking during driving). Going offline stops new live tracking updates.
        </p>
      </LegalSection>

      <LegalSection title="2. WhatsApp messaging, relay & media">
        <p>
          Uncedo uses the Meta WhatsApp Cloud API to send one-time account linking messages, quote confirmations, 6-digit
          arrival PINs, helper-customer relay messages, and payment links. Communication outside Meta’s 24-hour customer
          service window uses approved WhatsApp templates and depends on Meta platform delivery.
        </p>
        <p>
          Customers and helpers must not use Uncedo’s WhatsApp channel or relay to exchange passwords, one-time codes,
          bank/card credentials, or abusive content. Voice notes or image interpretation are processed only when explicitly
          enabled and supported in the workflow; helper Police Clearance Certificates are never passed to AI systems.
        </p>
      </LegalSection>

      <LegalSection title="3. Automated assistance boundaries (POPIA s71)">
        <p>
          Automated WhatsApp responses help route enquiries and display approved request summaries. Only Uncedo’s backend
          services—and where required, explicit customer or helper confirmation actions—authorise bookings, status
          transitions, payments, wallet entries, and account links. For full POPIA rights and safeguards, review our{' '}
          <Link className="font-bold text-brand underline" to="/privacy-policy">Privacy Policy &amp; POPIA Notice</Link>.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
