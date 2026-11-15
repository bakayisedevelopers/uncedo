import { useMemo, useRef, useState } from 'react';
import { ImagePlus, Layers, Plus, Search, Trash2, Check } from 'lucide-react';
import {
  buildHelperServiceOfferingId,
  deleteStorageObject,
  removeHelperServiceOffering,
  saveHelperServiceOffering,
  uploadHelperFile,
} from '../../services/helperDataService';

export function StepServicesPortfolio({ user, catalog, offerings, onCompleteNext }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedOptionIds, setSelectedOptionIds] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const photoInputRef = useRef(null);

  const catalogById = useMemo(
    () => new Map(catalog.map((item) => [String(item.id || '').toLowerCase(), item])),
    [catalog],
  );

  const selectedService = useMemo(
    () => catalog.find((item) => item.id === selectedServiceId) || null,
    [catalog, selectedServiceId],
  );

  const requiresOptionPick = Boolean(
    selectedService
      && Array.isArray(selectedService.options)
      && selectedService.options.length > 0
      && selectedService.optionApplicationMode !== 'unified',
  );

  const inheritsBundleImages = Boolean(
    selectedService && selectedService.type === 'bundle' && selectedService.inheritBundleImages !== false,
  );

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (item) =>
        item.label.toLowerCase().includes(q)
        || item.categoryName.toLowerCase().includes(q)
        || item.description.toLowerCase().includes(q),
    );
  }, [catalog, searchQuery]);

  const toggleOption = (optionId) => {
    setSelectedOptionIds((prev) =>
      prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId],
    );
  };

  const handleSelectFiles = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    const valid = files.filter((f) => ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(String(f.type || '').toLowerCase()) && f.size <= 8 * 1024 * 1024);
    if (valid.length !== files.length) {
      setError('Some files were skipped. Only JPG, PNG, or WEBP images under 8 MB are allowed.');
    } else {
      setError('');
    }
    setPendingFiles((prev) => [...prev, ...valid].slice(0, 10));
  };

  const handleSubmitOffering = async () => {
    if (!selectedService) {
      setError('Select a service from the catalogue first.');
      return;
    }
    if (requiresOptionPick && selectedOptionIds.length === 0) {
      setError(`Select at least one service option under ${selectedService.label}.`);
      return;
    }
    if (!inheritsBundleImages && pendingFiles.length === 0) {
      setError('Upload at least one real work photo for this service application.');
      return;
    }

    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const targets = requiresOptionPick
        ? selectedService.options.filter((opt) => selectedOptionIds.includes(opt.id))
        : [{ id: '', title: '' }];

      for (const opt of targets) {
        const optionId = opt.id || '';
        const pathPrefix = optionId
          ? `helper-services/${selectedService.id}/${optionId}`
          : `helper-services/${selectedService.id}`;
        const existingOffering = offerings.find(
          (o) => o.id === buildHelperServiceOfferingId(user.uid, selectedService.id, optionId),
        );
        const existingPhotos = Array.isArray(existingOffering?.photos) ? existingOffering.photos : [];
        const uploadedPhotos = [];
        for (const file of pendingFiles) {
          const uploaded = await uploadHelperFile({
            uid: user.uid,
            file,
            pathPrefix,
          });
          uploadedPhotos.push(uploaded);
        }
        const mergedPhotos = [...existingPhotos, ...uploadedPhotos].slice(0, 10);
        await saveHelperServiceOffering({
          helperId: user.uid,
          serviceId: selectedService.id,
          categoryId: selectedService.categoryId || selectedService.id,
          serviceName: selectedService.label,
          optionId,
          optionTitle: opt.title || '',
          photos: mergedPhotos,
        });
      }

      setNotice(`Saved ${targets.length} service offering${targets.length > 1 ? 's' : ''} for Uncedo admin review.`);
      setSelectedServiceId('');
      setSelectedOptionIds([]);
      setPendingFiles([]);
    } catch (err) {
      setError(err?.message || 'Unable to save service offering right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddPhotosToExisting = async (offering, event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setSubmitting(true);
    setError('');
    try {
      const pathPrefix = offering.optionId
        ? `helper-services/${offering.serviceId}/${offering.optionId}`
        : `helper-services/${offering.serviceId}`;
      const uploaded = [];
      for (const file of files) {
        if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(String(file.type || '').toLowerCase())) continue;
        uploaded.push(await uploadHelperFile({ uid: user.uid, file, pathPrefix }));
      }
      if (!uploaded.length) {
        throw new Error('Select valid JPG, PNG, or WEBP photos.');
      }
      await saveHelperServiceOffering({
        helperId: user.uid,
        serviceId: offering.serviceId,
        categoryId: offering.categoryId,
        serviceName: offering.serviceName,
        optionId: offering.optionId,
        optionTitle: offering.optionTitle,
        photos: [...(offering.photos || []), ...uploaded].slice(0, 10),
      });
      setNotice(`Added ${uploaded.length} photo(s) to ${offering.serviceName}.`);
    } catch (err) {
      setError(err?.message || 'Failed to add portfolio photos.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteOffering = async (offering) => {
    setDeletingId(offering.id);
    setError('');
    try {
      for (const photo of offering.photos || []) {
        if (photo?.objectPath) {
          await deleteStorageObject(photo.objectPath).catch(() => null);
        }
      }
      await removeHelperServiceOffering(offering.id);
      setNotice(`Removed ${offering.serviceName}${offering.optionTitle ? ` — ${offering.optionTitle}` : ''}.`);
    } catch (err) {
      setError(err?.message || 'Unable to remove this offering right now.');
    } finally {
      setDeletingId('');
    }
  };

  const hasValidSubmittedOffering = offerings.some((item) => {
    if (['declined', 'removed'].includes(item.status)) return false;
    const entry = catalogById.get(String(item.serviceId || '').toLowerCase());
    const inherited = entry?.type === 'bundle' && entry?.inheritBundleImages !== false;
    return inherited || (Array.isArray(item.photos) && item.photos.length > 0);
  });

  return (
    <div className="space-y-7">
      {offerings.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">
              Your submitted services ({offerings.length})
            </h3>
            <span className="text-xs text-ink-500">Work photos required for approval</span>
          </div>

          <div className="divide-y divide-border rounded-xl border border-border bg-surface">
            {offerings.map((offering) => {
              const catalogEntry = catalogById.get(String(offering.serviceId || '').toLowerCase());
              const isInherited = catalogEntry?.type === 'bundle' && catalogEntry?.inheritBundleImages !== false;
              const photoCount = Array.isArray(offering.photos) ? offering.photos.length : 0;

              return (
                <div key={offering.id} className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-900">
                      <span>{offering.serviceName}</span>
                      {offering.optionTitle && (
                        <>
                          <span className="text-ink-400 font-normal">·</span>
                          <span className="font-medium text-tealbrand-700">{offering.optionTitle}</span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-ink-500 flex flex-wrap items-center gap-2">
                      <span
                        className={
                          offering.status === 'approved'
                            ? 'text-tealbrand-700 font-semibold'
                            : offering.status === 'declined'
                              ? 'text-red-700 font-semibold'
                              : 'text-amber-800 font-semibold'
                        }
                      >
                        {offering.status === 'approved'
                          ? 'Approved'
                          : offering.status === 'declined'
                            ? 'Declined'
                            : 'Pending review'}
                      </span>
                      <span>·</span>
                      <span>
                        {isInherited
                          ? 'Inherits approved bundle photos'
                          : `${photoCount} work photo${photoCount === 1 ? '' : 's'}`}
                      </span>
                    </div>
                    {offering.declineReason && (
                      <p className="text-xs text-red-700">Reason: {offering.declineReason}</p>
                    )}

                    {photoCount > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1.5">
                        {offering.photos.map((photo, idx) => (
                          <img
                            key={photo.id || idx}
                            src={photo.uri || photo.downloadUrl}
                            alt="Work sample"
                            referrerPolicy="no-referrer"
                            className="h-14 w-14 rounded-lg border border-border object-cover"
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isInherited && (
                      <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-surface hover:bg-well text-xs font-semibold text-ink-700">
                        <ImagePlus className="h-3.5 w-3.5 text-tealbrand-700" />
                        Add Photos
                        <input
                          type="file"
                          multiple
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => handleAddPhotosToExisting(offering, e)}
                          className="hidden"
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteOffering(offering)}
                      disabled={deletingId === offering.id}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-border bg-surface hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-xs font-semibold text-ink-500 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-well/60 p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
              <Layers className="h-4 w-4 text-tealbrand-700" />
              Add a service from the Uncedo catalogue
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">
              Select a service, pick applicable packages/options, and attach photos of your completed work.
            </p>
          </div>
          <div className="relative w-full sm:w-60">
            <Search className="h-4 w-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter services…"
              className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-ink-900 focus:border-tealbrand-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
          {filteredCatalog.map((entry) => {
            const active = entry.id === selectedServiceId;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  setSelectedServiceId(entry.id);
                  setSelectedOptionIds([]);
                  setPendingFiles([]);
                  setError('');
                }}
                className={`text-left p-3.5 rounded-lg border transition-colors ${
                  active
                    ? 'border-tealbrand-600 bg-surface ring-2 ring-tealbrand-600/20'
                    : 'border-border bg-surface hover:border-ink-400/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-ink-900">{entry.label}</span>
                  {active && <Check className="h-4 w-4 text-tealbrand-700 shrink-0 mt-0.5" />}
                </div>
                <div className="text-xs text-ink-500 mt-1">
                  {entry.categoryName || entry.categoryId}
                  {entry.options?.length > 0 ? ` · ${entry.options.length} option${entry.options.length > 1 ? 's' : ''}` : ''}
                </div>
              </button>
            );
          })}
          {filteredCatalog.length === 0 && (
            <div className="sm:col-span-2 text-sm text-ink-500 py-6 text-center">
              No matching active services found in catalogue.
            </div>
          )}
        </div>

        {selectedService && (
          <div className="pt-5 border-t border-border space-y-5">
            {requiresOptionPick && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-2.5">
                  Select options you offer for {selectedService.label}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedService.options.map((opt) => {
                    const checked = selectedOptionIds.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleOption(opt.id)}
                        className={`text-left px-3.5 py-2.5 rounded-lg border flex items-center justify-between gap-2 text-sm ${
                          checked
                            ? 'border-tealbrand-600 bg-tealbrand-50/75 text-ink-900 font-medium'
                            : 'border-border bg-surface text-ink-700'
                        }`}
                      >
                        <span className="truncate">{opt.title}</span>
                        <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                          checked ? 'bg-tealbrand-600 border-tealbrand-600 text-white' : 'border-border bg-surface'
                        }`}>
                          {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {!inheritsBundleImages ? (
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                    Work portfolio photos (1 to 10 photos)
                  </span>
                  <span className="tabular-nums-mono text-xs text-ink-500">
                    {pendingFiles.length} / 10 selected
                  </span>
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleSelectFiles}
                  className="hidden"
                />
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-surface hover:bg-well text-sm font-semibold text-ink-900"
                  >
                    <ImagePlus className="h-4 w-4 text-tealbrand-700" />
                    Choose Work Photos
                  </button>
                  {pendingFiles.map((file, idx) => (
                    <span
                      key={`${file.name}-${idx}`}
                      className="text-xs text-ink-700 bg-surface border border-border rounded-md px-2.5 py-1.5 flex items-center gap-2"
                    >
                      <span className="truncate max-w-[160px]">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-ink-400 hover:text-red-700 font-semibold"
                        aria-label={`Remove ${file.name}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-tealbrand-600/30 bg-tealbrand-50/50 px-3.5 py-2.5 text-xs text-tealbrand-700 font-medium">
                This bundle automatically inherits approved work photos from its included services.
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSubmitOffering}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {submitting ? 'Uploading & Saving…' : 'Submit Service Offering'}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-tealbrand-600/30 bg-tealbrand-50 px-4 py-3 text-sm text-tealbrand-700">
          {notice}
        </div>
      )}

      <div className="pt-4 flex items-center justify-end gap-3 border-t border-border">
        <button
          type="button"
          onClick={() => onCompleteNext?.()}
          disabled={!hasValidSubmittedOffering || submitting}
          className="px-5 py-2.5 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white disabled:opacity-40"
        >
          Continue to Agreement
        </button>
      </div>
    </div>
  );
}
