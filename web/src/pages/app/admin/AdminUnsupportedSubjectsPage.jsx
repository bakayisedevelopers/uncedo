import { useEffect, useState } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import SectionCard from '../../../components/ui/SectionCard';
import LoadingState from '../../../components/ui/LoadingState';
import EmptyState from '../../../components/ui/EmptyState';
import { listUnsupportedSubjectRequests } from '../../../services/unsupportedSubjectService';

function formatDateTime(value) {
  if (!value) return 'Not requested yet';
  const millis = typeof value?.toMillis === 'function' ? value.toMillis() : new Date(value).getTime();
  if (!Number.isFinite(millis) || millis <= 0) return 'Not requested yet';
  return new Date(millis).toLocaleString();
}

export default function AdminUnsupportedSubjectsPage() {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    try {
      const requests = await listUnsupportedSubjectRequests();
      setItems(requests);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Requested Subjects"
        description="Subjects students asked for that are not currently offered."
      />

      <SectionCard>
        {isLoading ? <LoadingState message="Loading requested subjects..." /> : null}
        {!isLoading && !items.length ? (
          <EmptyState title="No unsupported subjects yet" description="Requests will appear here when students ask for subjects outside the active catalog." />
        ) : null}
        {!isLoading && items.length ? (
          <div className="overflow-hidden rounded-2xl border border-zinc-200">
            <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-zinc-500 md:grid-cols-[1fr_120px_220px]">
              <span>Subject</span>
              <span className="text-right">Requests</span>
              <span className="hidden md:block">Last requested</span>
            </div>
            <div className="divide-y divide-zinc-200">
              {items.map((item) => (
                <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-sm md:grid-cols-[1fr_120px_220px]">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-zinc-900">{item.subject || item.normalizedSubject || 'Unknown subject'}</p>
                    {item.lastInputPreview ? <p className="mt-1 text-xs text-zinc-500">{item.lastInputPreview}</p> : null}
                  </div>
                  <p className="text-right font-bold text-zinc-900">{Number(item.count || 0)}</p>
                  <p className="hidden text-zinc-600 md:block">{formatDateTime(item.lastRequestedAt)}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
