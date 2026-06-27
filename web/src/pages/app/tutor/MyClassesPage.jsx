import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import SectionCard from '../../../components/ui/SectionCard';
import LoadingState from '../../../components/ui/LoadingState';
import EmptyState from '../../../components/ui/EmptyState';
import RequestCard from '../../../components/app/RequestCard';
import { useAuth } from '../../../hooks/useAuth';
import { useTutorAcceptedRequests } from '../../../hooks/useClassRequests';
import { useTutorSessions } from '../../../hooks/useSessions';

export default function MyClassesPage() {
  const { user } = useAuth();
  const { classes, isLoading: loadingClasses } = useTutorAcceptedRequests(user?.uid);
  const { sessions, isLoading: loadingSessions } = useTutorSessions(user?.uid);

  const classesWithSessions = useMemo(() => {
    const byRequestId = new Map(sessions.map((session) => [session.requestId, session]));
    return classes.map((request) => ({
      request,
      session: byRequestId.get(request.id) || null,
    }));
  }, [classes, sessions]);

  const isLoading = loadingClasses || loadingSessions;

  return (
    <div>
      <PageHeader title="My Classes" description="Requests and sessions are grouped together for a clearer teaching queue." />

      <SectionCard>
        {isLoading ? (
          <LoadingState message="Syncing accepted classes..." />
        ) : classesWithSessions.length ? (
          <div className="space-y-4">
            {classesWithSessions.map(({ request, session }) => (
              <div key={request.id} className="space-y-2">
                <RequestCard request={request} relatedSession={session} />
                {session?.id ? (
                  <div className="flex justify-end">
                    <Link to={`/app/session/${session.id}`} className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                      Open session details <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No classes yet" description="Accept a class request to build your schedule." />
        )}
      </SectionCard>
    </div>
  );
}
