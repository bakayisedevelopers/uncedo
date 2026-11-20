import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, MessageSquare } from 'lucide-react';
import portraitImg from '../assets/images/auth_partner_portrait_1794749286443.jpg';
import {
  WHATSAPP_CHAT_URL,
  completeWhatsAppAccountLink,
} from '../services/helperDataService';
import {
  capturePendingWhatsAppAccountLink,
  clearPendingWhatsAppAccountLink,
} from '../utils/whatsappLinkState';

export function WhatsAppLinkPage({ user, onNavigate, onWhatsAppLinked }) {
  const [token] = useState(() => capturePendingWhatsAppAccountLink());
  const [linking, setLinking] = useState(() => Boolean(token));
  const [linkedDone, setLinkedDone] = useState(false);
  const [returnUrl, setReturnUrl] = useState(WHATSAPP_CHAT_URL);
  const [error, setError] = useState('');
  const attemptedTokenRef = useRef('');

  useEffect(() => {
    if (!token || attemptedTokenRef.current === token) return;
    attemptedTokenRef.current = token;
    let active = true;
    setLinking(true);
    setError('');
    completeWhatsAppAccountLink(token)
      .then((result) => {
        if (!active) return;
        clearPendingWhatsAppAccountLink();
        const nextReturn = /^https:\/\/wa\.me\/\d{8,15}$/.test(String(result?.returnUrl || ''))
          ? String(result.returnUrl)
          : WHATSAPP_CHAT_URL;
        setReturnUrl(nextReturn);
        setLinkedDone(true);
        onWhatsAppLinked?.('Your WhatsApp chat is now verified and linked to your helper account.');
      })
      .catch((err) => {
        if (!active) return;
        if (/invalid|expired|already been used/i.test(String(err?.message || ''))) {
          clearPendingWhatsAppAccountLink();
        }
        setError(err?.message || 'We could not verify this WhatsApp link. Return to WhatsApp and request a fresh link.');
      })
      .finally(() => {
        if (active) setLinking(false);
      });
    return () => { active = false; };
  }, [onWhatsAppLinked, token]);

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

        <div className="relative z-10 inline-flex items-center gap-2.5 font-display font-bold text-lg tracking-tight text-white">
          <img
            src="/helpers-logo-192.png"
            alt="Uncedo Helpers"
            referrerPolicy="no-referrer"
            className="h-8 w-8 rounded-lg border border-white/20 object-cover bg-white shrink-0"
          />
          <span>Uncedo Helpers</span>
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
          <span className="lg:hidden inline-flex items-center gap-2 font-display font-bold text-sm text-ink-900">
            <img
              src="/helpers-logo-192.png"
              alt="Uncedo Helpers"
              referrerPolicy="no-referrer"
              className="h-6 w-6 rounded-md border border-border object-cover bg-white shrink-0"
            />
            <span>Uncedo Helpers</span>
          </span>
          <div className="w-12 hidden lg:block" />
        </header>

        <main className="flex-1 flex items-center justify-center px-6 sm:px-12 py-10">
          <div className="w-full max-w-md space-y-6">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tealbrand-700">
                WhatsApp Account Verification
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">
                {linkedDone ? 'WhatsApp Connected' : 'Link Helper Account'}
              </h1>
            </div>

            {!token ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  This WhatsApp verification link is missing or expired. Message Uncedo on WhatsApp to request a fresh link, or sign in directly.
                </div>
                <a
                  href={`${WHATSAPP_CHAT_URL}?text=${encodeURIComponent('Resend link')}`}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white"
                >
                  <MessageSquare className="h-4 w-4" />
                  Request New Link on WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => onNavigate(user ? '/onboarding' : '/sign-in')}
                  className="w-full py-2.5 px-4 rounded-lg border border-border bg-white hover:bg-well text-sm font-medium text-ink-700"
                >
                  {user ? 'Go to Helper Onboarding' : 'Sign In to Helpers Portal'}
                </button>
              </div>
            ) : linking ? (
              <div className="rounded-lg border border-tealbrand-600/30 bg-tealbrand-50 px-4 py-4 text-sm text-tealbrand-800">
                Verifying your one-time WhatsApp link…
              </div>
            ) : linkedDone ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-tealbrand-600/30 bg-tealbrand-50 px-4 py-3.5 text-sm text-tealbrand-700 flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <span>
                    Your WhatsApp chat is now connected to {user?.email || 'your helper account'}. You can return to WhatsApp or continue your helper setup here.
                  </span>
                </div>
                <a
                  href={returnUrl}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white"
                >
                  <MessageSquare className="h-4 w-4" />
                  Return to Uncedo WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => onNavigate(user ? '/onboarding' : '/sign-in')}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-border bg-white hover:bg-well text-sm font-semibold text-ink-800"
                >
                  <span>{user ? 'Continue to Helper Onboarding' : 'Sign In to Helpers Portal'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {error}
                  </div>
                )}
                <a
                  href={`${returnUrl}?text=${encodeURIComponent('Resend link')}`}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white"
                >
                  <MessageSquare className="h-4 w-4" />
                  Request New Link on WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => onNavigate(user ? '/onboarding' : '/sign-in')}
                  className="w-full py-2.5 px-4 rounded-lg border border-border bg-white hover:bg-well text-sm font-medium text-ink-700"
                >
                  {user ? 'Go to Helper Onboarding' : 'Sign In to Helpers Portal'}
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
