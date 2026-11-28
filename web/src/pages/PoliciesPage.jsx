import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import LegalPageShell from '../components/legal/LegalPageShell';

const POLICY_LINKS = [
  {
    to: '/privacy-policy',
    title: 'Privacy Policy & POPIA Notice',
    description:
      'How Uncedo collects, secures, and disposes of personal information under South Africa’s Protection of Personal Information Act.',
  },
  {
    to: '/terms',
    title: 'Terms of Service',
    description:
      'Booking terms, arrival PIN confirmation, customer and helper responsibilities, and platform rules.',
  },
  {
    to: '/payment-pricing-policy',
    title: 'Payment & Pricing Policy',
    description:
      'Transparent quote structure, cash or Paystack link settlement, waiting fees, and helper payouts.',
  },
  {
    to: '/refund-policy',
    title: 'Refund & Cancellation Policy',
    description:
      'Cancellation windows, dispute resolution, and refund timelines for paid bookings.',
  },
  {
    to: '/data-voice-policy',
    title: 'Data & Location Policy',
    description:
      'How service addresses, live helper GPS during active trips, and WhatsApp thread history are handled.',
  },
];

export default function PoliciesPage() {
  return (
    <LegalPageShell
      eyebrow="Policies"
      title="Uncedo Policies & Legal"
      updatedAt="27 November 2026"
      intro="Review how Uncedo protects your privacy under POPIA, structures transparent pricing and payments, and keeps bookings safe across WhatsApp and our apps."
      contact="For POPIA or policy questions, message our official WhatsApp channel (wa.me/27605239926) and ask to reach the Information Officer."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {POLICY_LINKS.map((policy) => (
          <Link
            key={policy.to}
            to={policy.to}
            className="group flex flex-col justify-between rounded-2xl border border-zinc-200 bg-zinc-50/60 p-5 transition-colors hover:border-emerald-300 hover:bg-emerald-50/40"
          >
            <div>
              <h2 className="font-display text-lg font-bold text-zinc-950 group-hover:text-brand-dark">
                {policy.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{policy.description}</p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-brand-dark">
              <span>Read policy</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
    </LegalPageShell>
  );
}
