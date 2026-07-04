import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Search, Star, XCircle } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import SectionCard from '../../../components/ui/SectionCard';
import { useStudentRequest } from '../../../hooks/useClassRequests';
import { useStudentSessions } from '../../../hooks/useSessions';
import { useAuth } from '../../../hooks/useAuth';
import { REQUEST_STATUSES } from '../../../utils/requestStatus';
import { cancelClassRequest } from '../../../services/classRequestService';
import { getUserProfile } from '../../../services/userService';

const PENDING_STATUS_REDIRECT_KEY = 'parakleo_pending_request_status_redirect';

function getStatusCopy(status) {
  if ([REQUEST_STATUSES.PENDING, REQUEST_STATUSES.MATCHING].includes(status)) return 'Searching for a tutor';
  if (status === REQUEST_STATUSES.OFFERED) return 'Waiting for tutor to accept';
  if (status === REQUEST_STATUSES.ACCEPTED) return 'Tutor found';
  if ([REQUEST_STATUSES.WAITING_STUDENT, REQUEST_STATUSES.IN_PROGRESS, REQUEST_STATUSES.IN_SESSION].includes(status)) return 'Class ready';
  if (status === REQUEST_STATUSES.NO_TUTOR_AVAILABLE) return 'No tutor available';
  if (status === REQUEST_STATUSES.COMPLETED) return 'Class completed';
  if ([REQUEST_STATUSES.CANCELED, REQUEST_STATUSES.CANCELED_DURING, REQUEST_STATUSES.EXPIRED].includes(status)) return 'Request closed';
  return 'Request made';
}

function getStatusMeta(status) {
  if ([REQUEST_STATUSES.PENDING, REQUEST_STATUSES.MATCHING].includes(status)) {
    return {
      label: 'Searching for tutor',
      tone: 'emerald',
      icon: Search,
      badge: 'Request made • searching for tutor',
    };
  }

  if (status === REQUEST_STATUSES.OFFERED) {
    return {
      label: 'Waiting for tutor to accept',
      tone: 'violet',
      icon: CheckCircle2,
      badge: 'Tutor found • waiting for acceptance',
    };
  }

  if (status === REQUEST_STATUSES.ACCEPTED) {
    return {
      label: 'Tutor found',
      tone: 'violet',
      icon: CheckCircle2,
      badge: 'Tutor accepted your request',
    };
  }

  if ([REQUEST_STATUSES.WAITING_STUDENT, REQUEST_STATUSES.IN_PROGRESS, REQUEST_STATUSES.IN_SESSION].includes(status)) {
    return {
      label: 'Class ready',
      tone: 'violet',
      icon: CheckCircle2,
      badge: 'Tutor accepted • session is ready',
    };
  }

  if (status === REQUEST_STATUSES.NO_TUTOR_AVAILABLE) {
    return {
      label: 'No tutor available',
      tone: 'amber',
      icon: Search,
      badge: 'No tutor available right now',
    };
  }

  if (status === REQUEST_STATUSES.COMPLETED) {
    return {
      label: 'Completed',
      tone: 'emerald',
      icon: CheckCircle2,
      badge: 'Class completed successfully',
    };
  }

  if ([REQUEST_STATUSES.CANCELED, REQUEST_STATUSES.CANCELED_DURING, REQUEST_STATUSES.EXPIRED].includes(status)) {
    return {
      label: 'Closed',
      tone: 'rose',
      icon: XCircle,
      badge: 'This request is no longer active',
    };
  }

  return {
    label: 'Request made',
    tone: 'zinc',
    icon: Search,
    badge: 'Preparing your request',
  };
}

function getToneClasses(tone) {
  if (tone === 'emerald') {
    return {
      iconWrap: 'bg-emerald-100 text-emerald-700',
      gradient: 'from-emerald-500 via-teal-500 to-blue-500',
    };
  }

  if (tone === 'violet') {
    return {
      iconWrap: 'bg-violet-100 text-violet-700',
      gradient: 'from-violet-500 via-fuchsia-500 to-blue-500',
    };
  }

  if (tone === 'amber') {
    return {
      iconWrap: 'bg-amber-100 text-amber-700',
      gradient: 'from-amber-500 via-orange-500 to-yellow-500',
    };
  }

  if (tone === 'rose') {
    return {
      iconWrap: 'bg-rose-100 text-rose-700',
      gradient: 'from-rose-500 via-pink-500 to-red-500',
    };
  }

  return {
    iconWrap: 'bg-zinc-100 text-zinc-700',
    gradient: 'from-zinc-500 via-zinc-400 to-zinc-500',
  };
}

