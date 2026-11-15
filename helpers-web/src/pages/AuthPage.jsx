import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Lock, Mail, MessageSquare, Phone, User } from 'lucide-react';
import portraitImg from '../assets/images/auth_partner_portrait_1794749286443.jpg';
import {
  completeWhatsAppSignupLink,
  signInHelperAccount,
  signOutHelperAccount,
  signUpHelperAccount,
} from '../services/helperDataService';

function parseWhatsAppSignupHash() {
  if (typeof window === 'undefined') return { token: '', phone: '', mode: '' };
  const rawHash = window.location.hash.replace(/^#/, '');
  if (!rawHash) return { token: '', phone: '', mode: '' };
  const params = new URLSearchParams(rawHash);
  const token = String(params.get('wa_signup_token') || '').trim();
  const phone = String(params.get('wa_phone') || '').trim();
  const mode = String(params.get('wa_mode') || '').trim().toLowerCase();
  if (token) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
  return { token, phone, mode };
}

export function AuthPage({ initialMode = 'signup', user, onNavigate, onWhatsAppLinked }) {
  const [hashInfo] = useState(() => parseWhatsAppSignupHash());
  const [mode, setMode] = useState(() => {
    if (hashInfo.mode === 'signin') return 'signin';
    if (hashInfo.mode === 'signup') return 'signup';
    return initialMode;
  });

  useEffect(() => {
    if (!hashInfo.mode) {
      setMode(initialMode);
    }
  }, [initialMode, hashInfo.mode]);

  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(hashInfo.phone || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [portraitLoaded, setPortraitLoaded] = useState(true);

  useEffect(() => {
    if (user && !hashInfo.token) {
      onNavigate('/onboarding');
    }
  }, [hashInfo.token, onNavigate, user]);

  const completeAndProceed = async (fallbackNotice) => {
    if (hashInfo.token) {
      await completeWhatsAppSignupLink(hashInfo.token);
      onWhatsAppLinked?.(
        mode === 'signup'
          ? 'Helper account created and linked to WhatsApp. Complete the steps below to get verified.'
          : 'Helper account signed in and linked to WhatsApp. Complete the steps below to get verified.',
      );
    } else if (fallbackNotice) {
      onWhatsAppLinked?.(fallbackNotice);
    }
    onNavigate('/onboarding');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await signUpHelperAccount({ fullName, email, password, phoneNumber });
        await completeAndProceed('Your helper account has been created. Complete the 7 onboarding steps below.');
      } else {
        await signInHelperAccount({ email, password });
        await completeAndProceed('');
      }
    } catch (err) {
      setError(err?.message || 'Unable to authenticate right now. Please check your details and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLinkCurrentSession = async () => {
    setError('');
    setSubmitting(true);
    try {
      await completeAndProceed('WhatsApp chat linked to your helper account. Continue your onboarding below.');
    } catch (err) {
      setError(err?.message || 'Unable to link this WhatsApp session. Sign out and sign in with the helper email.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas grid grid-cols-1 lg:grid-cols-12">
      {/* Left Architectural Editorial Panel */}
      <aside className="hidden lg:flex lg:col-span-5 relative bg-forest-900 text-white flex-col justify-between p-10 overflow-hidden">
        {portraitLoaded && (
          <img
            src={portraitImg}
            alt="Uncedo helper partner holding smartphone"
            referrerPolicy="no-referrer"
            onError={() => setPortraitLoaded(false)}
            className="absolute inset-0 h-full w-full object-cover opacity-35"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-forest-950 via-forest-900/80 to-forest-900/60" />

        <div className="relative z-10 flex items-center justify-between">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
            className="font-display font-bold text-lg tracking-tight text-white whitespace-nowrap"
          >
            Uncedo Helpers
          </a>
        </div>

        <div className="relative z-10 space-y-6 max-w-md">
          <div className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tealbrand-500">
              Web Onboarding Portal
            </p>
            <h2 className="font-display text-3xl font-bold tracking-tight text-white leading-tight">
              Your complete helper setup, guided step by step.
            </h2>
          </div>

          <ul className="space-y-3 text-sm text-white/85 border-t border-white/15 pt-5">
            <li className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-tealbrand-500 mt-0.5 shrink-0" />
              <span>Links automatically to your WhatsApp helper profile</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-tealbrand-500 mt-0.5 shrink-0" />
              <span>Tracks all 7 steps from selfie and portfolio to bank payout setup</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-tealbrand-500 mt-0.5 shrink-0" />
              <span>Saves progress automatically so you can resume anytime</span>
            </li>
          </ul>
        </div>
      </aside>

      {/* Right Form Canvas */}
      <div className="lg:col-span-7 flex flex-col bg-surface">
        <header className="border-b border-border px-6 sm:px-10 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-ink-900 whitespace-nowrap"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to overview
          </button>
          <span className="lg:hidden font-display font-bold text-sm text-ink-900">Uncedo Helpers</span>
          <div className="w-20 hidden lg:block" />
        </header>

        <main className="flex-1 flex items-center justify-center px-6 sm:px-12 py-10">
          <div className="w-full max-w-md space-y-7">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tealbrand-700">
                {mode === 'signup' ? 'New Partner Registration' : 'Returning Partner'}
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">
                {mode === 'signup' ? 'Create your helper account' : 'Sign in to your account'}
              </h1>
              <p className="text-sm text-ink-500 leading-relaxed">
                {hashInfo.token
                  ? 'Your WhatsApp chat connects automatically once signed in, opening the 7-step onboarding flow.'
                  : 'Access your checklist, upload work photos or clearance documents, and check approval status.'}
              </p>
            </div>

            {!user && (
              <div className="grid grid-cols-2 p-1 rounded-lg bg-well border border-border">
                <button
                  type="button"
                  onClick={() => { setError(''); setMode('signup'); }}
                  className={`py-2 text-xs font-semibold rounded-md transition-colors ${
                    mode === 'signup'
                      ? 'bg-surface text-ink-900 shadow-sm'
                      : 'text-ink-500 hover:text-ink-900'
                  }`}
                >
                  Create Account
                </button>
                <button
                  type="button"
                  onClick={() => { setError(''); setMode('signin'); }}
                  className={`py-2 text-xs font-semibold rounded-md transition-colors ${
                    mode === 'signin'
                      ? 'bg-surface text-ink-900 shadow-sm'
                      : 'text-ink-500 hover:text-ink-900'
                  }`}
                >
                  Sign In
                </button>
              </div>
            )}

            {hashInfo.token && (
              <div className="rounded-lg border border-tealbrand-600/30 bg-tealbrand-50 px-4 py-3 text-xs text-tealbrand-700 flex items-center gap-2.5">
                <MessageSquare className="h-4 w-4 shrink-0" />
                <span>
                  WhatsApp link token active{hashInfo.phone ? ` for ${hashInfo.phone}` : ''}.
                </span>
              </div>
            )}

            {user && hashInfo.token ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-well/60 p-4 text-sm">
                  <div className="text-xs text-ink-500">Signed in helper email</div>
                  <div className="font-semibold text-ink-900 mt-0.5">{user.email}</div>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleLinkCurrentSession}
                  disabled={submitting}
                  className="w-full py-3 px-4 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Linking & Opening Onboarding…' : 'Link WhatsApp & Start Onboarding'}
                </button>
                <button
                  type="button"
                  onClick={() => signOutHelperAccount()}
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-lg border border-border bg-white hover:bg-well text-sm font-medium text-ink-700"
                >
                  Sign out and use another account
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <>
                    <div>
                      <label htmlFor="authFullName" className="block text-sm font-medium text-ink-900 mb-1.5">
                        Full name
                      </label>
                      <div className="relative">
                        <User className="h-4 w-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          id="authFullName"
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="e.g. Thabo Mokoena"
                          className="w-full rounded-lg border border-border bg-white pl-10 pr-3.5 py-2.5 text-sm text-ink-900 focus:border-tealbrand-600 focus:outline-none focus:ring-2 focus:ring-tealbrand-600/15"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="authPhone" className="block text-sm font-medium text-ink-900 mb-1.5">
                        WhatsApp mobile number
                      </label>
                      <div className="relative">
                        <Phone className="h-4 w-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          id="authPhone"
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="+27 71 234 5678"
                          readOnly={Boolean(hashInfo.phone)}
                          className={`w-full rounded-lg border border-border pl-10 pr-3.5 py-2.5 text-sm tabular-nums-mono text-ink-900 focus:border-tealbrand-600 focus:outline-none ${
                            hashInfo.phone ? 'bg-well text-ink-700' : 'bg-white'
                          }`}
                          required
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label htmlFor="authEmail" className="block text-sm font-medium text-ink-900 mb-1.5">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="h-4 w-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="authEmail"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-lg border border-border bg-white pl-10 pr-3.5 py-2.5 text-sm text-ink-900 focus:border-tealbrand-600 focus:outline-none focus:ring-2 focus:ring-tealbrand-600/15"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="authPassword" className="block text-sm font-medium text-ink-900 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="h-4 w-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="authPassword"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your account password'}
                      minLength={6}
                      className="w-full rounded-lg border border-border bg-white pl-10 pr-3.5 py-2.5 text-sm text-ink-900 focus:border-tealbrand-600 focus:outline-none focus:ring-2 focus:ring-tealbrand-600/15"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                >
                  {submitting
                    ? (mode === 'signup' ? 'Creating Account…' : 'Signing In…')
                    : (mode === 'signup' ? 'Create Account & Start Onboarding' : 'Sign In & Continue Onboarding')}
                </button>
              </form>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
