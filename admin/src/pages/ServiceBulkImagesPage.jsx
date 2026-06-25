import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ImagePlus, Search, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Card, EmptyState, LoadingState, SectionTitle } from '../components/ui';
import {
  buildServiceCatalogView,
  subscribeToServiceCatalog,
  uploadSharedServiceCatalogImages,
} from '../services/serviceCatalogService';

function formatFileSize(bytes = 0) {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${value} B`;
}

function createStageId(file) {
  return `${file.name || 'image'}-${file.lastModified || Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = (error) => {
      URL.revokeObjectURL(objectUrl);
      reject(error);
    };
    image.src = objectUrl;
  });
}

async function optimizeImageFile(file) {
  const originalSize = Number(file?.size || 0);
  if (!file || originalSize <= 3 * 1024 * 1024) return file;

  try {
    const image = await loadImageFromFile(file);
    const longestEdge = Math.max(image.width || 0, image.height || 0);
    const scale = longestEdge > 2400 ? 2400 / longestEdge : 1;
    const width = Math.max(1, Math.round((image.width || 1) * scale));
    const height = Math.max(1, Math.round((image.height || 1) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(image, 0, 0, width, height);

    const preferredType = ['image/jpeg', 'image/webp'].includes(file.type) ? file.type : 'image/jpeg';
    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, preferredType, 0.9);
    });

    if (!blob || blob.size >= originalSize * 0.9) {
      return file;
    }

    return new File([blob], file.name, {
      type: preferredType,
      lastModified: file.lastModified || Date.now(),
    });
  } catch (_error) {
    return file;
  }
}

