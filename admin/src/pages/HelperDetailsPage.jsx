import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Image as ImageIcon, Pause, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Badge, Card, EmptyState, LoadingState, SectionTitle } from '../components/ui';
import {
  flattenProviderServices,
  listHelperProfiles,
  removeHelperSkill,
  updateHelperModeration,
  updateHelperServiceStatus,
} from '../services/adminService';
import {
  groupRowsByService,
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

export default function HelperDetailsPage() {
  const navigate = useNavigate();
  const { helperId } = useParams();
  const [searchParams] = useSearchParams();
  const [helpers, setHelpers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);

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

  const selected = helpers.find((item) => item.uid === helperId) || null;
  const focusedServiceId = searchParams.get('serviceId') || '';

  const serviceRows = useMemo(() => flattenProviderServices(selected ? [selected] : []), [selected]);
  const serviceGroups = useMemo(() => groupRowsByService(serviceRows), [serviceRows]);
  const pendingCount = useMemo(
    () => serviceRows.filter((row) => isPendingSkillStatus(row.skillStatus)).length,
    [serviceRows],
  );

  const applyProviderPatch = async (updates) => {
    if (!selected?.uid) return;
    setIsMutating(true);
    try {
      await updateHelperModeration(selected.uid, updates);
      await load();
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
      await load();
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
      await load();
    } finally {
      setIsMutating(false);
    }
  };

  if (isLoading && !selected) {
    return <LoadingState label="Loading helper details..." />;
  }

  if (!selected && !isLoading) {
    return (
      <EmptyState
        title="Helper not found"
        description="This helper profile is not available in the live directory yet."
        action={(
          <Link
            to="/helpers"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to helpers
          </Link>
        )}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle
          eyebrow="Helper details"
          title={selected.fullName || selected.displayName || selected.email}
          description="Review the helper profile, then expand the collapsible service submissions below."
          action={(
            <div className="flex flex-wrap gap-2">
              <Link
                to="/helpers"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to helpers
              </Link>
              {focusedServiceId ? (
                <Link
                  to={`/services/${focusedServiceId}`}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white"
                >
                  Open service
                </Link>
              ) : null}
            </div>
          )}
        />

        <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
          <Card className="bg-white/7">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-brand-soft/80">Helper profile</p>
                <h3 className="mt-2 text-2xl font-bold text-white">{selected.fullName || selected.displayName || selected.email}</h3>
                <p className="mt-1 text-sm text-ink-200">{selected.email}</p>
                <p className="mt-2 text-sm text-ink-300">
                  {selected.providerType || 'individual'}{selected.businessName ? ` - ${selected.businessName}` : ''}{selected.city ? ` - ${selected.city}` : ''}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge tone={statusTone(selected.verificationStatus)}>{helperStateLabel(selected)}</Badge>
                <Badge tone={selected.suspended ? 'danger' : 'success'}>{selected.suspended ? 'Suspended' : 'Available'}</Badge>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[
                ['Phone', selected.phoneNumber || 'Not set'],
                ['Address', selected.homeAddress || selected.customerProfile?.serviceAddress || 'Not set'],
                ['Role', selected.activeRole || selected.role || 'helper'],
                ['Service count', String(serviceRows.length)],
                ['Pending skills', String(pendingCount)],
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
                <ShieldAlert className="h-4 w-4" />
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
              eyebrow="Service submissions"
              title="Collapsible skills"
              description="Each service expands into its individual skill submissions with photos and moderation actions."
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-300">Skills</p>
                <p className="mt-2 text-2xl font-bold text-white">{serviceRows.length}</p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-300">Pending</p>
                <p className="mt-2 text-2xl font-bold text-white">{pendingCount}</p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-300">Services</p>
                <p className="mt-2 text-2xl font-bold text-white">{serviceGroups.length}</p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {serviceGroups.length ? serviceGroups.map((group) => (
                <Card key={group.serviceId} className="bg-white/7">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="text-base font-bold text-white">{group.serviceName}</p>
                      <p className="mt-1 text-sm text-ink-200">{group.serviceDescription || 'No service description saved.'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={group.pendingCount ? 'warning' : 'success'}>{group.pendingCount} pending</Badge>
                      <Badge tone={group.totalCount ? 'brand' : 'neutral'}>{group.totalCount} skill{group.totalCount === 1 ? '' : 's'}</Badge>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {group.rows.map((row, index) => {
                      const defaultOpen = focusedServiceId === group.serviceId && index === 0;

                      return (
                        <details key={row.skillId} open={defaultOpen} className="rounded-[20px] border border-white/10 bg-white/5">
                          <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer rounded-[20px] px-4 py-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-white">{row.skillName}</p>
                                <p className="mt-1 text-xs text-ink-300">{row.serviceName}</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Badge tone={statusTone(row.skillStatus)}>{row.skillStatus}</Badge>
                                <Badge tone={row.skillActive ? 'success' : 'neutral'}>{row.skillActive ? 'Active' : 'Paused'}</Badge>
                                <Badge tone={row.suspended ? 'danger' : 'neutral'}>{row.suspended ? 'Suspended' : 'Live'}</Badge>
                              </div>
                            </div>
                          </summary>

                          <div className="border-t border-white/10 px-4 pb-4 pt-4">
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                                  No photos uploaded for this skill.
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
                                onClick={() => applySkillPatch(row, { status: 'pending', active: false })}
                                className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-2.5 text-sm font-bold text-amber-100 disabled:opacity-60"
                              >
                                <Pause className="mr-2 inline-block h-4 w-4" />
                                Pause
                              </button>
                              <button
                                type="button"
                                disabled={isMutating}
                                onClick={() => applySkillPatch(row, { status: 'rejected', active: false, verified: false })}
                                className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-2.5 text-sm font-bold text-rose-100 disabled:opacity-60"
                              >
                                Decline
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
                        </details>
                      );
                    })}
                  </div>
                </Card>
              )) : (
                <EmptyState
                  title="No services yet"
                  description="This helper has not uploaded any service skills with work pictures."
                />
              )}
            </div>
          </Card>
        </div>
      </Card>
    </div>
  );
}

