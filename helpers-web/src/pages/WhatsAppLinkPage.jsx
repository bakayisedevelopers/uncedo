import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Lock, Mail } from 'lucide-react';
import portraitImg from '../assets/images/auth_partner_portrait_1794749286443.jpg';
import {
  completeWhatsAppAccountLink,
  signInHelperAccount,
  signOutHelperAccount,
} from '../services/helperDataService';

function parseWhatsAppLinkToken() {
  if (typeof window === 'undefined') return '';
  const rawHash = window.location.hash.replace(/^#/, '');
  const hashToken = new URLSearchParams(rawHash).get('wa_link_token') || '';
  const queryToken = new URLSearchParams(window.location.search).get('token') || '';
  const token = String(hashToken || queryToken || '').trim();
  if (token) {
    window.history.replaceState(null, '', window.location.pathname);
  }
  return token;
}

export function WhatsAppLinkPage({ user, onNavigate, onWhatsAppLinked }) {
  const [token] = useState(() => parseWhatsAppLinkToken());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkedDone, setLinkedDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const autoComplete = async () => {
      if (!user || !token || linkedDone) return;
      setLinking(true);
      setError('');
      try {
        await completeWhatsAppAccountLink(token);
        if (!active) return;
        setLinkedDone(true);
        onWhatsAppLinked?.('Your WhatsApp account is verified and linked. Continue your helper onboarding below.');
      } catch (err) {
        if (active) setError(err?.message || 'Unable to verify this WhatsApp link with the signed-in account.');
      } finally {
        if (active) setLinking(false);
      }
    };
    autoComplete();
    return () => { active = false; };
  }, [linkedDone, onWhatsAppLinked, token, user]);

  const handleSignInAndLink = async (event) => {
    event.preventDefault();
    if (!token) {
      setError('This link token is missing or expired. Request a new link on WhatsApp.');
      return;
    }
    setLinking(true);
    setError('');
    try {
      await signInHelperAccount({ email, password });
      await completeWhatsAppAccountLink(token);
      setLinkedDone(true);
      onWhatsAppLinked?.('Your helper account is linked to WhatsApp. Complete your onboarding below.');
      onNavigate('/onboarding');
    } catch (err) {
      setError(err?.message || 'Could not sign in and link this WhatsApp chat.');
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas grid grid-cols-1 lg:grid-cols-12">
      <aside className="hidden lg:flex lg:col-span-5 relative bg-forest-900 text-white flex-col justify-between p-10 overflow-hidden">
        <img
          src={portraitImg}
          alt="Uncedo helper specialist"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-forest-950 via-forest-900/80 to-forest-900/60" />

        <div className="relative z-10 font-display font-bold text-lg tracking-tight text-white">
          Uncedo Helpers
        </div>

        <div className="relative z-10 space-y-3 max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tealbrand-500">
            Account Connection
          </p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-white leading-tight">
            Connect your WhatsApp number to your helper profile.
          </h2>
          <p className="text-sm text-white/75 leading-relaxed">
            Once connected, your verification steps, document approvals, and customer job dispatch stay synchronized across web and WhatsApp.
          </p>
        </div>
      </aside>

      <div className="lg:col-span-7 flex flex-col bg-surface">
        <header className="border-b border-border px-6 sm:px-10 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-ink-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </button>
          <span className="lg:hidden font-display font-bold text-sm text-ink-900">Uncedo Helpers</span>
          <div className="w-12 hidden lg:block" />
        </header>

        <main className="flex-1 flex items-center justify-center px-6 sm:px-12 py-10">
          <div className="w-full max-w-md space-y-6">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tealbrand-700">
                WhatsApp Account Verification
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">
                Link Helper Account
              </h1>
            </div>

            {!token ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  This WhatsApp verification link is missing or expired. Message Uncedo on WhatsApp to request a fresh link, or sign in directly.
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate(user ? '/onboarding' : '/sign-in')}
                  className="w-full py-3 px-4 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white"
                >
                  {user ? 'Go to Helper Onboarding' : 'Sign In to Helpers Portal'}
                </button>
              </div>
            ) : linkedDone ? (
              <div className="space-y-5">
                <div className="rounded-lg border border-tealbrand-600/30 bg-tealbrand-50 px-4 py-3.5 text-sm text-tealbrand-700 flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  WhatsApp chat connected to {user?.email || 'your helper account'}.
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('/onboarding')}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white"
                >
                  Continue to Helper Onboarding
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ) : user ? (
              <div className="space-y-4">
                {linking ? (
                  <p className="text-sm text-ink-600">Connecting WhatsApp to {user.email}…</p>
                ) : (
                  <>
                    {error && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        {error}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => signOutHelperAccount()}
                      className="w-full py-2.5 px-4 rounded-lg border border-border bg-white hover:bg-well text-sm font-medium text-ink-700"
                    >
                      Sign out and try the correct helper email
                    </button>
                  </>
                )}
              </div>
            ) : (
              <form onSubmit={handleSignInAndLink} className="space-y-4">
                <p className="text-sm text-ink-500">
                  Sign in with your Uncedo Helper email and password to verify the connection and continue your onboarding.
                </p>
                <div>
                  <label htmlFor="linkEmail" className="block text-sm font-medium text-ink-900 mb-1.5">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="h-4 w-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="linkEmail"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-lg border border-border bg-white pl-10 pr-3.5 py-2.5 text-sm text-ink-900 focus:border-tealbrand-600 focus:outline-none focus:ring-2 focus:ring-tealbrand-600/15"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="linkPassword" className="block text-sm font-medium text-ink-900 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="h-4 w-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="linkPassword"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
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
                  disabled={linking}
                  className="w-full py-3 px-4 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {linking ? 'Verifying Link…' : 'Sign In & Verify WhatsApp'}
                </button>
              </form>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
