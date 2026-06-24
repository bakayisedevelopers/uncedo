import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Image as ImageIcon } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Card, EmptyState, LoadingState, SectionTitle } from '../components/ui';
import {
  flattenProviderServices,
  listHelperProfiles,
} from '../services/adminService';
import {
  buildServiceCatalogView,
  deleteServiceCatalogImage,
  saveServiceCatalogEntry,
  subscribeToServiceCatalog,
  uploadServiceCatalogImages,
} from '../services/serviceCatalogService';
import {
  groupRowsByHelper,
  isPendingSkillStatus,
  matchesCatalogItem,
} from '../utils/moderationView';

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function tone(status = '') {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'approved' || normalized === 'verified') return 'success';
  if (normalized === 'pending' || normalized === 'review') return 'warning';
  if (normalized === 'rejected') return 'danger';
  return 'neutral';
}

function parseQuestionLines(value = '') {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [promptPart, optionsPart = ''] = line.split('::');
      const prompt = String(promptPart || '').trim();
      if (!prompt) return null;
      const options = String(optionsPart || '')
        .split('|')
        .map((option) => option.trim())
        .filter(Boolean)
        .map((option) => ({ value: slugify(option), label: option }));
      return {
        id: slugify(prompt) || `question_${index + 1}`,
        prompt,
        answerType: options.length ? 'enum' : 'text',
        options,
      };
    })
    .filter(Boolean);
}

function formatQuestionLines(questions = []) {
  return (Array.isArray(questions) ? questions : [])
    .map((question) => {
      const options = (Array.isArray(question.options) ? question.options : [])
        .map((option) => option.label || option.value || '')
        .filter(Boolean);
      return options.length ? `${question.prompt || question.id}::${options.join('|')}` : `${question.prompt || question.id}`;
    })
    .join('\n');
}

function parseNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function ServiceDetailsPage() {
  const navigate = useNavigate();
  const { serviceId } = useParams();
  const isNewService = String(serviceId || '').trim().toLowerCase() === 'new';
  const [helpers, setHelpers] = useState([]);
  const [catalogEntries, setCatalogEntries] = useState([]);
  const [isLoadingHelpers, setIsLoadingHelpers] = useState(true);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [message, setMessage] = useState('');
  const [draftServiceId, setDraftServiceId] = useState('');
  const [draftLabel, setDraftLabel] = useState('');
  const [draftPromptLabel, setDraftPromptLabel] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftCategoryId, setDraftCategoryId] = useState('');
  const [draftCategoryName, setDraftCategoryName] = useState('');
  const [draftKind, setDraftKind] = useState('service');
  const [draftActive, setDraftActive] = useState(true);
  const [draftFiles, setDraftFiles] = useState([]);
  const [draftIncludedServiceIds, setDraftIncludedServiceIds] = useState([]);
  const [draftRequiredQuestions, setDraftRequiredQuestions] = useState('');
  const [draftOptionalQuestions, setDraftOptionalQuestions] = useState('');
  const [draftBasePrice, setDraftBasePrice] = useState('0');
  const [draftTravelFee, setDraftTravelFee] = useState('35');
  const [draftBookingFee, setDraftBookingFee] = useState('0');
  const [draftMinimumTotal, setDraftMinimumTotal] = useState('0');
  const [draftMaximumTotal, setDraftMaximumTotal] = useState('0');
  const [draftWeekendMultiplier, setDraftWeekendMultiplier] = useState('1.08');
  const [draftEveningMultiplier, setDraftEveningMultiplier] = useState('1.08');
  const [draftBundleDiscountPercent, setDraftBundleDiscountPercent] = useState('0');
  const [draftRequiresPortfolioSelection, setDraftRequiresPortfolioSelection] = useState(false);
  const [draftInheritBundleImages, setDraftInheritBundleImages] = useState(true);

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

  const selectedService = useMemo(() => {
    if (isNewService) {
      return {
        id: 'new',
        categoryId: '',
        categoryName: '',
        label: 'New service',
        promptLabel: '',
        description: '',
        kind: 'service',
        persisted: false,
        active: true,
        approved: true,
        images: [],
        pricing: {},
        includedServiceIds: [],
        questionnaire: { required: [], optional: [] },
        requiresPortfolioSelection: false,
        inheritBundleImages: true,
      };
    }
    return catalogEntries.find((item) => item.id === serviceId) || null;
  }, [catalogEntries, isNewService, serviceId]);

  useEffect(() => {
    if (!selectedService) return;
    setDraftServiceId(selectedService.id === 'new' ? '' : selectedService.id);
    setDraftLabel(selectedService.label || '');
    setDraftPromptLabel(selectedService.promptLabel || selectedService.label || '');
    setDraftDescription(selectedService.description || '');
    setDraftCategoryId(selectedService.categoryId || '');
    setDraftCategoryName(selectedService.categoryName || '');
    setDraftKind(selectedService.kind || 'service');
    setDraftActive(selectedService.persisted ? selectedService.active !== false : true);
    setDraftFiles([]);
    setDraftIncludedServiceIds(Array.isArray(selectedService.includedServiceIds) ? selectedService.includedServiceIds : []);
    setDraftRequiredQuestions(formatQuestionLines(selectedService.questionnaire?.required || []));
    setDraftOptionalQuestions(formatQuestionLines(selectedService.questionnaire?.optional || []));
    setDraftBasePrice(String(selectedService.pricing?.basePrice ?? 0));
    setDraftTravelFee(String(selectedService.pricing?.travelFee ?? 35));
    setDraftBookingFee(String(selectedService.pricing?.bookingFee ?? 0));
    setDraftMinimumTotal(String(selectedService.pricing?.minimumTotal ?? 0));
    setDraftMaximumTotal(String(selectedService.pricing?.maximumTotal ?? 0));
    setDraftWeekendMultiplier(String(selectedService.pricing?.weekendMultiplier ?? 1.08));
    setDraftEveningMultiplier(String(selectedService.pricing?.eveningMultiplier ?? 1.08));
    setDraftBundleDiscountPercent(String(selectedService.pricing?.bundleDiscountPercent ?? 0));
    setDraftRequiresPortfolioSelection(Boolean(selectedService.requiresPortfolioSelection));
    setDraftInheritBundleImages(selectedService.inheritBundleImages !== false);
    setMessage('');
  }, [selectedService]);

  const serviceRows = useMemo(() => {
    if (!selectedService || selectedService.id === 'new') return [];
    return flattenProviderServices(helpers).filter((row) => matchesCatalogItem(row, selectedService));
  }, [helpers, selectedService]);

  const helperGroups = useMemo(() => groupRowsByHelper(serviceRows), [serviceRows]);
  const pendingSubmissionCount = useMemo(
    () => serviceRows.filter((row) => isPendingSkillStatus(row.skillStatus)).length,
    [serviceRows],
  );

  const selectableBundleServices = useMemo(
    () => catalogEntries.filter((entry) => entry.id !== selectedService?.id && entry.kind !== 'bundle'),
    [catalogEntries, selectedService?.id],
  );

  const inheritedBundleImages = useMemo(() => {
    if (draftKind !== 'bundle' || draftInheritBundleImages === false) return [];
    const seen = new Set();
    return catalogEntries
      .filter((entry) => draftIncludedServiceIds.includes(entry.id))
      .flatMap((entry) => (entry.images || []).map((image) => ({ ...image, inherited: true })))
      .filter((image) => {
        const key = String(image.uri || image.id || '').trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [catalogEntries, draftIncludedServiceIds, draftInheritBundleImages, draftKind]);

  const effectiveImages = useMemo(
    () => ([...(selectedService?.images || []), ...inheritedBundleImages].slice(0, 10)),
    [inheritedBundleImages, selectedService?.images],
  );

  const refreshHelpers = async () => {
    const items = await listHelperProfiles();
    setHelpers(items);
  };

  const buildPayload = (images = []) => ({
    categoryId: slugify(draftCategoryId),
    categoryName: String(draftCategoryName || '').trim(),
    label: String(draftLabel || '').trim(),
    promptLabel: String(draftPromptLabel || draftLabel || '').trim(),
    description: String(draftDescription || '').trim(),
    kind: draftKind,
    active: draftActive,
    approved: true,
    images,
    includedServiceIds: draftKind === 'bundle' ? draftIncludedServiceIds : [],
    requiresPortfolioSelection: draftRequiresPortfolioSelection,
    inheritBundleImages: draftInheritBundleImages,
    pricing: {
      basePrice: parseNumber(draftBasePrice),
      travelFee: parseNumber(draftTravelFee, 35),
      bookingFee: parseNumber(draftBookingFee),
      minimumTotal: parseNumber(draftMinimumTotal),
      maximumTotal: parseNumber(draftMaximumTotal),
      weekendMultiplier: parseNumber(draftWeekendMultiplier, 1.08),
      eveningMultiplier: parseNumber(draftEveningMultiplier, 1.08),
      bundleDiscountPercent: parseNumber(draftBundleDiscountPercent),
    },
    questionnaire: {
      required: parseQuestionLines(draftRequiredQuestions),
      optional: parseQuestionLines(draftOptionalQuestions),
    },
  });

  const handleServiceSave = async () => {
    const targetServiceId = slugify(draftServiceId || draftLabel);
    if (!targetServiceId || !draftLabel.trim() || !draftCategoryId.trim() || !draftCategoryName.trim()) {
      setMessage('Service id, name, category id, and category name are required.');
      return;
    }

    setIsMutating(true);
    setMessage('');

    try {
      const uploads = draftFiles.length
        ? await uploadServiceCatalogImages({ serviceId: targetServiceId, files: draftFiles })
        : [];
      const images = [...(selectedService?.images || []), ...uploads, ...inheritedBundleImages].slice(0, 10);
      const saved = await saveServiceCatalogEntry(targetServiceId, buildPayload(images));

      if (saved) {
        setCatalogEntries((current) => {
          const existing = current.some((entry) => entry.id === saved.id);
          return existing
            ? current.map((entry) => (entry.id === saved.id ? saved : entry))
            : [...current, saved];
        });
        if (serviceId !== saved.id) {
          navigate(`/services/${saved.id}`, { replace: true });
        }
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

  const handleDeleteImage = async (picture) => {
    const targetServiceId = slugify(draftServiceId || selectedService?.id || '');
    if (!targetServiceId || !picture?.id) return;
    if (picture.inherited) {
      setMessage('Inherited bundle images are managed from the underlying services.');
      return;
    }
    setIsMutating(true);
    setMessage('');

    try {
      if (picture.objectPath) {
        await deleteServiceCatalogImage(picture.objectPath);
      }

      const images = effectiveImages.filter((entry) => entry.id !== picture.id);
      const saved = await saveServiceCatalogEntry(targetServiceId, buildPayload(images));
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

  const remainingUploads = Math.max(0, 10 - effectiveImages.length);

  if ((isLoadingCatalog || isLoadingHelpers) && !selectedService) {
    return <LoadingState label="Loading service details..." />;
  }

  if (!selectedService && !isLoadingCatalog) {
    return (
      <EmptyState
        title="Service not found"
        description="This service is not available in the live catalog yet."
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
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle
          eyebrow="Service details"
          title={isNewService ? 'Create service' : (selectedService.label || 'Service details')}
          description="Manage catalog content, pricing controls, bundle composition, images, and helper approvals in one place."
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

        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.85fr]">
          <div className="space-y-6">
            <Card className="bg-white/7">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Service id</span>
                  <input
                    value={draftServiceId}
                    onChange={(event) => setDraftServiceId(event.target.value)}
                    disabled={!isNewService}
                    className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none placeholder:text-ink-400 disabled:cursor-not-allowed disabled:bg-white/5"
                    placeholder="executive_car_wash"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Service type</span>
                  <select
                    value={draftKind}
                    onChange={(event) => setDraftKind(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none"
                  >
                    <option value="service">Standard service</option>
                    <option value="bundle">Bundle service</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Service name</span>
                  <input
                    value={draftLabel}
                    onChange={(event) => setDraftLabel(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Prompt label</span>
                  <input
                    value={draftPromptLabel}
                    onChange={(event) => setDraftPromptLabel(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none"
                    placeholder="I want the executive wash"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Category id</span>
                  <input
                    value={draftCategoryId}
                    onChange={(event) => setDraftCategoryId(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none"
                    placeholder="car_wash"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Category name</span>
                  <input
                    value={draftCategoryName}
                    onChange={(event) => setDraftCategoryName(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none"
                    placeholder="Car Wash"
                  />
                </label>
              </div>

              <label className="mt-4 block space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Description</span>
                <textarea
                  value={draftDescription}
                  onChange={(event) => setDraftDescription(event.target.value)}
                  rows={4}
                  className="w-full rounded-[22px] border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none"
                />
              </label>

              {draftKind === 'bundle' ? (
                <div className="mt-5 rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-white">Included services</p>
                      <p className="mt-1 text-sm text-ink-200">Select the individual services that make up this bundle.</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-ink-200">
                      <input
                        type="checkbox"
                        checked={draftInheritBundleImages}
                        onChange={(event) => setDraftInheritBundleImages(event.target.checked)}
                      />
                      Inherit service images
                    </label>
                  </div>

                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {selectableBundleServices.map((entry) => {
                      const isSelected = draftIncludedServiceIds.includes(entry.id);
                      return (
                        <label key={entry.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-ink-950/30 px-4 py-3 text-sm text-white">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(event) => {
                              setDraftIncludedServiceIds((current) => (
                                event.target.checked
                                  ? [...new Set([...current, entry.id])]
                                  : current.filter((item) => item !== entry.id)
                              ));
                            }}
                          />
                          <span>{entry.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[
                  ['Base price', draftBasePrice, setDraftBasePrice],
                  ['Travel fee', draftTravelFee, setDraftTravelFee],
                  ['Booking fee', draftBookingFee, setDraftBookingFee],
                  ['Minimum total', draftMinimumTotal, setDraftMinimumTotal],
                  ['Maximum total', draftMaximumTotal, setDraftMaximumTotal],
                  ['Bundle discount %', draftBundleDiscountPercent, setDraftBundleDiscountPercent],
                  ['Weekend multiplier', draftWeekendMultiplier, setDraftWeekendMultiplier],
                  ['Evening multiplier', draftEveningMultiplier, setDraftEveningMultiplier],
                ].map(([label, value, setter]) => (
                  <label key={label} className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">{label}</span>
                    <input
                      value={value}
                      onChange={(event) => setter(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Required questions</span>
                  <textarea
                    value={draftRequiredQuestions}
                    onChange={(event) => setDraftRequiredQuestions(event.target.value)}
                    rows={6}
                    className="w-full rounded-[22px] border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none"
                    placeholder={'Question prompt::Option A|Option B\nAnother question'}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Optional questions</span>
                  <textarea
                    value={draftOptionalQuestions}
                    onChange={(event) => setDraftOptionalQuestions(event.target.value)}
                    rows={6}
                    className="w-full rounded-[22px] border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none"
                    placeholder={'Question prompt::Option A|Option B\nAnother question'}
                  />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap gap-4 text-sm text-ink-200">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draftRequiresPortfolioSelection}
                    onChange={(event) => setDraftRequiresPortfolioSelection(event.target.checked)}
                  />
                  Requires portfolio selection
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draftActive}
                    onChange={(event) => setDraftActive(event.target.checked)}
                  />
                  Published
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleServiceSave}
                  disabled={isMutating}
                  className="rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                >
                  {selectedService.persisted ? 'Save changes' : 'Create service'}
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
                        const limitedFiles = files.slice(0, Math.max(0, 10 - effectiveImages.length));
                        setDraftFiles(limitedFiles);
                        if (event.target) event.target.value = '';
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
                {effectiveImages.length ? effectiveImages.map((picture) => (
                  <div key={picture.id} className="overflow-hidden rounded-[20px] border border-white/10 bg-white/5">
                    <img src={picture.uri} alt={draftLabel || 'Service'} className="h-40 w-full object-cover" />
                    <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-ink-300">
                      <span>{picture.uploadedAt ? new Date(picture.uploadedAt).toLocaleDateString() : 'Uploaded'}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteImage(picture)}
                        disabled={isMutating || picture.inherited}
                        className="inline-flex items-center gap-1 font-bold text-white disabled:opacity-60"
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        {picture.inherited ? 'Inherited' : 'Remove'}
                      </button>
                    </div>
                  </div>
                )) : (
                  <EmptyState
                    title="No service images yet"
                    description="Upload images, or let bundle services inherit images from their included services."
                  />
                )}
              </div>
            </Card>
          </div>

          <Card>
            <SectionTitle
              eyebrow="Helper approvals"
              title="Helpers offering this service"
              description="Open a helper to review the service submissions attached to this catalog item."
            />

            {selectedService.id === 'new' ? (
              <EmptyState
                title="Save the service first"
                description="Helpers can only apply for this service after it has been created in the live catalog."
              />
            ) : (
              <>
                <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-bold text-white">{helperGroups.length} helper{helperGroups.length === 1 ? '' : 's'}</p>
                      <p className="mt-1 text-sm text-ink-200">{pendingSubmissionCount} submission{pendingSubmissionCount === 1 ? '' : 's'} waiting for review</p>
                    </div>
                    <Badge tone={pendingSubmissionCount ? 'warning' : 'success'}>{pendingSubmissionCount ? 'Needs review' : 'Up to date'}</Badge>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {helperGroups.length ? helperGroups.map((group) => (
                    <button
                      key={group.providerUid}
                      type="button"
                      onClick={() => navigate(`/helpers/${group.providerUid}?serviceId=${selectedService.id}`)}
                      className="w-full rounded-[22px] border border-white/10 bg-white/5 p-4 text-left transition hover:border-white/20 hover:bg-white/10"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-lg font-bold text-white">{group.helperName}</p>
                          <p className="mt-1 text-sm text-ink-200">{group.providerType || 'individual'}{group.businessName ? ` - ${group.businessName}` : ''}{group.city ? ` - ${group.city}` : ''}</p>
                          <p className="mt-2 text-xs text-ink-300">{group.totalCount} submission{group.totalCount === 1 ? '' : 's'} in this service</p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Badge tone={group.pendingCount ? 'warning' : 'success'}>{group.pendingCount} pending</Badge>
                          <Badge tone={tone(group.verificationStatus)}>{group.verificationStatus || 'pending'}</Badge>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge tone={group.approvedCount ? 'success' : 'neutral'}>{group.approvedCount} approved</Badge>
                        <Badge tone={group.pausedCount ? 'warning' : 'neutral'}>{group.pausedCount} paused</Badge>
                        <Badge tone={group.rows.length ? 'brand' : 'neutral'}>{group.rows.length} skill{group.rows.length === 1 ? '' : 's'}</Badge>
                      </div>
                    </button>
                  )) : (
                    <EmptyState
                      title="No helper submissions yet"
                      description="Once helpers add this service to their profile, their request will show up here for approval."
                    />
                  )}
                </div>
              </>
            )}
          </Card>
        </div>
      </Card>
    </div>
  );
}
