
import { Navigate } from 'react-router-dom';
import PageHeader from '../../../components/ui/PageHeader';
import SectionCard from '../../../components/ui/SectionCard';
import LoadingState from '../../../components/ui/LoadingState';
import EmptyState from '../../../components/ui/EmptyState';
import RequestCard from '../../../components/app/RequestCard';
import { useAuth } from '../../../hooks/useAuth';
import { useTutorAvailableRequests } from '../../../hooks/useClassRequests';
import { OFFER_TIMEOUT_SECONDS } from '../../../constants/lifecycle';
import { getTutorOnboardingStatus } from '../../../utils/onboarding';
import useViewportMode from '../../../hooks/useViewportMode';

export default function AvailableRequestsPage() {
  const { user } = useAuth();
  const { requests, isLoading } = useTutorAvailableRequests(user?.uid);
  const onboardingStatus = getTutorOnboardingStatus(user);
  const { useBottomNav } = useViewportMode();
  const isTutorRestrictedMobile = useBottomNav;
  const canAccept = onboardingStatus.complete && user?.onlineStatus === 'online';

  if (isTutorRestrictedMobile) {
    return <Navigate to="/app/tutor" replace />;
  }

  return (
    <div>
      <PageHeader
        title="Available Requests"
        description="Incoming offers are actionable from the live overlay only. This list is a realtime mirror for context."
      />
      {!canAccept ? (
        <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          You must be online with a completed tutor profile before accepting requests.
        </p>
      ) : null}

      <SectionCard>
        {requests.length ? (
          <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            Use the incoming offer overlay to accept or decline within {OFFER_TIMEOUT_SECONDS} seconds. Actions are disabled on this page to prevent duplicate submissions.
          </p>
        ) : null}
        {isLoading ? (
          <LoadingState message="Listening for live tutor offers..." />
        ) : requests.length ? (
          <div className="space-y-4">
            {requests.map((request) => {
              const expiryLabel = request.offerExpiresAt
                ? new Date(request.offerExpiresAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : 'N/A';

              return (
                <RequestCard
                  key={request.id}
                  request={request}
                  action={
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-amber-700">
                        Expires at {expiryLabel}
                      </span>
                      <span className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
                        Respond in overlay
                      </span>
                    </div>
                  }
                />
              );
            })}
          </div>
        ) : (
          <EmptyState title="No pending requests" description="Stay online. Requests will appear here and in the live offer overlay." />
        )}
      </SectionCard>
    </div>
  );
}
