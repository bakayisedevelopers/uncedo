import { useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, Search } from 'lucide-react';
import { Badge, Card, EmptyState, LoadingState, SectionTitle } from '../components/ui';
import { flattenProviderServices, listHelperProfiles, removeHelperSkill, updateHelperServiceStatus } from '../services/adminService';
import {
  buildServiceCatalogView,
  deleteServiceCatalogImage,
  saveServiceCatalogEntry,
  subscribeToServiceCatalog,
  uploadServiceCatalogImages,
} from '../services/serviceCatalogService';

function tone(status = '') {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'approved' || normalized === 'verified') return 'success';
  if (normalized === 'pending' || normalized === 'review') return 'warning';
  if (normalized === 'rejected') return 'danger';
  return 'neutral';
}

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function formatPublishedState(entry) {
  if (!entry) return 'Draft';
  if (entry.active === false) return 'Paused';
  return 'Added';
}

export default function ServicesPage() {
  const [helpers, setHelpers] = useState([]);
  const [catalogEntries, setCatalogEntries] = useState([]);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [search, setSearch] = useState('');
  const [isLoadingHelpers, setIsLoadingHelpers] = useState(true);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [message, setMessage] = useState('');
  const [draftLabel, setDraftLabel] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftActive, setDraftActive] = useState(true);
  const [draftFiles, setDraftFiles] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const loadHelpers = async () => {
      setIsLoadingHelpers(true);
      try {
        const items = await listHelperProfiles();
        if (!cancelled) {
          setHelpers(items);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingHelpers(false);
        }
      }
    };

    loadHelpers();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    const connect = async () => {
      setIsLoadingCatalog(true);
      try {
        const cleanup = await subscribeToServiceCatalog((items) => {
          if (!cancelled) {
            setCatalogEntries(items);
          }
          setIsLoadingCatalog(false);
        }, () => {
          if (!cancelled) {
            setCatalogEntries(buildServiceCatalogView([]));
          }
          setIsLoadingCatalog(false);
        });
        unsubscribe = typeof cleanup === 'function' ? cleanup : () => {};
      } catch (_error) {
        if (!cancelled) {
          setCatalogEntries(buildServiceCatalogView([]));
          setIsLoadingCatalog(false);
        }
      }
    };

    connect();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const selectedService = useMemo(
    () => catalogEntries.find((item) => item.id === selectedServiceId) || catalogEntries[0] || null,
    [catalogEntries, selectedServiceId],
  );

  useEffect(() => {
    if (!selectedService?.id) return;
    setSelectedServiceId(selectedService.id);
  }, [selectedService?.id]);

  useEffect(() => {
    if (!selectedService) return;
    setDraftLabel(selectedService.label || '');
    setDraftDescription(selectedService.description || '');
    setDraftActive(selectedService.active !== false);
    setDraftFiles([]);
    setMessage('');
  }, [selectedService?.id]);

  const filteredCatalog = useMemo(() => {
    const normalizedSearch = String(search || '').trim().toLowerCase();
    return [...catalogEntries]
      .filter((entry) => {
        if (!normalizedSearch) return true;
        return [
          entry.label,
          entry.categoryName,
          entry.description,
        ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
      })
      .sort((left, right) => `${left.categoryName}-${left.label}`.localeCompare(`${right.categoryName}-${right.label}`));
  }, [catalogEntries, search]);

  const helperRows = useMemo(() => {
    if (!selectedService) return [];
    const selectedKey = slugify(selectedService.id);
    return flattenProviderServices(helpers).filter((row) => {
      const rowKey = slugify(row.catalogId || row.skillName || '');
      return rowKey === selectedKey || row.catalogId === selectedService.id;
    });
  }, [helpers, selectedService]);

  const pendingHelperRows = useMemo(
    () => helperRows.filter((row) => row.skillStatus === 'pending' || row.skillStatus === 'review'),
    [helperRows],
  );

  const refreshHelpers = async () => {
    const items = await listHelperProfiles();
    setHelpers(items);
  };

  const handleServiceSave = async (overrides = {}) => {
    if (!selectedService) return;
    const nextActive = typeof overrides.active === 'boolean' ? overrides.active : draftActive;
    setIsMutating(true);
    setMessage('');

    try {
      const uploads = draftFiles.length
        ? await uploadServiceCatalogImages({ serviceId: selectedService.id, files: draftFiles })
        : [];
      const images = [...(selectedService.images || []), ...uploads].slice(0, 10);
      const saved = await saveServiceCatalogEntry(selectedService.id, {
        categoryId: selectedService.categoryId,
        categoryName: selectedService.categoryName,
        label: String(draftLabel || selectedService.label || '').trim(),
        description: String(draftDescription || '').trim(),
        active: nextActive,
        approved: true,
        images,
      });

      if (saved) {
        setCatalogEntries((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)));
        setSelectedServiceId(saved.id);
      }

      setMessage('Service saved to Firestore.');
      setDraftFiles([]);
      await refreshHelpers();
    } catch (error) {
      setMessage(error.message || 'Unable to save this service.');
    } finally {
      setIsMutating(false);
    }
  };

  const handleToggleService = async (nextActive) => {
    setDraftActive(nextActive);
    await handleServiceSave({ active: nextActive });
  };

  const handleDeleteImage = async (picture) => {
    if (!selectedService || !picture?.id) return;
    setIsMutating(true);
    setMessage('');

    try {
      if (picture.objectPath) {
        await deleteServiceCatalogImage(picture.objectPath);
      }

      const images = (selectedService.images || []).filter((entry) => entry.id !== picture.id);
      const saved = await saveServiceCatalogEntry(selectedService.id, {
        categoryId: selectedService.categoryId,
        categoryName: selectedService.categoryName,
        label: selectedService.label,
        description: selectedService.description,
        active: selectedService.active !== false,
        approved: true,
        images,
      });

      if (saved) {
        setCatalogEntries((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)));
      }
      setMessage('Image removed.');
    } catch (error) {
      setMessage(error.message || 'Unable to remove that image.');
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
      await refreshHelpers();
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
      await refreshHelpers();
    } finally {
      setIsMutating(false);
    }
  };

  const remainingUploads = Math.max(0, 10 - (selectedService?.images?.length || 0));

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle
          eyebrow="Service review"
          title="Services"
          description="Manage the publishable service catalog, upload admin-owned images, and review helper approvals underneath each service."
          action={(
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search service, category, or description"
                className="w-full rounded-2xl border border-white/10 bg-ink-950/50 py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-ink-400 focus:border-brand"
              />
            </label>
          )}
        />

        {isLoadingCatalog || isLoadingHelpers ? <LoadingState label="Loading services..." /> : null}

        {!isLoadingCatalog && filteredCatalog.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredCatalog.map((item) => {
              const rowCount = helperRows.filter((row) => slugify(row.catalogId || row.skillName || '') === slugify(item.id)).length;
              const activeRow = selectedService?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedServiceId(item.id)}
                  className={`rounded-[24px] border p-4 text-left transition ${
                    activeRow
                      ? 'border-brand/40 bg-brand/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-300">{item.categoryName || 'Service'}</p>
                      <p className="mt-2 text-lg font-bold text-white">{item.label}</p>
                      <p className="mt-1 text-sm leading-6 text-ink-200">{item.description || 'No description yet.'}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Badge tone={item.active === false ? 'neutral' : 'success'}>{formatPublishedState(item)}</Badge>
                      <Badge tone={rowCount ? 'brand' : 'neutral'}>{rowCount} helper{rowCount === 1 ? '' : 's'}</Badge>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge tone={item.images.length ? 'success' : 'neutral'}>{item.images.length} image{item.images.length === 1 ? '' : 's'}</Badge>
                    <Badge tone={item.approved ? 'success' : 'warning'}>{item.approved ? 'Published' : 'Draft'}</Badge>
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}

        {!isLoadingCatalog && !filteredCatalog.length ? (
          <EmptyState
            title="No services found"
            description="The admin catalog has not been created yet."
          />
        ) : null}
      </Card>

      {selectedService ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <Card>
            <SectionTitle
              eyebrow="Catalog item"
              title={selectedService.label}
              description="Edit the service metadata, upload up to 10 admin images, and publish it for helpers."
            />

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Service name</span>
                <input
                  value={draftLabel}
                  onChange={(event) => setDraftLabel(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none placeholder:text-ink-400 focus:border-brand"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Category</span>
                <input
                  value={selectedService.categoryName || ''}
                  disabled
                  className="w-full cursor-not-allowed rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-ink-200 outline-none"
                />
              </label>
            </div>

            <label className="mt-4 block space-y-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Description</span>
              <textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                rows={4}
                className="w-full rounded-[22px] border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none placeholder:text-ink-400 focus:border-brand"
              />
            </label>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => handleToggleService(!draftActive)}
                disabled={isMutating}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {draftActive ? 'Pause service' : 'Publish service'}
              </button>
              <button
                type="button"
                onClick={handleServiceSave}
                disabled={isMutating}
                className="rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {selectedService.images.length ? 'Save changes' : 'Add service'}
              </button>
            </div>

            <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-white/5 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-bold text-white">Service images</p>
                  <p className="mt-1 text-sm text-ink-200">
                    Upload up to {remainingUploads} more image{remainingUploads === 1 ? '' : 's'} for this service.
                  </p>
                </div>
                <label className="inline-flex cursor-pointer items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white">
                  Upload images
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const files = Array.from(event.target.files || []);
                      const limitedFiles = files.slice(0, Math.max(0, 10 - (selectedService.images?.length || 0)));
                      setDraftFiles(limitedFiles);
                      if (event.target) {
                        event.target.value = '';
                      }
                    }}
                  />
                </label>
              </div>

              {draftFiles.length ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {draftFiles.map((file) => (
                    <div key={`${file.name}-${file.lastModified}`} className="rounded-[20px] border border-white/10 bg-ink-950/40 px-4 py-3">
                      <p className="text-sm font-bold text-white">{file.name}</p>
                      <p className="mt-1 text-xs text-ink-300">{Math.ceil(file.size / 1024)} KB</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {message ? <p className="mt-3 text-sm font-bold text-brand-soft">{message}</p> : null}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {(selectedService.images || []).length ? selectedService.images.map((picture) => (
                <div key={picture.id} className="overflow-hidden rounded-[20px] border border-white/10 bg-white/5">
                  <img src={picture.uri} alt={selectedService.label} className="h-40 w-full object-cover" />
                  <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-ink-300">
                    <span>{picture.uploadedAt ? new Date(picture.uploadedAt).toLocaleDateString() : 'Uploaded'}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteImage(picture)}
                      disabled={isMutating}
                      className="inline-flex items-center gap-1 font-bold text-white disabled:opacity-60"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                </div>
              )) : (
                <EmptyState
                  title="No service images yet"
                  description="Upload the first admin images to make this service visible in the helper catalog and customer feed."
                />
              )}
            </div>
          </Card>

          <Card>
            <SectionTitle
              eyebrow="Helper approvals"
              title="Submitted helper skills"
              description="These helper profiles have requested this service and need an admin decision."
            />

            <div className="space-y-3">
              <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-white">{helperRows.length} helper submission{helperRows.length === 1 ? '' : 's'}</p>
                    <p className="mt-1 text-sm text-ink-200">{pendingHelperRows.length} waiting for review</p>
                  </div>
                  <Badge tone={pendingHelperRows.length ? 'warning' : 'success'}>{pendingHelperRows.length ? 'Needs review' : 'Up to date'}</Badge>
                </div>
              </div>

              {helperRows.length ? helperRows.map((row) => (
                <div key={`${row.providerUid}-${row.skillId}`} className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-lg font-bold text-white">{row.providerName}</p>
                      <p className="mt-1 text-sm text-ink-200">{row.skillName} in {row.serviceName}</p>
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
                      Decline
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
              )) : (
                <EmptyState
                  title="No helper submissions yet"
                  description="Once helpers add this service to their profile, their request will show up here for approval."
                />
              )}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
