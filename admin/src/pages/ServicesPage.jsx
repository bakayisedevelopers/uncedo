import { useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, Search } from 'lucide-react';
import { Badge, Card, EmptyState, LoadingState, SectionTitle } from '../components/ui';
import { flattenProviderServices, listHelperProfiles, removeHelperSkill, updateHelperServiceStatus } from '../services/adminService';

function tone(status = '') {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'approved' || normalized === 'verified') return 'success';
  if (normalized === 'pending' || normalized === 'review') return 'warning';
  if (normalized === 'rejected') return 'danger';
  return 'neutral';
}

export default function ServicesPage() {
  const [helpers, setHelpers] = useState([]);
  const [search, setSearch] = useState('');
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

  const rows = useMemo(() => {
    const normalizedSearch = String(search || '').trim().toLowerCase();
    return flattenProviderServices(helpers).filter((row) => {
      if (!normalizedSearch) return true;
      return [
        row.skillName,
        row.serviceName,
        row.providerName,
        row.businessName,
        row.providerEmail,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    });
  }, [helpers, search]);

  const refresh = async () => {
    await load();
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
          eyebrow="Service review"
          title="All uploaded services"
          description="Flattened moderation view for every provider skill and its work photos."
          action={(
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search service, skill, or provider"
                className="w-full rounded-2xl border border-white/10 bg-ink-950/50 py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-ink-400 focus:border-brand"
              />
            </label>
          )}
        />

        {isLoading ? <LoadingState label="Loading services..." /> : null}

        {!isLoading && !rows.length ? (
          <EmptyState
            title="No services found"
            description="Provider skills will appear here as soon as helpers upload them."
          />
        ) : null}

        {!isLoading && rows.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {rows.map((row) => (
              <div key={`${row.providerUid}-${row.serviceId}-${row.skillId}`} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-lg font-bold text-white">{row.skillName}</p>
                    <p className="mt-1 text-sm text-ink-200">{row.serviceName} by {row.providerName}</p>
                    <p className="mt-1 text-xs text-ink-300">{row.businessName || row.providerType || 'individual'}{row.city ? ` - ${row.city}` : ''}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={tone(row.skillStatus)}>{row.skillStatus}</Badge>
                    <Badge tone={row.skillActive ? 'success' : 'neutral'}>{row.skillActive ? 'Active' : 'Paused'}</Badge>
                    <Badge tone={row.suspended ? 'danger' : 'neutral'}>{row.suspended ? 'Suspended' : 'Live'}</Badge>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                    Pause
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
                    onClick={() => deleteSkill(row)}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
