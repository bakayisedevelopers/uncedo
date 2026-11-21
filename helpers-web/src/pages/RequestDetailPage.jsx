import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Banknote,
  Camera,
  CheckCircle2,
  Clock,
  CreditCard,
  KeyRound,
  MapPin,
  MessageSquare,
  Navigation,
  Send,
  ShoppingBag,
  Star,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { BottomNav } from '../components/BottomNav';
import { useHelperSession } from '../context/HelperSessionContext';
import {
  finalizeServiceRequestBillingApi,
  normalizeTimestampMs,
  resolveHelperPayoutAmount,
  resolveRequestCustomerTotal,
  respondToCashServicePaymentApi,
  sendHelperRequestMessage,
  submitServiceRequestRatingApi,
  subscribeToActiveServiceRequest,
  subscribeToRequestMessages,
  subscribeToServicePaymentOperation,
  updateHelperServiceRequestApi,
  uploadCompletionProofPhotos,
} from '../services/helperDataService';

const ACTIVE_TRIP_STATUSES = new Set([
  'accepted',
  'en_route',
  'driving',
  'buying_resources',
  'arrived',
  'work_started',
]);

function formatElapsedWait(ms = 0) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatPaymentStatusLabel(paymentStatus = '') {
  const normalized = String(paymentStatus || 'unpaid').toLowerCase();
  const labels = {
    paid: 'Paid & Settled',
    cash_selected: 'Cash Selected',
    awaiting_cash_confirmation: 'Awaiting Your Cash Confirmation',
    payment_processing: 'Card Payment Processing',
    awaiting_customer_confirmation: 'Awaiting Customer Card Confirmation',
    payment_failed: 'Payment Failed',
    payment_reconciliation_required: 'Payment Verifying',
    wallet_debt_recorded: 'Outstanding Balance',
    unpaid: 'Awaiting Customer Payment',
  };
  return labels[normalized] || normalized.replace(/_/g, ' ');
}

