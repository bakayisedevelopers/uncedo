import { Link } from 'react-router-dom';
import StatusBadge from '../ui/StatusBadge';
import { getProfileStatusByRole } from '../../utils/onboarding';

export default function OnboardingStatusBanner({ user, role }) {
  const status = getProfileStatusByRole(user, role);

  if (status.complete) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-emerald-300">{status.title}</p>
            <p className="text-xs text-emerald-200/90">{status.message}</p>
          </div>
          <StatusBadge status="completed" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-amber-200">{status.title}</p>
          <p className="text-xs text-amber-100/90">{status.message}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status="pending" />
          <Link to={`/app/onboarding?role=${role}`} className="rounded-xl bg-amber-300 px-3 py-1.5 text-xs font-bold text-zinc-900">
            Complete now
          </Link>
        </div>
      </div>
    </div>
  );
}
