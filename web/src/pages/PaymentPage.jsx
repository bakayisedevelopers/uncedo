import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Banknote, CheckCircle2, CreditCard, Loader2, LockKeyhole, MessageCircle, RefreshCw, ShieldCheck, Star } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { requestPaymentFunction } from '../services/paymentService';

const TOKEN_STORAGE_KEY = 'uncedo:payment-session';
const MODE_STORAGE_KEY = 'uncedo:payment-mode';
const REFERENCE_STORAGE_KEY = 'uncedo:payment-return-reference';
const DEFAULT_WHATSAPP_URL = 'https://wa.me/27605239926';

function formatMoney(amount, currency = 'ZAR') {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 'Amount unavailable';
  const wholeAmount = Math.round(value);
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(wholeAmount);
}

function makeIdempotencyKey() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function PaymentPage() {
  const { user, initializing } = useAuth();
  const [token, setToken] = useState('');
  const [pageMode, setPageMode] = useState('payment');
  const [payment, setPayment] = useState(null);
  const [setupSession, setSetupSession] = useState(null);
  const [setupReference, setSetupReference] = useState('');
  const [setupVerifying, setSetupVerifying] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(15);
  const [email, setEmail] = useState('');
  const [saveCardConsent, setSaveCardConsent] = useState(true);
  const [savedCardId, setSavedCardId] = useState('');
  const [savedCardAttempt, setSavedCardAttempt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [ratingScore, setRatingScore] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingBusy, setRatingBusy] = useState(false);
  const [ratingError, setRatingError] = useState('');
  const [ratingNotice, setRatingNotice] = useState('');

  const isCardSetupMode = pageMode === 'card_setup';
  const request = payment || {};
  const activeAttemptId = String(payment?.activeAttemptId || '');
  const ownerCanSave = Boolean(user?.firebaseUser?.uid && payment?.canSaveCard);
  const canSaveCard = payment?.canSaveCard !== false;
  const canUseSavedCards = Boolean(ownerCanSave || payment?.canUseSavedCards);
  const cards = useMemo(() => Array.isArray(payment?.savedCards) ? payment.savedCards : [], [payment]);
  const pendingSavedCard = savedCardAttempt || payment?.pendingSavedCardPayment || null;
  const availableMethods = useMemo(
    () => (Array.isArray(payment?.availableMethods) ? payment.availableMethods : []),
    [payment],
  );
  const allowsCash = availableMethods.length > 0
    ? availableMethods.includes('cash')
    : !payment?.isCancellationFee;
  const allowsCard = availableMethods.length > 0
    ? availableMethods.includes('paystack_checkout')
    : true;

  const refresh = useCallback(async (sessionToken = token) => {
    if (!sessionToken) return;
    if (pageMode === 'card_setup') {
      const result = await requestPaymentFunction('getPreBookingCardSetupSession', { token: sessionToken }, { authenticated: Boolean(user) });
      setSetupSession(result);
      if (result.email) setEmail((current) => current || result.email);
      setExpired(false);
      return;
    }
    const result = await requestPaymentFunction('getServicePaymentSession', { token: sessionToken }, { authenticated: Boolean(user) });
    setPayment(result);
    setSavedCardAttempt(result.pendingSavedCardPayment || null);
    setSavedCardId(result.pendingSavedCardPayment?.card?.id || '');
    setExpired(false);
  }, [pageMode, token, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramToken = params.get('token') || '';
    const paramMode = params.get('mode') || '';
    const reference = params.get('reference') || params.get('trxref') || '';
    const incomingToken = paramToken || sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
    let resolvedMode = paramMode;
    if (!resolvedMode) {
      resolvedMode = paramToken ? 'payment' : (sessionStorage.getItem(MODE_STORAGE_KEY) || 'payment');
    }
    if (incomingToken) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, incomingToken);
      setToken(incomingToken);
    }
    if (resolvedMode === 'card_setup') {
      sessionStorage.setItem(MODE_STORAGE_KEY, 'card_setup');
      setPageMode('card_setup');
    } else {
      sessionStorage.removeItem(MODE_STORAGE_KEY);
      setPageMode('payment');
    }
    // Keep opaque capability tokens out of the address bar after capture.
    if (window.location.search) window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
    if (reference) {
      sessionStorage.setItem(REFERENCE_STORAGE_KEY, reference);
      setSetupReference(reference);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = async () => {
      setError('');
      try {
        if (pageMode === 'card_setup') {
          const result = await requestPaymentFunction('getPreBookingCardSetupSession', { token }, { authenticated: Boolean(user) });
          if (cancelled) return;
          setSetupSession(result);
          if (result.email) setEmail((current) => current || result.email);
          setExpired(false);
          const storedReference = sessionStorage.getItem(REFERENCE_STORAGE_KEY);
          if (storedReference && !result.verified) {
            sessionStorage.removeItem(REFERENCE_STORAGE_KEY);
            setSetupReference(storedReference);
            setSetupVerifying(true);
            try {
              const verified = await requestPaymentFunction('verifyPreBookingCardSetupCheckout', { token, reference: storedReference });
              if (!cancelled) {
                if (verified.verified) {
                  setSetupVerifying(false);
                  setSetupSession((current) => ({
                    ...(current || {}),
                    verified: true,
                    cardSummary: verified.cardSummary || current?.cardSummary,
                    refundStatus: verified.refundStatus || current?.refundStatus,
                    refundAccepted: verified.refundAccepted,
                    whatsappReturnUrl: verified.whatsappReturnUrl || current?.whatsappReturnUrl,
                  }));
                } else if (verified.status === 'processing') {
                  setMessage('Paystack is still confirming your card check. We will finish automatically in a moment.');
                }
              }
            } catch (verifyError) {
              if (!cancelled) {
                setSetupVerifying(false);
                setError(verifyError.message || 'Card verification did not succeed. Please try another card.');
              }
            }
          }
          return;
        }

        const result = await requestPaymentFunction('getServicePaymentSession', { token }, { authenticated: Boolean(user) });
        if (cancelled) return;
        setPayment(result);
        setSavedCardAttempt(result.pendingSavedCardPayment || null);
        setSavedCardId(result.pendingSavedCardPayment?.card?.id || '');
        setExpired(false);
        const storedReference = sessionStorage.getItem(REFERENCE_STORAGE_KEY);
        if (storedReference && result.paymentStatus !== 'paid') {
          sessionStorage.removeItem(REFERENCE_STORAGE_KEY);
          const verified = await requestPaymentFunction('verifyServicePaystackCheckout', { token, reference: storedReference });
          if (!cancelled) {
            setMessage(verified.status === 'paid' ? 'Your payment has been verified.' : 'Paystack is still confirming this payment. Refresh this page shortly.');
            await refresh(token);
          }
        }
      } catch (loadError) {
        if (cancelled) return;
        if (loadError.code === 'expired' || loadError.code === 'http-410') setExpired(true);
        else setError(loadError.message || 'This link could not be loaded.');
      }
    };
    load();
    return () => { cancelled = true; };
  }, [pageMode, token, user, refresh]);

  useEffect(() => {
    if (pageMode === 'card_setup') {
      if (!setupVerifying || !token || setupSession?.verified) return undefined;
      const poll = window.setInterval(async () => {
        try {
          if (setupReference) {
            const verified = await requestPaymentFunction('verifyPreBookingCardSetupCheckout', { token, reference: setupReference });
            if (verified.verified) {
              setSetupVerifying(false);
              setMessage('');
              setSetupSession((current) => ({
                ...(current || {}),
                verified: true,
                cardSummary: verified.cardSummary || current?.cardSummary,
                refundStatus: verified.refundStatus || current?.refundStatus,
                refundAccepted: verified.refundAccepted,
                whatsappReturnUrl: verified.whatsappReturnUrl || current?.whatsappReturnUrl,
              }));
              return;
            }
          }
          await refresh(token);
        } catch (pollError) {
          setSetupVerifying(false);
          setError(pollError.message || 'Unable to verify your card. Please try again.');
        }
      }, 3000);
      return () => window.clearInterval(poll);
    }
    if (!payment || payment.paymentStatus !== 'payment_processing') return undefined;
    const timer = window.setInterval(() => refresh().catch(() => null), 5000);
    return () => window.clearInterval(timer);
  }, [pageMode, payment, refresh, setupReference, setupSession?.verified, setupVerifying, token]);

  useEffect(() => {
    if (!isCardSetupMode || !setupSession?.verified) return undefined;
    setRedirectCountdown(15);
    const targetUrl = setupSession.whatsappReturnUrl || DEFAULT_WHATSAPP_URL;
    const interval = window.setInterval(() => {
      setRedirectCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(interval);
          window.location.assign(targetUrl);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isCardSetupMode, setupSession?.verified, setupSession?.whatsappReturnUrl]);

  useEffect(() => {
    const profileEmail = user?.profile?.email || user?.firebaseUser?.email || '';
    if (profileEmail && !email) setEmail(profileEmail);
  }, [email, user]);

  async function runAction(action, successMessage = '') {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await action();
      if (successMessage) setMessage(successMessage);
      await refresh();
      return result;
    } catch (actionError) {
      if (actionError.code === 'expired' || actionError.code === 'http-410') setExpired(true);
      setError(actionError.message || 'Payment could not be completed.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function startCardSetupCheckout(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await requestPaymentFunction('startPreBookingCardSetupCheckout', {
        token,
        email: email.trim(),
        saveCardConsent,
      }, { authenticated: Boolean(user) });
      if (result?.verified) {
        setSetupSession((current) => ({
          ...(current || {}),
          verified: true,
          cardSummary: result.cardSummary || current?.cardSummary,
          refundStatus: result.refundStatus || current?.refundStatus,
          refundAccepted: result.refundAccepted ?? current?.refundAccepted,
          whatsappReturnUrl: result.whatsappReturnUrl || current?.whatsappReturnUrl,
        }));
      } else if (result?.authorizationUrl) {
        if (result.reference) setSetupReference(result.reference);
        window.location.assign(result.authorizationUrl);
      }
    } catch (actionError) {
      if (actionError.code === 'expired' || actionError.code === 'http-410') setExpired(true);
      setError(actionError.message || 'Could not start card verification right now.');
    } finally {
      setBusy(false);
    }
  }

  async function startCardCheckout(event) {
    event.preventDefault();
    const result = await runAction(() => requestPaymentFunction('startServicePaystackCheckout', {
      token,
      email: email.trim(),
      saveCardConsent: canSaveCard && saveCardConsent,
      idempotencyKey: makeIdempotencyKey(),
    }, { authenticated: Boolean(user) }));
    if (result?.authorizationUrl) window.location.assign(result.authorizationUrl);
    else if (result?.status === 'payment_reconciliation_required' || result?.status === 'payment_failed') setMessage('Payment status: ' + result.status.replaceAll('_', ' ') + '. Refresh to see the latest verified status.');
  }

  async function selectCash() {
    const result = await runAction(() => requestPaymentFunction('selectCashPaymentFromSession', { token, idempotencyKey: makeIdempotencyKey() }), 'Cash payment selected. Pay the assigned helper in cash, then report it here.');
    if (result?.attemptId) setPayment((current) => ({ ...current, activeAttemptId: result.attemptId, paymentStatus: result.status }));
  }

  async function reportCashPaid() {
    await runAction(() => requestPaymentFunction('reportCashServicePayment', { token, attemptId: activeAttemptId }), 'Your report was sent. The assigned helper must confirm receipt before this request is marked paid.');
  }

  async function changeFromCash() {
    await runAction(() => requestPaymentFunction('cancelCashPaymentSelection', { token, attemptId: activeAttemptId }), 'Cash payment selection cancelled. You can choose another payment method.');
  }

  async function prepareSavedCard(cardId) {
    const result = await runAction(() => requestPaymentFunction('prepareSavedCardServicePayment', {
      token,
      paymentMethodId: cardId,
      idempotencyKey: makeIdempotencyKey(),
    }, { authenticated: Boolean(user) }));
    if (result?.attemptId) {
      setSavedCardAttempt({ ...result, card: result.card });
      setSavedCardId(cardId);
    }
  }

  async function confirmSavedCard() {
    if (!pendingSavedCard?.attemptId) return;
    const result = await runAction(() => requestPaymentFunction('confirmSavedCardServicePayment', {
      token,
      requestId: pendingSavedCard.requestId,
      attemptId: pendingSavedCard.attemptId,
      confirmed: true,
    }, { authenticated: Boolean(user) }));
    if (result?.status === 'paid') setSavedCardAttempt(null);
    else if (result?.status) setMessage(`Payment status: ${result.status.replaceAll('_', ' ')}. We will not retry an uncertain charge automatically.`);
  }

  async function cancelSavedCard() {
    if (!pendingSavedCard?.attemptId) return;
    const result = await runAction(() => requestPaymentFunction('cancelSavedCardPaymentConfirmation', {
      token,
      requestId: pendingSavedCard.requestId,
      attemptId: pendingSavedCard.attemptId,
    }, { authenticated: Boolean(user) }), 'Saved-card selection cancelled. No charge was made.');
    if (result?.success) setSavedCardAttempt(null);
  }

  async function submitHelperRating(event) {
    event.preventDefault();
    setRatingBusy(true);
    setRatingError('');
    setRatingNotice('');
    try {
      await requestPaymentFunction('submitServiceRatingFromPaymentSession', {
        token,
        score: ratingScore,
        comment: ratingComment.trim(),
      });
      setRatingNotice(`Thank you for rating ${payment?.helperName || 'your helper'}!`);
      await refresh();
    } catch (submitError) {
      setRatingError(submitError?.message || 'Unable to submit rating right now.');
    } finally {
      setRatingBusy(false);
    }
  }

  const paid = payment?.paymentStatus === 'paid';
  const paymentFailed = ['payment_failed', 'wallet_debt_recorded'].includes(String(payment?.paymentStatus || ''));
  const inProgress = ['payment_processing', 'payment_reconciliation_required', 'initializing', 'processing'].includes(String(payment?.paymentStatus || ''));
  const cashWaiting = ['cash_selected', 'awaiting_cash_confirmation'].includes(String(payment?.paymentStatus || ''));

  if (!token && !initializing) {
    return <PaymentShell><StatePanel icon={<AlertTriangle />} title="A payment link is needed" copy="Open the secure payment link sent by Uncedo or request a fresh link from your app or WhatsApp conversation." /></PaymentShell>;
  }

  if (isCardSetupMode) {
    const whatsappHref = setupSession?.whatsappReturnUrl || DEFAULT_WHATSAPP_URL;
    const refundConfirmed = setupSession?.refundStatus === 'refunded' || setupSession?.refundAccepted === true;
    return (
      <PaymentShell>
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link to="/" aria-label="Uncedo home" className="inline-flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
          <img
            src="/assets/aistudio/IMG_0926_8f427254.jpeg"
            alt="Uncedo"
            referrerPolicy="no-referrer"
            className="h-10 w-auto shrink-0 object-contain mix-blend-multiply"
          />
        </Link>
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-500"><LockKeyhole size={15} className="text-emerald-700" /> Card verification</div>
        </header>
        <main className="mx-auto max-w-2xl">
          <div className="mb-6">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">WhatsApp booking</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl">Verify your card for Uncedo</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-600">
              Paystack will charge only <strong>R1.00</strong> to verify that your card exists and is valid, and refund it immediately.
            </p>
          </div>

          {error ? <Notice tone="error">{error}</Notice> : null}
          {message ? <Notice tone="info">{message}</Notice> : null}

          {expired ? (
            <StatePanel icon={<AlertTriangle />} title="This card setup link has expired" copy="Return to your Uncedo WhatsApp chat and tap Add new card again to get a fresh link." />
          ) : !setupSession ? (
            <div className="app-surface flex min-h-56 items-center justify-center gap-3 p-8 text-zinc-600"><Loader2 className="animate-spin" /> Loading card verification…</div>
          ) : setupVerifying && !setupSession.verified ? (
            <section className="app-surface p-6 sm:p-8">
              <StatePanel
                icon={<Loader2 className="animate-spin" />}
                title="Confirming your card with Paystack"
                copy="Please wait while we verify your card check and issue the immediate R1.00 refund."
              />
            </section>
          ) : setupSession.verified ? (
            <section className="app-surface p-6 sm:p-8">
              <StatePanel
                icon={<CheckCircle2 />}
                title="Card verified"
                copy={setupSession.cardSummary?.last4
                  ? `${setupSession.cardSummary.brand || 'Card'} •••• ${setupSession.cardSummary.last4} is ready for this booking.`
                  : 'Your card has been verified for this booking.'}
              />
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm leading-6 text-emerald-950">
                <p className="font-bold">
                  {refundConfirmed
                    ? 'Your R1.00 verification check has been refunded immediately.'
                    : 'Your R1.00 verification refund has been submitted to Paystack.'}
                </p>
                <p className="mt-1 text-emerald-900">
                  We have sent your booking summary on WhatsApp — tap <strong>Confirm</strong> there to start finding a helper.
                </p>
              </div>
              <div className="mt-6 space-y-3">
                <a
                  href={whatsappHref}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3.5 text-sm font-extrabold text-white hover:bg-emerald-800"
                >
                  <MessageCircle size={18} />
                  <span>Go back to WhatsApp</span>
                  <ArrowRight size={16} />
                </a>
                <p className="text-center text-xs font-semibold text-zinc-500 tabular-nums">
                  Returning to WhatsApp automatically in {redirectCountdown}s…
                </p>
              </div>
            </section>
          ) : (
            <div className="space-y-5">
              <section className="app-surface overflow-hidden">
                <div className="border-b border-zinc-100 bg-zinc-50/80 p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Service</p>
                      <h2 className="mt-1 text-lg font-extrabold text-zinc-950">
                        {setupSession.service || 'Uncedo service'}
                        {setupSession.selectedOptionTitle ? ` — ${setupSession.selectedOptionTitle}` : ''}
                      </h2>
                    </div>
                    <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-800"><ShieldCheck size={21} /></div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 p-5 sm:p-6">
                  <div>
                    <p className="text-sm font-semibold text-zinc-500">Card verification charge</p>
                    <p className="mt-1 text-3xl font-black text-zinc-950 tabular-nums">R1.00</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Refunded immediately</p>
                  </div>
                </div>
                <div className="border-t border-zinc-100 bg-zinc-50/60 px-5 py-3.5 text-xs leading-5 text-zinc-600 sm:px-6">
                  The system will only charge <strong>R1.00</strong> on Paystack to confirm your card exists and is valid, and it is <strong>refunded immediately</strong> back to your card.
                </div>
              </section>

              <section className="app-surface p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-blue-100 p-2.5 text-blue-800"><CreditCard size={21} /></span>
                  <div>
                    <h2 className="font-extrabold text-zinc-950">Enter card on Paystack</h2>
                    <p className="mt-0.5 text-xs text-zinc-500">Card details are collected securely on Paystack’s hosted page.</p>
                  </div>
                </div>
                <form onSubmit={startCardSetupCheckout} className="mt-5 space-y-4">
                  <label className="block text-sm font-semibold text-zinc-700">
                    Email for Paystack verification &amp; receipts
                    <input
                      required
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="mt-1.5 min-h-[48px] w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 sm:text-sm"
                    />
                    {setupSession.requiresEmail ? (
                      <span className="mt-1.5 block text-xs font-normal text-zinc-500">
                        Your profile does not have an email yet. We will save this email to your profile for future Paystack transactions.
                      </span>
                    ) : null}
                  </label>
                  <label className="flex min-h-[48px] cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 text-sm leading-5 text-zinc-700">
                    <input
                      type="checkbox"
                      checked={saveCardConsent}
                      onChange={(event) => setSaveCardConsent(event.target.checked)}
                      className="mt-0.5 h-5 w-5 accent-emerald-700"
                    />
                    <span>
                      <strong>Save this card for future payments?</strong>
                      <span className="mt-0.5 block text-xs text-zinc-500">
                        Keep checked to save this card to your profile for future bookings. Uncheck to verify for this booking only without saving it to your profile.
                      </span>
                    </span>
                  </label>
                  <button
                    disabled={busy || !email.trim()}
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 font-extrabold text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={17} className="animate-spin" /> : <LockKeyhole size={17} />}
                    {busy ? 'Opening Paystack…' : 'Continue to Paystack · R1'}
                  </button>
                </form>
              </section>
            </div>
          )}
        </main>
        <footer className="mx-auto mt-10 max-w-2xl text-center text-xs leading-5 text-zinc-500">
          Uncedo never asks for your card number or CVV in chat. The temporary R1.00 card verification check is refunded immediately by Paystack.
        </footer>
      </PaymentShell>
    );
  }

  return (
    <PaymentShell>
      <header className="mb-8 flex items-center justify-between gap-4">
        <Link to="/" aria-label="Uncedo home" className="inline-flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
          <img
            src="/assets/aistudio/IMG_0926_8f427254.jpeg"
            alt="Uncedo"
            referrerPolicy="no-referrer"
            className="h-10 w-auto shrink-0 object-contain mix-blend-multiply"
          />
        </Link>
        <div className="flex items-center gap-2 text-xs font-bold text-zinc-500"><LockKeyhole size={15} className="text-emerald-700" /> Secure payment</div>
      </header>
      <main className="mx-auto max-w-2xl">
        <div className="mb-6">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">
            {payment?.isCancellationFee ? 'Cancellation fee' : 'Request payment'}
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl">
            {payment?.isCancellationFee ? 'Pay cancellation fee' : 'Complete your payment'}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-600">
            {payment?.isCancellationFee
              ? 'Review your cancellation fee and pay with a card below. Uncedo confirms card payments directly with Paystack.'
              : 'Review the final service amount and choose how you would like to pay. Uncedo confirms card payments directly with Paystack.'}
          </p>
        </div>

        {error ? <Notice tone="error">{error}</Notice> : null}
        {message ? <Notice tone="info">{message}</Notice> : null}

        {expired ? (
          <StatePanel icon={<AlertTriangle />} title="This payment link has expired" copy="For your security, expired links cannot be used. Request a fresh link from your signed-in app or the Uncedo WhatsApp conversation." />
        ) : !payment ? (
          <div className="app-surface flex min-h-56 items-center justify-center gap-3 p-8 text-zinc-600"><Loader2 className="animate-spin" /> Loading payment details…</div>
        ) : (
          <div className="space-y-5">
            <section className="app-surface overflow-hidden">
              <div className="border-b border-zinc-100 bg-zinc-50/80 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                <div><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Service</p><h2 className="mt-1 text-lg font-extrabold text-zinc-950">{request.service || 'Uncedo service'}</h2></div>
                  <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-800"><ShieldCheck size={21} /></div>
                </div>
                <p className="mt-4 text-xs font-semibold text-zinc-500">Request reference</p>
                <p className="mt-0.5 font-mono text-sm font-bold text-zinc-800">{request.requestReference || '—'}</p>
              </div>
              <div className="flex items-center justify-between gap-3 p-5 sm:p-6">
                <div><p className="text-sm font-semibold text-zinc-500">Final payable amount</p><p className="mt-1 text-3xl font-black text-zinc-950 tabular-nums">{formatMoney(payment.amount, payment.currency)}</p></div>
                <span className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${paid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{paid ? 'Paid' : String(payment.paymentStatus || 'unpaid').replaceAll('_', ' ')}</span>
              </div>
            </section>

            {paid ? (
              <section className="app-surface p-6 sm:p-8"><StatePanel icon={<CheckCircle2 />} title="Payment already completed" copy={payment.receipt?.receiptId ? `Receipt ${payment.receipt.receiptId}. Your payment was verified by Uncedo.` : 'This request is marked as paid in Uncedo’s records.'} /><button onClick={() => refresh()} className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-bold text-zinc-700"><RefreshCw size={15} /> Refresh status</button></section>
            ) : payment.paymentStatus === 'awaiting_customer_confirmation' ? (
              <section className="app-surface p-6 sm:p-8">
                {pendingSavedCard && canUseSavedCards ? <>
                  <StatePanel icon={<CreditCard />} title="Confirm this saved-card payment" copy={`You selected ${pendingSavedCard.card?.brand || 'card'} •••• ${pendingSavedCard.card?.last4}. Nothing is charged until you confirm the exact amount below.`} />
                  <div className="mt-5 rounded-xl bg-violet-50 p-4 text-center"><p className="text-xs font-bold uppercase tracking-wide text-violet-800">One-time payment</p><p className="mt-1 text-2xl font-black text-zinc-950 tabular-nums">{formatMoney(pendingSavedCard.amount, payment.currency)}</p><p className="mt-1 text-xs text-zinc-600">Request {request.requestReference}</p></div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2"><button disabled={busy} onClick={confirmSavedCard} className="min-h-[48px] rounded-xl bg-violet-700 px-4 py-3 font-extrabold text-white disabled:opacity-50">{busy ? 'Processing…' : 'Confirm payment'}</button><button disabled={busy} onClick={cancelSavedCard} className="min-h-[48px] rounded-xl border border-zinc-300 px-4 py-3 font-bold text-zinc-700 disabled:opacity-50">Change payment method</button></div>
                </> : <StatePanel icon={<CreditCard />} title="Saved-card confirmation is pending" copy={payment?.isGuestSession ? 'No payment has been submitted yet. Open your payment link in the same browser session without signing into another account to confirm or cancel.' : 'No payment has been submitted yet. Sign in as the verified request owner to confirm or cancel this saved-card selection.'} />}
              </section>
            ) : inProgress ? (
              <section className="app-surface p-6 sm:p-8"><StatePanel icon={<Loader2 className="animate-spin" />} title="Payment is being verified" copy="Uncedo is checking the payment with Paystack. Please do not start another payment while this check is in progress." /><button onClick={() => refresh()} className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-bold text-zinc-700"><RefreshCw size={15} /> Check again</button></section>
            ) : cashWaiting && allowsCash ? (
              <section className="app-surface p-6 sm:p-8">
                <StatePanel icon={<Banknote />} title={payment.paymentStatus === 'awaiting_cash_confirmation' ? 'Waiting for helper confirmation' : 'Pay the assigned helper in cash'} copy={payment.paymentStatus === 'awaiting_cash_confirmation' ? 'Your report has been sent. The helper must confirm that they received the cash payment.' : 'Pay the assigned helper in cash. Uncedo will mark the request paid only after the assigned helper confirms receipt.'} />
                {payment.paymentStatus === 'cash_selected' && activeAttemptId ? <button disabled={busy} onClick={reportCashPaid} className="mt-5 min-h-[48px] w-full rounded-xl bg-emerald-700 px-5 py-3.5 font-extrabold text-white hover:bg-emerald-800 disabled:opacity-50">{busy ? 'Sending…' : 'I have paid the helper'}</button> : null}
                {payment.paymentStatus === 'cash_selected' && activeAttemptId ? <button disabled={busy} onClick={changeFromCash} className="mt-3 min-h-[48px] w-full rounded-xl border border-zinc-300 px-5 py-3 text-sm font-bold text-zinc-700 disabled:opacity-50">Change payment method</button> : null}
                <button onClick={() => refresh()} className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-bold text-zinc-700"><RefreshCw size={15} /> Refresh status</button>
              </section>
            ) : (
              <div className="grid gap-5">
                {allowsCash ? (
                  <section className="app-surface p-5 sm:p-6">
                    <div className="flex items-center gap-3"><span className="rounded-xl bg-emerald-100 p-2.5 text-emerald-800"><Banknote size={21} /></span><div><h2 className="font-extrabold text-zinc-950">Pay with Cash</h2><p className="mt-0.5 text-xs text-zinc-500">Pay the assigned helper in cash.</p></div></div>
                    <button disabled={busy} onClick={selectCash} className="mt-5 min-h-[48px] w-full rounded-xl border border-emerald-700 px-5 py-3 font-extrabold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">Pay with Cash</button>
                  </section>
                ) : null}

                {allowsCard ? (
                  <section className="app-surface p-5 sm:p-6">
                    <div className="flex items-center gap-3"><span className="rounded-xl bg-blue-100 p-2.5 text-blue-800"><CreditCard size={21} /></span><div><h2 className="font-extrabold text-zinc-950">Pay by new card</h2><p className="mt-0.5 text-xs text-zinc-500">Your card details are collected on Paystack’s secure hosted checkout.</p></div></div>
                    <form onSubmit={startCardCheckout} className="mt-5 space-y-4">
                      <label className="block text-sm font-semibold text-zinc-700">Email for the Paystack receipt<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 min-h-[48px] w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15" /></label>
                      {canSaveCard ? (
                        <label className="flex min-h-[48px] cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm leading-5 text-zinc-700">
                          <input
                            type="checkbox"
                            checked={saveCardConsent}
                            onChange={(event) => setSaveCardConsent(event.target.checked)}
                            className="mt-1 h-5 w-5 accent-emerald-700"
                          />
                          <span>
                            <strong>Save this card for future payments?</strong>
                            <span className="block text-xs text-zinc-500">
                              Keep checked to save this card via Paystack for faster future payments and cancellation fees (works for guest bookings too). Uncheck to pay once without saving.
                            </span>
                          </span>
                        </label>
                      ) : (
                        <p className="rounded-xl bg-zinc-50 p-3 text-xs leading-5 text-zinc-500">
                          You are signed into a different account from this booking, so this card will not be saved. You can still complete a one-time payment below.
                        </p>
                      )}
                      <button disabled={busy || !email.trim()} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 font-extrabold text-white hover:bg-blue-800 disabled:opacity-50">{busy ? <Loader2 size={17} className="animate-spin" /> : <LockKeyhole size={17} />}{busy ? 'Preparing secure checkout…' : `Continue to Paystack · ${formatMoney(payment.amount, payment.currency)}`}</button>
                    </form>
                  </section>
                ) : null}

                {cards.length ? (
                  <section className="app-surface p-5 sm:p-6">
                    <div className="flex items-center gap-3"><span className="rounded-xl bg-violet-100 p-2.5 text-violet-800"><CreditCard size={21} /></span><div><h2 className="font-extrabold text-zinc-950">Saved card</h2><p className="mt-0.5 text-xs text-zinc-500">A charge happens only after you review and confirm it.</p></div></div>
                    {!savedCardAttempt ? <div className="mt-4 space-y-2">{cards.map((card) => <button key={card.id} disabled={busy} onClick={() => prepareSavedCard(card.id)} className={`flex min-h-[48px] w-full items-center justify-between rounded-xl border p-3 text-left ${savedCardId === card.id ? 'border-violet-400 bg-violet-50' : 'border-zinc-200 hover:bg-zinc-50'}`}><span className="text-sm font-bold text-zinc-800">{card.brand} •••• {card.last4}</span><span className="text-xs font-extrabold text-violet-800">Select</span></button>)}</div> : <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4"><p className="text-sm font-bold text-zinc-900">Confirm {formatMoney(savedCardAttempt.amount, payment.currency)} on {savedCardAttempt.card?.brand || 'card'} •••• {savedCardAttempt.card?.last4}</p><p className="mt-1 text-xs leading-5 text-zinc-600">This authorises one payment for request {request.requestReference}. The charge will be verified by Paystack before Uncedo marks it paid.</p><div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={confirmSavedCard} className="min-h-[44px] rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-50">{busy ? 'Processing…' : 'Confirm payment'}</button><button disabled={busy} onClick={cancelSavedCard} className="min-h-[44px] rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-bold text-zinc-700">Cancel</button></div></div>}
                  </section>
                ) : null}
              </div>
            )}

            {paymentFailed && !paid ? (
              <Notice tone="error">
                {payment?.paymentStatus === 'wallet_debt_recorded'
                  ? (allowsCash
                    ? 'This amount has been deducted from your wallet. Please pay using a new card or Cash above to clear the balance.'
                    : 'This amount has been deducted from your wallet. Please pay using a card above to clear the balance.')
                  : (allowsCash
                    ? 'Your previous payment attempt did not succeed. You can try Cash or a new card above.'
                    : 'Your previous payment attempt did not succeed. Please pay using a card above.')}
              </Notice>
            ) : null}

            {(payment.canRateHelper || payment.hasCustomerRating) && payment.helperName !== undefined ? (
              <section className="app-surface p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Service feedback</p>
                    <h2 className="mt-1 text-lg font-extrabold text-zinc-950">
                      Rate {payment.helperName || 'your helper'}
                    </h2>
                    <p className="mt-1 text-xs text-zinc-500">
                      {payment.hasCustomerRating
                        ? 'Your rating has been saved.'
                        : payment?.isCancellationFee
                          ? 'Because your helper had arrived or started work before cancellation, you can still rate your experience.'
                          : paid
                            ? 'Your payment is complete. Let us know how the service went.'
                            : 'Even though the payment did not complete, you can still rate your helper experience.'}
                    </p>
                  </div>
                </div>
                {ratingError ? <div className="mt-4"><Notice tone="error">{ratingError}</Notice></div> : null}
                {ratingNotice ? <div className="mt-4"><Notice tone="info">{ratingNotice}</Notice></div> : null}
                {payment.hasCustomerRating ? (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                    <div className="flex items-center gap-1.5 font-extrabold">
                      <span>You rated {payment.helperName || 'your helper'} {payment.customerRating?.score || ratingScore}/5</span>
                    </div>
                    {payment.customerRating?.comment ? (
                      <p className="mt-1 text-xs text-emerald-900">“{payment.customerRating.comment}”</p>
                    ) : null}
                  </div>
                ) : payment.canRateHelper ? (
                  <form onSubmit={submitHelperRating} className="mt-4 space-y-4">
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRatingScore(star)}
                          aria-label={`Rate ${star} stars`}
                          className="rounded-lg p-1.5 hover:bg-zinc-100"
                        >
                          <Star
                            size={24}
                            className={star <= ratingScore ? 'fill-amber-400 text-amber-500' : 'text-zinc-300'}
                          />
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={ratingComment}
                      onChange={(event) => setRatingComment(event.target.value)}
                      placeholder="Optional comment about your service experience…"
                      className="min-h-[44px] w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                    />
                    <button
                      type="submit"
                      disabled={ratingBusy}
                      className="min-h-[48px] w-full rounded-xl bg-emerald-700 px-5 py-3 text-sm font-extrabold text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      {ratingBusy ? 'Submitting rating…' : 'Submit rating'}
                    </button>
                  </form>
                ) : null}
              </section>
            ) : null}
          </div>
        )}
      </main>
      <footer className="mx-auto mt-10 max-w-2xl text-center text-xs leading-5 text-zinc-500">Uncedo never asks for your card number or CVV in chat. Card details are entered on Paystack’s secure page. If a payment is uncertain, we verify it before permitting another charge.</footer>
    </PaymentShell>
  );
}

function PaymentShell({ children }) {
  return <div className="min-h-screen bg-[radial-gradient(circle_at_12%_8%,rgba(16,185,129,.11),transparent_35%),linear-gradient(180deg,#f8fafc_0%,#fff_55%,#f8fafc_100%)] px-4 py-6 sm:px-6">{children}</div>;
}

function Notice({ tone, children }) {
  const style = tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-sky-200 bg-sky-50 text-sky-900';
  return <div role="status" className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${style}`}>{children}</div>;
}

function StatePanel({ icon, title, copy }) {
  return <div className="text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">{icon}</span><h2 className="mt-4 text-lg font-black text-zinc-950">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-600">{copy}</p></div>;
}