export function RequestDetailPage({ requestId, onNavigate }) {
  const session = useHelperSession();
  const [request, setRequest] = useState(null);
  const [paymentOperation, setPaymentOperation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [arrivalPin, setArrivalPin] = useState('');
  const [proofFiles, setProofFiles] = useState([]);
  const [ratingScore, setRatingScore] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingSuccess, setRatingSuccess] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionNotice, setActionNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const chatScrollRef = useRef(null);
  const proofInputRef = useRef(null);

  useEffect(() => {
    if (!requestId) return undefined;
    const unsubReq = subscribeToActiveServiceRequest(requestId, (req) => {
      setRequest(req);
      setLoading(false);
    });
    const unsubPayment = subscribeToServicePaymentOperation(requestId, setPaymentOperation);
    const unsubMsgs = subscribeToRequestMessages(requestId, setMessages);
    return () => {
      unsubReq?.();
      unsubPayment?.();
      unsubMsgs?.();
    };
  }, [requestId]);

  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const status = String(request?.status || '').toLowerCase();
  const arrivedAtMs = normalizeTimestampMs(request?.arrivedAt || request?.helperAssignment?.arrivedAt);

  useEffect(() => {
    if (status !== 'arrived' || !arrivedAtMs) return undefined;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [status, arrivedAtMs]);

  const waitTimerInfo = useMemo(() => {
    if (status !== 'arrived' || !arrivedAtMs) return null;
    const elapsedMs = Math.max(0, nowMs - arrivedAtMs);
    const graceMs = 2 * 60 * 1000;
    const extraMinutes = elapsedMs > graceMs ? Math.ceil((elapsedMs - graceMs) / 60000) : 0;
    return {
      elapsedMs,
      graceRemainingMs: Math.max(0, graceMs - elapsedMs),
      isOverGrace: elapsedMs > graceMs,
      extraMinutes,
      waitFeeRand: extraMinutes * 1,
    };
  }, [status, arrivedAtMs, nowMs]);

  const handleStatusTransition = async (nextStatus, pinOverride = undefined) => {
    setActionBusy(true);
    setActionError('');
    setActionNotice('');
    try {
      await updateHelperServiceRequestApi({
        requestId,
        action: 'transition',
        status: nextStatus,
        ...(pinOverride !== undefined ? { arrivalPin: pinOverride } : {}),
      });
      if (nextStatus === 'arrived') {
        setArrivalPin('');
        setActionNotice('Arrival marked. A 6-digit PIN has been sent to the customer via WhatsApp.');
      } else if (nextStatus === 'work_started') {
        setArrivalPin('');
        setActionNotice('Arrival PIN verified — job is now in progress.');
      }
    } catch (err) {
      setActionError(err?.message || 'Unable to update job status.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleVerifyPinAndStart = async (event) => {
    event?.preventDefault();
    const cleanPin = arrivalPin.replace(/\D+/g, '').slice(0, 6);
    if (cleanPin.length !== 6) {
      setActionError('Enter the customer’s 6-digit numbers-only arrival PIN to start the job.');
      return;
    }
    await handleStatusTransition('work_started', cleanPin);
  };

  const handleCompleteJob = async () => {
    setActionBusy(true);
    setActionError('');
    setActionNotice('');
    try {
      const helperUid = session?.user?.uid || session?.profile?.uid || request?.helperAssignment?.helperId || '';
      if (proofFiles.length > 0 && helperUid) {
        await uploadCompletionProofPhotos({
          helperId: helperUid,
          requestId,
          files: proofFiles.map((item) => item.file),
        });
      }
      await finalizeServiceRequestBillingApi({ requestId });
      proofFiles.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      setProofFiles([]);
      setActionNotice('Job completed! The customer has been notified on WhatsApp to pay with Cash or Card.');
    } catch (err) {
      setActionError(err?.message || 'Unable to complete service job right now.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCashConfirmation = async (action) => {
    const attemptId = String(paymentOperation?.activeAttemptId || '').trim();
    if (!attemptId) {
      setActionError('No active cash payment attempt is awaiting confirmation yet.');
      return;
    }
    setActionBusy(true);
    setActionError('');
    setActionNotice('');
    try {
      await respondToCashServicePaymentApi({ requestId, attemptId, action });
      setActionNotice(
        action === 'confirm'
          ? 'Cash payment confirmed and job settled.'
          : 'Marked as not received. The customer has been asked to choose another payment method.',
      );
    } catch (err) {
      setActionError(err?.message || 'Unable to update cash payment status.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSubmitRating = async (event) => {
    event.preventDefault();
    setActionBusy(true);
    setActionError('');
    try {
      await submitServiceRequestRatingApi({
        requestId,
        score: ratingScore,
        comment: ratingComment,
      });
      setRatingSuccess(true);
      setActionNotice('Customer rating submitted. Thank you!');
    } catch (err) {
      setActionError(err?.message || 'Unable to submit customer rating.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleProofFileSelect = (event) => {
    const selected = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
    if (!selected.length) return;
    setProofFiles((prev) => [
      ...prev,
      ...selected.slice(0, Math.max(0, 4 - prev.length)).map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
    event.target.value = '';
  };

  const handleRemoveProofFile = (id) => {
    setProofFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const openCancelModal = () => {
    setCancelError('');
    setCancelModalOpen(true);
  };

  const closeCancelModal = () => {
    setCancelError('');
    setCancelModalOpen(false);
  };

  const handleConfirmCancel = async (event) => {
    event.preventDefault();
    const reason = cancelReason.trim();
    if (reason.length < 3) {
      setCancelError('Please enter at least 3 characters explaining why you are cancelling this job.');
      return;
    }
    setActionBusy(true);
    setCancelError('');
    setActionError('');
    try {
      await updateHelperServiceRequestApi({
        requestId,
        action: 'cancel',
        reason,
      });
      setCancelReason('');
      setCancelModalOpen(false);
      onNavigate('/jobs');
    } catch (err) {
      setCancelError(err?.message || 'Unable to cancel job.');
    } finally {
      setActionBusy(false);
    }
  };

  const sendMessageText = async (text) => {
    const clean = String(text || '').trim();
    if (!clean) return;
    setActionError('');
    try {
      await sendHelperRequestMessage({ requestId, text: clean });
    } catch (err) {
      setActionError(err?.message || 'Unable to send message.');
    }
  };

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    await sendMessageText(text);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <p className="text-sm text-ink-500">Loading service request workspace…</p>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-6 space-y-4">
        <h2 className="font-display text-lg font-bold text-ink-900">Request not found</h2>
        <button
          type="button"
          onClick={() => onNavigate('/jobs')}
          className="px-6 py-3 bg-tealbrand-600 text-white rounded-lg text-xs font-semibold"
        >
          Back to Jobs
        </button>
      </div>
    );
  }

  const address = request.requestPayload?.serviceAddress
    || request.requestPayload?.address
    || request.serviceAddress
    || 'Customer location specified';
  const lat = request.location?.latitude || request.requestPayload?.location?.latitude;
  const lon = request.location?.longitude || request.requestPayload?.location?.longitude;
  const mapsUrl =
    lat && lon
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  const totalAmount = resolveRequestCustomerTotal(request);
  const helperPayoutAmount = resolveHelperPayoutAmount(request);
  const waitingCost = Number(request.waitingCost ?? request.pricingSnapshot?.waitingCost ?? 0);
  const paymentStatus = String(
    paymentOperation?.status || request.paymentStatus || 'unpaid',
  ).toLowerCase();
  const paymentMethod = String(paymentOperation?.method || '').toLowerCase();
  const isCashAwaitingConfirmation = status === 'completed' && paymentStatus === 'awaiting_cash_confirmation';
  const alreadyRated = Boolean(request.helperRatedCustomer || request.ratings?.helper || ratingSuccess);

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-canvas text-ink-900 pb-24 md:pb-10">
      <header className="sticky top-0 z-30 w-full max-w-full bg-surface/95 backdrop-blur-md border-b border-border px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onNavigate('/jobs')}
            aria-label="Back to Jobs"
            className="h-10 w-10 rounded-lg border border-border bg-surface hover:bg-well text-ink-700 flex items-center justify-center shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-sm sm:text-base font-bold tracking-tight truncate">
              {request.serviceSummary || request.subject || 'Service Job'}
            </h1>
            <p className="text-xs text-ink-500 truncate">
              Status:{' '}
              <span className="font-semibold uppercase text-tealbrand-700">
                {status.replace(/_/g, ' ')}
              </span>
            </p>
          </div>
        </div>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3.5 sm:px-4 py-2 bg-tealbrand-600 hover:bg-tealbrand-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 min-h-[40px]"
        >
          <Navigation className="w-3.5 h-3.5 shrink-0" />
          <span>Directions</span>
        </a>
      </header>

      <main className="w-full max-w-6xl min-w-0 mx-auto px-4 md:px-6 py-6 sm:py-8 space-y-6">
        {actionError && (
          <div className="w-full min-w-0 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError('')}
              className="text-xs font-semibold underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {actionNotice && (
          <div className="w-full min-w-0 rounded-lg border border-tealbrand-200 bg-tealbrand-50 px-4 py-3 text-sm text-tealbrand-900 flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{actionNotice}</span>
            <button
              type="button"
              onClick={() => setActionNotice('')}
              className="text-xs font-semibold underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start w-full min-w-0">
          {/* Job Details, Trip Controls & Settlement */}
          <div className="min-w-0 w-full space-y-6">
            <div className="min-w-0 w-full bg-surface rounded-xl border border-border p-5 sm:p-6 space-y-4 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">
                  Job Scope &amp; Address
                </div>
                {request.customerName && (
                  <span className="text-xs font-semibold text-ink-700 [overflow-wrap:anywhere]">
                    Customer: {request.customerName}
                  </span>
                )}
              </div>
              <div className="space-y-1.5 min-w-0">
                <h2 className="font-display text-lg font-bold text-ink-900 [overflow-wrap:anywhere]">
                  {request.subject || request.serviceSummary || 'Service Session'}
                </h2>
                <p className="text-sm text-ink-600 flex items-start gap-1.5 min-w-0">
                  <MapPin className="h-4 w-4 text-tealbrand-700 mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{address}</span>
                </p>
              </div>
              <div className="pt-4 border-t border-border space-y-1.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-ink-500">Your Helper Payout</span>
                  <span className="tabular-nums-mono font-bold text-lg text-tealbrand-700 shrink-0">
                    R{helperPayoutAmount.toFixed(2)}
                  </span>
                </div>
                {totalAmount > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-ink-400">Customer Confirmed Total</span>
                    <span className="tabular-nums-mono font-semibold text-ink-600 shrink-0">
                      R{Math.round(totalAmount)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Active Trip Progression */}
            {status !== 'completed' && (
              <div className="min-w-0 w-full bg-surface rounded-xl border border-border p-5 sm:p-6 space-y-4 overflow-hidden">
                <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">
                  Trip Progression
                </h2>

                {status === 'arrived' && waitTimerInfo && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3.5 flex flex-wrap items-center justify-between gap-3 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-amber-900 min-w-0 flex-1">
                      <Clock className="h-4 w-4 text-amber-700 shrink-0" />
                      <span className="min-w-0 break-words">
                        {waitTimerInfo.isOverGrace
                          ? `Waiting fee active (+R${waitTimerInfo.waitFeeRand.toFixed(2)} at R1/min)`
                          : 'Free 2-minute customer meet window'}
                      </span>
                    </div>
                    <span className="tabular-nums-mono text-sm font-bold text-amber-900 shrink-0">
                      {waitTimerInfo.isOverGrace
                        ? formatElapsedWait(waitTimerInfo.elapsedMs)
                        : formatElapsedWait(waitTimerInfo.graceRemainingMs)}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 min-w-0">
                  {status === 'accepted' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStatusTransition('driving')}
                        disabled={actionBusy}
                        className="w-full py-3 px-4 bg-tealbrand-600 hover:bg-tealbrand-700 text-white font-semibold rounded-lg text-xs min-h-[44px] disabled:opacity-50"
                      >
                        Start Driving (On the Way)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusTransition('buying_resources')}
                        disabled={actionBusy}
                        className="w-full py-3 px-4 border border-tealbrand-600 bg-tealbrand-50 hover:bg-tealbrand-100 text-tealbrand-800 font-semibold rounded-lg text-xs min-h-[44px] inline-flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <ShoppingBag className="h-4 w-4 shrink-0" />
                        <span>Buying Resources First</span>
                      </button>
                    </>
                  )}

                  {['driving', 'en_route'].includes(status) && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStatusTransition('arrived')}
                        disabled={actionBusy}
                        className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-xs min-h-[44px] disabled:opacity-50"
                      >
                        Mark Arrived at Customer Location
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusTransition('buying_resources')}
                        disabled={actionBusy}
                        className="w-full py-3 px-4 border border-border bg-well hover:bg-border/60 text-ink-800 font-semibold rounded-lg text-xs min-h-[44px] inline-flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <ShoppingBag className="h-4 w-4 shrink-0" />
                        <span>Buying Resources</span>
                      </button>
                    </>
                  )}

                  {status === 'buying_resources' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStatusTransition('driving')}
                        disabled={actionBusy}
                        className="w-full py-3 px-4 bg-tealbrand-600 hover:bg-tealbrand-700 text-white font-semibold rounded-lg text-xs min-h-[44px] disabled:opacity-50"
                      >
                        Resume Driving to Customer
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusTransition('arrived')}
                        disabled={actionBusy}
                        className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-xs min-h-[44px] disabled:opacity-50"
                      >
                        Mark Arrived at Customer Location
                      </button>
                    </>
                  )}

                  {status === 'arrived' && (
                    <form
                      onSubmit={handleVerifyPinAndStart}
                      className="min-w-0 w-full rounded-xl border border-tealbrand-200 bg-tealbrand-50/50 p-4 space-y-3"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <KeyRound className="h-4 w-4 text-tealbrand-700 mt-0.5 shrink-0" />
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div className="text-xs font-bold text-ink-900">
                            Confirm Arrival with 6-Digit Customer PIN
                          </div>
                          <p className="text-xs text-ink-600 break-words">
                            Ask the customer for the 6-digit PIN sent to their WhatsApp to verify you found each other and start the job.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 min-w-0 w-full">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          value={arrivalPin}
                          onChange={(e) => setArrivalPin(e.target.value.replace(/\D+/g, '').slice(0, 6))}
                          placeholder="000000"
                          aria-label="6-digit customer arrival PIN"
                          className="w-full sm:flex-1 min-w-0 px-3.5 py-2.5 rounded-lg border border-border bg-white text-center font-mono text-base font-bold tracking-[0.28em] sm:tracking-[0.35em] text-ink-900 focus:outline-none focus:border-tealbrand-700 min-h-[44px]"
                        />
                        <button
                          type="submit"
                          disabled={actionBusy || arrivalPin.length !== 6}
                          className="w-full sm:w-auto px-4 py-2.5 bg-tealbrand-700 hover:bg-tealbrand-800 text-white font-semibold rounded-lg text-xs min-h-[44px] disabled:opacity-50 shrink-0"
                        >
                          {actionBusy ? 'Verifying…' : 'Verify & Start Job'}
                        </button>
                      </div>
                    </form>
                  )}

                  {status === 'work_started' && (
                    <div className="space-y-3 min-w-0">
                      <div className="rounded-lg border border-dashed border-border bg-well/40 p-3.5 space-y-2.5 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                          <span className="text-xs font-semibold text-ink-700">
                            Completion Proof Photos (Optional)
                          </span>
                          <button
                            type="button"
                            onClick={() => proofInputRef.current?.click()}
                            disabled={actionBusy || proofFiles.length >= 4}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-well text-xs font-semibold text-ink-800 disabled:opacity-50 shrink-0"
                          >
                            <Camera className="h-3.5 w-3.5 text-tealbrand-700" />
                            <span>Add Photo</span>
                          </button>
                          <input
                            ref={proofInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleProofFileSelect}
                            className="hidden"
                          />
                        </div>
                        {proofFiles.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {proofFiles.map((item) => (
                              <div key={item.id} className="relative h-16 w-16 rounded-lg overflow-hidden border border-border">
                                <img
                                  src={item.previewUrl}
                                  alt="Completion proof"
                                  className="h-full w-full object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveProofFile(item.id)}
                                  aria-label="Remove proof photo"
                                  className="absolute top-1 right-1 h-5 w-5 rounded-full bg-forest-950/75 text-white flex items-center justify-center"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleCompleteJob}
                        disabled={actionBusy}
                        className="w-full py-3 px-4 bg-tealbrand-700 hover:bg-tealbrand-800 text-white font-semibold rounded-lg text-xs min-h-[44px] disabled:opacity-50"
                      >
                        {actionBusy ? 'Finalizing Billing…' : 'Complete Job & Request Payment'}
                      </button>
                    </div>
                  )}

                  {!ACTIVE_TRIP_STATUSES.has(status) && (
                    <p className="text-xs text-ink-500">
                      No active trip actions remain for status &ldquo;{status.replace(/_/g, ' ')}&rdquo;.
                    </p>
                  )}
                </div>

                {ACTIVE_TRIP_STATUSES.has(status) && (
                  <button
                    type="button"
                    onClick={openCancelModal}
                    disabled={actionBusy}
                    className="w-full py-2.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors min-h-[40px]"
                  >
                    Cancel Service Session
                  </button>
                )}
              </div>
            )}

            {/* Post-Job Payment Settlement & Cash Confirmation */}
            {status === 'completed' && (
              <div className="min-w-0 w-full bg-surface rounded-xl border border-border p-5 sm:p-6 space-y-4 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">
                    Payment &amp; Settlement
                  </h2>
                  <span
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold max-w-full break-words ${
                      paymentStatus === 'paid'
                        ? 'bg-emerald-50 text-emerald-700'
                        : isCashAwaitingConfirmation
                          ? 'bg-amber-50 text-amber-800'
                          : paymentStatus === 'payment_failed'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-well text-ink-700'
                    }`}
                  >
                    {formatPaymentStatusLabel(paymentStatus)}
                  </span>
                </div>

                <div className="rounded-lg border border-border bg-well/40 p-4 space-y-2 text-xs min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink-500">Customer Total</span>
                    <span className="tabular-nums-mono font-bold text-ink-900 shrink-0">
                      R{Math.round(totalAmount)}
                    </span>
                  </div>
                  {waitingCost > 0 && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-ink-500">Waiting Fee Included</span>
                      <span className="tabular-nums-mono font-semibold text-ink-900 shrink-0">
                        R{waitingCost.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                    <span className="text-ink-600 font-semibold">Your Helper Payout</span>
                    <span className="tabular-nums-mono font-bold text-sm text-tealbrand-700 shrink-0">
                      R{helperPayoutAmount.toFixed(2)}
                    </span>
                  </div>
                </div>

                {paymentStatus === 'unpaid' && (
                  <div className="rounded-lg border border-border bg-tealbrand-50/40 p-3.5 flex items-start gap-2.5 text-xs text-ink-700 min-w-0">
                    <CreditCard className="h-4 w-4 text-tealbrand-700 mt-0.5 shrink-0" />
                    <span className="min-w-0 flex-1 break-words">
                      The customer has received their invoice via WhatsApp and can now choose <strong>Pay with Cash</strong> or <strong>Pay with Card</strong>.
                    </span>
                  </div>
                )}

                {paymentStatus === 'cash_selected' && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3.5 flex items-start gap-2.5 text-xs text-amber-900 min-w-0">
                    <Banknote className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
                    <span className="min-w-0 flex-1 break-words">
                      Customer selected <strong>Cash</strong>. Once they hand over payment or mark it paid, you will be able to confirm receipt right here.
                    </span>
                  </div>
                )}

                {isCashAwaitingConfirmation && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3 min-w-0">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Banknote className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="text-xs font-bold text-amber-950">
                          Confirm Cash Receipt
                        </div>
                        <p className="text-xs text-amber-900 break-words">
                          The customer reported paying{' '}
                          <strong>
                            R{Math.round(Number(paymentOperation?.amount ?? totalAmount))} ZAR
                          </strong>
                          . Confirm only once you have received the funds.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => handleCashConfirmation('reject')}
                        disabled={actionBusy}
                        className="w-full py-2.5 px-3 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-xs font-semibold text-red-700 inline-flex items-center justify-center gap-1.5 min-h-[42px] disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>Not Received</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCashConfirmation('confirm')}
                        disabled={actionBusy}
                        className="w-full py-2.5 px-3 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 min-h-[42px] disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        <span>Confirm Received</span>
                      </button>
                    </div>
                  </div>
                )}

                {['payment_processing', 'awaiting_customer_confirmation'].includes(paymentStatus) && (
                  <div className="rounded-lg border border-tealbrand-200 bg-tealbrand-50/50 p-3.5 flex items-start gap-2.5 text-xs text-tealbrand-900 min-w-0">
                    <CreditCard className="h-4 w-4 text-tealbrand-700 mt-0.5 shrink-0" />
                    <span className="min-w-0 flex-1 break-words">
                      Card checkout is currently in progress via Paystack. This panel updates automatically when settled.
                    </span>
                  </div>
                )}

                {paymentStatus === 'paid' && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 flex items-start gap-2.5 text-xs text-emerald-900 min-w-0">
                    <CheckCircle2 className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="font-bold">
                        Settled via {paymentMethod === 'cash' ? 'Cash' : 'Card (Paystack)'}
                      </div>
                      {paymentOperation?.receiptId && (
                        <div className="text-[11px] text-emerald-800 [overflow-wrap:anywhere]">
                          Receipt: {paymentOperation.receiptId}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!alreadyRated && (
                  <form onSubmit={handleSubmitRating} className="pt-4 border-t border-border space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">
                      Rate Customer Experience
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRatingScore(star)}
                          aria-label={`Rate ${star} stars`}
                          className="p-1.5 rounded-lg hover:bg-well"
                        >
                          <Star
                            className={`h-5 w-5 ${
                              star <= ratingScore
                                ? 'fill-amber-400 text-amber-500'
                                : 'text-ink-300'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={ratingComment}
                      onChange={(e) => setRatingComment(e.target.value)}
                      placeholder="Optional note about this job…"
                      className="w-full px-3 py-2 rounded-lg border border-border text-xs focus:outline-none focus:border-tealbrand-700"
                    />
                    <button
                      type="submit"
                      disabled={actionBusy}
                      className="px-4 py-2.5 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-white text-xs font-semibold min-h-[40px] disabled:opacity-50"
                    >
                      {actionBusy ? 'Submitting Rating…' : 'Submit Rating'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Customer Chat (WhatsApp Bridge) */}
          <div className="min-w-0 w-full max-w-full bg-surface rounded-xl border border-border flex flex-col h-[540px] overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-border flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <MessageSquare className="w-4 h-4 text-tealbrand-700 shrink-0" />
                <h2 className="text-sm font-bold text-ink-900 truncate">Customer Chat (WhatsApp Bridge)</h2>
              </div>
              <span className="text-xs text-tealbrand-700 font-semibold shrink-0">Live Sync</span>
            </div>

            <div className="flex-1 min-w-0 w-full p-4 overflow-y-auto overflow-x-hidden space-y-3 bg-well/40">
              {messages.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-xs text-ink-500">
                    No messages yet. Customer replies from WhatsApp appear here in real time.
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isHelper = msg.senderRole === 'helper';
                  return (
                    <div key={msg.id} className={`flex min-w-0 ${isHelper ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`min-w-0 max-w-[82%] rounded-xl px-4 py-2.5 text-xs ${
                          isHelper
                            ? 'bg-tealbrand-700 text-white rounded-br-none'
                            : 'bg-surface text-ink-900 border border-border rounded-bl-none'
                        }`}
                      >
                        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{msg.text}</p>
                        <div
                          className={`mt-1 flex flex-wrap items-center gap-1 text-[10px] ${
                            isHelper ? 'text-tealbrand-100 justify-end' : 'text-ink-400'
                          }`}
                        >
                          {!isHelper && msg.channel === 'whatsapp' && (
                            <span className="font-semibold text-tealbrand-700">WhatsApp ·</span>
                          )}
                          <span>
                            {new Date(msg.createdAtMs || Date.now()).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {isHelper && <span>· {msg.deliveryStatus || 'sent'}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatScrollRef} />
            </div>

            <div className="w-full max-w-full min-w-0 px-3.5 py-2 border-t border-border bg-surface flex items-center gap-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => sendMessageText("I'm on my way to your location now.")}
                className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-well text-ink-700 hover:bg-border/60 whitespace-nowrap"
              >
                On my way
              </button>
              <button
                type="button"
                onClick={() => sendMessageText('Stopping quickly to pick up the required resources for your job.')}
                className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-well text-ink-700 hover:bg-border/60 whitespace-nowrap"
              >
                Buying resources
              </button>
              <button
                type="button"
                onClick={() => sendMessageText('I have arrived outside your location.')}
                className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-well text-ink-700 hover:bg-border/60 whitespace-nowrap"
              >
                I have arrived
              </button>
              <button
                type="button"
                onClick={() => sendMessageText('Running 5 minutes behind due to traffic.')}
                className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-well text-ink-700 hover:bg-border/60 whitespace-nowrap"
              >
                5 mins behind
              </button>
            </div>

            <form onSubmit={handleSendMessage} className="w-full min-w-0 p-3.5 border-t border-border bg-surface flex items-center gap-2.5">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type a message to customer WhatsApp…"
                className="min-w-0 w-full flex-1 px-3.5 py-2.5 rounded-lg border border-border text-xs focus:outline-none focus:border-tealbrand-700 min-h-[44px]"
              />
              <button
                type="submit"
                disabled={!inputText.trim()}
                aria-label="Send message"
                className="p-2.5 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 disabled:opacity-50 text-white min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* In-app Cancel Reason Dialog */}
      {cancelModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-forest-950/50 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleConfirmCancel}
            noValidate
            className="w-full max-w-md rounded-xl border border-border bg-surface p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-ink-900">
                Cancel Service Session
              </h3>
              <button
                type="button"
                onClick={closeCancelModal}
                disabled={actionBusy}
                className="p-1 text-ink-400 hover:text-ink-900 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-ink-500">
              Let the customer and Uncedo support know why you need to cancel this assignment.
            </p>
            {cancelError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800 [overflow-wrap:anywhere]">
                {cancelError}
              </div>
            )}
            <div className="space-y-1.5">
              <textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => {
                  setCancelReason(e.target.value);
                  if (cancelError) setCancelError('');
                }}
                placeholder="Reason for cancellation (minimum 3 characters)…"
                className="w-full rounded-lg border border-border bg-white p-3 text-sm text-ink-900 focus:border-tealbrand-600 focus:outline-none"
              />
              <p className="text-[11px] text-ink-400">
                Minimum 3 characters required.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={closeCancelModal}
                disabled={actionBusy}
                className="px-4 py-2 rounded-lg border border-border bg-surface text-xs font-semibold text-ink-700 hover:bg-well disabled:opacity-50"
              >
                Keep Job
              </button>
              <button
                type="submit"
                disabled={actionBusy}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-semibold text-white disabled:opacity-50"
              >
                {actionBusy ? 'Cancelling…' : 'Confirm Cancellation'}
              </button>
            </div>
          </form>
        </div>
      )}

      <BottomNav
        pathname="/jobs"
        onNavigate={onNavigate}
        pendingOffersCount={session?.offers?.length || 0}
        showOnboardingBadge={!session?.evaluation?.fullyVerified}
        isOnline={Boolean(session?.isOnline)}
        shiftBusy={Boolean(session?.shiftBusy)}
        onToggleOnline={session?.toggleOnline}
      />
    </div>
  );
}
