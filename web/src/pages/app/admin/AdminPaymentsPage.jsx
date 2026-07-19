import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, RefreshCcw, Search } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import SectionCard from '../../../components/ui/SectionCard';
import LoadingState from '../../../components/ui/LoadingState';
import EmptyState from '../../../components/ui/EmptyState';
import { useAuth } from '../../../hooks/useAuth';
import {
  getAdminPayoutWeekDetails,
  listAdminWeeklyPayouts,
  syncWeeklyPayoutRecordsFromSessions,
  updateWeeklyPayoutStatus,
} from '../../../services/payoutService';
import { getTutorsForAdmin } from '../../../services/userService';
import {
  formatCurrency,
  formatWeekRangeLabel,
  getPayoutStatusBadgeClasses,
  getSessionCompletedDate,
  toDateValue,
} from '../../../utils/payouts';

const FILTERS = ['all', 'unpaid', 'processing', 'paid', 'unsuccessful'];

function maskAccountNumber(value) {
  const raw = String(value || '').replace(/\s+/g, '');
  if (!raw) return '—';
  if (raw.length <= 4) return raw;
  return `${'*'.repeat(Math.max(raw.length - 4, 0))}${raw.slice(-4)}`;
}

export default function AdminPaymentsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [tutors, setTutors] = useState([]);
  const [expandedId, setExpandedId] = useState('');
  const [detailsMap, setDetailsMap] = useState({});
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const [payoutItems, tutorItems] = await Promise.all([
        listAdminWeeklyPayouts(),
        getTutorsForAdmin(),
      ]);
      setItems(payoutItems);
      setTutors(tutorItems);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const syncData = async () => {
    setIsSyncing(true);
    try {
      await syncWeeklyPayoutRecordsFromSessions({ lookbackWeeks: 12 });
      await load();
    } finally {
      setIsSyncing(false);
    }
  };

  const tutorById = useMemo(
    () => tutors.reduce((acc, tutor) => ({ ...acc, [tutor.uid]: tutor }), {}),
    [tutors],
  );

  const filteredItems = useMemo(() => {
    const normalizedSearch = String(search || '').trim().toLowerCase();

    return items.filter((item) => {
      if (filter !== 'all' && item.status !== filter) return false;
      if (!normalizedSearch) return true;

      const haystack = `${item.tutorName || ''} ${item.tutorEmail || ''}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [filter, items, search]);

  const updateStatus = async (item, status) => {
    await updateWeeklyPayoutStatus({
      weekKey: item.weekKey,
      tutorId: item.tutorId,
      status,
      paidBy: {
        uid: user?.uid || null,
        email: user?.email || null,
      },
    });
    await load();
  };

  const updateNotes = async (item, notes) => {
    await updateWeeklyPayoutStatus({
      weekKey: item.weekKey,
      tutorId: item.tutorId,
      status: item.status,
      notes,
      paidBy: item.paidBy || null,
    });
    await load();
  };

  const toggleDetails = async (item) => {
    const targetId = `${item.weekKey}_${item.tutorId}`;
    if (expandedId === targetId) {
      setExpandedId('');
      return;
    }

    setExpandedId(targetId);
    if (!detailsMap[targetId]) {
      const details = await getAdminPayoutWeekDetails({ weekKey: item.weekKey, tutorId: item.tutorId });
      setDetailsMap((prev) => ({ ...prev, [targetId]: details }));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Manual Payout Management" description="Track weekly tutor amounts, mark payout state, and add payout notes." />

      <SectionCard className="border border-zinc-200 bg-white shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] ${filter === item
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-zinc-300 bg-white text-zinc-600'}`}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tutor"
                className="w-full rounded-2xl border border-zinc-300 px-9 py-2 text-sm text-zinc-700 outline-none focus:border-emerald-400"
              />
            </label>
            <button
              type="button"
              onClick={syncData}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-700 hover:border-emerald-300"
            >
              <RefreshCcw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync weeks
            </button>
          </div>
        </div>

        {isLoading ? <LoadingState message="Loading weekly payouts..." /> : null}

        {!isLoading && !filteredItems.length ? (
          <EmptyState title="No payout records" description="Run sync to generate weekly payout records from completed sessions." />
        ) : null}

        {!isLoading && filteredItems.length ? (
          <div className="space-y-4">
            {filteredItems.map((item) => {
              const expandedKey = `${item.weekKey}_${item.tutorId}`;
              const details = detailsMap[expandedKey];
              const tutor = tutorById[item.tutorId];
              const payout = tutor?.tutorProfile?.payout || {};

              return (
                <div key={expandedKey} className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-base font-black text-zinc-900">{item.tutorName || tutor?.fullName || item.tutorEmail || 'Tutor'}</p>
                      <p className="text-sm text-zinc-600">{item.tutorEmail || tutor?.email || 'No email'}</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.13em] text-zinc-500">{formatWeekRangeLabel(item.weekStart, item.weekEnd)} ({item.weekKey})</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getPayoutStatusBadgeClasses(item.status)}`}>
                        {item.status}
                      </span>
                      {toDateValue(item.paidAt) ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Paid {new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(toDateValue(item.paidAt))}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                          <Clock3 className="h-3.5 w-3.5" />
                          Pending payout
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                      <p className="text-xs text-zinc-500">Sessions</p>
                      <p className="text-lg font-bold text-zinc-900">{item.totalSessions}</p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                      <p className="text-xs text-zinc-500">Gross</p>
                      <p className="text-lg font-bold text-zinc-900">{formatCurrency(item.grossAmount)}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <p className="text-xs text-emerald-700">Tutor amount</p>
                      <p className="text-lg font-bold text-emerald-800">{formatCurrency(item.tutorAmount)}</p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                      <p className="text-xs text-zinc-500">Platform amount</p>
                      <p className="text-lg font-bold text-zinc-900">{formatCurrency(item.platformAmount)}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => updateStatus(item, 'unpaid')} className="rounded-xl border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700">Mark unpaid</button>
                    <button type="button" onClick={() => updateStatus(item, 'processing')} className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">Mark processing</button>
                    <button type="button" onClick={() => updateStatus(item, 'paid')} className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">Mark paid</button>
                    <button type="button" onClick={() => toggleDetails(item)} className="rounded-xl border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700">{expandedId === expandedKey ? 'Hide details' : 'View details'}</button>
                  </div>

                  <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Notes</p>
                    <textarea
                      defaultValue={item.notes || ''}
                      onBlur={(event) => {
                        const nextValue = String(event.target.value || '');
                        if (nextValue !== String(item.notes || '')) {
                          updateNotes(item, nextValue);
                        }
                      }}
                      rows={2}
                      placeholder="Add payout note"
                      className="mt-1 w-full resize-y rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-700 outline-none focus:border-emerald-400"
                    />
                  </div>

                  {expandedId === expandedKey ? (
                    <div className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Bank details (admin only)</p>
                        <p className="text-sm text-zinc-700">Bank: {payout.bankName || '—'}</p>
                        <p className="text-sm text-zinc-700">Account holder: {payout.accountHolder || '—'}</p>
                        <p className="text-sm text-zinc-700">Account number: {maskAccountNumber(payout.accountNumber)}</p>
                        <p className="text-sm text-zinc-700">Account type: {payout.accountType || '—'}</p>
                        <p className="text-sm text-zinc-700">Branch code: {payout.branchCode || '—'}</p>
                      </div>

                      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                        <table className="min-w-full divide-y divide-zinc-200 text-sm">
                          <thead className="bg-zinc-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-zinc-600">Session</th>
                              <th className="px-3 py-2 text-left font-semibold text-zinc-600">Date</th>
                              <th className="px-3 py-2 text-right font-semibold text-zinc-600">Total</th>
                              <th className="px-3 py-2 text-right font-semibold text-zinc-600">Tutor</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {(details?.sessions || []).map((session) => (
                              <tr key={session.id}>
                                <td className="px-3 py-2 text-zinc-800">{session.topic || session.id}</td>
                                <td className="px-3 py-2 text-zinc-600">{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(getSessionCompletedDate(session) || new Date())}</td>
                                <td className="px-3 py-2 text-right text-zinc-700">{formatCurrency(session.totalAmount)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-emerald-700">{formatCurrency(session.payoutBreakdown?.tutorAmount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
