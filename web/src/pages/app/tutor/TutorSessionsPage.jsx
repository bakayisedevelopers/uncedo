import { useState } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import SectionCard from '../../../components/ui/SectionCard';
import LoadingState from '../../../components/ui/LoadingState';
import EmptyState from '../../../components/ui/EmptyState';
import SessionCard from '../../../components/app/SessionCard';
import FormField from '../../../components/ui/FormField';
import SelectField from '../../../components/ui/SelectField';
import { useAuth } from '../../../hooks/useAuth';
import { useTutorSessions } from '../../../hooks/useSessions';
import { meetingProviderOptions } from '../../../constants/meetingProviders';
import { sessionStatusOptions } from '../../../constants/sessionStatus';
import { updateSession } from '../../../services/sessionService';

export default function TutorSessionsPage() {
  const { user } = useAuth();
  const { sessions, isLoading } = useTutorSessions(user?.uid);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});
  const [savingId, setSavingId] = useState(null);

  const startEditing = (session) => {
    setEditingId(session.id);
    setForm({
      scheduledDate: session.scheduledDate || '',
      scheduledTime: session.scheduledTime || '',
      meetingProvider: session.meetingProvider || 'any',
      meetingLink: session.meetingLink || '',
      status: session.status || 'accepted',
      notes: session.notes || '',
    });
  };

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const saveSession = async (session) => {
    setSavingId(session.id);
    try {
      await updateSession(session.id, {
        ...session,
        ...form,
      });
      setEditingId(null);
      setForm({});
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      <PageHeader title="Tutor Sessions" description="Manage meeting links, schedule, and progression status." />

      <SectionCard>
        {isLoading ? (
          <LoadingState message="Syncing your sessions..." />
        ) : sessions.length ? (
          <div className="space-y-4">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                role="tutor"
                action={
                  editingId === session.id ? (
                    <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <FormField label="Scheduled date" name="scheduledDate" type="date" value={form.scheduledDate} onChange={onChange} />
                        <FormField label="Scheduled time" name="scheduledTime" type="time" value={form.scheduledTime} onChange={onChange} />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <SelectField label="Provider" name="meetingProvider" value={form.meetingProvider} onChange={onChange} options={meetingProviderOptions} />
                        <SelectField
                          label="Status"
                          name="status"
                          value={form.status}
                          onChange={onChange}
                          options={sessionStatusOptions.map((status) => ({ value: status, label: status.replace('_', ' ') }))}
                        />
                      </div>
                      <FormField
                        label="Meeting link"
                        name="meetingLink"
                        value={form.meetingLink}
                        onChange={onChange}
                        placeholder="https://meet.google.com/..."
                      />
                      <FormField label="Notes" as="textarea" rows={3} name="notes" value={form.notes} onChange={onChange} />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => saveSession(session)}
                          disabled={savingId === session.id}
                          className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50"
                        >
                          {savingId === session.id ? 'Saving...' : 'Save updates'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditing(session)}
                      className="rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-brand/40"
                    >
                      Manage Session
                    </button>
                  )
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No sessions yet" description="Accept class requests to start managing sessions." />
        )}
      </SectionCard>
    </div>
  );
}
