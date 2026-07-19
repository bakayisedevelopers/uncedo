import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Clock3 } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import SectionCard from '../../../components/ui/SectionCard';
import EmptyState from '../../../components/ui/EmptyState';
import LoadingState from '../../../components/ui/LoadingState';
import RequestCard from '../../../components/app/RequestCard';
import { useAuth } from '../../../hooks/useAuth';
import { useStudentRequests } from '../../../hooks/useClassRequests';
import { useStudentSessions } from '../../../hooks/useSessions';

function statusLabel(status) {
  if (['pending', 'matching', 'offered'].includes(status)) return 'Searching for tutor';
  if (['accepted', 'waiting_student', 'in_progress', 'in_session'].includes(status)) return 'Tutor found';
  if (status === 'no_tutor_available') return 'No tutor available';
  if (status === 'completed') return 'Class completed';
  return 'Request update';
}

export default function StudentRequestsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { requests, isLoading: loadingRequests } = useStudentRequests(user?.uid);
  const { sessions, isLoading: loadingSessions } = useStudentSessions(user?.uid);

  const items = useMemo(() => {
    const sessionByRequest = new Map(sessions.map((session) => [session.requestId, session]));
    return requests.map((request) => ({
      request,
      session: sessionByRequest.get(request.id) || null,
    }));
  }, [requests, sessions]);

  const isLoading = loadingRequests || loadingSessions;

  return (
    <div className="space-y-5">
      <PageHeader title="My Classes" description="A single place for request status and session access." />

      <SectionCard>
        {isLoading ? (
          <LoadingState message="Syncing your classes..." />
        ) : items.length ? (
          <div className="space-y-4">
            {items.map(({ request, session }) => (
              <div key={request.id} className="space-y-2">
                <button
                  type="button"
                  onClick={() => navigate(`/app/student/requests/${request.id}`)}
                  className="block w-full text-left"
                >
                  <RequestCard request={request} relatedSession={session} />
                </button>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                  <p className="font-semibold">{statusLabel(request.status)}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {request.duration || session?.duration || 'Per-minute'}
                    </span>
                    {session?.id ? (
                      <Link to={`/app/session/${session.id}`} className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline">
                        Join / Re-open class <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No classes yet"
            description="Create your first request and it will appear here with its session details."
            action={
              <Link to="/app/student" className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-white">
                Request Class
              </Link>
            }
          />
        )}
      </SectionCard>
    </div>
  );
}
