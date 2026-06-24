import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge, Card, EmptyState, LoadingState, SectionTitle } from '../components/ui';
import { flattenProviderServices, listHelperProfiles } from '../services/adminService';
import {
  isPendingSkillStatus,
} from '../utils/moderationView';

function statusTone(status = '') {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'verified' || normalized === 'approved') return 'success';
  if (normalized === 'pending' || normalized === 'review') return 'warning';
  if (normalized === 'rejected' || normalized === 'suspended') return 'danger';
  return 'neutral';
}

function helperStateLabel(profile) {
  if (profile.suspended || profile.adminStatus === 'suspended') return 'Suspended';
  if (String(profile.verificationStatus || '').toLowerCase() === 'verified') return 'Verified';
  if (String(profile.verificationStatus || '').toLowerCase() === 'rejected') return 'Rejected';
  return 'Pending review';
}

function helperAgreementLabel(profile = {}) {
  const activeRole = String(profile?.activeRole || profile?.role || '').toLowerCase();
  if (activeRole && activeRole !== 'helper') {
    return 'No helper agreement';
  }

  const agreement = profile?.agreement || {};
  const acceptedVersion = String(agreement.acceptedVersion || '').trim();
  const requiredVersion = String(agreement.requiredVersion || '').trim();
  const isCurrent = Boolean(
    acceptedVersion
      && requiredVersion
      && acceptedVersion === requiredVersion
      && (
        agreement.currentVersionAccepted === true
        || agreement.acceptedCurrentVersion === true
        || acceptedVersion === requiredVersion
      ),
  );

  if (isCurrent) {
    return `Agreement current (v${acceptedVersion})`;
  }

  return requiredVersion ? `Agreement pending (needs v${requiredVersion})` : 'Agreement pending';
}

export default function HelpersPage() {
  const navigate = useNavigate();
  const [helpers, setHelpers] = useState([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    try {
      const items = await listHelperProfiles();
      setHelpers(items);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const helperCards = useMemo(() => {
    const normalizedSearch = String(search || '').trim().toLowerCase();

    return helpers
      .filter((item) => {
        if (!normalizedSearch) return true;
        return [
          item.fullName,
          item.displayName,
          item.email,
          item.businessName,
          item.city,
        ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
      })
      .map((profile) => {
        const serviceRows = flattenProviderServices([profile]);
        const pendingCount = serviceRows.filter((row) => isPendingSkillStatus(row.skillStatus)).length;
        return {
          profile,
          serviceRows,
          pendingCount,
        };
      })
      .sort((left, right) => {
        if (right.pendingCount !== left.pendingCount) {
          return right.pendingCount - left.pendingCount;
        }
        return `${left.profile.fullName || left.profile.displayName || left.profile.email}`.localeCompare(
          `${right.profile.fullName || right.profile.displayName || right.profile.email}`,
        );
      });
  }, [helpers, search]);

  const summary = useMemo(() => {
    const totalPending = helperCards.reduce((count, item) => count + item.pendingCount, 0);
    const helpersWithPending = helperCards.filter((item) => item.pendingCount > 0).length;
    return { totalPending, helpersWithPending };
  }, [helperCards]);

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle
          eyebrow="Directory"
          title="Helpers"
          description="Review helper profiles first, then open a helper to inspect its collapsible service submissions and photos."
          action={(
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search helpers"
                className="w-full rounded-2xl border border-white/10 bg-ink-950/50 py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-ink-400 focus:border-brand"
              />
            </label>
          )}
        />

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-300">Helpers</p>
            <p className="mt-2 text-2xl font-bold text-white">{helperCards.length}</p>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-300">Pending skills</p>
            <p className="mt-2 text-2xl font-bold text-white">{summary.totalPending}</p>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-300">Helpers needing review</p>
            <p className="mt-2 text-2xl font-bold text-white">{summary.helpersWithPending}</p>
          </div>
        </div>

        {isLoading ? <LoadingState label="Loading helpers..." /> : null}

        {!isLoading && !helperCards.length ? (
          <EmptyState
            title="No helpers found"
            description="Helper profiles will appear here once helpers create accounts in the shared Firebase project."
          />
        ) : null}

        {!isLoading && helperCards.length ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {helperCards.map(({ profile, serviceRows, pendingCount }) => (
              <button
                key={profile.uid}
                type="button"
                onClick={() => navigate(`/helpers/${profile.uid}`)}
                className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-left transition hover:border-white/20 hover:bg-white/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-white">{profile.fullName || profile.displayName || profile.email}</p>
                    <p className="mt-1 truncate text-sm text-ink-200">{profile.email}</p>
                    <p className="mt-2 text-xs text-ink-300">
                      {profile.businessName || profile.providerType || 'individual'}{profile.city ? ` - ${profile.city}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-ink-300">{helperAgreementLabel(profile)}</p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 text-ink-300" />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge tone={statusTone(profile.verificationStatus)}>{helperStateLabel(profile)}</Badge>
                  <Badge tone={profile.suspended ? 'danger' : 'neutral'}>{profile.suspended ? 'Blocked' : 'Active'}</Badge>
                  <Badge tone={pendingCount ? 'warning' : 'success'}>{pendingCount} pending</Badge>
                  <Badge tone="neutral">{serviceRows.length} skills</Badge>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

