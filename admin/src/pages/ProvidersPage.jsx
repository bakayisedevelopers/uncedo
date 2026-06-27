import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Check,
  ChevronRight,
  Image as ImageIcon,
  Pause,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Badge, Card, EmptyState, LoadingState, SectionTitle } from '../components/ui';
import {
  flattenProviderServices,
  listHelperProfiles,
  removeHelperSkill,
  updateHelperModeration,
  updateHelperServiceStatus,
} from '../services/adminService';

function statusTone(status = '') {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'verified' || normalized === 'approved') return 'success';
  if (normalized === 'pending' || normalized === 'review') return 'warning';
  if (normalized === 'rejected' || normalized === 'suspended') return 'danger';
  return 'neutral';
}

function providerStateLabel(profile) {
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

export default function ProvidersPage() {
  const [helpers, setHelpers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const items = await listHelperProfiles();
      setHelpers(items);
      setSelectedId((current) => current || items[0]?.uid || '');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selected = helpers.find((item) => item.uid === selectedId) || helpers[0] || null;

  const providerCards = useMemo(() => {
    const normalizedSearch = String(search || '').trim().toLowerCase();
    return helpers.filter((item) => {
      if (!normalizedSearch) return true;
      return [
        item.fullName,
        item.displayName,
        item.email,
        item.businessName,
        item.city,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    });
  }, [helpers, search]);

  const serviceRows = useMemo(() => flattenProviderServices(selected ? [selected] : []), [selected]);

  const refresh = async () => {
    await load();
  };

  const applyProviderPatch = async (updates) => {
    if (!selected?.uid) return;
    setIsMutating(true);
    try {
      await updateHelperModeration(selected.uid, updates);
      await refresh();
    } finally {
      setIsMutating(false);
    }
  };

  const applySkillPatch = async (row, updates) => {
    setIsMutating(true);
    try {
      await updateHelperServiceStatus({
        uid: row.providerUid,
        serviceId: row.serviceId,
        skillId: row.skillId,
        updates,
      });
      await refresh();
    } finally {
      setIsMutating(false);
    }
  };

  const deleteSkill = async (row) => {
    setIsMutating(true);
    try {
      await removeHelperSkill({
        uid: row.providerUid,
        serviceId: row.serviceId,
        skillId: row.skillId,
      });
      await refresh();
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle
          eyebrow="Directory"
          title="Provider moderation"
          description="Inspect helper profiles, business details, and service-level approvals."
          action={(
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search providers"
                className="w-full rounded-2xl border border-white/10 bg-ink-950/50 py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-ink-400 focus:border-brand"
              />
            </label>
          )}
        />

        {isLoading ? <LoadingState label="Loading providers..." /> : null}

        {!isLoading && !providerCards.length ? (
          <EmptyState
            title="No providers found"
            description="Provider profiles will appear here once helpers create accounts in the shared Firebase project."
          />
        ) : null}

        {!isLoading && providerCards.length ? (
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-3">
              {providerCards.map((profile) => {
                const serviceCount = flattenProviderServices([profile]).length;
                const selectedRow = profile.uid === selectedId;
                return (
                  <button
                    key={profile.uid}
                    type="button"
                    onClick={() => setSelectedId(profile.uid)}
                    className={`w-full rounded-[24px] border p-4 text-left transition ${
                      selectedRow
                        ? 'border-brand/30 bg-brand/10'
                        : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                    }`}
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
                      <Badge tone={statusTone(profile.verificationStatus)}>{providerStateLabel(profile)}</Badge>
                      <Badge tone={profile.suspended ? 'danger' : 'neutral'}>{profile.suspended ? 'Blocked' : 'Active'}</Badge>
                      <Badge tone="neutral">{serviceCount} skills</Badge>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="space-y-4">
              {selected ? (
                <>
                  <Card className="bg-white/7">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-brand-soft/80">Provider profile</p>
                        <h3 className="mt-2 text-2xl font-bold text-white">{selected.fullName || selected.displayName || selected.email}</h3>
                        <p className="mt-1 text-sm text-ink-200">{selected.email}</p>
                        <p className="mt-2 text-sm text-ink-300">
                          {selected.providerType || 'individual'}{selected.businessName ? ` - ${selected.businessName}` : ''}{selected.city ? ` - ${selected.city}` : ''}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge tone={statusTone(selected.verificationStatus)}>{providerStateLabel(selected)}</Badge>
                        <Badge tone={selected.suspended ? 'danger' : 'success'}>{selected.suspended ? 'Suspended' : 'Available'}</Badge>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {[
                        ['Phone', selected.phoneNumber || 'Not set'],
                        ['Address', selected.homeAddress || selected.customerProfile?.serviceAddress || 'Not set'],
                        ['Role', selected.activeRole || selected.role || 'helper'],
                        ['Service count', String(serviceRows.length)],
                        ['Agreement', helperAgreementLabel(selected)],
                        ['Business', selected.businessName || 'Not a business profile'],
                        ['Account', selected.suspended ? 'Suspended' : 'Active'],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-[20px] border border-white/10 bg-white/5 p-4">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-300">{label}</p>
                          <p className="mt-2 text-sm text-white">{value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => applyProviderPatch({ verificationStatus: 'verified', suspended: false, adminStatus: 'active' })}
                        className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Verify
                      </button>
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => applyProviderPatch({ verificationStatus: 'rejected', suspended: false, adminStatus: 'review' })}
                        className="inline-flex items-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-2.5 text-sm font-bold text-amber-100 disabled:opacity-60"
                      >
                        <ShieldAlert className="h-4 w-4" />
                        Mark review
                      </button>
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => applyProviderPatch({ suspended: true, adminStatus: 'suspended', onlineStatus: 'offline' })}
                        className="inline-flex items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-2.5 text-sm font-bold text-rose-100 disabled:opacity-60"
                      >
                        <Ban className="h-4 w-4" />
                        Suspend
                      </button>
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => applyProviderPatch({ suspended: false, adminStatus: 'active' })}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                      >
                        <Check className="h-4 w-4" />
                        Restore
                      </button>
                    </div>
                  </Card>

                  <Card>
                    <SectionTitle
                      eyebrow="Services"
                      title="Provider skills and photos"
                      description="Each row shows the service, its work photos, and the moderation controls."
                    />

                    {serviceRows.length ? (
                      <div className="space-y-4">
                        {serviceRows.map((row) => (
                          <div key={`${row.providerUid}-${row.serviceId}-${row.skillId}`} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div className="min-w-0">
                                <p className="text-base font-bold text-white">{row.skillName}</p>
                                <p className="mt-1 text-sm text-ink-200">{row.serviceName}</p>
                                <p className="mt-1 text-xs text-ink-300">{row.serviceDescription || 'No service description saved.'}</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Badge tone={statusTone(row.skillStatus)}>{row.skillStatus}</Badge>
                                <Badge tone={row.skillActive ? 'success' : 'neutral'}>{row.skillActive ? 'Active' : 'Paused'}</Badge>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                              {(row.pictures || []).length ? row.pictures.map((picture) => (
                                <a
                                  key={picture.id}
                                  href={picture.uri}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="overflow-hidden rounded-[20px] border border-white/10 bg-ink-950/40"
                                >
                                  <img src={picture.uri} alt={row.skillName} className="h-40 w-full object-cover" />
                                  <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-ink-300">
                                    <span>{picture.uploadedAt ? new Date(picture.uploadedAt).toLocaleDateString() : 'Uploaded'}</span>
                                    <span className="inline-flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" /> Open</span>
                                  </div>
                                </a>
                              )) : (
                                <div className="rounded-[20px] border border-dashed border-white/10 bg-white/5 p-4 text-sm text-ink-200 sm:col-span-2">
                                  No work photos were uploaded for this skill.
                                </div>
                              )}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={isMutating}
                                onClick={() => applySkillPatch(row, { status: 'approved', active: true, verified: true })}
                                className="rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={isMutating}
                                onClick={() => applySkillPatch(row, { status: 'rejected', active: false, verified: false })}
                                className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-2.5 text-sm font-bold text-rose-100 disabled:opacity-60"
                              >
                                Disapprove
                              </button>
                              <button
                                type="button"
                                disabled={isMutating}
                                onClick={() => applySkillPatch(row, { status: 'pending', active: false })}
                                className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-2.5 text-sm font-bold text-amber-100 disabled:opacity-60"
                              >
                                Pause
                              </button>
                              <button
                                type="button"
                                disabled={isMutating}
                                onClick={() => deleteSkill(row)}
                                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                              >
                                <Trash2 className="h-4 w-4" />
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        title="No services yet"
                        description="This provider has not uploaded any service skills with work pictures."
                      />
                    )}
                  </Card>
                </>
              ) : (
                <EmptyState title="Select a provider" description="Choose a provider to review their profile and services." />
              )}
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
