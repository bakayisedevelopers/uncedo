import { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  CalendarClock,
  Check,
  LockKeyhole,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import { UNCEDO_WHATSAPP_BOOK_URL } from '../components/Navbar';
import WhatsAppIcon from '../components/WhatsAppIcon';

const BOOKING_SCENARIOS = [
  {
    id: 'request',
    label: '1. Say what you need',
    summary: 'No sign-up form. Just message Uncedo naturally.',
    messages: [
      {
        sender: 'customer',
        time: '09:14',
        text: 'Hi! Can I book knotless braids in Rondebosch for today at 14:00?',
      },
      {
        sender: 'uncedo',
        time: '09:14',
        text: 'We can sort that out right here—no account needed. Please share your street address and confirm the Knotless Braids option (R280 estimate) so I can match you.',
      },
      {
        sender: 'customer',
        time: '09:15',
        text: 'Yes, 18 Main Rd, Rondebosch. Confirm please!',
      },
    ],
  },
  {
    id: 'matched',
    label: '2. Helper matched',
    summary: 'See verified skills, rating, and jobs completed for your exact service option.',
    messages: [
      {
        sender: 'uncedo',
        time: '09:16',
        text: 'Great news! Nomsa accepted your Knotless Braids request.',
        detailLines: [
          'Option rating: 4.9 / 5 (18 reviews)',
          'Mastery level: Specialist',
          'Completed Knotless Braids jobs: 24',
        ],
      },
      {
        sender: 'customer',
        time: '09:17',
        text: 'Awesome, please let Nomsa know I am in flat 3B at the gate.',
      },
      {
        sender: 'uncedo',
        time: '09:17',
        text: 'Sent straight to Nomsa! She will reply directly here if she needs anything on the way.',
      },
    ],
  },
  {
    id: 'pin_pay',
    label: '3. Arrival PIN & Pay',
    summary: 'Confirm safety on arrival and settle by cash or Paystack link.',
    messages: [
      {
        sender: 'uncedo',
        time: '13:58',
        text: 'Nomsa has arrived at your location! Share your 6-digit Arrival PIN: 482915 so work can begin safely.',
      },
      {
        sender: 'uncedo',
        time: '15:20',
        text: 'Service complete! Total: R280 ZAR. Pay cash to Nomsa or open your secure Paystack link—never enter card details inside chat.',
      },
    ],
  },
];

const WHATSAPP_BENEFITS = [
  {
    icon: UserCheck,
    number: '01.',
    title: 'Zero account needed',
    description:
      'We built WhatsApp booking so you never have to remember another password or fill out long onboarding forms just to get help.',
  },
  {
    icon: WhatsAppIcon,
    number: '02.',
    title: 'One friendly conversation',
    description:
      'Pick a service option, share your address, chat with your matched helper, and ask questions inside the same WhatsApp thread.',
  },
  {
    icon: ShieldCheck,
    number: '03.',
    title: 'Verified helpers & Arrival PIN',
    description:
      'See your helper’s service-option rating, mastery level, and completed job count up front, backed by a 6-digit arrival PIN.',
  },
  {
    icon: LockKeyhole,
    number: '04.',
    title: 'Pay by Cash or secure link',
    description:
      'Settle with cash or open a hosted Paystack checkout link sent to your chat—Uncedo never asks for card numbers in messages.',
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    step: '01.',
    title: 'Send a WhatsApp message',
    text: 'Tap Book above and tell Uncedo what you need—cleaning, beauty, tutoring, yard care, or car wash—and when it suits you.',
  },
  {
    step: '02.',
    title: 'Review price & get matched',
    text: 'Confirm your transparent estimate in chat. Once a helper accepts, you receive their name, option rating, mastery level, and arrival updates.',
  },
  {
    step: '03.',
    title: 'Verify PIN, pay & rate',
    text: 'Share your 6-digit arrival PIN when your helper gets there, pay easily via Cash or Paystack when done, and leave a rating right in WhatsApp.',
  },
];

export default function LandingPage() {
  const [activeScenarioId, setActiveScenarioId] = useState(BOOKING_SCENARIOS[0].id);
  const activeScenario =
    BOOKING_SCENARIOS.find((scenario) => scenario.id === activeScenarioId) || BOOKING_SCENARIOS[0];

  return (
    <MainLayout>
      <div className="bg-zinc-50/70 pb-20">
        {/* Hero Split Section */}
        <section className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8 lg:pt-14">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="grid items-stretch gap-10 lg:grid-cols-12 lg:gap-12"
          >
            {/* Left Copy Column */}
            <div className="flex flex-col justify-between py-2 lg:col-span-7">
              <div>
                <p className="text-sm font-medium text-brand-dark">
                  WhatsApp booking <span aria-hidden="true">·</span> No account required
                </p>

                <h1
                  className="mt-4 max-w-2xl font-display font-extrabold tracking-tight text-zinc-950"
                  style={{ fontSize: 'clamp(2.35rem, 4.1vw, 3.65rem)', lineHeight: 1.06, textWrap: 'balance' }}
                >
                  Book everyday help right on WhatsApp.
                </h1>

                <p className="mt-5 max-w-xl text-base leading-7 text-zinc-600 sm:text-lg">
                  WhatsApp is our booking platform—built friendly and fast so you can book trusted
                  cleaning, beauty, tutoring, yard care, and home help in minutes{' '}
                  <span className="font-semibold text-zinc-900">
                    without having to create an account
                  </span>
                  .
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-5">
                  <a
                    href={UNCEDO_WHATSAPP_BOOK_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[48px] items-center justify-center gap-2.5 whitespace-nowrap rounded-xl bg-brand-dark px-6 py-3.5 text-base font-bold text-white shadow-sm transition-colors duration-150 hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                  >
                    <WhatsAppIcon className="h-5 w-5 shrink-0" />
                    <span>Book on WhatsApp</span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </a>

                  <Link
                    to="/sign-in"
                    className="inline-flex min-h-[44px] items-center whitespace-nowrap text-sm font-semibold text-zinc-700 underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-zinc-950 hover:decoration-zinc-900"
                  >
                    Already have an account? Sign in
                  </Link>
                </div>
              </div>

              <div className="mt-10 border-t border-zinc-200 pt-6">
                <div className="grid gap-4 text-sm text-zinc-700 sm:grid-cols-3">
                  <div className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" aria-hidden="true" />
                    <span>Start straight in WhatsApp</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" aria-hidden="true" />
                    <span>Upfront helper stats &amp; PIN</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" aria-hidden="true" />
                    <span>Cash or Paystack card link</span>
                  </div>
                </div>

                <p className="mt-5 text-xs text-zinc-500">
                  By booking with Uncedo on WhatsApp, you agree to our{' '}
                  <Link to="/terms" className="font-semibold text-brand-dark underline underline-offset-2">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link to="/privacy-policy" className="font-semibold text-brand-dark underline underline-offset-2">
                    Privacy Policy
                  </Link>
                  .
                </p>
              </div>
            </div>

            {/* Right Interactive WhatsApp Preview Column */}
            <div className="flex flex-col justify-between rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 lg:col-span-5 lg:h-full">
              <div>
                <div className="flex items-center justify-between gap-4 border-b border-zinc-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-brand-dark">
                      <WhatsAppIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-display text-sm font-bold text-zinc-950">Uncedo on WhatsApp</p>
                      <p className="text-xs text-zinc-500 tabular-nums">+27 60 523 9926</p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-brand-dark">No account needed</span>
                </div>

                {/* Interactive Step Switcher (Functional buttons) */}
                <div
                  role="tablist"
                  aria-label="WhatsApp booking flow preview"
                  className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1"
                >
                  {BOOKING_SCENARIOS.map((scenario) => {
                    const isActive = scenario.id === activeScenario.id;
                    return (
                      <button
                        key={scenario.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setActiveScenarioId(scenario.id)}
                        className={`truncate rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors ${
                          isActive
                            ? 'bg-white text-zinc-950 shadow-sm'
                            : 'text-zinc-600 hover:text-zinc-950'
                        }`}
                      >
                        {scenario.label}
                      </button>
                    );
                  })}
                </div>

                <p className="mt-3 text-xs text-zinc-500">{activeScenario.summary}</p>

                {/* Chat Thread Surface */}
                <div className="mt-4 space-y-3 rounded-2xl bg-zinc-50 p-4">
                  {activeScenario.messages.map((msg, idx) => {
                    const isCustomer = msg.sender === 'customer';
                    return (
                      <div
                        key={`${activeScenario.id}-${idx}`}
                        className={`flex flex-col ${isCustomer ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                            isCustomer
                              ? 'bg-brand-dark text-white'
                              : 'border border-zinc-200 bg-white text-zinc-800'
                          }`}
                        >
                          <p>{msg.text}</p>
                          {Array.isArray(msg.detailLines) ? (
                            <ul className="mt-2 space-y-1 border-t border-zinc-100 pt-2 text-xs font-medium text-zinc-700">
                              {msg.detailLines.map((line) => (
                                <li key={line}>{line}</li>
                              ))}
                            </ul>
                          ) : null}
                          <p
                            className={`mt-1 text-right text-[11px] tabular-nums ${
                              isCustomer ? 'text-emerald-100' : 'text-zinc-400'
                            }`}
                          >
                            {msg.time}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3 border-t border-zinc-100 pt-4">
                <span className="text-xs text-zinc-500">Opens directly in WhatsApp</span>
                <a
                  href={UNCEDO_WHATSAPP_BOOK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-bold text-brand-dark hover:text-emerald-800"
                >
                  <span>Try this chat now</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Features Grid */}
        <section id="features" className="mx-auto mt-16 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-brand-dark">Designed for simplicity</p>
              <h2 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-zinc-950">
                Why we use WhatsApp for every booking
              </h2>
            </div>
            <p className="max-w-md text-sm text-zinc-600">
              No app installs or mandatory sign-ups—everything from quotes to ratings happens where you already chat.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {WHATSAPP_BENEFITS.map((item) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.number}
                  className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-6"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-display text-sm font-bold text-brand-dark tabular-nums">
                        {item.number}
                      </span>
                      <Icon className="h-5 w-5 text-zinc-400" aria-hidden="true" />
                    </div>
                    <h3 className="mt-5 font-display text-lg font-bold text-zinc-950">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-600">{item.description}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* How It Works & Final WhatsApp CTA */}
        <section id="how-it-works" className="mx-auto mt-14 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-zinc-200 bg-white p-7 sm:p-10">
            <div className="flex flex-col gap-3 border-b border-zinc-200 pb-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-medium text-brand-dark">Three easy steps</p>
                <h2 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-zinc-950">
                  How WhatsApp booking works
                </h2>
              </div>
              <p className="text-sm text-zinc-600">
                Available across South Africa <span aria-hidden="true">·</span> Reply anytime
              </p>
            </div>

            <div className="mt-8 grid gap-8 md:grid-cols-3">
              {HOW_IT_WORKS_STEPS.map((item, index) => (
                <div
                  key={item.step}
                  className={index > 0 ? 'md:border-l md:border-zinc-200 md:pl-8' : ''}
                >
                  <p className="font-display text-sm font-bold text-brand-dark tabular-nums">
                    {item.step}
                  </p>
                  <h3 className="mt-3 font-display text-xl font-bold text-zinc-950">
                    {item.title}
                  </h3>
                  <p className="mt-2.5 text-sm leading-6 text-zinc-600">{item.text}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-col items-start justify-between gap-5 border-t border-zinc-200 pt-7 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3">
                <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-brand-dark" aria-hidden="true" />
                <div>
                  <p className="font-display text-base font-bold text-zinc-950">
                    Ready to book without creating an account?
                  </p>
                  <p className="text-sm text-zinc-600">
                    Say hello to Uncedo on WhatsApp at{' '}
                    <span className="font-semibold text-zinc-900 tabular-nums">+27 60 523 9926</span>.
                  </p>
                </div>
              </div>

              <a
                href={UNCEDO_WHATSAPP_BOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-brand-dark px-5 py-3 text-sm font-bold text-white transition-colors duration-150 hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
              >
                <WhatsAppIcon className="h-4 w-4 shrink-0" />
                <span>Start WhatsApp chat</span>
              </a>
            </div>
          </div>
        </section>
      </div>
    </MainLayout>
  );
}
