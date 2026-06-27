import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ChevronDown } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import SectionCard from '../../../components/ui/SectionCard';
import LoadingState from '../../../components/ui/LoadingState';
import EmptyState from '../../../components/ui/EmptyState';
import { PLATFORM_FEE_RATE, TUTOR_PAYOUT_RATE } from '../../../utils/onboarding';
import { useAuth } from '../../../hooks/useAuth';
import { useTutorSessions } from '../../../hooks/useSessions';
import {
  formatCurrency,
  formatWeekRangeLabel,
  getPayoutStatusBadgeClasses,
  getSessionCompletedDate,
  groupSessionsByWeek,
  toDateValue,
} from '../../../utils/payouts';
import { listTutorWeeklyPayouts } from '../../../services/payoutService';

function SummaryCard({ label, value, helper }) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-black tracking-tight text-zinc-900">{value}</p>
      {helper ? <p className="mt-2 text-sm text-zinc-500">{helper}</p> : null}
    </div>
  );
}

function sessionDateLabel(session) {
  const date = getSessionCompletedDate(session);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export default function TutorPaymentsPage() {
  const { user } = useAuth();
  const { sessions, isLoading } = useTutorSessions(user?.uid);
  const [weeklyPayoutRecords, setWeeklyPayoutRecords] = useState([]);
  const [isLoadingPayoutRecords, setIsLoadingPayoutRecords] = useState(false);
  const [expandedWeekKey, setExpandedWeekKey] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadPayoutRecords() {
      if (!user?.uid) {
        setWeeklyPayoutRecords([]);
        return;
      }

      setIsLoadingPayoutRecords(true);
      try {
        const records = await listTutorWeeklyPayouts(user.uid);
        if (!cancelled) {
          setWeeklyPayoutRecords(records);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPayoutRecords(false);
        }
      }
    }

    loadPayoutRecords();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const payoutByWeekKey = useMemo(
    () => weeklyPayoutRecords.reduce((acc, item) => ({ ...acc, [item.weekKey]: item }), {}),
    [weeklyPayoutRecords],
  );

  const weeklyGroups = useMemo(() => {
    const completed = sessions.filter((session) => session.status === 'completed');
    return groupSessionsByWeek(completed).map((group) => {
      const payoutRecord = payoutByWeekKey[group.weekKey];
      return {
        ...group,
        payoutRecord,
        status: payoutRecord?.status || 'unpaid',
        paidAt: payoutRecord?.paidAt || null,
        notes: payoutRecord?.notes || '',
      };
    });
  }, [payoutByWeekKey, sessions]);

  const summaries = useMemo(() => {
    const lifetimeTutorEarnings = weeklyGroups.reduce((sum, item) => sum + Number(item.tutorAmount || 0), 0);
    const paidAmount = weeklyGroups
      .filter((item) => item.status === 'paid')
      .reduce((sum, item) => sum + Number(item.tutorAmount || 0), 0);
    const unpaidAmount = weeklyGroups
      .filter((item) => item.status !== 'paid')
      .reduce((sum, item) => sum + Number(item.tutorAmount || 0), 0);

    const currentDate = new Date();
    const currentWeekGroup = weeklyGroups.find((item) => {
      const weekStart = toDateValue(item.weekStart);
      const weekEnd = toDateValue(item.weekEnd);
      return weekStart && weekEnd && currentDate >= weekStart && currentDate <= weekEnd;
    });

    return {
      lifetimeTutorEarnings,
      paidAmount,
      unpaidAmount,
      currentWeekAmount: Number(currentWeekGroup?.tutorAmount || 0),
    };
  }, [weeklyGroups]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tutor Payments"
        description="Track completed sessions by week, payout status, and amounts owed for manual payouts."
      />

      <SectionCard className="overflow-hidden border border-zinc-200 bg-gradient-to-br from-white via-zinc-50 to-emerald-50/30 shadow-sm">
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Lifetime tutor earnings" value={formatCurrency(summaries.lifetimeTutorEarnings)} />
            <SummaryCard label="Unpaid amount" value={formatCurrency(summaries.unpaidAmount)} helper="Weeks marked unpaid or processing." />
            <SummaryCard label="Paid amount" value={formatCurrency(summaries.paidAmount)} helper="Weeks marked as paid by admin." />
            <SummaryCard label="Current week amount" value={formatCurrency(summaries.currentWeekAmount)} helper="Your earnings this Monday–Sunday." />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Platform fee" value={`${Math.round(PLATFORM_FEE_RATE * 100)}%`} helper="Applied to new completed sessions." />
            <SummaryCard label="Tutor share" value={`${Math.round(TUTOR_PAYOUT_RATE * 100)}%`} helper="Applied to new completed sessions." />
            <SummaryCard label="Completed payout weeks" value={String(weeklyGroups.length)} helper="Weeks with completed sessions." />
            <SummaryCard label="Sessions completed" value={String(weeklyGroups.reduce((sum, item) => sum + item.totalSessions, 0))} helper="Total count across all weeks." />
          </div>
        </div>
      </SectionCard>

      <SectionCard className="border border-zinc-200 bg-white shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-zinc-900">Weekly payout breakdown</h3>
            <p className="text-sm text-zinc-500">Grouped Monday to Sunday with manual payout tracking status.</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-600">
            {weeklyGroups.length} week{weeklyGroups.length === 1 ? '' : 's'}
          </div>
        </div>

        {(isLoading || isLoadingPayoutRecords) ? <LoadingState message="Loading payout history..." /> : null}

        {!isLoading && !isLoadingPayoutRecords && !weeklyGroups.length ? (
          <EmptyState
            title="No completed sessions yet"
            description="Completed sessions will appear here and automatically group into payout weeks."
          />
        ) : null}

        {!isLoading && !isLoadingPayoutRecords && weeklyGroups.length ? (
          <div className="space-y-4">
            {weeklyGroups.map((group) => {
              const paidAt = toDateValue(group.paidAt);
              const isExpanded = expandedWeekKey === group.weekKey;

              return (
                <div key={group.weekKey} className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setExpandedWeekKey((current) => (current === group.weekKey ? '' : group.weekKey))}
                    className="flex w-full flex-col gap-3 text-left md:flex-row md:items-start md:justify-between"
                    aria-expanded={isExpanded}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        <p className="text-base font-black text-zinc-900">{formatWeekRangeLabel(group.weekStart, group.weekEnd)}</p>
                      </div>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{group.weekKey}</p>
                      <p className="mt-2 text-sm font-semibold text-emerald-700">Total made: {formatCurrency(group.grossAmount)}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getPayoutStatusBadgeClasses(group.status)}`}>
                        {group.status}
                      </span>
                      {paidAt ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          <CalendarClock className="h-3.5 w-3.5" />
                          Paid {new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(paidAt)}
                        </span>
                      ) : null}
                    </div>
                  </button>

                  {isExpanded ? (
                    <>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                          <p className="text-xs text-zinc-500">Sessions</p>
                          <p className="text-lg font-bold text-zinc-900">{group.totalSessions}</p>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                          <p className="text-xs text-zinc-500">Gross</p>
                          <p className="text-lg font-bold text-zinc-900">{formatCurrency(group.grossAmount)}</p>
                        </div>
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                          <p className="text-xs text-emerald-700">Tutor payout</p>
                          <p className="text-lg font-bold text-emerald-800">{formatCurrency(group.tutorAmount)}</p>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                          <p className="text-xs text-zinc-500">Platform amount</p>
                          <p className="text-lg font-bold text-zinc-900">{formatCurrency(group.platformAmount)}</p>
                        </div>
                      </div>

                      {group.notes ? (
                        <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                          <span className="font-semibold">Admin note:</span> {group.notes}
                        </div>
                      ) : null}

                      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
                        <table className="min-w-full divide-y divide-zinc-200 text-sm">
                      <thead className="bg-zinc-50 text-zinc-600">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Session</th>
                          <th className="px-3 py-2 text-left font-semibold">Date</th>
                          <th className="px-3 py-2 text-left font-semibold">Student</th>
                          <th className="px-3 py-2 text-left font-semibold">Duration</th>
                          <th className="px-3 py-2 text-right font-semibold">Total</th>
                          <th className="px-3 py-2 text-right font-semibold">Tutor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 bg-white">
                        {group.sessions.map((session) => {
                          const durationMinutes = Number(session.billedMinutes || session.durationMinutes || 0);
                          return (
                            <tr key={session.id}>
                              <td className="px-3 py-2 font-semibold text-zinc-800">{session.topic || 'Session'}</td>
                              <td className="px-3 py-2 text-zinc-600">{sessionDateLabel(session)}</td>
                              <td className="px-3 py-2 text-zinc-600">{session.studentName || session.studentEmail || '—'}</td>
                              <td className="px-3 py-2 text-zinc-600">{durationMinutes ? `${durationMinutes.toFixed(2)} min` : '—'}</td>
                              <td className="px-3 py-2 text-right text-zinc-700">{formatCurrency(session.computedAmounts?.totalAmount || session.totalAmount)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-emerald-700">{formatCurrency(session.computedAmounts?.tutorAmount)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                        </table>
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Payout policies" subtitle="Review tutor payout, platform fee, refund, and dispute rules.">
        <div className="flex flex-wrap gap-3 text-sm font-semibold">
          <Link to="/payment-pricing-policy" className="text-brand underline">Payment and Pricing Policy</Link>
          <Link to="/refund-policy" className="text-brand underline">Refund Policy</Link>
          <Link to="/terms" className="text-brand underline">Terms of Service</Link>
        </div>
      </SectionCard>
    </div>
  );
}
