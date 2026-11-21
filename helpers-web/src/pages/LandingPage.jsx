import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Download } from 'lucide-react';
import heroCraftImg from '../assets/images/hero_helper_craft_1794749285703.jpg';
import showcaseImg from '../assets/images/partner_work_showcase_1794749286598.jpg';
import { ONBOARDING_STEPS } from '../utils/onboardingSteps';
import { WHATSAPP_CHAT_URL } from '../services/helperDataService';

const PREPARATION_ITEMS = [
  {
    label: 'Government-issued ID or business reg.',
    detail: 'SA ID, passport, or CIPC registration matching your bank account.',
  },
  {
    label: 'Recent clear headshot',
    detail: 'Well-lit selfie with full face visible so customers recognise you on arrival.',
  },
  {
    label: 'Photos of completed work',
    detail: 'At least one authentic photo from past jobs for each service you offer.',
  },
  {
    label: 'Police clearance certificate',
    detail: 'PDF (up to 10 MB) or clear JPG/PNG photo uploaded to private review storage.',
  },
  {
    label: 'South African cheque or savings account',
    detail: 'Verified instantaneously via Paystack for automated Monday earnings payouts.',
  },
];

export function LandingPage({ user, onNavigate, pwa }) {
  const [heroLoaded, setHeroLoaded] = useState(true);
  const [showcaseLoaded, setShowcaseLoaded] = useState(true);

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink-900">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4 sm:gap-8">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
            className="flex items-center gap-2.5 font-display font-bold text-lg tracking-tight text-ink-900 whitespace-nowrap shrink-0"
          >
            <img
              src="/helpers-logo-192.png"
              alt="Uncedo Helpers"
              referrerPolicy="no-referrer"
              className="h-9 w-9 rounded-xl border border-border object-cover bg-white shrink-0"
            />
            <span>Uncedo Helpers</span>
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-ink-500">
            <a href="#process" className="hover:text-ink-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
              Process
            </a>
            <a href="#checklist" className="hover:text-ink-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
              Requirements
            </a>
            <a href="#payouts" className="hover:text-ink-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
              Payouts
            </a>
            <a
              href="/sign-in"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/sign-in');
              }}
              className="hover:text-ink-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Sign In
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {pwa && !pwa.isInstalled && (
              <button
                type="button"
                onClick={pwa.openInstallPopup}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-surface hover:bg-well text-xs font-semibold text-ink-800 whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5 text-tealbrand-700" />
                <span className="hidden sm:inline">Install App</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate(user ? '/home' : '/sign-up')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0"
            >
              {user ? 'Open App' : 'Start Application'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Split */}
        <section className="max-w-7xl mx-auto px-4 sm:px-8 pt-10 pb-12 lg:pt-16 lg:pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between py-2 space-y-8">
              <div className="space-y-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tealbrand-700">
                  South Africa Service Partner Portal
                </p>
                <h1 className="font-display font-bold text-ink-900 leading-[1.08] tracking-tight text-[clamp(2.25rem,4vw,3.5rem)]">
                  Get verified as an Uncedo Helper in seven structured steps.
                </h1>
                <p className="text-base sm:text-lg text-ink-500 leading-relaxed max-w-xl">
                  Build your profile once from your browser. Submit your headshot, work portfolio, signed helper agreement, private police clearance, and Paystack bank details—then go online on WhatsApp whenever you are ready to accept nearby jobs.
                </p>

                <div className="pt-2 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => onNavigate(user ? '/onboarding' : '/sign-up')}
                    className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    {user ? 'Resume Helper Application' : 'Create Helper Account'}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  {!user && (
                    <button
                      type="button"
                      onClick={() => onNavigate('/sign-in')}
                      className="px-5 py-3.5 rounded-lg border border-border bg-surface hover:bg-well text-sm font-semibold text-ink-900 transition-colors whitespace-nowrap shrink-0"
                    >
                      Already registered? Sign In
                    </button>
                  )}
                </div>
              </div>

              <div className="pt-6 border-t border-border text-xs text-ink-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>Johannesburg, Pretoria &amp; Cape Town service areas</span>
                <span aria-hidden="true">·</span>
                <span>Progress saves automatically at every step</span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-72 sm:h-96 lg:h-full min-h-[340px] rounded-xl overflow-hidden border border-border bg-forest-900">
                {heroLoaded ? (
                  <img
                    src={heroCraftImg}
                    alt="Skilled South African service provider organizing tools on a sunlit workbench"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroLoaded(false)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-forest-900 to-tealbrand-800 flex items-end p-8 text-white">
                    <span className="font-display text-lg font-semibold">Uncedo Skilled Partner Network</span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-6 text-white">
                  <p className="text-sm font-medium leading-snug max-w-md">
                    Verified plumbers, electricians, cleaners, painters, and handymen receive direct nearby requests through Uncedo WhatsApp dispatch.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 4-column structured metrics row below hero split */}
          <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 border border-border rounded-xl bg-surface divide-y sm:divide-y-0 sm:divide-x divide-border">
            <div className="p-5 sm:p-6">
              <div className="tabular-nums-mono text-2xl font-bold text-ink-900">07</div>
              <div className="text-sm font-semibold text-ink-900 mt-1">Guided stages</div>
              <div className="text-xs text-ink-500 mt-0.5">From profile basics to verified dispatch</div>
            </div>
            <div className="p-5 sm:p-6">
              <div className="tabular-nums-mono text-2xl font-bold text-ink-900">1–2 Days</div>
              <div className="text-sm font-semibold text-ink-900 mt-1">Admin review window</div>
              <div className="text-xs text-ink-500 mt-0.5">Portfolio and clearance checks</div>
            </div>
            <div className="p-5 sm:p-6">
              <div className="tabular-nums-mono text-2xl font-bold text-ink-900">Monday</div>
              <div className="text-sm font-semibold text-ink-900 mt-1">Weekly payouts</div>
              <div className="text-xs text-ink-500 mt-0.5">Direct ZAR transfers via Paystack</div>
            </div>
            <div className="p-5 sm:p-6">
              <div className="tabular-nums-mono text-2xl font-bold text-ink-900">50 km</div>
              <div className="text-sm font-semibold text-ink-900 mt-1">Dispatch radius</div>
              <div className="text-xs text-ink-500 mt-0.5">Send “online” on WhatsApp when ready</div>
            </div>
          </div>
        </section>

        {/* 7-Step Onboarding Process Section */}
        <section id="process" className="border-t border-border bg-surface py-16 lg:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
              <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tealbrand-700">
                    The Verification Pipeline
                  </p>
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">
                    One clear checklist from signup to first job offer.
                  </h2>
                  <p className="text-sm sm:text-base text-ink-500 leading-relaxed">
                    You never have to guess what is still pending. Every step updates live as you upload documents or as Uncedo administrators approve your application.
                  </p>
                </div>

                <div className="aspect-[4/3] rounded-xl overflow-hidden border border-border bg-well">
                  {showcaseLoaded ? (
                    <img
                      src={showcaseImg}
                      alt="Clean modern sunlit residence interior serviced by Uncedo professionals"
                      referrerPolicy="no-referrer"
                      onError={() => setShowcaseLoaded(false)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-sm text-ink-500">
                      Uncedo Quality Homes
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-7 divide-y divide-border border-t border-b border-border">
                {ONBOARDING_STEPS.map((step) => (
                  <div key={step.id} className="py-5 sm:py-6 flex items-start gap-5">
                    <div className="tabular-nums-mono text-sm font-semibold text-tealbrand-700 w-8 shrink-0 pt-0.5">
                      {step.number}.
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-display text-base sm:text-lg font-bold text-ink-900">
                        {step.title}
                      </h3>
                      <p className="text-sm text-ink-500 leading-relaxed">
                        {step.summary}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Preparation Checklist & Payout Band */}
        <section id="checklist" className="border-t border-border bg-canvas py-16 lg:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
            <div className="lg:col-span-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tealbrand-700">
                Before You Start
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">
                Keep these five items nearby to finish in one sitting.
              </h2>
              <p className="text-sm sm:text-base text-ink-500 leading-relaxed">
                If you need to step away mid-process, your completed steps stay saved—simply sign back in anytime to continue from where you stopped.
              </p>
            </div>

            <div className="lg:col-span-7 bg-surface border border-border rounded-xl divide-y divide-border">
              {PREPARATION_ITEMS.map((item) => (
                <div key={item.label} className="p-5 flex items-start gap-3.5">
                  <Check className="h-4 w-4 text-tealbrand-600 mt-1 shrink-0" strokeWidth={2.5} />
                  <div>
                    <div className="text-sm font-semibold text-ink-900">{item.label}</div>
                    <div className="text-xs sm:text-sm text-ink-500 mt-0.5">{item.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Deep Forest Conversion Band */}
        <section id="payouts" className="bg-forest-900 text-white py-16 lg:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tealbrand-500">
                Automated Weekly Settlement &amp; WhatsApp Dispatch
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Ready to start receiving verified service requests?
              </h2>
              <p className="text-sm sm:text-base text-white/75 leading-relaxed max-w-2xl">
                Create your helper account or sign in with your existing Uncedo email to complete the remaining verification steps.
              </p>
            </div>
            <div className="lg:col-span-4 flex flex-wrap lg:justify-end gap-3">
              <button
                type="button"
                onClick={() => onNavigate(user ? '/onboarding' : '/sign-up')}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-tealbrand-500 hover:bg-tealbrand-600 text-sm font-semibold text-forest-950 transition-colors whitespace-nowrap shrink-0"
              >
                {user ? 'Open Onboarding Portal' : 'Begin Onboarding'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface py-6 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-ink-500">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-display font-bold text-ink-900">Uncedo Helpers</span>
            <span aria-hidden="true">·</span>
            <span>© {new Date().getFullYear()} Uncedo</span>
            <span aria-hidden="true">·</span>
            <button type="button" onClick={() => onNavigate('/privacy-policy')} className="hover:text-tealbrand-700 hover:underline font-medium">
              Privacy &amp; POPIA
            </button>
            <button type="button" onClick={() => onNavigate('/terms')} className="hover:text-tealbrand-700 hover:underline font-medium">
              Helper Terms
            </button>
            <button type="button" onClick={() => onNavigate('/payment-pricing-policy')} className="hover:text-tealbrand-700 hover:underline font-medium">
              Payouts &amp; Pricing
            </button>
            <button type="button" onClick={() => onNavigate('/refund-policy')} className="hover:text-tealbrand-700 hover:underline font-medium">
              Cancellations
            </button>
            <button type="button" onClick={() => onNavigate('/data-voice-policy')} className="hover:text-tealbrand-700 hover:underline font-medium">
              Location &amp; Data
            </button>
          </div>
          <a
            href={WHATSAPP_CHAT_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-tealbrand-700 hover:underline shrink-0"
          >
            Chat with Uncedo Support on WhatsApp
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </footer>
    </div>
  );
}
