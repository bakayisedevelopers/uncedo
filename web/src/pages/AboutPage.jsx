import { Link } from 'react-router-dom';
import LegalPageShell, { LegalSection } from '../components/legal/LegalPageShell';

export default function AboutPage() {
  return (
    <LegalPageShell
      eyebrow="About Parakleo"
      title="Learning support that moves at student speed"
      updatedAt="June 7, 2026"
      intro="Parakleo is a web-based learning platform that helps students request academic support quickly and connect with verified tutors through a simple, reliable session flow. The product is designed for urgent help, flexible scheduling, and clear progress from request to live session."
      contact="For partnership, support, or platform questions, contact the Parakleo team through the app support channels."
    >
      <LegalSection title="What Parakleo Does">
        <p>
          Parakleo helps students request help for school subjects, describe what they need, and get matched with tutors
          who are available to assist. The platform is built around fast requests, structured session management, and a
          learning experience that feels straightforward on web.
        </p>
        <p>
          Students can submit a request, track its progress, and join a live session once a tutor accepts. Tutors can
          review incoming requests, respond to suitable sessions, and teach through the same connected workflow.
        </p>
      </LegalSection>

      <LegalSection title="How The Platform Helps">
        <p>
          The goal is to remove friction from getting academic help. Instead of long signup-to-booking delays, Parakleo
          focuses on immediate action: request support, confirm the details, and move into a live lesson with better
          visibility over status, timing, and follow-through.
        </p>
        <p>
          The platform also supports the wider session journey through notifications, tutor verification, session status
          tracking, payment-related policy pages, and account flows tailored for students and tutors.
        </p>
      </LegalSection>

      <LegalSection title="Who It Is For">
        <p>
          Parakleo is built for students who need extra help with schoolwork and for tutors who want to respond to real
          learning needs through a focused digital workflow. It is especially useful when a student needs help quickly,
          wants a more guided request process, or needs a clearer path from question to live support.
        </p>
      </LegalSection>

      <LegalSection title="What Matters To Us">
        <p>
          The platform is shaped around clarity, trust, and responsiveness. That means verified tutors, clearer student
          flows, transparent policies, and a product experience that makes it easier to ask for help without confusion.
        </p>
        <p>
          If you want to explore Parakleo further, you can return to the <Link to="/" className="font-bold text-brand underline underline-offset-2">landing page</Link> to review the product overview and core features.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
