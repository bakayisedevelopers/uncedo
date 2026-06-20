import PageHeader from '../../../components/ui/PageHeader';
import SectionCard from '../../../components/ui/SectionCard';
import LoadingState from '../../../components/ui/LoadingState';
import EmptyState from '../../../components/ui/EmptyState';
import SessionCard from '../../../components/app/SessionCard';
import { useAuth } from '../../../hooks/useAuth';
import { useStudentSessions } from '../../../hooks/useSessions';

export default function StudentSessionsPage() {
  const { user } = useAuth();
  const { sessions, isLoading } = useStudentSessions(user?.uid);

  return (
    <div>
      <PageHeader title="My Sessions" description="Track scheduled, in-progress, and completed classes in real time." />

      <SectionCard>
        {isLoading ? (
          <LoadingState message="Syncing your sessions..." />
        ) : sessions.length ? (
          <div className="space-y-4">
            {sessions.map((session) => (
              <SessionCard key={session.id} session={session} role="student" />
            ))}
          </div>
        ) : (
          <EmptyState title="No sessions yet" description="Accepted requests automatically become sessions." />
        )}
      </SectionCard>
    </div>
  );
}
