import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, ImageIcon } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useTutorAvailableRequests } from '../../hooks/useClassRequests';
import { OFFER_TIMEOUT_SECONDS } from '../../constants/lifecycle';
import { acceptClassRequest, declineClassRequest } from '../../services/classRequestService';
import { findSessionIdByRequestAndTutor } from '../../services/sessionService';
import { getTutorOnboardingStatus } from '../../utils/onboarding';
import { debugError, debugLog } from '../../utils/devLogger';
import { formatRand, normalizePricingSnapshot } from '../../utils/pricing';
import { getUserProfile } from '../../services/userService';

function getDemandLabel(pricingBand) {
  const normalized = String(pricingBand || 'normal').toLowerCase();
  if (normalized === 'low') return { text: 'Low demand', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (normalized === 'high') return { text: 'High demand', tone: 'bg-rose-50 text-rose-700 border-rose-200' };
  return { text: 'Normal demand', tone: 'bg-blue-50 text-blue-700 border-blue-200' };
}

export default function TutorOfferOverlay() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { requests } = useTutorAvailableRequests(user?.uid);
  const onboardingStatus = getTutorOnboardingStatus(user);
  const canAccept = onboardingStatus.complete && user?.onlineStatus === 'online';

  const [activeRequest, setActiveRequest] = useState(null);
  const [displayRequest, setDisplayRequest] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [studentProfile, setStudentProfile] = useState(null);

  const audioCtxRef = useRef(null);
  const audioNodesRef = useRef({
    oscillator: null,
    gainNode: null,
    sweepTimer: null,
  });
  const latestRequestIdRef = useRef(null);
  const processingRef = useRef(false);

  const topRequest = requests[0] || null;

  useEffect(() => {
    let isSubscribed = true;
    if (!displayRequest?.studentId) {
      setStudentProfile(null);
      return () => {
        isSubscribed = false;
      };
    }

    getUserProfile(displayRequest.studentId)
      .then((profile) => {
        if (!isSubscribed) return;
        setStudentProfile(profile || null);
      })
      .catch(() => {
        if (!isSubscribed) return;
        setStudentProfile(null);
      });

    return () => {
      isSubscribed = false;
    };
  }, [displayRequest?.studentId]);

  const stopAlertSound = () => {
    const { oscillator, gainNode, sweepTimer } = audioNodesRef.current;

    if (sweepTimer) {
      clearInterval(sweepTimer);
    }

    if (gainNode) {
      try {
        gainNode.gain.cancelScheduledValues(audioCtxRef.current?.currentTime || 0);
        gainNode.gain.setTargetAtTime(0.0001, audioCtxRef.current?.currentTime || 0, 0.02);
      } catch {
        // Ignore audio shutdown errors.
      }
    }

    if (oscillator) {
      try {
        oscillator.stop();
      } catch {
        // Ignore repeated stop calls.
      }

      try {
        oscillator.disconnect();
      } catch {
        // Ignore disconnect errors.
      }
    }

    if (gainNode) {
      try {
        gainNode.disconnect();
      } catch {
        // Ignore disconnect errors.
      }
    }

    audioNodesRef.current = {
      oscillator: null,
      gainNode: null,
      sweepTimer: null,
    };
  };

  const startAlertSound = async () => {
    stopAlertSound();

    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new window.AudioContext();
      }

      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(520, ctx.currentTime);

      gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.035, ctx.currentTime + 0.12);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start();

      const sweepTimer = setInterval(() => {
        if (!audioCtxRef.current) return;
        const activeCtx = audioCtxRef.current;
        try {
          const nextGain = gainNode.gain.value > 0.025 ? 0.018 : 0.035;
          gainNode.gain.cancelScheduledValues(activeCtx.currentTime);
          gainNode.gain.linearRampToValueAtTime(nextGain, activeCtx.currentTime + 0.18);
        } catch {
          // Ignore modulation errors and keep the alert running.
        }
      }, 360);

      audioNodesRef.current = {
        oscillator,
        gainNode,
        sweepTimer,
      };
    } catch {
      // Ignore audio initialization failures so the popup still works.
    }
  };

  useEffect(() => {
    if (processingRef.current) return;

    if (!topRequest) {
      setDisplayRequest(null);
      return;
    }

    setDisplayRequest(topRequest);
  }, [topRequest]);

  useEffect(() => {
    if (!displayRequest?.id) {
      stopAlertSound();
      return undefined;
    }

    if (latestRequestIdRef.current === displayRequest.id) return undefined;

    latestRequestIdRef.current = displayRequest.id;
    startAlertSound();

    return () => {
      stopAlertSound();
    };
  }, [displayRequest?.id]);

  const handleResponse = async (response) => {
    if (!displayRequest || !canAccept) return;
    if (processingRef.current) return;

    stopAlertSound();
    processingRef.current = true;
    setActiveRequest(displayRequest.id);
    setErrorMessage('');

    debugLog('tutorOffer', 'Tutor offer response started.', {
      response,
      requestId: displayRequest.id,
    });

    try {
      if (response === 'accept') {
        const result = await acceptClassRequest({
          requestId: displayRequest.id,
          tutorId: user.uid,
          tutorName: user.fullName || user.displayName || user.email,
          tutorEmail: user.email,
        });

        let sessionId = result?.sessionId || null;

        if (!sessionId) {
          sessionId = await findSessionIdByRequestAndTutor({
            requestId: displayRequest.id,
            tutorId: user.uid,
          });
        }

        debugLog('tutorOffer', 'Tutor accepted request successfully.', {
          requestId: displayRequest.id,
          sessionId: sessionId || null,
          reused: Boolean(result?.reused),
        });

        if (!sessionId) {
          throw new Error('Call session was created, but no session ID was found.');
        }

        setDisplayRequest(null);
        navigate(`/app/session/${sessionId}`);
        return;
      }

      await declineClassRequest({
        requestId: displayRequest.id,
        tutorId: user.uid,
      });

      debugLog('tutorOffer', 'Tutor declined request.', {
        requestId: displayRequest.id,
      });

      setDisplayRequest(null);
    } catch (error) {
      debugError('tutorOffer', 'Tutor offer response failed.', {
        message: error.message,
        requestId: displayRequest.id,
      });
      setErrorMessage(error.message || 'Unable to process this request. Please try again.');
    } finally {
      processingRef.current = false;
      setActiveRequest(null);
    }
  };

  if (!displayRequest) return null;

  const isImage = displayRequest.attachment?.contentType?.startsWith('image/');
  const pricing = normalizePricingSnapshot(displayRequest.pricingSnapshot);
  const demand = getDemandLabel(pricing.pricingBand);
  const requestedDurationMinutes = Number(displayRequest.durationMinutes || pricing.requestedDurationMinutes || pricing.durationMinutes || 0);
  const dynamicRate = Math.max(0, Number(pricing.adjustedRatePerMinute || pricing.ratePerMinute || 0));
  const baseAmount = Number(pricing.adjustedBaseAmount ?? pricing.baseAmount ?? 0);
  const estimatedTotal = Number(pricing.finalPrice ?? pricing.totalAmount ?? 0);
  const dynamicPortion = Math.max(0, estimatedTotal - baseAmount);
  const studentName = displayRequest.studentName || studentProfile?.fullName || studentProfile?.displayName || 'Student';
  const studentRating = Number(studentProfile?.ratings?.asStudent?.average ?? 0);
  const attachments = displayRequest.attachments?.length
    ? displayRequest.attachments
    : displayRequest.attachment?.downloadUrl
      ? [displayRequest.attachment]
      : [];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl bg-white p-3 shadow-2xl">
        <div className="pointer-events-none absolute inset-0 bg-emerald-50" />
        <div
          key={displayRequest.id}
          className="pointer-events-none absolute inset-0 origin-left"
          style={{
            animation: `offer-countdown-shrink ${OFFER_TIMEOUT_SECONDS}s linear forwards`,
          }}
        />
        <div className="relative z-10 rounded-[1.25rem] p-4 text-black">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black">
                Incoming request
              </p>
              <h3 className="text-lg font-bold text-black">
                {displayRequest.topic || 'Mathematics request'}
              </h3>
              <p className="text-sm text-black">
                {displayRequest.duration || 'N/A'} • {displayRequest.subject || 'Mathematics'}
              </p>
            </div>
          </div>

          {errorMessage ? (
            <p className="mb-3 rounded-xl border border-black bg-white px-3 py-2 text-xs font-semibold text-black">
              {errorMessage}
            </p>
          ) : null}

          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-black bg-transparent px-2.5 py-1 font-semibold text-black">
              {demand.text}
            </span>
            <span className="rounded-full border border-black bg-transparent px-2.5 py-1 font-semibold text-black">
              Rate / min: {formatRand(dynamicRate)}
            </span>
            <span className="rounded-full border border-black bg-transparent px-2.5 py-1 font-semibold text-black">
              Duration: {requestedDurationMinutes || 'N/A'} min
            </span>
          </div>

          <div className="mb-3 rounded-xl border border-black bg-transparent p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black">Requesting student</p>
            <p className="mt-1 text-sm font-bold text-black">{studentName}</p>
            <p className="text-xs text-black">
              Rating: {studentRating > 0 ? `${studentRating.toFixed(2)} / 5` : 'Not rated yet'}
            </p>
          </div>

          <p className="mb-3 text-sm text-black">
            {displayRequest.description || 'Student sent a request with attachment(s).'}
          </p>

          <div className="mb-4 rounded-2xl border border-black bg-transparent p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black">
              What you&apos;re agreeing to
            </p>
            <div className="mt-2 grid gap-2 text-xs text-black sm:grid-cols-2">
              <p>Base amount: <span className="font-semibold">{formatRand(baseAmount)}</span></p>
              <p>Dynamic demand value: <span className="font-semibold">{formatRand(dynamicPortion)}</span></p>
              <p>Dynamic rate per minute: <span className="font-semibold">{formatRand(dynamicRate)}</span></p>
              <p>Total expected session price: <span className="font-semibold">{formatRand(estimatedTotal)}</span></p>
            </div>
          </div>

          {attachments.length ? (
            <div className="mb-3 rounded-xl border border-black bg-transparent p-3 text-xs">
              <p className="mb-2 font-semibold text-black">Attachment preview</p>
              <div className="space-y-2">
                {attachments.slice(0, 3).map((file, index) => {
                  const itemIsImage = file?.contentType?.startsWith('image/') || (index === 0 && isImage);
                  return (
                    <a
                      key={`${file.fileName || 'attachment'}-${index}`}
                      href={file.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-lg border bg-transparent p-2 transition hover:bg-transparent"
                    >
                      {itemIsImage ? (
                        <img
                          src={file.downloadUrl}
                          alt={file.fileName || 'Attachment preview'}
                          className="max-h-44 w-full rounded-lg object-contain"
                        />
                      ) : (
                        <div className="flex items-center gap-2 text-black">
                          {file?.contentType?.includes('pdf') ? (
                            <FileText className="h-4 w-4" />
                          ) : (
                            <ImageIcon className="h-4 w-4" />
                          )}
                          <span>{file.fileName || 'Document attachment'}</span>
                        </div>
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!canAccept ? (
            <div className="mb-3 rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              {onboardingStatus.message || 'Please complete your tutor profile before accepting requests.'}
            </div>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleResponse('accept')}
              disabled={!canAccept || activeRequest === displayRequest.id || processingRef.current}
              className="rounded-xl border border-green bg-green px-4 py-2 text-sm font-bold text-black disabled:opacity-60"
            >
              {activeRequest === displayRequest.id ? 'Submitting...' : 'Accept'}
            </button>
            <button
              type="button"
              onClick={() => handleResponse('decline')}
              disabled={!canAccept || activeRequest === displayRequest.id || processingRef.current}
              className="rounded-xl border border-red bg-red px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