function ServiceAssignmentPicker({ services, selectedIds = [], onToggle }) {
  const [search, setSearch] = useState('');

  const filteredServices = useMemo(() => {
    const normalizedSearch = String(search || '').trim().toLowerCase();
    return services.filter((service) => {
      if (!normalizedSearch) return true;
      return [
        service.label,
        service.categoryName,
        service.description,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    });
  }, [search, services]);

  return (
    <div className="space-y-3 rounded-[20px] border border-white/10 bg-ink-950/30 p-4">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search services for this image"
          className="w-full rounded-2xl border border-white/10 bg-ink-950/50 py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-ink-400"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        {selectedIds.length ? selectedIds.map((serviceId) => {
          const service = services.find((item) => item.id === serviceId);
          if (!service) return null;
          return (
            <button
              key={serviceId}
              type="button"
              onClick={() => onToggle(serviceId)}
              className="rounded-full border border-brand/30 bg-brand/15 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-brand-soft"
            >
              {service.label}
            </button>
          );
        }) : (
          <p className="text-sm text-ink-300">No services selected yet. Selected images are the only ones that will be saved.</p>
        )}
      </div>

      <div className="max-h-56 overflow-y-auto rounded-[18px] border border-white/10">
        {filteredServices.length ? filteredServices.map((service) => {
          const isSelected = selectedIds.includes(service.id);
          return (
            <button
              key={service.id}
              type="button"
              onClick={() => onToggle(service.id)}
              className={`flex w-full items-start justify-between gap-3 border-b border-white/10 px-4 py-3 text-left last:border-b-0 ${
                isSelected ? 'bg-brand/10' : 'bg-transparent hover:bg-white/5'
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">{service.label}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink-300">{service.categoryName || 'Service'}</p>
              </div>
              <Badge tone={service.persisted ? 'success' : 'neutral'}>{service.persisted ? 'Saved' : 'Code only'}</Badge>
            </button>
          );
        }) : (
          <div className="px-4 py-6 text-sm text-ink-300">No matching services.</div>
        )}
      </div>
    </div>
  );
}

export default function ServiceBulkImagesPage() {
  const [catalogEntries, setCatalogEntries] = useState([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [stagedImages, setStagedImages] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const stagedImagesRef = useRef([]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    const connect = async () => {
      setIsLoadingCatalog(true);
      try {
        const cleanup = await subscribeToServiceCatalog((items) => {
          if (!cancelled) setCatalogEntries(items);
          setIsLoadingCatalog(false);
        }, () => {
          if (!cancelled) setCatalogEntries(buildServiceCatalogView([]));
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
      stagedImagesRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  useEffect(() => {
    stagedImagesRef.current = stagedImages;
  }, [stagedImages]);

  const sortedServices = useMemo(() => (
    [...catalogEntries].sort((left, right) => `${left.categoryName}-${left.label}`.localeCompare(`${right.categoryName}-${right.label}`))
  ), [catalogEntries]);

  const servicesById = useMemo(() => (
    sortedServices.reduce((accumulator, service) => {
      accumulator[service.id] = service;
      return accumulator;
    }, {})
  ), [sortedServices]);

  const assignedCount = stagedImages.filter((item) => item.serviceIds.length).length;
  const unassignedCount = stagedImages.length - assignedCount;

  const handleStageFiles = (event) => {
    const files = Array.from(event.target.files || []);
    if (event.target) event.target.value = '';
    if (!files.length) return;

    setMessage('');
    setStagedImages((current) => ([
      ...current,
      ...files.slice(0, 50).map((file) => ({
        id: createStageId(file),
        file,
        previewUrl: URL.createObjectURL(file),
        serviceIds: [],
      })),
    ]));
  };

  const handleToggleService = (stageId, serviceId) => {
    setStagedImages((current) => current.map((item) => (
      item.id !== stageId
        ? item
        : {
            ...item,
            serviceIds: item.serviceIds.includes(serviceId)
              ? item.serviceIds.filter((currentId) => currentId !== serviceId)
              : [...item.serviceIds, serviceId],
          }
    )));
  };

  const handleRemoveStage = (stageId) => {
    setStagedImages((current) => current.filter((item) => {
      if (item.id === stageId && item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return item.id !== stageId;
    }));
  };

  const handleSave = async () => {
    const assignedImages = stagedImages.filter((item) => item.serviceIds.length);
    if (!assignedImages.length) {
      setMessage('Assign at least one service to one image before saving.');
      return;
    }

    setIsSaving(true);
    setMessage('');

    try {
      const assignments = await Promise.all(assignedImages.map(async (item) => ({
        file: await optimizeImageFile(item.file),
        serviceIds: item.serviceIds,
      })));

      const results = await uploadSharedServiceCatalogImages({
        assignments,
        servicesById,
      });

      stagedImages.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      setStagedImages([]);
      setMessage(`Saved ${results.length} image${results.length === 1 ? '' : 's'} across ${results.reduce((total, item) => total + item.serviceIds.length, 0)} service assignment${results.reduce((total, item) => total + item.serviceIds.length, 0) === 1 ? '' : 's'}. Unassigned images were skipped.`);
    } catch (error) {
      setMessage(error?.message || 'Unable to save the uploaded images right now.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingCatalog) {
    return <LoadingState label="Loading service catalog..." />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle
          eyebrow="Bulk service images"
          title="Upload and assign images"
          description="Stage multiple pictures locally, assign each one to one or more services, then save them once to storage and attach the same image record across every selected service."
          action={(
            <Link
              to="/services"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to services
            </Link>
          )}
        />

        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="bg-white/7">
            <div className="space-y-4">
              <div className="rounded-[24px] border border-dashed border-white/10 bg-white/5 p-5">
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-lg font-bold text-white">Stage images first</p>
                    <p className="mt-1 text-sm leading-6 text-ink-200">
                      Images stay in local state until you click save. Files above roughly 3 MB are reduced only when the browser can make them smaller without a noticeable drop in quality.
                    </p>
                  </div>
                  <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white">
                    <ImagePlus className="h-4 w-4" />
                    Upload pictures
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleStageFiles}
                    />
                  </label>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-300">Staged</p>
                  <p className="mt-2 text-3xl font-bold text-white">{stagedImages.length}</p>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-300">Assigned</p>
                  <p className="mt-2 text-3xl font-bold text-white">{assignedCount}</p>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-300">Skipped</p>
                  <p className="mt-2 text-3xl font-bold text-white">{unassignedCount}</p>
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                <p className="font-bold text-white">Save behavior</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-200">
                  <li>Each assigned image uploads once to Firebase Storage.</li>
                  <li>The same image link is reused across every selected service.</li>
                  <li>Unassigned images are skipped and removed from the staged list after save.</li>
                </ul>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || !stagedImages.length}
                  className="rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                >
                  {isSaving ? 'Saving...' : 'Save uploads'}
                </button>
                {message ? <p className="text-sm font-bold text-brand-soft">{message}</p> : null}
              </div>
            </div>
          </Card>

          <Card className="bg-white/7">
            {stagedImages.length ? (
              <div className="space-y-4">
                {stagedImages.map((item, index) => (
                  <div key={item.id} className="grid gap-4 rounded-[24px] border border-white/10 bg-ink-950/30 p-4 xl:grid-cols-[280px_1fr]">
                    <div className="space-y-3">
                      <div className="overflow-hidden rounded-[20px] border border-white/10 bg-white/5">
                        <img src={item.previewUrl} alt={item.file.name || `Upload ${index + 1}`} className="h-56 w-full object-cover" />
                      </div>
                      <div>
                        <p className="truncate text-sm font-bold text-white">{item.file.name}</p>
                        <p className="mt-1 text-xs text-ink-300">{formatFileSize(item.file.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveStage(item.id)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove image
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={item.serviceIds.length ? 'success' : 'warning'}>
                          {item.serviceIds.length ? `${item.serviceIds.length} service${item.serviceIds.length === 1 ? '' : 's'} selected` : 'Needs assignment'}
                        </Badge>
                        {item.serviceIds.length > 1 ? <Badge tone="brand">Shared image</Badge> : null}
                      </div>
                      <ServiceAssignmentPicker
                        services={sortedServices}
                        selectedIds={item.serviceIds}
                        onToggle={(serviceId) => handleToggleService(item.id, serviceId)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No images staged"
                description="Upload pictures here, then assign each image to one or more services before saving."
              />
            )}
          </Card>
        </div>
      </Card>
    </div>
  );
}
