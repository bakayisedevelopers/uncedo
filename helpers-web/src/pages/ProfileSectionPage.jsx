import { useState } from 'react';
import { ArrowRight, Banknote, CheckCircle2, ChevronLeft, CreditCard, MapPin, RefreshCw, XCircle } from 'lucide-react';
import { StepAgreement } from '../components/steps/StepAgreement';
import { StepBasics } from '../components/steps/StepBasics';
import { StepPayoutDetails } from '../components/steps/StepPayoutDetails';
import { StepPoliceClearance } from '../components/steps/StepPoliceClearance';
import { StepProfilePhoto } from '../components/steps/StepProfilePhoto';
import { useHelperSession } from '../context/HelperSessionContext';
import {
  reactivateHelperAccount,
  requestHelperAccountDeletion,
  resolveHelperPayoutAmount,
  resolveLegacyCompletedJobsWalletApi,
  respondToCashServicePaymentApi,
  signOutHelperAccount,
} from '../services/helperDataService';

const LEGAL_LINKS = [
  { path: '/privacy-policy', label: 'Privacy Policy & POPIA Notice' },
  { path: '/terms', label: 'Helper Terms and Conditions' },
  { path: '/payment-pricing-policy', label: 'Helper Payout, Pricing & Cash Policy' },
  { path: '/refund-policy', label: 'Cancellation, Refund & Adjustment Policy' },
  { path: '/data-voice-policy', label: 'Location, Data & WhatsApp Policy' },
];

function moneyMinor(minor = 0) {
  return `R${(Math.max(0, Number(minor || 0)) / 100).toFixed(2)}`;
}

