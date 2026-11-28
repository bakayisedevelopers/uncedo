import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, MessageSquare } from 'lucide-react';
import portraitImg from '../assets/images/auth_helper_barber_1795647320964.jpg';
import {
  WHATSAPP_CHAT_URL,
  confirmWhatsAppHelperDeletionLink,
  inspectWhatsAppHelperDeletionLink,
} from '../services/helperDataService';

function formatDeletionDate(ms) {
  const num = Number(ms || 0);
  if (!Number.isFinite(num) || num <= 0) return 'in 30 days';
  try {
    return new Intl.DateTimeFormat('en-ZA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(num));
  } catch {
    return 'in 30 days';
  }
}

export function WhatsAppAccountDeletionPage({ user, onNavigate }) {
  const [token] = useState(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    return String(params.get('wa_delete_token') || '').trim();
  });
  const [loading, setLoading] = useState(Boolean(token));
  const [info, setInfo] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [doneMessage, setDoneMessage] = useState('');
  const [returnUrl, setReturnUrl] = useState(WHATSAPP_CHAT_URL);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    }
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
      setLoading(false);
      setError('This link is missing or expired. Send "delete account" in your Uncedo WhatsApp chat to request a fresh link.');
      return undefined;
    }
    let active = true;
    inspectWhatsAppHelperDeletionLink(token)
      .then((res) => {
        if (!active) return;
        setInfo(res);
        if (res?.returnUrl) setReturnUrl(String(res.returnUrl));
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || 'Unable to verify this account deletion link.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [token]);

  async function handleAction(action) {
    setError('');
    if (action === 'schedule_deletion' && confirmText.trim() !== 'DELETE') {
      setError('Type DELETE in uppercase to confirm scheduling your 30-day account deletion.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await confirmWhatsAppHelperDeletionLink({
        token,
        action,
        confirmText: confirmText.trim(),
        reason: reason.trim(),
      });
      if (result?.returnUrl) setReturnUrl(String(result.returnUrl));
      if (action === 'reactivate') {
        setDoneMessage('Your helper account has been reactivated and its 30-day scheduled deletion has been canceled.');
      } else {
        const label = result?.deletionDateLabel || formatDeletionDate(result?.deletionScheduledAtMs);
        setDoneMessage(`Your helper account has been taken offline and scheduled for permanent deletion on ${label}. You can sign in or reply "reactivate account" on WhatsApp anytime before that date to restore it.`);
      }
    } catch (err) {
      setError(err?.message || 'Unable to complete that account action right now.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas grid grid-cols-1 lg:grid-cols-12">
      <aside className="hidden lg:flex lg:col-span-5 relative bg-forest-900 text-white flex-col justify-between p-10 overflow-hidden">
        <img
          src={portraitImg}
          alt="Uncedo Helpers specialist"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-forest-950 via-forest-900/80 to-forest-900/60" />

        <div className="relative z-10 inline-flex items-center">
          <img
            src="/helpers-wordmark-white.png"
            alt="Uncedo Helpers"
            referrerPolicy="no-referrer"
            className="h-9 w-auto object-contain shrink-0"
          />
        </div>

        <div className="relative z-10 space-y-3 max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tealbrand-500">
            Account Management
          </p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-white leading-tight">
            Manage or schedule deletion of your helper account.
          </h2>
          <p className="text-sm text-white/75 leading-relaxed">
            Scheduled deletions include a 30-day reactivation window. Completed job and payout records stay preserved for audit and record-keeping.
          </p>
        </div>
      </aside>

      <div className="lg:col-span-7 flex flex-col bg-surface">
        <header className="border-b border-border px-6 sm:px-10 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onNavigate(user ? '/profile/security' : '/')}
            className="inline-flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-ink-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {user ? 'Security & clearance' : 'Home'}
          </button>
          <span className="lg:hidden inline-flex items-center">
            <img
              src="/helpers-wordmark.png"
              alt="Uncedo Helpers"
              referrerPolicy="no-referrer"
              className="h-8 w-auto object-contain shrink-0"
            />
          </span>
          <div className="w-12 hidden lg:block" />
        </header>

        <main className="flex-1 flex items-center justify-center px-6 sm:px-12 py-10">
          <div className="w-full max-w-md space-y-5">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tealbrand-700">
                Helper Account Deletion
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">
                {doneMessage
                  ? 'Account updated'
                  : info?.accountStatus === 'pending_deletion'
                    ? 'Scheduled for deletion'
                    : 'Delete helper account'}
              </h1>
            </div>

            {loading ? (
              <div className="rounded-lg border border-tealbrand-600/30 bg-tealbrand-50 px-4 py-4 text-sm text-tealbrand-800">
                Verifying your secure WhatsApp link…
              </div>
            ) : doneMessage ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-tealbrand-600/30 bg-tealbrand-50 px-4 py-3.5 text-sm text-tealbrand-800 flex items-start gap-2.5">
                  <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                  <span>{doneMessage}</span>
                </div>
                <a
                  href={returnUrl}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white"
                >
                  <MessageSquare className="h-4 w-4" />
                  Return to Uncedo WhatsApp
                </a>
              </div>
            ) : error && !info ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error}
                </div>
                <a
                  href={`${returnUrl}?text=${encodeURIComponent('delete account')}`}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white"
                >
                  <MessageSquare className="h-4 w-4" />
                  Request New Link on WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => onNavigate(user ? '/profile/security' : '/sign-in')}
                  className="w-full py-2.5 px-4 rounded-lg border border-border bg-white hover:bg-well text-sm font-medium text-ink-700"
                >
                  {user ? 'Open Security Settings' : 'Sign In to Helpers Portal'}
                </button>
              </div>
            ) : info?.accountStatus === 'pending_deletion' ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 leading-relaxed">
                  {info.displayName ? `${info.displayName}, your` : 'Your'} helper account is scheduled for permanent deletion on{' '}
                  <strong>{info.deletionDateLabel || formatDeletionDate(info.deletionScheduledAtMs)}</strong>.
                  You can cancel deletion now and restore your helper account immediately.
                </div>
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
                )}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleAction('reactivate')}
                  className="w-full py-3 px-4 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? 'Reactivating…' : 'Cancel deletion & reactivate account'}
                </button>
              </div>
            ) : info ? (
              <div className="space-y-4">
                <p className="text-sm text-ink-700">
                  Account: <strong>{info.displayName || 'Helper'}</strong>
                  {info.maskedEmail ? ` (${info.maskedEmail})` : ''}
                </p>
                <div className="rounded-lg border border-border bg-well px-4 py-3 text-sm text-ink-700 leading-relaxed">
                  Scheduling deletion immediately takes your helper profile offline and removes it from dispatch. You have <strong>30 days</strong> to reactivate. After 30 days, your profile is deleted while past job and payout records retain your details for record-keeping.
                </div>
                {!info.eligible && info.ineligibleReason ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {info.ineligibleReason}
                  </div>
                ) : (
                  <>
                    {error && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
                    )}
                    <label className="block space-y-1.5 text-xs font-bold text-ink-700">
                      <span>Optional reason</span>
                      <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Why are you leaving?"
                        className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm font-normal text-ink-900"
                      />
                    </label>
                    <label className="block space-y-1.5 text-xs font-bold text-ink-700">
                      <span>Type DELETE to confirm</span>
                      <input
                        type="text"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="Type DELETE"
                        className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm font-normal text-ink-900"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={submitting || confirmText.trim() !== 'DELETE'}
                      onClick={() => handleAction('schedule_deletion')}
                      className="w-full py-3 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {submitting ? 'Scheduling deletion…' : 'Schedule 30-day account deletion'}
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
