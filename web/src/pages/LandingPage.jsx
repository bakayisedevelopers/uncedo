import { motion } from 'motion/react';
import { ArrowRight, Calendar, CheckCircle2, Download, Globe, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import { useAuth } from '../hooks/useAuth';

function CTAButton({ children, variant = 'primary', ...props }) {
  const styles =
    variant === 'primary'
      ? 'bg-brand text-white hover:bg-brand-dark shadow-lg shadow-brand/30'
      : 'border border-brand/30 bg-brand/10 text-brand hover:bg-brand/20';

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-2xl px-6 py-3 text-sm font-bold transition ${styles}`}
      {...props}
    >
      {children}
    </button>
  );
}

function FeatureCard({ icon: Icon, title, description }) {
  return (
    <article className="rounded-[28px] border border-brand/20 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <div className="mb-4 inline-flex rounded-2xl border border-brand/20 bg-brand/10 p-3 text-brand">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-xl font-black text-zinc-900">{title}</h3>
      <p className="mt-2 text-sm text-zinc-600">{description}</p>
    </article>
  );
}

export default function LandingPage() {
  const { user, isInitializing, rememberMe } = useAuth();

  if (!isInitializing && user && rememberMe) {
    return <Navigate to="/app" replace />;
  }

  return (
    <MainLayout>
      <div className="bg-gradient-to-b from-emerald-50 via-zinc-50 to-white pb-20">
        <section className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative overflow-hidden rounded-[36px] border border-brand/20 bg-white p-8 shadow-xl md:p-12"
          >
            <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-brand/20 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-brand/15 blur-3xl" />

            <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand">Uncedo App</p>
            <h1 className="mt-4 max-w-3xl text-5xl font-black leading-[0.95] text-zinc-900 md:text-7xl">
              Everyday help, class support, and trusted services in one simple app.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-zinc-600">
              Uncedo helps customers request support quickly, track progress clearly, and manage service or learning needs through a clean mobile-first experience.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <CTAButton>
                <Download className="mr-2 h-4 w-4" />
                Download Uncedo App
              </CTAButton>
              <Link to="/signup">
                <CTAButton>
                  <Zap className="mr-2 h-4 w-4" />
                  Create Account
                </CTAButton>
              </Link>
              <Link to="/login">
                <CTAButton variant="secondary">
                  Login
                  <ArrowRight className="ml-2 h-4 w-4" />
                </CTAButton>
              </Link>
            </div>

            <div className="mt-8 grid gap-3 text-sm text-zinc-700 sm:grid-cols-3">
              {['Fast customer requests', 'Secure payment setup', 'Progress and status tracking'].map((item) => (
                <div key={item} className="inline-flex items-center gap-2 rounded-2xl border border-brand/20 bg-brand/5 px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 text-brand" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <p className="mt-6 text-xs text-zinc-600">
              By continuing, you agree to our{' '}
              <Link to="/terms" className="font-bold text-brand underline">Terms of Service</Link>,{' '}
              <Link to="/privacy-policy" className="font-bold text-brand underline">Privacy Policy</Link>, and{' '}
              <Link to="/payment-pricing-policy" className="font-bold text-brand underline">Payment Policy</Link>.
            </p>
          </motion.div>
        </section>

        <section id="features" className="mx-auto mt-10 grid max-w-7xl gap-4 px-4 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
          <FeatureCard icon={Zap} title="Instant Requests" description="Request help quickly and keep the next step clear from the moment you start." />
          <FeatureCard icon={ShieldCheck} title="Trusted Providers" description="Profiles, verification, and platform checks help create more confident matches." />
          <FeatureCard icon={Globe} title="Use It Anywhere" description="Manage requests from your phone or desktop with a consistent account flow." />
          <FeatureCard icon={Calendar} title="Flexible Scheduling" description="Handle needs around your day and follow progress without confusion." />
        </section>

        <section id="how-it-works" className="mx-auto mt-8 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[32px] border border-brand/20 bg-white p-8 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand" />
              <h2 className="text-3xl font-black text-zinc-900">How Uncedo Works</h2>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                { step: '01', title: 'Create your profile', text: 'Set up your account once and keep your details ready for future requests.' },
                { step: '02', title: 'Request what you need', text: 'Submit a request clearly so the right provider flow can take over.' },
                { step: '03', title: 'Track progress', text: 'Stay updated through request, completion, and payment status in one place.' },
              ].map((item) => (
                <article key={item.step} className="rounded-2xl border border-brand/20 bg-emerald-50/60 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">{item.step}</p>
                  <h3 className="mt-2 text-xl font-black text-zinc-900">{item.title}</h3>
                  <p className="mt-2 text-sm text-zinc-600">{item.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </MainLayout>
  );
}
