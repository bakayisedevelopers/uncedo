import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Banknote, Clock, CreditCard, X } from 'lucide-react';
import { useHelperSession } from '../context/HelperSessionContext';
import { resolveHelperPayoutAmount } from '../services/helperDataService';

function getCountdownColor(secondsLeft) {
  if (secondsLeft <= 10) return '#ef4444';
  if (secondsLeft <= 20) return '#f59e0b';
  return '#22c55e';
}

function formatRand(amount) {
  return `R${(Number(amount || 0) || 0).toFixed(2)}`;
}

const IGNORED_ANSWER_KEYS = new Set([
  'travel_distance_km',
  'service_address_target',
  'service_address',
  'timing_preference',
  'scheduled_for_text',
  'selectedoptionid',
  'selected_option_id',
  'preselectedpaymenttype',
  'pre_selected_payment_type',
  'paymentmethod',
  'payment_method',
]);

function formatDetailLabel(rawKey = '') {
  const spaced = String(rawKey || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!spaced) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function formatDetailValue(rawValue) {
  if (rawValue === null || rawValue === undefined) return '';
  if (typeof rawValue === 'boolean') return rawValue ? 'Yes' : 'No';
  if (Array.isArray(rawValue)) {
    return rawValue.map(formatDetailValue).filter(Boolean).join(', ');
  }
  const text = String(rawValue).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (/^[a-z0-9_]+$/.test(text) && text.includes('_')) {
    const cleaned = text.replace(/_+/g, ' ').trim();
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return text;
}

function resolveOfferPaymentType(offer) {
  const rawType = String(
    offer?.preSelectedPaymentType
    || offer?.requestPayload?.preSelectedPaymentType
    || offer?.paymentMethod
    || offer?.paymentOperation?.method
    || offer?.settlementData?.method
    || '',
  )
    .trim()
    .toLowerCase();

  if (rawType === 'cash') return 'cash';
  if (
    rawType === 'card'
    || rawType === 'saved_card'
    || rawType === 'paystack_checkout'
    || rawType === 'paystack'
    || Boolean(
      offer?.preSelectedCardId
      || offer?.requestPayload?.preSelectedCardId
      || offer?.selectedCardId
      || offer?.requestPayload?.selectedCardId
      || offer?.preSelectedCardMode
      || offer?.requestPayload?.preSelectedCardMode,
    )
  ) {
    return 'card';
  }
  return '';
}

function extractOfferDetails(offer, offerTitle = '') {
  const normalizedTitle = String(offerTitle || '').trim().toLowerCase();
  const candidates = [
    offer?.description,
    offer?.requestPayload?.summary,
    offer?.serviceSummary,
    offer?.selectedOptionTitle,
    offer?.requestPayload?.selectedOptionTitle,
  ];
  const summaryText =
    candidates
      .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
      .find(
        (item) =>
          Boolean(item)
          && item.toLowerCase() !== 'a customer is requesting help.'
          && item.toLowerCase() !== normalizedTitle,
      ) || '';

  const rawAnswers = offer?.structuredAnswers || offer?.requestPayload?.structuredAnswers || {};
  const answerRows = [];
  if (rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers)) {
    for (const [key, rawValue] of Object.entries(rawAnswers)) {
      const normalizedKey = String(key || '').trim().toLowerCase();
      if (!normalizedKey || IGNORED_ANSWER_KEYS.has(normalizedKey)) continue;
      const value = formatDetailValue(rawValue);
      const label = formatDetailLabel(key);
      if (!label || !value) continue;
      answerRows.push({ key, label, value });
      if (answerRows.length >= 8) break;
    }
  }

  const rawNote = String(
    offer?.notes
    || offer?.requestPayload?.notes
    || offer?.additionalDetails
    || offer?.requestPayload?.additionalDetails
    || '',
  )
    .replace(/\s+/g, ' ')
    .trim();
  const noteText = rawNote && !answerRows.some((item) => item.value.toLowerCase() === rawNote.toLowerCase())
    ? rawNote
    : '';

  return { summaryText, answerRows, noteText };
}

export function HelperOfferOverlay({ onNavigate }) {
  const session = useHelperSession();
  const {
    user,
    profile,
    offers = [],
    activeRequest,
    evaluation,
    offerBusyId,
    offerError,
    setOfferError,
    respondToOffer,
  } = session || {};

  const [now, setNow] = useState(() => Date.now());
  const [pendingAction, setPendingAction] = useState({ offerId: '', action: '' });

  const visibleOffers = useMemo(
    () =>
      (Array.isArray(offers) ? offers : []).filter(
        (offer) => !offer?.offerExpiresAt || Number(offer.offerExpiresAt) > now,
      ),
    [offers, now],
  );

  const activeOffer = visibleOffers[0] || null;
  const activeOfferId = activeOffer?.id || '';
  const activeOfferExpiresAt = Number(activeOffer?.offerExpiresAt || 0);

  useEffect(() => {
    if (!activeOfferExpiresAt) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [activeOfferExpiresAt]);

  useEffect(() => {
    if (!offerBusyId) {
      setPendingAction({ offerId: '', action: '' });
    }
  }, [offerBusyId]);

  const offerWindowMs = useMemo(() => {
    if (!activeOfferExpiresAt) return 30000;
    const startedAt = Number(activeOffer?.lastOfferAt || 0);
    if (startedAt > 0 && activeOfferExpiresAt > startedAt) {
      return Math.max(5000, activeOfferExpiresAt - startedAt);
    }
    return 30000;
  }, [activeOffer?.lastOfferAt, activeOfferExpiresAt]);

  const secondsLeft = useMemo(() => {
    if (!activeOfferExpiresAt) return 0;
    return Math.max(0, Math.ceil((activeOfferExpiresAt - now) / 1000));
  }, [activeOfferExpiresAt, now]);

  const countdownRatio = activeOfferExpiresAt
    ? Math.max(0, Math.min(1, (activeOfferExpiresAt - now) / offerWindowMs))
    : 1;
  const countdownColor = activeOfferExpiresAt ? getCountdownColor(secondsLeft) : '#22c55e';
  const isExpired = Boolean(activeOfferExpiresAt) && secondsLeft <= 0;

  const isProcessingOffer = Boolean(activeOfferId && offerBusyId === activeOfferId);
  const isAccepting = isProcessingOffer && pendingAction.offerId === activeOfferId && pendingAction.action === 'accept';
  const isDeclining = isProcessingOffer && pendingAction.offerId === activeOfferId && pendingAction.action === 'decline';

  if (!activeOffer || isDeclining || isExpired) {
    return null;
  }

  const serverVerifiedHelper = String(profile?.verificationStatus || '').trim().toLowerCase() === 'verified';
  const isBusyFallback = String(activeOffer.offerType || '').trim().toLowerCase() === 'busy_helper_fallback';
  const canRespond = Boolean(user?.uid && (evaluation?.fullyVerified || serverVerifiedHelper) && (!activeRequest || isBusyFallback));

  const offerTitle =
    activeOffer.title || activeOffer.subject || activeOffer.serviceSummary || 'Service request';
  const customerName = activeOffer.customerName || 'Customer';
  const areaText =
    activeOffer.area
    || activeOffer.requestPayload?.serviceAddress
    || activeOffer.requestPayload?.address
    || activeOffer.serviceAddress
    || 'Location pending';
  const payoutAmount =
    activeOffer.payoutEstimate
    ?? resolveHelperPayoutAmount(activeOffer);

  const paymentType = resolveOfferPaymentType(activeOffer);
  const offerDetails = extractOfferDetails(activeOffer, offerTitle);
  const hasOfferDetails = Boolean(
    offerDetails.summaryText || offerDetails.answerRows.length > 0 || offerDetails.noteText,
  );

  const handleAction = async (action) => {
    setPendingAction({ offerId: activeOffer.id, action });
    await respondToOffer(activeOffer, action, onNavigate);
  };

  const buttonsDisabled =
    !canRespond || (Boolean(activeOfferExpiresAt) && secondsLeft <= 0) || isProcessingOffer;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Incoming helper offer"
      className="fixed inset-0 z-[60] flex items-end justify-center pointer-events-none"
    >
      {/* Translucent backdrop */}
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-slate-900/20 backdrop-blur-[1px] pointer-events-auto"
      />

      {/* Bottom Sheet (matches mobile HelperOfferOverlay) */}
      <div className="relative z-10 w-full max-w-xl mx-auto rounded-t-[24px] border border-b-0 border-border bg-surface shadow-[0_-12px_38px_rgba(9,26,23,0.18)] overflow-hidden pointer-events-auto pb-[env(safe-area-inset-bottom)]">
        {/* Live Countdown Progress Background Fill */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 opacity-[0.18] transition-[width] duration-100 ease-linear pointer-events-none"
          style={{
            width: `${countdownRatio * 100}%`,
            backgroundColor: countdownColor,
          }}
        />

        {/* Animated Diagonal Shimmer Sweep */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 -bottom-12 left-0 w-32 bg-white/40 blur-[1px] animate-helper-shimmer"
        />

        {/* Foreground Content */}
        <div className="relative z-10 p-5 sm:p-6 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-black uppercase tracking-[0.11em] text-tealbrand-800">
              {isBusyFallback ? 'Next job offer · After current job' : 'Incoming helper offer'}
            </span>
            {activeOfferExpiresAt > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold tabular-nums-mono text-white"
                style={{ backgroundColor: countdownColor }}
              >
                <Clock className="h-3 w-3" />
                {secondsLeft}s
              </span>
            )}
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="font-display text-[22px] font-extrabold text-ink-900 leading-tight break-words">
                {offerTitle}
              </h2>
              <p className="text-[13px] font-bold text-ink-500 leading-snug break-words">
                {customerName} | {areaText}
              </p>
            </div>
            <div className="shrink-0 rounded-2xl bg-tealbrand-800 px-3.5 py-2 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-tealbrand-100 leading-none mb-0.5">
                Your payout
              </div>
              <span className="tabular-nums-mono text-base font-extrabold text-white">
                {formatRand(payoutAmount)}
              </span>
            </div>
          </div>

          {/* Request Details Under Price */}
          {hasOfferDetails && (
            <div className="rounded-[14px] bg-well/75 px-3.5 py-2.5 space-y-1.5 max-h-36 overflow-y-auto">
              {offerDetails.summaryText && (
                <p className="text-xs font-medium text-ink-700 leading-relaxed break-words">
                  {offerDetails.summaryText}
                </p>
              )}
              {offerDetails.answerRows.length > 0 && (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {offerDetails.answerRows.map((item) => (
                    <div key={item.key} className="flex items-baseline justify-between sm:justify-start gap-1.5 min-w-0">
                      <dt className="font-semibold text-ink-500 shrink-0">{item.label}:</dt>
                      <dd className="font-bold text-ink-900 break-words min-w-0">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {offerDetails.noteText && (
                <p className="text-xs text-ink-600 leading-relaxed break-words">
                  <span className="font-semibold text-ink-500">Notes: </span>
                  {offerDetails.noteText}
                </p>
              )}
            </div>
          )}

          {/* Customer Payment Type (Borderless, Centered Row) */}
          {paymentType && (
            <div className="px-3 py-1 flex items-center justify-center gap-2">
              {paymentType === 'card' ? (
                <CreditCard className="h-4 w-4 text-tealbrand-700 shrink-0" aria-hidden="true" />
              ) : (
                <Banknote className="h-4 w-4 text-emerald-700 shrink-0" aria-hidden="true" />
              )}
              <span className="text-sm font-extrabold text-ink-900">
                {paymentType === 'card' ? 'Card' : 'Cash'}
              </span>
            </div>
          )}

          {isBusyFallback && activeRequest && (
            <div className="rounded-[14px] border border-tealbrand-200 bg-tealbrand-50 px-3.5 py-2.5 text-xs font-semibold text-tealbrand-900 leading-relaxed">
              Your active job stays uninterrupted. If you accept, we will ask the customer to confirm waiting based on your estimated finish and arrival times.
            </div>
          )}

          {/* Guard Warning if helper cannot accept right now */}
          {!canRespond && (
            <div className="rounded-[18px] border border-amber-300 bg-amber-50 p-3 flex items-start gap-2.5 text-xs font-extrabold text-amber-900 leading-relaxed">
              <AlertCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                {activeRequest
                  ? 'Finish the current helper job before taking another offer.'
                  : 'Complete your helper profile before accepting offers.'}
              </span>
            </div>
          )}

          {/* Error Feedback */}
          {offerError && (
            <div className="rounded-[14px] border border-red-200 bg-red-50 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs font-semibold text-red-800">
              <span>{offerError}</span>
              <button
                type="button"
                onClick={() => setOfferError?.('')}
                className="p-0.5 text-red-700 hover:text-red-900"
                aria-label="Dismiss offer error"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* 50/50 Action Buttons */}
          <div className="grid grid-cols-2 gap-2.5 pt-0.5">
            <button
              type="button"
              onClick={() => handleAction('accept')}
              disabled={buttonsDisabled}
              className="w-full min-h-[48px] rounded-2xl bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-extrabold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAccepting ? 'Accepting...' : isDeclining ? 'Processing...' : 'Accept'}
            </button>
            <button
              type="button"
              onClick={() => handleAction('decline')}
              disabled={buttonsDisabled}
              className="w-full min-h-[48px] rounded-2xl border border-border bg-surface hover:bg-well text-sm font-extrabold text-ink-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeclining ? 'Declining...' : isAccepting ? 'Processing...' : 'Decline'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
