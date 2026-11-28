import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import {
  confirmWhatsAppAccountDeletionLink,
  inspectWhatsAppAccountDeletionLink,
} from '../services/authService';

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

export default function WhatsAppAccountDeletionPage() {
  const [token] = useState(() => {
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
  const [returnUrl, setReturnUrl] = useState('https://wa.me/27605239926');

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    }
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
      setLoading(false);
      setError('This link is missing or expired. Send "delete account" in your Uncedo WhatsApp chat to request a fresh link.');
      return undefined;
    }
    let active = true;
    inspectWhatsAppAccountDeletionLink({ token })
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
      const result = await confirmWhatsAppAccountDeletionLink({
        token,
        action,
        confirmText: confirmText.trim(),
        reason: reason.trim(),
      });
      if (result?.returnUrl) setReturnUrl(String(result.returnUrl));
      if (action === 'reactivate') {
        setDoneMessage('Your Uncedo customer account has been reactivated and its 30-day scheduled deletion has been canceled.');
      } else {
        const label = result?.deletionDateLabel || formatDeletionDate(result?.deletionScheduledAtMs);
        setDoneMessage(`Your account is now scheduled for permanent deletion on ${label}. You can sign in or reply "reactivate account" on WhatsApp anytime before that date to restore it.`);
      }
    } catch (err) {
      setError(err?.message || 'Unable to complete that account action right now.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MainLayout>
      <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4 py-12">
        <section className="app-surface w-full space-y-5 p-7 sm:p-9" aria-live="polite">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand">Account management</p>
            <h1 className="mt-2 text-2xl font-black text-zinc-900 sm:text-3xl">
              {doneMessage
                ? 'Account updated'
                : info?.accountStatus === 'pending_deletion'
                  ? 'Account scheduled for deletion'
                  : 'Delete Uncedo customer account'}
            </h1>
          </div>

          {loading ? (
            <p className="text-sm text-zinc-600">Verifying your secure WhatsApp link…</p>
          ) : doneMessage ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {doneMessage}
              </div>
              <a
                href={returnUrl}
                className="inline-flex w-full items-center justify-center rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white hover:bg-brand-dark"
              >
                Return to Uncedo on WhatsApp
              </a>
            </div>
          ) : error && !info ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                {error}
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href={returnUrl}
                  className="inline-flex items-center justify-center rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white hover:bg-brand-dark"
                >
                  Open Uncedo WhatsApp
                </a>
                <Link
                  to="/account"
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-300 px-5 py-3 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
                >
                  Manage in Account Settings
                </Link>
              </div>
            </div>
          ) : info?.accountStatus === 'pending_deletion' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                {info.displayName ? `${info.displayName}, your` : 'Your'} customer account is scheduled for permanent deletion on{' '}
                <strong>{info.deletionDateLabel || formatDeletionDate(info.deletionScheduledAtMs)}</strong>.
                You can cancel deletion now and restore your account immediately.
              </div>
              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
              ) : null}
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleAction('reactivate')}
                className="w-full rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {submitting ? 'Reactivating account…' : 'Cancel deletion & reactivate account'}
              </button>
            </div>
          ) : info ? (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-zinc-600">
                Account: <strong>{info.displayName || 'Customer'}</strong>
                {info.maskedEmail ? ` (${info.maskedEmail})` : ''}
              </p>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700">
                Your account will be scheduled for deletion <strong>30 days</strong> from now. During that 30-day window you can sign back in or reply on WhatsApp to reactivate. After 30 days, your user profile is removed while completed service request details remain recorded for business and helper audit history.
              </div>
              {!info.eligible && info.ineligibleReason ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                  {info.ineligibleReason}
                </div>
              ) : (
                <>
                  {error ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
                  ) : null}
                  <label className="block space-y-1.5 text-sm font-semibold text-zinc-700">
                    <span>Optional reason</span>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Why are you leaving?"
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand"
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm font-semibold text-zinc-700">
                    <span>Type DELETE to confirm</span>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="Type DELETE"
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-red-500"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={submitting || confirmText.trim() !== 'DELETE'}
                    onClick={() => handleAction('schedule_deletion')}
                    className="w-full rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {submitting ? 'Scheduling deletion…' : 'Schedule 30-day account deletion'}
                  </button>
                </>
              )}
            </div>
          ) : null}
        </section>
      </main>
    </MainLayout>
  );
}