function formatDate(val) {
  if (!val) return 'Recent';
  const parsed = typeof val?.toDate === 'function' ? val.toDate() : new Date(val);
  return Number.isNaN(parsed.getTime())
    ? 'Recent'
    : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getJobAmount(job) {
  return resolveHelperPayoutAmount(job);
}

export function ProfileSectionPage({ section = 'details', isTopLevel = false, onNavigate }) {
  const {
    user,
    profile,
    evaluation,
    walletSnapshot,
    cashConfirmations = [],
    refreshCashConfirmations,
    walletLoading,
    walletError,
    refreshWallet,
    offers,
    offerBusyId,
    offerError,
    setOfferError,
    respondToOffer,
    jobHistory,
    setClearanceReview,
    setActiveAgreement,
  } = useHelperSession();

  const fallbackUnresolvedJobs = jobHistory.filter((job) => {
    const st = String(job.status || '').toLowerCase();
    if (st !== 'completed' && st !== 'canceled' && st !== 'cancelled') return false;
    if (Number(job?.legacyWalletResolvedAtMs || 0) > 0) return false;
    if (Number(job?.helperWalletAccountingVersion || 0) === 1) return false;
    if (String(job?.cashPayment?.status || '').toLowerCase() === 'helper_confirmed') return false;
    if (String(job?.paymentMethod || '').toLowerCase() === 'cash' && String(job?.paymentStatus || '').toLowerCase() === 'paid') return false;
    if (
      String(job?.paymentFlowVersion || '') === 'explicit_v1'
      && ['unpaid', 'cash_selected', 'awaiting_cash_confirmation', 'awaiting_customer_confirmation', 'payment_processing', 'payment_reconciliation_required'].includes(String(job?.paymentStatus || '').toLowerCase())
    ) {
      return false;
    }
    return st === 'completed' ? getJobAmount(job) > 0 : Number(job?.helperPayoutBreakdown?.helperAmount || 0) > 0;
  });
  const fallbackUnresolvedMinor = Math.round(
    fallbackUnresolvedJobs.reduce(
      (sum, job) => sum + (String(job.status || '').toLowerCase() === 'completed' ? getJobAmount(job) : Number(job?.helperPayoutBreakdown?.helperAmount || 0)),
      0,
    ) * 100,
  );
  const serverLegacySummary = walletSnapshot?.legacySummary;
  const unresolvedLegacyMinor = (serverLegacySummary && typeof serverLegacySummary.unresolvedAmountMinor === 'number')
    ? Math.max(0, serverLegacySummary.unresolvedAmountMinor)
    : fallbackUnresolvedMinor;
  const unresolvedLegacyJobsCount = (serverLegacySummary && typeof serverLegacySummary.unresolvedJobsCount === 'number')
    ? serverLegacySummary.unresolvedJobsCount
    : fallbackUnresolvedJobs.length;
  const wallet = walletSnapshot?.wallet || {};
  const transactions = Array.isArray(walletSnapshot?.transactions) ? walletSnapshot.transactions : [];
  const recentJobs = jobHistory.slice(0, 8);
  const [cashBusyId, setCashBusyId] = useState('');
  const [cashFeedback, setCashFeedback] = useState('');
  const [resolvingLegacy, setResolvingLegacy] = useState(false);
  const [legacyFeedback, setLegacyFeedback] = useState('');
  const [legacyError, setLegacyError] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionError, setDeletionError] = useState('');
  const [deletionFeedback, setDeletionFeedback] = useState('');
  const isPendingDeletion = String(profile?.accountStatus || '').trim().toLowerCase() === 'pending_deletion';
  const deletionDateLabel = profile?.deletionScheduledAtMs
    ? new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(profile.deletionScheduledAtMs))
    : 'in 30 days';

  const handleScheduleAccountDeletion = async () => {
    setDeletionError('');
    setDeletionFeedback('');
    if (deleteConfirmText.trim() !== 'DELETE') {
      setDeletionError('Type DELETE in uppercase to schedule account deletion.');
      return;
    }
    setDeletionBusy(true);
    try {
      await requestHelperAccountDeletion({ reason: deleteReason.trim() });
      await signOutHelperAccount().catch(() => null);
      onNavigate('/sign-in');
    } catch (err) {
      setDeletionError(err?.message || 'Unable to schedule account deletion right now.');
    } finally {
      setDeletionBusy(false);
    }
  };

  const handleReactivateAccount = async () => {
    setDeletionError('');
    setDeletionFeedback('');
    setDeletionBusy(true);
    try {
      await reactivateHelperAccount();
      setDeletionFeedback('Your helper account has been reactivated and the 30-day scheduled deletion was canceled.');
    } catch (err) {
      setDeletionError(err?.message || 'Unable to reactivate your account right now.');
    } finally {
      setDeletionBusy(false);
    }
  };

  const handleResolveLegacyJobs = async () => {
    setResolvingLegacy(true);
    setLegacyFeedback('');
    setLegacyError('');
    try {
      const result = await resolveLegacyCompletedJobsWalletApi();
      await refreshWallet();
      const addedMinor = Number(result?.addedMinor || 0);
      const count = Number(result?.resolvedCount || 0);
      if (addedMinor > 0) {
        setLegacyFeedback(`Added ${moneyMinor(addedMinor)} from ${count} completed job${count === 1 ? '' : 's'} to your wallet balance.`);
      } else {
        setLegacyFeedback('All eligible completed jobs are already resolved into your wallet.');
      }
    } catch (err) {
      setLegacyError(err?.message || 'Unable to resolve legacy completed jobs into your wallet.');
    } finally {
      setResolvingLegacy(false);
    }
  };

  const loadCashConfirmations = async () => {
    if (section !== 'payouts' || !user?.uid) return;
    await refreshCashConfirmations?.();
  };

  const handleCashResponse = async (item, action) => {
    setCashBusyId(`${item.requestId}:${action}`);
    setCashFeedback('');
    try {
      await respondToCashServicePaymentApi({
        requestId: item.requestId,
        attemptId: item.attemptId,
        action,
      });
      await Promise.all([loadCashConfirmations(), refreshWallet()]);
      setCashFeedback(
        action === 'confirm'
          ? `Confirmed R${Number(item.amount || 0).toFixed(2)} cash payment for ${item.service}.`
          : `Marked payment as not received for ${item.service}. Customer can re-select a payment method.`,
      );
    } catch (err) {
      setCashFeedback(err?.message || 'Unable to update cash confirmation.');
    } finally {
      setCashBusyId('');
    }
  };

  const headers = {
    details: {
      eyebrow: 'Account',
      title: 'Personal details',
      copy: 'Edit your helper identity, profile selfie, helper type, and home address used for dispatch.',
    },
    payouts: {
      eyebrow: 'Wallet & Activity',
      title: 'Payments',
      copy: 'Track your wallet balance, incoming offers, job earnings activity, and verified South African bank payout.',
    },
    security: {
      eyebrow: 'Account',
      title: 'Security & police clearance',
      copy: 'Keep your account safe, upload or review your police clearance certificate, and check safety rules.',
    },
    legal: {
      eyebrow: 'Account',
      title: 'Agreement and legal',
      copy: 'Review your active Uncedo Helper Agreement and official platform policy documents.',
    },
  };

  const activeHeader = headers[section] || headers.details;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-5">
      {!isTopLevel && (
        <button
          type="button"
          onClick={() => onNavigate('/profile')}
          className="inline-flex items-center gap-1 text-xs font-extrabold text-tealbrand-700 hover:text-tealbrand-800"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Back to profile</span>
        </button>
      )}

      <header className="space-y-1.5">
        <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-tealbrand-700 flex items-center gap-1.5">
          {section === 'payouts' && <CreditCard className="h-3.5 w-3.5" />}
          <span>{activeHeader.eyebrow}</span>
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-ink-900">
          {activeHeader.title}
        </h1>
        <p className="text-sm text-ink-500 leading-relaxed">{activeHeader.copy}</p>
      </header>

      {section === 'details' && (
        <div className="space-y-5">
          <section className="rounded-[24px] border border-border bg-surface p-5 sm:p-6 space-y-4">
            <div className="space-y-0.5">
              <h2 className="font-display text-lg font-extrabold text-ink-900">Completion status</h2>
              <p className="text-xs sm:text-sm text-ink-500">
                {evaluation.fullyVerified
                  ? 'All helper profile requirements are verified.'
                  : `${evaluation.completedTotalSteps} of ${evaluation.totalSteps} onboarding stages complete (${evaluation.progressPercent}%).`}
              </p>
            </div>
          </section>

          <section className="rounded-[24px] border border-border bg-surface p-5 sm:p-6 space-y-4">
            <h2 className="font-display text-lg font-extrabold text-ink-900">Profile selfie</h2>
            <StepProfilePhoto user={user} profile={profile} onCompleteNext={() => onNavigate('/services')} />
          </section>

          <section className="rounded-[24px] border border-border bg-surface p-5 sm:p-6 space-y-4">
            <h2 className="font-display text-lg font-extrabold text-ink-900">Helper details</h2>
            <StepBasics user={user} profile={profile} onCompleteNext={() => onNavigate('/profile')} />
          </section>
        </div>
      )}

      {section === 'payouts' && (
        <div className="space-y-5">
          <section className="rounded-[24px] border border-tealbrand-600/20 bg-tealbrand-50/45 p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-extrabold text-ink-900">Wallet</h2>
                <p className="text-xs text-ink-500 mt-0.5">
                  Server-recorded helper funds and completed job earnings.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  refreshWallet();
                  loadCashConfirmations();
                }}
                disabled={walletLoading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-surface hover:bg-well text-xs font-bold text-ink-900 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${walletLoading ? 'animate-spin' : ''}`} />
                <span>{walletLoading ? 'Refreshing…' : 'Refresh'}</span>
              </button>
            </div>

            {(() => {
              const rawMinor = wallet?.balanceMinor;
              const profileMinor = profile?.wallet?.balanceMinor;
              const signedBalanceMinor = Number.isSafeInteger(Number(rawMinor))
                ? Number(rawMinor)
                : Number.isSafeInteger(Number(profileMinor))
                  ? Number(profileMinor)
                  : (wallet?.availableMinor !== undefined || wallet?.outstandingCommissionMinor !== undefined)
                    ? (Number(wallet?.availableMinor || 0) - Number(wallet?.outstandingCommissionMinor || 0))
                    : Math.round(Number(profile?.wallet?.balance || 0) * 100);
              const nextMonthlyPayoutMinor = wallet?.reconciliationBlocked ? 0 : Math.max(0, signedBalanceMinor);
              const formattedBalance = signedBalanceMinor < 0
                ? `-R${(Math.abs(signedBalanceMinor) / 100).toFixed(2)}`
                : moneyMinor(signedBalanceMinor);
              return (
                <>
                  <div>
                    <div className={`tabular-nums-mono text-3xl font-extrabold ${signedBalanceMinor < 0 ? 'text-red-700' : 'text-ink-900'}`}>
                      {formattedBalance}
                    </div>
                    <div className="text-xs font-semibold text-ink-500 mt-0.5">
                      {signedBalanceMinor < 0
                        ? 'Wallet balance (negative — platform share owed from cash jobs, offset by upcoming card earnings)'
                        : 'Wallet balance'}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-border bg-surface p-3.5">
                      <div className="text-[11px] font-bold uppercase text-ink-400">Next 26th monthly payout</div>
                      <div className="tabular-nums-mono text-lg font-extrabold text-tealbrand-700 mt-1">
                        {moneyMinor(nextMonthlyPayoutMinor)}
                      </div>
                      <div className="text-[11px] text-ink-500 mt-0.5">
                        {nextMonthlyPayoutMinor > 0
                          ? 'Paid out via Paystack on the 26th of the month and reset to R0.00 once confirmed.'
                          : 'Paid card jobs split directly to your bank; monthly 26th payouts run for remaining wallet balances above R0.00.'}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border bg-surface p-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-bold uppercase text-ink-400">Completed jobs total</div>
                          <div className="tabular-nums-mono text-lg font-extrabold text-ink-900 mt-1">
                            {moneyMinor(unresolvedLegacyMinor)}
                          </div>
                        </div>
                        {unresolvedLegacyMinor > 0 && (
                          <button
                            type="button"
                            onClick={handleResolveLegacyJobs}
                            disabled={resolvingLegacy || walletLoading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-tealbrand-600 hover:bg-tealbrand-700 text-xs font-bold text-white disabled:opacity-50 shrink-0"
                          >
                            <span>{resolvingLegacy ? 'Resolving…' : 'Resolve'}</span>
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] text-ink-500">
                        {unresolvedLegacyMinor > 0
                          ? `${unresolvedLegacyJobsCount} unresolved completed job${unresolvedLegacyJobsCount === 1 ? '' : 's'} ready to add to your wallet balance.`
                          : 'All completed job earnings have been synced to your wallet.'}
                      </div>
                    </div>
                  </div>
                  {legacyFeedback && (
                    <p className="text-xs font-semibold text-tealbrand-800 bg-surface rounded-xl border border-border px-3.5 py-2.5">
                      {legacyFeedback}
                    </p>
                  )}
                  {legacyError && (
                    <p className="text-xs font-medium text-red-700">{legacyError}</p>
                  )}
                </>
              );
            })()}

            {walletError && (
              <p className="text-xs font-medium text-red-700">{walletError}</p>
            )}
          </section>

          {/* Pending Cash Confirmations */}
          {(cashConfirmations.length > 0 || cashFeedback) && (
            <section className="rounded-[24px] border border-amber-300 bg-amber-50/70 p-5 sm:p-6 space-y-3">
              <div className="flex items-center gap-2 text-amber-900">
                <Banknote className="h-4 w-4 text-amber-700" />
                <h2 className="font-display text-lg font-extrabold">
                  Cash Confirmations ({cashConfirmations.length})
                </h2>
              </div>
              {cashFeedback && (
                <p className="text-xs font-semibold text-tealbrand-800 bg-surface rounded-xl border border-border px-3.5 py-2.5">
                  {cashFeedback}
                </p>
              )}
              <div className="space-y-3">
                {cashConfirmations.map((item) => {
                  const confirming = cashBusyId === `${item.requestId}:confirm`;
                  const rejecting = cashBusyId === `${item.requestId}:reject`;
                  const busy = confirming || rejecting;
                  return (
                    <div
                      key={item.requestId}
                      className="rounded-2xl border border-amber-200 bg-surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="text-xs font-bold text-amber-800">
                          Customer reported paying R{Number(item.amount || 0).toFixed(2)} ZAR
                        </div>
                        <div className="text-sm font-extrabold text-ink-900 truncate">
                          {item.service} · {item.requestReference}
                        </div>
                        <button
                          type="button"
                          onClick={() => onNavigate(`/requests/${item.requestId}`)}
                          className="text-xs font-bold text-tealbrand-700 hover:underline"
                        >
                          Open job details
                        </button>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCashResponse(item, 'reject')}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-xs font-bold text-red-700 disabled:opacity-50"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>{rejecting ? 'Updating…' : 'Not Received'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCashResponse(item, 'confirm')}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-tealbrand-600 hover:bg-tealbrand-700 text-xs font-bold text-white disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>{confirming ? 'Confirming…' : 'Confirm Received'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Pending Offers */}
          {offers.length > 0 && (
            <section className="rounded-[24px] border border-border bg-surface p-5 sm:p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-extrabold text-ink-900">
                  Incoming Offers ({offers.length})
                </h2>
              </div>
              {offerError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800 flex items-center justify-between gap-2">
                  <span>{offerError}</span>
                  <button type="button" onClick={() => setOfferError('')} className="font-semibold underline">
                    Dismiss
                  </button>
                </div>
              )}
              <div className="space-y-3">
                {offers.map((offer) => {
                  const busy = offerBusyId === offer.id;
                  const amount = getJobAmount(offer);
                  const address = offer.area || offer.requestPayload?.serviceAddress || offer.requestPayload?.address || 'Customer location specified';
                  return (
                    <div
                      key={offer.id}
                      className="rounded-2xl border border-border bg-canvas/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="text-xs font-bold text-tealbrand-700">
                          {amount > 0 ? `R${amount.toFixed(2)}` : 'Quoted'}
                        </div>
                        <div className="text-sm font-extrabold text-ink-900 truncate">
                          {offer.title || offer.subject || offer.serviceSummary || 'Service Offer'}
                        </div>
                        <p className="text-xs text-ink-500 flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-tealbrand-700 shrink-0" />
                          <span className="truncate">{address}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => respondToOffer(offer, 'decline')}
                          disabled={busy}
                          className="px-3.5 py-2 rounded-xl border border-border bg-surface hover:bg-well text-xs font-bold text-ink-700 disabled:opacity-50"
                        >
                          Decline
                        </button>
                        <button
                          type="button"
                          onClick={() => respondToOffer(offer, 'accept', onNavigate)}
                          disabled={busy}
                          className="px-4 py-2 rounded-xl bg-tealbrand-600 hover:bg-tealbrand-700 text-xs font-bold text-white disabled:opacity-50"
                        >
                          {busy ? 'Accepting…' : 'Accept'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Incoming Incomes & Wallet Transactions */}
          <section className="rounded-[24px] border border-border bg-surface p-5 sm:p-6 space-y-3">
            <h2 className="font-display text-lg font-extrabold text-ink-900">
              Incoming Incomes &amp; Activity
            </h2>
            {transactions.length === 0 ? (
              <p className="text-xs sm:text-sm text-ink-500">
                Wallet credits, job payouts, and settlement activity will appear here as completed jobs settle.
              </p>
            ) : (
              <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden">
                {transactions.slice(0, 10).map((tx, idx) => {
                  const deltaMinor = Number.isSafeInteger(Number(tx.deltaMinor))
                    ? Number(tx.deltaMinor)
                    : Number(tx.availableDeltaMinor ?? tx.amountMinor ?? tx.amount ?? 0);
                  const txType = String(tx.entryType || tx.type || tx.category || 'Income').replace(/_/g, ' ');
                  const isDirectSplit = tx.entryType === 'split_direct_settlement' && deltaMinor === 0 && Number(tx.splitHelperAmountMinor || 0) > 0;
                  return (
                    <div key={tx.id || idx} className="p-3.5 sm:px-4 flex items-center justify-between gap-3 bg-surface">
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-sm font-bold text-ink-900 truncate capitalize">
                          {tx.description || txType}
                        </div>
                        <div className="text-xs text-ink-500 flex items-center gap-2">
                          <span>{formatDate(tx.createdAt || tx.createdAtMs)}</span>
                          {tx.status && (
                            <>
                              <span>·</span>
                              <span className="capitalize">{String(tx.status).replace(/_/g, ' ')}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className={`tabular-nums-mono text-sm font-extrabold shrink-0 ${deltaMinor < 0 ? 'text-red-700' : 'text-tealbrand-700'}`}>
                        {isDirectSplit
                          ? `Split ${moneyMinor(tx.splitHelperAmountMinor)}`
                          : `${deltaMinor < 0 ? '-' : '+'}${moneyMinor(Math.abs(deltaMinor))}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Jobs & Activity Summary */}
          <section className="rounded-[24px] border border-border bg-surface p-5 sm:p-6 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-extrabold text-ink-900">Jobs &amp; Activity</h2>
              <button
                type="button"
                onClick={() => onNavigate('/jobs')}
                className="text-xs font-extrabold text-tealbrand-700 hover:underline"
              >
                View all jobs
              </button>
            </div>
            {recentJobs.length === 0 ? (
              <p className="text-xs sm:text-sm text-ink-500">
                Completed and active jobs contributing to your payouts appear here automatically.
              </p>
            ) : (
              <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden">
                {recentJobs.map((job) => {
                  const st = String(job.status || 'pending').toLowerCase();
                  const amount = getJobAmount(job);
                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => onNavigate(`/requests/${job.id}`)}
                      className="w-full text-left p-3.5 sm:px-4 hover:bg-well/40 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 text-xs text-ink-500">
                          <span
                            className={`font-bold capitalize ${
                              st === 'completed'
                                ? 'text-tealbrand-700'
                                : st.includes('cancel')
                                  ? 'text-red-700'
                                  : 'text-amber-800'
                            }`}
                          >
                            {st.replace(/_/g, ' ')}
                          </span>
                          <span>·</span>
                          <span>{formatDate(job.createdAt)}</span>
                        </div>
                        <div className="text-sm font-bold text-ink-900 truncate">
                          {job.serviceSummary || job.subject || 'Service Request'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="tabular-nums-mono text-sm font-extrabold text-ink-900">
                          {amount > 0 ? `R${amount.toFixed(2)}` : '—'}
                        </span>
                        <ArrowRight className="h-4 w-4 text-ink-400" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-[24px] border border-border bg-surface p-5 sm:p-6 space-y-4">
            <h2 className="font-display text-lg font-extrabold text-ink-900">Bank payout destination</h2>
            <StepPayoutDetails
              profile={profile}
              showContinueButton={false}
              onCompleteNext={() => onNavigate(isTopLevel ? '/payments' : '/profile')}
            />
          </section>
        </div>
      )}

      {section === 'security' && (
        <div className="space-y-5">
          <section className="rounded-[24px] border border-border bg-surface p-5 sm:p-6 space-y-4">
            <h2 className="font-display text-lg font-extrabold text-ink-900">Police clearance certificate</h2>
            <StepPoliceClearance
              profile={profile}
              onReviewLoaded={setClearanceReview}
              onCompleteNext={() => onNavigate('/profile')}
            />
          </section>

          <section className="rounded-[24px] border border-border bg-surface p-5 sm:p-6 space-y-3">
            <h2 className="font-display text-lg font-extrabold text-ink-900">Safety guidance</h2>
            <ul className="space-y-2 text-sm text-ink-700 leading-relaxed">
              <li>· Keep your live location active only while you are available for work.</li>
              <li>· Use verified payout details and the in-app workflow for every customer job.</li>
              <li>· Only accept jobs you can complete inside the requested area and time.</li>
            </ul>
          </section>

          <section className="rounded-[24px] border border-border bg-surface p-5 sm:p-6 space-y-3">
            <h2 className="font-display text-lg font-extrabold text-ink-900">Session</h2>
            <button
              type="button"
              onClick={async () => {
                await signOutHelperAccount().catch(() => null);
                onNavigate('/sign-in');
              }}
              className="px-5 py-2.5 rounded-xl border border-border bg-well hover:bg-border/60 text-xs font-bold text-ink-900"
            >
              Log out
            </button>
          </section>

          <section className="rounded-[24px] border border-red-200 bg-surface p-5 sm:p-6 space-y-3">
            <h2 className="font-display text-lg font-extrabold text-ink-900">
              {isPendingDeletion ? 'Account scheduled for deletion' : 'Delete helper account'}
            </h2>
            {isPendingDeletion ? (
              <>
                <p className="text-sm text-red-900 leading-relaxed">
                  Your helper account is scheduled for permanent deletion on <strong>{deletionDateLabel}</strong>. You are offline and removed from dispatch. Cancel deletion now to restore your account immediately.
                </p>
                {deletionError && <p className="text-xs font-semibold text-red-700">{deletionError}</p>}
                {deletionFeedback && <p className="text-xs font-semibold text-tealbrand-700">{deletionFeedback}</p>}
                <button
                  type="button"
                  disabled={deletionBusy}
                  onClick={handleReactivateAccount}
                  className="px-5 py-2.5 rounded-xl bg-tealbrand-700 hover:bg-tealbrand-800 text-xs font-bold text-white disabled:opacity-50"
                >
                  {deletionBusy ? 'Reactivating…' : 'Cancel deletion & reactivate'}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-600 leading-relaxed">
                  Scheduling deletion immediately takes you offline and places your account in a 30-day reactivation window before permanent removal. Past job and payout records retain your details for record-keeping.
                </p>
                {deletionError && <p className="text-xs font-semibold text-red-700">{deletionError}</p>}
                {deletionFeedback && <p className="text-xs font-semibold text-tealbrand-700">{deletionFeedback}</p>}
                <input
                  type="text"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Optional reason"
                  className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-ink-900"
                />
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE to confirm"
                  className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-ink-900"
                />
                <button
                  type="button"
                  disabled={deletionBusy || deleteConfirmText.trim() !== 'DELETE'}
                  onClick={handleScheduleAccountDeletion}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white disabled:opacity-50"
                >
                  {deletionBusy ? 'Scheduling deletion…' : 'Schedule 30-day account deletion'}
                </button>
              </>
            )}
          </section>
        </div>
      )}

      {section === 'legal' && (
        <div className="space-y-5">
          <section className="rounded-[24px] border border-border bg-surface p-5 sm:p-6 space-y-4">
            <h2 className="font-display text-lg font-extrabold text-ink-900">Helper agreement</h2>
            <StepAgreement
              user={user}
              profile={profile}
              onAgreementLoaded={setActiveAgreement}
              onCompleteNext={() => onNavigate('/profile')}
            />
          </section>

          <section className="rounded-[24px] border border-border bg-surface p-5 sm:p-6 space-y-3">
            <h2 className="font-display text-lg font-extrabold text-ink-900">Policies &amp; POPIA Notices</h2>
            <div className="space-y-2">
              {LEGAL_LINKS.map((link) => (
                <button
                  key={link.path}
                  type="button"
                  onClick={() => onNavigate(link.path)}
                  className="w-full text-left flex items-center justify-between gap-3 rounded-2xl border border-border bg-tealbrand-50/40 hover:bg-tealbrand-50 px-4 py-3 text-sm font-bold text-tealbrand-800 transition-colors"
                >
                  <span>{link.label}</span>
                  <ArrowRight className="h-4 w-4 text-ink-400 shrink-0" />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
