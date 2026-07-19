import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Power, Star } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import SectionCard from '../../../components/ui/SectionCard';
import TutorMetricTile from '../../../components/app/TutorMetricTile';
import { useAuth } from '../../../hooks/useAuth';
import { useTutorAvailableRequests } from '../../../hooks/useClassRequests';
import { useTutorSessions } from '../../../hooks/useSessions';
import { SESSION_STATUS } from '../../../constants/lifecycle';
import { getTutorOnboardingStatus } from '../../../utils/onboarding';
import { getUserProfile, updateUserProfile } from '../../../services/userService';
import { acceptClassRequest, declineClassRequest } from '../../../services/classRequestService';
import { findSessionIdByRequestAndTutor } from '../../../services/sessionService';
import { debugError, debugLog } from '../../../utils/devLogger';
import useViewportMode from '../../../hooks/useViewportMode';

export default function TutorDashboardPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const { requests } = useTutorAvailableRequests(user?.uid);
  const { sessions } = useTutorSessions(user?.uid);
  const onboardingStatus = getTutorOnboardingStatus(user);
  const isOnline = user?.onlineStatus === 'online';
  const { useBottomNav } = useViewportMode();
  const isTutorRestrictedMobile = useBottomNav;
  const [now, setNow] = useState(Date.now());
  const [activeRequestId, setActiveRequestId] = useState('');
  const [requestError, setRequestError] = useState('');
  const [profileSnapshot, setProfileSnapshot] = useState(user || null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    getUserProfile(user.uid).then((profile) => {
      setProfileSnapshot(profile || user);
    });
  }, [user]);

  const tutorProfile = profileSnapshot?.tutorProfile || user?.tutorProfile || {};
  const activeTutorSession = useMemo(
    () => sessions.find((session) => [SESSION_STATUS.WAITING_STUDENT, SESSION_STATUS.IN_PROGRESS].includes(session.status)),
    [sessions],
  );
  const dispatchMetrics = {
    acceptanceRate: Number(tutorProfile.acceptanceRate ?? profileSnapshot?.acceptanceRate ?? 0),
    completionRate: Number(tutorProfile.completionRate ?? profileSnapshot?.completionRate ?? 0),
    overallRating: Number(tutorProfile.overallRating ?? profileSnapshot?.overallRating ?? profileSnapshot?.ratings?.asTutor?.average ?? 0),
    avgResponseSeconds: Number(tutorProfile.avgResponseSeconds ?? profileSnapshot?.avgResponseSeconds ?? 0),
    cancellationRate: Number(tutorProfile.cancellationRate ?? profileSnapshot?.cancellationRate ?? 0),
    recentAssignmentsCount: Number(tutorProfile.recentAssignmentsCount ?? profileSnapshot?.recentAssignmentsCount ?? tutorProfile.completedSessionsLast24Hours ?? 0),
  };

  const formatPercent = (value) => `${(Math.max(0, value <= 1 ? value * 100 : value)).toFixed(1)}%`;

  if (activeTutorSession) {
    const isInProgress = activeTutorSession.status === SESSION_STATUS.IN_PROGRESS;

    return (
      <div className="space-y-4">
        <div className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
          <div className="inline-flex items-center rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
            Live session
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-zinc-900">
            {isInProgress ? 'Your class is in progress.' : 'Your class is ready to join.'}
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            {activeTutorSession.topic || 'Current class'}
            {' '}
            {activeTutorSession.subject ? `• ${activeTutorSession.subject}` : ''}
          </p>

          <div className="mt-5 rounded-[1.75rem] border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
              {activeTutorSession.studentName || 'Student'}
            </p>
            <p className="mt-2 text-lg font-bold text-zinc-900">
              {activeTutorSession.duration || 'Live now'}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              {isInProgress ? 'Join back into the live class from any device.' : 'Open the session room to begin or continue the class.'}
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link
              to={`/app/session/${activeTutorSession.id}`}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Join session
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const toggleOnlineStatus = async () => {
    if (isTutorRestrictedMobile) return;
    if (!onboardingStatus.complete) return;
    debugLog('tutorDashboard', 'Toggling tutor online status.', { current: isOnline ? 'online' : 'offline' });
    const profile = await updateUserProfile(user.uid, { onlineStatus: isOnline ? 'offline' : 'online' });
    setUser((prev) => ({ ...prev, ...profile }));
  };

  const respond = async (requestId, response) => {
    debugLog('tutorDashboard', 'Tutor responding to request from dashboard.', { requestId, response });
    setActiveRequestId(requestId);
    setRequestError('');
    try {
      if (response === 'accept') {
        await acceptClassRequest({
          requestId,
          tutorId: user.uid,
          tutorName: user.fullName || user.displayName || user.email,
          tutorEmail: user.email,
        });
        const sessionId = await findSessionIdByRequestAndTutor({ requestId, tutorId: user.uid });
        if (sessionId) {
          navigate(`/app/session/${sessionId}`);
        }
      } else {
        await declineClassRequest({ requestId, tutorId: user.uid });
      }
    } catch (error) {
      debugError('tutorDashboard', 'Tutor response failed.', { requestId, response, message: error.message });
      setRequestError(error.message || 'Unable to process this request. Please try again.');
    } finally {
      setActiveRequestId('');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Tutor Home" description="Go online to view requests and respond quickly." />

      {!onboardingStatus.complete ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {onboardingStatus.message} <Link className="font-semibold underline" to="/app/onboarding?role=tutor">Complete profile</Link>
        </div>
      ) : null}
      {isTutorRestrictedMobile ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          To teach and accept class requests, please access Parakleo from a laptop or tablet in landscape mode.
        </div>
      ) : null}

      <SectionCard>
        <div className="rounded-3xl border border-emerald-200 bg-white p-4 md:p-6">
          <p className="text-2xl font-black text-zinc-900">Go online to view requests</p>
          <p className="mt-1 text-sm text-zinc-500">When you are online, new requests will appear below in real time.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={toggleOnlineStatus}
              disabled={isTutorRestrictedMobile || !onboardingStatus.complete}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold text-white ${isOnline ? 'bg-rose-600' : 'bg-emerald-600'}`}
            >
              <Power className="h-4 w-4" />
              {isOnline ? 'Go Offline' : 'Go Online'}
            </button>
            {!isTutorRestrictedMobile ? (
              <Link to="/app/tutor/available-requests" className="rounded-xl border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700">
                Open full request list
              </Link>
            ) : null}
          </div>
        </div>
      </SectionCard>

      {isOnline ? (
        <SectionCard title="Dispatch metrics" subtitle="These values are used in backend tutor dispatch ranking.">
          <div className="grid justify-start gap-3 [grid-template-columns:repeat(2,max-content)] xl:[grid-template-columns:repeat(3,max-content)]">
            <TutorMetricTile
              label="Acceptance rate"
              value={formatPercent(dispatchMetrics.acceptanceRate)}
            />
            <TutorMetricTile
              label="Completion rate"
              value={formatPercent(dispatchMetrics.completionRate)}
            />
            <TutorMetricTile
              label="Tutor rating"
              value={dispatchMetrics.overallRating > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <span>{dispatchMetrics.overallRating.toFixed(2)}</span>
                </span>
              ) : 'Not rated yet'}
            />
            <TutorMetricTile
              label="Avg response speed"
              value={dispatchMetrics.avgResponseSeconds > 0 ? `${dispatchMetrics.avgResponseSeconds.toFixed(0)}s` : 'Not available yet'}
            />
            <TutorMetricTile
              label="Cancellation rate"
              value={formatPercent(dispatchMetrics.cancellationRate)}
            />
            <TutorMetricTile
              label="Recent assignments"
              value={Math.max(0, dispatchMetrics.recentAssignmentsCount).toFixed(0)}
            />
          </div>
        </SectionCard>
      ) : null}

      {isOnline ? (
        <SectionCard title="Incoming requests">
          {requestError ? (
            <p className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {requestError}
            </p>
          ) : null}
          {requests.length ? (
            <div className="space-y-3">
              {requests.map((request) => {
                const secondsLeft = Math.max(0, Math.ceil(((request.offerExpiresAt || 0) - now) / 1000));
                return (
                  <div key={request.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <p className="font-semibold text-zinc-900">{request.topic}</p>
                    <p className="text-sm text-zinc-600">{request.description || 'New class request'}</p>
                    <p className="mt-1 text-xs font-semibold text-amber-700">{secondsLeft}s remaining</p>
                    <div className="mt-3 flex gap-2">
                      <button disabled={activeRequestId === request.id} onClick={() => respond(request.id, 'accept')} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Accept</button>
                      <button disabled={activeRequestId === request.id} onClick={() => respond(request.id, 'decline')} className="rounded-xl border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700">Decline</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-zinc-600">No requests yet. Stay online to receive offers.</p>
          )}
        </SectionCard>
      ) : null}
    </div>
  );
}