export default function StudentRequestStatusPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { requestId: requestIdParam } = useParams();
  const { state } = useLocation();
  const requestId = requestIdParam || state?.requestId || '';
  const { request } = useStudentRequest(requestId);
  const { sessions } = useStudentSessions(user?.uid);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [offeredTutorProfile, setOfferedTutorProfile] = useState(null);

  if (!requestId) {
    return <Navigate to="/app/student" replace />;
  }

  const currentStatus = request?.status;
  const matchingSession = useMemo(
    () => sessions.find((item) => item.requestId === requestId),
    [requestId, sessions],
  );
  const joinSessionId = matchingSession?.id || request?.sessionId || '';
  const normalizedStatus = String(currentStatus || '').toLowerCase();
  const sessionStatus = String(matchingSession?.status || '').toLowerCase();
  const hasActiveSession =
    Boolean(joinSessionId)
    && (!matchingSession || ['waiting_student', 'in_progress', 'in_session'].includes(sessionStatus));
  const canJoin = hasActiveSession && ![
    REQUEST_STATUSES.CANCELED,
    REQUEST_STATUSES.CANCELED_DURING,
    REQUEST_STATUSES.COMPLETED,
    REQUEST_STATUSES.EXPIRED,
  ].includes(currentStatus);
  const effectiveStatus = hasActiveSession && ['pending', 'matching', 'offered', 'no_tutor_available'].includes(normalizedStatus)
    ? (sessionStatus === 'in_progress' ? REQUEST_STATUSES.IN_PROGRESS : REQUEST_STATUSES.WAITING_STUDENT)
    : currentStatus;
  const statusText = getStatusCopy(effectiveStatus);
  const meta = getStatusMeta(effectiveStatus);
  const tone = getToneClasses(meta.tone);
  const StatusIcon = meta.icon;
  const topic = request?.topic || state?.topic || 'Your request';
  const duration = request?.duration || 'Per-minute billing';
  const shouldAutoOpenSession = canJoin && Boolean(joinSessionId);
  const isWaitingTutorAcceptance = currentStatus === REQUEST_STATUSES.OFFERED;
  const offeredTutorId = isWaitingTutorAcceptance ? (request?.currentOfferTutorId || request?.tutorId || null) : null;
  const tutorDisplayName = offeredTutorProfile?.fullName || offeredTutorProfile?.displayName || request?.tutorName || 'Tutor';
  const tutorAvatarUrl = offeredTutorProfile?.profilePhoto || offeredTutorProfile?.selfieUrl || '';
  const tutorRating = Number(offeredTutorProfile?.tutorProfile?.overallRating ?? offeredTutorProfile?.ratings?.asTutor?.average ?? 0);

  useEffect(() => {
    if (!requestId || typeof window === 'undefined') return;
    if (window.sessionStorage.getItem(PENDING_STATUS_REDIRECT_KEY) === requestId) {
      window.sessionStorage.removeItem(PENDING_STATUS_REDIRECT_KEY);
    }
  }, [requestId]);

  useEffect(() => {
    if (!shouldAutoOpenSession) return;
    navigate(`/app/session/${joinSessionId}`, { replace: true });
  }, [joinSessionId, navigate, shouldAutoOpenSession]);

  useEffect(() => {
    let isSubscribed = true;
    if (!offeredTutorId) {
      setOfferedTutorProfile(null);
      return () => {
        isSubscribed = false;
      };
    }

    getUserProfile(offeredTutorId)
      .then((profile) => {
        if (!isSubscribed) return;
        setOfferedTutorProfile(profile || null);
      })
      .catch(() => {
        if (!isSubscribed) return;
        setOfferedTutorProfile(null);
      });

    return () => {
      isSubscribed = false;
    };
  }, [offeredTutorId]);

  const canCancel = ![
    REQUEST_STATUSES.CANCELED,
    REQUEST_STATUSES.CANCELED_DURING,
    REQUEST_STATUSES.COMPLETED,
    REQUEST_STATUSES.EXPIRED,
  ].includes(currentStatus);

  const submitCancel = async () => {
    if (!request?.id || !cancelReason.trim()) return;
    setIsCanceling(true);
    try {
      await cancelClassRequest({ requestId: request.id, canceledBy: 'student', reason: cancelReason });
      setShowCancelModal(false);
      navigate('/app/student/requests', { replace: true });
    } finally {
      setShowCancelModal(false);
      setIsCanceling(false);
      setCancelReason('');
    }
  };

  useEffect(() => {
    if (!currentStatus) return;
    if ([REQUEST_STATUSES.CANCELED, REQUEST_STATUSES.CANCELED_DURING].includes(currentStatus)) {
      setShowCancelModal(false);
      setIsCanceling(false);
    }
  }, [currentStatus]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Request Status"
        description="Simple live status for your class request."
      />

      <div className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div className={`relative overflow-hidden bg-gradient-to-r ${tone.gradient} px-6 py-8 text-white md:px-8 md:py-10`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.22),_transparent_35%)]" />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]">
                Live request update
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight md:text-5xl">{statusText}</h1>
              <p className="mt-3 max-w-xl text-sm text-white/90 md:text-base">
                Request made, tutor search, and class completion updates appear here.
              </p>
            </div>

            <div className="w-full max-w-sm rounded-[1.75rem] border border-white/20 bg-white/10 p-4 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone.iconWrap}`}>
                  <StatusIcon className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Current state</p>
                  <p className="truncate text-lg font-bold text-white">{meta.label}</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-white/85">{meta.badge}</p>
              {canJoin && joinSessionId ? (
                <button
                  type="button"
                  onClick={() => navigate(`/app/session/${joinSessionId}`)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/15 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-white/25"
                >
                  Join Session
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {isWaitingTutorAcceptance ? (
                <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/15">
                    {tutorAvatarUrl ? (
                      <img
                        src={tutorAvatarUrl}
                        alt={tutorDisplayName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-black text-white/80">
                        {tutorDisplayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Tutor</p>
                    <p className="truncate text-base font-bold text-white">{tutorDisplayName}</p>
                    <p className="mt-1 text-xs text-white/80">
                      Rating:{' '}
                      {tutorRating > 0 ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-white">
                          <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
                          <span>{tutorRating.toFixed(2)}</span>
                        </span>
                      ) : (
                        'Not rated yet'
                      )}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <SectionCard title="Request overview" subtitle="Essential details only. Open full details when needed.">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Topic</p>
                <p className="mt-2 break-words text-lg font-bold text-zinc-900">{topic}</p>
              </div>

              <div className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Duration</p>
                <p className="mt-2 text-lg font-bold text-zinc-900">{duration}</p>
              </div>

              <div className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Payment method</p>
                <p className="mt-2 text-sm font-bold text-zinc-900">{request?.selectedCardId || 'Selected card on file'}</p>
              </div>
            </div>

            {canJoin ? (
              <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-800">
                  Your class is ready. Join now from the button on the right.
                </p>
              </div>
            ) : null}

            {isWaitingTutorAcceptance ? (
              <div className="rounded-[1.5rem] border border-violet-200 bg-violet-50 p-4">
                <p className="text-sm font-semibold text-violet-800">Waiting for tutor to accept</p>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Actions" subtitle="Quick things you may need right now.">
          <div className="space-y-3">
            {canJoin ? (
              <Link
                to={matchingSession?.id ? `/app/session/${matchingSession.id}` : '/app/student/requests'}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-dark"
              >
                Join session
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}

            <Link
              to={`/app/student/requests/${requestId}`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-bold text-zinc-800 transition hover:bg-zinc-100"
            >
              View full request details
            </Link>

            {canCancel ? (
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700"
              >
                Cancel Request
              </button>
            ) : null}
          </div>
        </SectionCard>
      </div>
      {showCancelModal ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-lg font-black text-zinc-900">Cancel request</p>
            <p className="mt-1 text-sm text-zinc-600">Please provide a reason. This helps us improve matching quality.</p>
            <textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              rows={4}
              className="mt-4 w-full rounded-2xl border border-zinc-300 px-3 py-2 text-sm"
              placeholder="Type your cancellation reason"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
              >
                Close
              </button>
              <button
                type="button"
                disabled={!cancelReason.trim() || isCanceling}
                onClick={submitCancel}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {isCanceling ? 'Canceling...' : 'Confirm cancel'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
