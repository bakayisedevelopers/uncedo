import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Banknote, CheckCircle2, CreditCard, Loader2, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { requestPaymentFunction } from '../services/paymentService';

const TOKEN_STORAGE_KEY = 'uncedo:payment-session';

function formatMoney(amount, currency = 'ZAR') {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 'Amount unavailable';
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency }).format(value);
}

function makeIdempotencyKey() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function PaymentPage() {
  const { user, initializing } = useAuth();
  const [token, setToken] = useState('');
  const [payment, setPayment] = useState(null);
  const [email, setEmail] = useState('');
  const [saveCardConsent, setSaveCardConsent] = useState(false);
  const [savedCardId, setSavedCardId] = useState('');
  const [savedCardAttempt, setSavedCardAttempt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);

  const request = payment || {};
  const activeAttemptId = String(payment?.activeAttemptId || '');
  const ownerCanSave = Boolean(user?.firebaseUser?.uid && payment?.canSaveCard);
  const cards = useMemo(() => Array.isArray(payment?.savedCards) ? payment.savedCards : [], [payment]);
  const pendingSavedCard = savedCardAttempt || payment?.pendingSavedCardPayment || null;

  const refresh = useCallback(async (sessionToken = token) => {
    if (!sessionToken) return;
    const result = await requestPaymentFunction('getServicePaymentSession', { token: sessionToken }, { authenticated: Boolean(user) });
    setPayment(result);
    setSavedCardAttempt(result.pendingSavedCardPayment || null);
    setSavedCardId(result.pendingSavedCardPayment?.card?.id || '');
    setExpired(false);
  }, [token, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incomingToken = params.get('token') || sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
    const reference = params.get('reference') || params.get('trxref') || '';
    if (incomingToken) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, incomingToken);
      setToken(incomingToken);
    }
    // The opaque capability is removed from the address bar before making requests or loading other routes.
    if (window.location.search) window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
    if (reference) sessionStorage.setItem('uncedo:payment-return-reference', reference);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = async () => {
      setError('');
      try {
        const result = await requestPaymentFunction('getServicePaymentSession', { token }, { authenticated: Boolean(user) });
        if (cancelled) return;
        setPayment(result);
        setSavedCardAttempt(result.pendingSavedCardPayment || null);
        setSavedCardId(result.pendingSavedCardPayment?.card?.id || '');
        setExpired(false);
        const storedReference = sessionStorage.getItem('uncedo:payment-return-reference');
        if (storedReference && result.paymentStatus !== 'paid') {
          sessionStorage.removeItem('uncedo:payment-return-reference');
          const verified = await requestPaymentFunction('verifyServicePaystackCheckout', { token, reference: storedReference });
          if (!cancelled) {
            setMessage(verified.status === 'paid' ? 'Your payment has been verified.' : 'Paystack is still confirming this payment. Refresh this page shortly.');
            await refresh(token);
          }
        }
      } catch (loadError) {
        if (cancelled) return;
        if (loadError.code === 'expired' || loadError.code === 'http-410') setExpired(true);
        else setError(loadError.message || 'This payment link could not be loaded.');
      }
    };
    load();
    return () => { cancelled = true; };
  }, [token, user, refresh]);

  useEffect(() => {
    if (!payment || payment.paymentStatus !== 'payment_processing') return undefined;
    const timer = window.setInterval(() => refresh().catch(() => null), 5000);
    return () => window.clearInterval(timer);
  }, [payment, refresh]);

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

  async function startCardCheckout(event) {
    event.preventDefault();
    const result = await runAction(() => requestPaymentFunction('startServicePaystackCheckout', {
      token,
      email: email.trim(),
      saveCardConsent: ownerCanSave && saveCardConsent,
      idempotencyKey: makeIdempotencyKey(),
    }, { authenticated: Boolean(user) }));
    if (result?.authorizationUrl) window.location.assign(result.authorizationUrl);
    else if (result?.status === 'payment_reconciliation_required' || result?.status === 'payment_failed') setMessage('Payment status: ' + result.status.replaceAll('_', ' ') + '. Refresh to see the latest verified status.');
  }

  async function selectCash() {
    const result = await runAction(() => requestPaymentFunction('selectCashPaymentFromSession', { token, idempotencyKey: makeIdempotencyKey() }), 'Cash / direct payment selected. Pay the assigned helper directly, then report it here.');
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
    }, { authenticated: true }));
    if (result?.attemptId) {
      setSavedCardAttempt({ ...result, card: result.card });
      setSavedCardId(cardId);
    }
  }

  async function confirmSavedCard() {
    if (!pendingSavedCard?.attemptId) return;
    const result = await runAction(() => requestPaymentFunction('confirmSavedCardServicePayment', {
      requestId: pendingSavedCard.requestId,
      attemptId: pendingSavedCard.attemptId,
      confirmed: true,
    }, { authenticated: true }));
    if (result?.status === 'paid') setSavedCardAttempt(null);
    else if (result?.status) setMessage(`Payment status: ${result.status.replaceAll('_', ' ')}. We will not retry an uncertain charge automatically.`);
  }

  async function cancelSavedCard() {
    if (!pendingSavedCard?.attemptId) return;
    const result = await runAction(() => requestPaymentFunction('cancelSavedCardPaymentConfirmation', {
      requestId: pendingSavedCard.requestId,
      attemptId: pendingSavedCard.attemptId,
    }, { authenticated: true }), 'Saved-card selection cancelled. No charge was made.');
    if (result?.success) setSavedCardAttempt(null);
  }

  const paid = payment?.paymentStatus === 'paid';
  const inProgress = ['payment_processing', 'payment_reconciliation_required', 'initializing', 'processing'].includes(String(payment?.paymentStatus || ''));
  const cashWaiting = ['cash_selected', 'awaiting_cash_confirmation'].includes(String(payment?.paymentStatus || ''));

  if (!token && !initializing) {
    return <PaymentShell><StatePanel icon={<AlertTriangle />} title="A payment link is needed" copy="Open the secure payment link sent by Uncedo or request a fresh link from your app or WhatsApp conversation." /></PaymentShell>;
  }

  return (
    <PaymentShell>
      <header className="mb-8 flex items-center justify-between gap-4">
        <Link to="/" className="text-xl font-black tracking-tight text-zinc-950">Uncedo<span className="text-emerald-600">.</span></Link>
        <div className="flex items-center gap-2 text-xs font-bold text-zinc-500"><LockKeyhole size={15} className="text-emerald-700" /> Secure payment</div>
      </header>
      <main className="mx-auto max-w-2xl">
        <div className="mb-6">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">Request payment</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl">Complete your payment</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-600">Review the final service amount and choose how you would like to pay. Uncedo confirms card payments directly with Paystack.</p>
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
                <div><p className="text-sm font-semibold text-zinc-500">Final payable amount</p><p className="mt-1 text-3xl font-black text-zinc-950">{formatMoney(payment.amount, payment.currency)}</p></div>
                <span className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${paid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{paid ? 'Paid' : String(payment.paymentStatus || 'unpaid').replaceAll('_', ' ')}</span>
              </div>
            </section>

            {paid ? (
              <section className="app-surface p-6 sm:p-8"><StatePanel icon={<CheckCircle2 />} title="Payment already completed" copy={payment.receipt?.receiptId ? `Receipt ${payment.receipt.receiptId}. Your payment was verified by Uncedo.` : 'This request is marked as paid in Uncedo’s records.'} /><button onClick={() => refresh()} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-bold text-zinc-700"><RefreshCw size={15} /> Refresh status</button></section>
            ) : payment.paymentStatus === 'awaiting_customer_confirmation' ? (
              <section className="app-surface p-6 sm:p-8">
                {pendingSavedCard && ownerCanSave ? <>
                  <StatePanel icon={<CreditCard />} title="Confirm this saved-card payment" copy={`You selected ${pendingSavedCard.card?.brand || 'card'} •••• ${pendingSavedCard.card?.last4}. Nothing is charged until you confirm the exact amount below.`} />
                  <div className="mt-5 rounded-xl bg-violet-50 p-4 text-center"><p className="text-xs font-bold uppercase tracking-wide text-violet-800">One-time payment</p><p className="mt-1 text-2xl font-black text-zinc-950">{formatMoney(pendingSavedCard.amount, payment.currency)}</p><p className="mt-1 text-xs text-zinc-600">Request {request.requestReference}</p></div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2"><button disabled={busy} onClick={confirmSavedCard} className="rounded-xl bg-violet-700 px-4 py-3 font-extrabold text-white disabled:opacity-50">{busy ? 'Processing…' : 'Confirm payment'}</button><button disabled={busy} onClick={cancelSavedCard} className="rounded-xl border border-zinc-300 px-4 py-3 font-bold text-zinc-700 disabled:opacity-50">Change payment method</button></div>
                </> : <StatePanel icon={<CreditCard />} title="Saved-card confirmation is pending" copy="No payment has been submitted yet. Sign in as the verified request owner to confirm or cancel this saved-card selection." />}
              </section>
            ) : inProgress ? (
              <section className="app-surface p-6 sm:p-8"><StatePanel icon={<Loader2 className="animate-spin" />} title="Payment is being verified" copy="Uncedo is checking the payment with Paystack. Please do not start another payment while this check is in progress." /><button onClick={() => refresh()} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-bold text-zinc-700"><RefreshCw size={15} /> Check again</button></section>
            ) : cashWaiting ? (
              <section className="app-surface p-6 sm:p-8">
                <StatePanel icon={<Banknote />} title={payment.paymentStatus === 'awaiting_cash_confirmation' ? 'Waiting for helper confirmation' : 'Pay the assigned helper directly'} copy={payment.paymentStatus === 'awaiting_cash_confirmation' ? 'Your report has been sent. The helper must confirm that they received the payment.' : 'Cash, EFT and direct bank transfer are recorded as one direct-to-helper method. Uncedo will mark the request paid only after the assigned helper confirms receipt.'} />
                {payment.paymentStatus === 'cash_selected' && activeAttemptId ? <button disabled={busy} onClick={reportCashPaid} className="mt-5 w-full rounded-xl bg-emerald-700 px-5 py-3.5 font-extrabold text-white hover:bg-emerald-800 disabled:opacity-50">{busy ? 'Sending…' : 'I have paid the helper'}</button> : null}
                {payment.paymentStatus === 'cash_selected' && activeAttemptId ? <button disabled={busy} onClick={changeFromCash} className="mt-3 w-full rounded-xl border border-zinc-300 px-5 py-3 text-sm font-bold text-zinc-700 disabled:opacity-50">Change payment method</button> : null}
                <button onClick={() => refresh()} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-bold text-zinc-700"><RefreshCw size={15} /> Refresh status</button>
              </section>
            ) : (
              <div className="grid gap-5">
                <section className="app-surface p-5 sm:p-6">
                  <div className="flex items-center gap-3"><span className="rounded-xl bg-emerald-100 p-2.5 text-emerald-800"><Banknote size={21} /></span><div><h2 className="font-extrabold text-zinc-950">Cash or direct payment</h2><p className="mt-0.5 text-xs text-zinc-500">Pay the assigned helper in person or by bank transfer.</p></div></div>
                  <button disabled={busy} onClick={selectCash} className="mt-5 w-full rounded-xl border border-emerald-700 px-5 py-3 font-extrabold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">Choose cash / direct payment</button>
                </section>

                <section className="app-surface p-5 sm:p-6">
                  <div className="flex items-center gap-3"><span className="rounded-xl bg-blue-100 p-2.5 text-blue-800"><CreditCard size={21} /></span><div><h2 className="font-extrabold text-zinc-950">Pay by new card</h2><p className="mt-0.5 text-xs text-zinc-500">Your card details are collected on Paystack’s secure hosted checkout.</p></div></div>
                  <form onSubmit={startCardCheckout} className="mt-5 space-y-4">
                    <label className="block text-sm font-semibold text-zinc-700">Email for the Paystack receipt<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15" /></label>
                    {ownerCanSave ? <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm leading-5 text-zinc-700"><input type="checkbox" checked={saveCardConsent} onChange={(event) => setSaveCardConsent(event.target.checked)} className="mt-1 accent-emerald-700" /><span><strong>Save this card for future payments</strong><span className="block text-xs text-zinc-500">The card is stored by Paystack. Uncedo stores only a reusable authorisation and masked card details.</span></span></label> : <p className="rounded-xl bg-zinc-50 p-3 text-xs leading-5 text-zinc-500">Saving a card is available only when you are signed in as the verified request owner. This one-time payment can still be completed below.</p>}
                    <button disabled={busy || !email.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 font-extrabold text-white hover:bg-blue-800 disabled:opacity-50">{busy ? <Loader2 size={17} className="animate-spin" /> : <LockKeyhole size={17} />}{busy ? 'Preparing secure checkout…' : `Continue to Paystack · ${formatMoney(payment.amount, payment.currency)}`}</button>
                  </form>
                </section>

                {cards.length ? (
                  <section className="app-surface p-5 sm:p-6">
                    <div className="flex items-center gap-3"><span className="rounded-xl bg-violet-100 p-2.5 text-violet-800"><CreditCard size={21} /></span><div><h2 className="font-extrabold text-zinc-950">Saved card</h2><p className="mt-0.5 text-xs text-zinc-500">A charge happens only after you review and confirm it.</p></div></div>
                    {!savedCardAttempt ? <div className="mt-4 space-y-2">{cards.map((card) => <button key={card.id} disabled={busy} onClick={() => prepareSavedCard(card.id)} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left ${savedCardId === card.id ? 'border-violet-400 bg-violet-50' : 'border-zinc-200 hover:bg-zinc-50'}`}><span className="text-sm font-bold text-zinc-800">{card.brand} •••• {card.last4}</span><span className="text-xs font-extrabold text-violet-800">Select</span></button>)}</div> : <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4"><p className="text-sm font-bold text-zinc-900">Confirm {formatMoney(savedCardAttempt.amount, payment.currency)} on {savedCardAttempt.card?.brand || 'card'} •••• {savedCardAttempt.card?.last4}</p><p className="mt-1 text-xs leading-5 text-zinc-600">This authorises one payment for request {request.requestReference}. The charge will be verified by Paystack before Uncedo marks it paid.</p><div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={confirmSavedCard} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-50">{busy ? 'Processing…' : 'Confirm payment'}</button><button disabled={busy} onClick={() => setSavedCardAttempt(null)} className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-bold text-zinc-700">Cancel</button></div></div>}
                  </section>
                ) : null}
              </div>
            )}
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
