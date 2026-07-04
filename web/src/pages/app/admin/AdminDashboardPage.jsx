import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, CircleDollarSign, GraduationCap, Users } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import SectionCard from '../../../components/ui/SectionCard';
import StatCard from '../../../components/ui/StatCard';
import LoadingState from '../../../components/ui/LoadingState';
import { getStudentsForAdmin, getTutorsForAdmin } from '../../../services/userService';
import { listAdminWeeklyPayouts, syncWeeklyPayoutRecordsFromSessions } from '../../../services/payoutService';
import { formatCurrency, getWeekKey, toDateValue } from '../../../utils/payouts';

export default function AdminDashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [tutors, setTutors] = useState([]);
  const [students, setStudents] = useState([]);
  const [payouts, setPayouts] = useState([]);

  const load = async () => {
    setIsLoading(true);
    try {
      await syncWeeklyPayoutRecordsFromSessions({ lookbackWeeks: 12 }).catch(() => []);
      const [tutorItems, studentItems, payoutItems] = await Promise.all([
        getTutorsForAdmin(),
        getStudentsForAdmin(),
        listAdminWeeklyPayouts(),
      ]);
      setTutors(tutorItems);
      setStudents(studentItems);
      setPayouts(payoutItems);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(() => {
    const currentWeekKey = getWeekKey(new Date());
    const currentWeekPayouts = payouts.filter((item) => item.weekKey === currentWeekKey);
    const unpaidThisWeek = currentWeekPayouts.filter((item) => item.status !== 'paid');
    const paidRecentCount = payouts.filter((item) => {
      if (item.status !== 'paid') return false;
      const paidAt = toDateValue(item.paidAt);
      if (!paidAt) return false;
      const daysAgo = (Date.now() - paidAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= 30;
    }).length;

    return {
      currentWeekKey,
      unpaidTutorCount: new Set(unpaidThisWeek.map((item) => item.tutorId)).size,
      unpaidAmount: unpaidThisWeek.reduce((sum, item) => sum + Number(item.tutorAmount || 0), 0),
      paidRecentCount,
    };
  }, [payouts]);

  return (
    <div className="space-y-6">
      <PageHeader title="Admin Operations" description="Manual payout tracking and operational views for tutors and students." />

      {isLoading ? <LoadingState message="Loading admin dashboard..." /> : null}

      {!isLoading ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatCard title="Total tutors" value={String(tutors.length)} icon={GraduationCap} tone="brand" />
            <StatCard title="Total students" value={String(students.length)} icon={Users} tone="zinc" />
            <StatCard title="Unpaid tutors this week" value={String(summary.unpaidTutorCount)} icon={CircleDollarSign} tone="sky" />
            <StatCard title="Unpaid amount this week" value={formatCurrency(summary.unpaidAmount)} icon={Banknote} tone="brand" />
            <StatCard title="Paid weeks (30d)" value={String(summary.paidRecentCount)} icon={CircleDollarSign} tone="zinc" />
          </div>

          <SectionCard>
            <div className="grid gap-3 md:grid-cols-2">
              <Link to="/app/admin/tutors" className="rounded-2xl border border-zinc-300 bg-white p-4 text-sm font-semibold text-zinc-800 hover:border-emerald-300">
                Tutor verification and profiles
              </Link>
              <Link to="/app/admin/tutor-agreements" className="rounded-2xl border border-zinc-300 bg-white p-4 text-sm font-semibold text-zinc-800 hover:border-emerald-300">
                Tutor agreement versioning
              </Link>
              <Link to="/app/admin/payments" className="rounded-2xl border border-zinc-300 bg-white p-4 text-sm font-semibold text-zinc-800 hover:border-emerald-300">
                Weekly manual payout management
              </Link>
              <Link to="/app/admin/requested-subjects" className="rounded-2xl border border-zinc-300 bg-white p-4 text-sm font-semibold text-zinc-800 hover:border-emerald-300">
                Requested subjects not yet offered
              </Link>
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
