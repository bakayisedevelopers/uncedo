import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Image as ImageIcon, Plus, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Card, EmptyState, LoadingState, SectionTitle } from '../components/ui';
import { getAdminCatalogCategories } from '../constants/serviceCatalog';
import { getAdminQuestionPreset } from '../constants/serviceQuestionPresets';
import { flattenProviderServices, listHelperProfiles } from '../services/adminService';
import {
  buildServiceCatalogView,
  deleteServiceCatalogImage,
  saveServiceCatalogEntry,
  subscribeToServiceCatalog,
  uploadServiceCatalogImages,
} from '../services/serviceCatalogService';
import { groupRowsByHelper, isPendingSkillStatus, matchesCatalogItem } from '../utils/moderationView';

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

let draftSequence = 0;

function createDraftKey(prefix = 'draft') {
  draftSequence += 1;
  return `${prefix}_${draftSequence}`;
}

function tone(status = '') {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'approved' || normalized === 'verified') return 'success';
  if (normalized === 'pending' || normalized === 'review') return 'warning';
  if (normalized === 'rejected') return 'danger';
  return 'neutral';
}

function createOptionDraft(option = {}, index = 0) {
  const value = String(option.value || '').trim() || `option_${index + 1}`;
  return {
    draftKey: String(option.draftKey || option.clientId || '').trim() || createDraftKey('option'),
    value,
    label: String(option.label || value).trim(),
    priceAdder: Number(option.priceAdder || 0),
    materialAdder: Number(option.materialAdder || 0),
  };
}

function createQuestionDraft(question = {}, index = 0, required = true) {
  return {
    draftKey: String(question.draftKey || question.clientId || '').trim() || createDraftKey('question'),
    id: String(question.id || `question_${index + 1}`).trim(),
    prompt: String(question.prompt || question.label || '').trim(),
    answerType: String(question.answerType || 'enum').trim().toLowerCase(),
    answerHint: String(question.answerHint || '').trim(),
    required,
    enabled: question.enabled !== false,
    options: (Array.isArray(question.options) ? question.options : []).map((option, optionIndex) => createOptionDraft(option, optionIndex)),
  };
}

function mapQuestionDrafts(questions = [], required = true) {
  return (Array.isArray(questions) ? questions : []).map((question, index) => createQuestionDraft(question, index, required));
}

function normalizeQuestionDrafts(questions = [], required = true) {
  return (Array.isArray(questions) ? questions : [])
    .filter((question) => question.enabled !== false && String(question.prompt || '').trim())
    .map((question, index) => {
      const prompt = String(question.prompt || '').trim();
      const options = (Array.isArray(question.options) ? question.options : [])
        .filter((option) => String(option.label || '').trim())
        .map((option, optionIndex) => ({
          value: slugify(option.value || option.label || `option_${optionIndex + 1}`),
          label: String(option.label || '').trim(),
          priceAdder: Number(option.priceAdder || 0),
          materialAdder: Number(option.materialAdder || 0),
          multiplier: 1,
        }));

      return {
        id: String(question.id || slugify(prompt) || `question_${index + 1}`).trim(),
        prompt,
        answerType: question.answerType === 'text' ? 'text' : 'enum',
        answerHint: String(question.answerHint || '').trim(),
        required,
        options,
      };
    });
}

function SliderField({
  label,
  help = '',
  min = 0,
  max = 500,
  step = 5,
  value = 0,
  onChange,
  prefix = 'R',
}) {
  return (
    <label className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">{label}</span>
          {help ? <p className="mt-1 text-xs leading-5 text-ink-300">{help}</p> : null}
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-bold text-white">
          {prefix}{Number(value || 0).toFixed(step < 1 ? 2 : 0)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#ff7a59]"
      />
    </label>
  );
}

function QuestionOptionEditor({ option, onChange, onRemove }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-ink-950/30 p-3">
      <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr_auto]">
        <input
          value={option.label}
          onChange={(event) => onChange({ ...option, label: event.target.value })}
          placeholder="Option label"
          className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none"
        />
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <span className="text-sm font-bold text-ink-200">Adds</span>
          <input
            type="range"
            min={0}
            max={500}
            step={5}
            value={option.priceAdder}
            onChange={(event) => onChange({ ...option, priceAdder: Number(event.target.value) })}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-[#ff7a59]"
          />
          <span className="text-sm font-bold text-white">R{Number(option.priceAdder || 0).toFixed(0)}</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function QuestionEditor({
  title,
  description,
  questions,
  onChange,
}) {
  const updateQuestion = (targetIndex, nextQuestion) => {
    onChange(questions.map((question, index) => (index === targetIndex ? nextQuestion : question)));
  };

  const removeQuestion = (targetIndex) => {
    onChange(questions.filter((_, index) => index !== targetIndex));
  };

  const addQuestion = () => {
    onChange([
      ...questions,
      createQuestionDraft({
        id: `question_${questions.length + 1}`,
        prompt: '',
        answerType: 'enum',
        options: [],
      }, questions.length),
    ]);
  };

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-white">{title}</p>
          <p className="mt-1 text-sm leading-6 text-ink-200">{description}</p>
        </div>
        <button
          type="button"
          onClick={addQuestion}
          className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white"
        >
          <Plus className="h-4 w-4" />
          Add question
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {questions.length ? questions.map((question, index) => (
          <div key={question.draftKey || `question_${index}`} className="rounded-[24px] border border-white/10 bg-ink-950/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Question {index + 1}</span>
                <label className="flex items-center gap-2 text-sm text-ink-200">
                  <input
                    type="checkbox"
                    checked={question.enabled !== false}
                    onChange={(event) => updateQuestion(index, { ...question, enabled: event.target.checked })}
                  />
                  Enabled
                </label>
              </div>
              <button
                type="button"
                onClick={() => removeQuestion(index)}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white"
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[1.4fr_0.6fr]">
              <input
                value={question.prompt}
                onChange={(event) => updateQuestion(index, {
                  ...question,
                  prompt: event.target.value,
                })}
                placeholder="Question prompt"
                className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none"
              />
              <select
                value={question.answerType}
                onChange={(event) => updateQuestion(index, { ...question, answerType: event.target.value })}
                className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="enum">Options</option>
                <option value="text">Text answer</option>
              </select>
            </div>

            {question.answerType === 'text' ? (
              <input
                value={question.answerHint}
                onChange={(event) => updateQuestion(index, { ...question, answerHint: event.target.value })}
                placeholder="Answer hint for customers"
                className="mt-4 w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none"
              />
            ) : (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-white">Options and added price</p>
                  <button
                    type="button"
                    onClick={() => updateQuestion(index, {
                      ...question,
                      options: [...question.options, createOptionDraft({}, question.options.length)],
                    })}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white"
                  >
                    <Plus className="h-4 w-4" />
                    Add option
                  </button>
                </div>
                {question.options.length ? question.options.map((option, optionIndex) => (
                  <QuestionOptionEditor
                    key={option.draftKey || `option_${optionIndex}`}
                    option={option}
                    onChange={(nextOption) => updateQuestion(index, {
                      ...question,
                      options: question.options.map((currentOption, currentIndex) => (currentIndex === optionIndex ? nextOption : currentOption)),
                    })}
                    onRemove={() => updateQuestion(index, {
                      ...question,
                      options: question.options.filter((_, currentIndex) => currentIndex !== optionIndex),
                    })}
                  />
                )) : (
                  <p className="text-sm text-ink-300">Add at least one option so the admin can control the added price for each answer.</p>
                )}
              </div>
            )}
          </div>
        )) : (
          <EmptyState title="No questions yet" description="Add questions here so the customer flow reads them directly from the backend." />
        )}
      </div>
    </div>
  );
}

export default function ServiceDetailsPage() {
  const navigate = useNavigate();
  const { serviceId } = useParams();
  const isNewService = String(serviceId || '').trim().toLowerCase() === 'new';
  const categoryOptions = useMemo(() => getAdminCatalogCategories(), []);
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
  const [draftKind, setDraftKind] = useState('service');
  const [draftActive, setDraftActive] = useState(true);
  const [draftFiles, setDraftFiles] = useState([]);
  const [draftIncludedServiceIds, setDraftIncludedServiceIds] = useState([]);
  const [draftBasePrice, setDraftBasePrice] = useState(120);
  const [draftTravelFee, setDraftTravelFee] = useState(35);
  const [draftMinimumTotal, setDraftMinimumTotal] = useState(80);
  const [draftMaximumTotal, setDraftMaximumTotal] = useState(500);
  const [draftRequiresPortfolioSelection, setDraftRequiresPortfolioSelection] = useState(false);
  const [draftInheritBundleImages, setDraftInheritBundleImages] = useState(true);
  const [draftRequiredQuestions, setDraftRequiredQuestions] = useState([]);
  const [draftOptionalQuestions, setDraftOptionalQuestions] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const loadHelpers = async () => {
      setIsLoadingHelpers(true);
      try {
        const items = await listHelperProfiles();
        if (!cancelled) setHelpers(items);
      } finally {
        if (!cancelled) setIsLoadingHelpers(false);
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
    };
  }, []);

  const selectedService = useMemo(() => {
    if (isNewService) {
      return {
        id: 'new',
        categoryId: categoryOptions[0]?.id || '',
        categoryName: categoryOptions[0]?.name || '',
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
  }, [catalogEntries, categoryOptions, isNewService, serviceId]);

  const selectedCategory = useMemo(
    () => categoryOptions.find((category) => category.id === draftCategoryId) || null,
    [categoryOptions, draftCategoryId],
  );

  useEffect(() => {
    if (!selectedService) return;
    const nextCategoryId = selectedService.categoryId || categoryOptions[0]?.id || '';
    const preset = getAdminQuestionPreset({ serviceId: selectedService.id, categoryId: nextCategoryId });

    setDraftServiceId(selectedService.id === 'new' ? '' : selectedService.id);
    setDraftLabel(selectedService.label || '');
    setDraftPromptLabel(selectedService.promptLabel || selectedService.label || '');
    setDraftDescription(selectedService.description || '');
    setDraftCategoryId(nextCategoryId);
    setDraftKind(selectedService.kind || 'service');
    setDraftActive(selectedService.persisted ? selectedService.active !== false : true);
    setDraftFiles([]);
    setDraftIncludedServiceIds(Array.isArray(selectedService.includedServiceIds) ? selectedService.includedServiceIds : []);
    setDraftBasePrice(Number(selectedService.pricing?.basePrice ?? 120));
    setDraftTravelFee(Number(selectedService.pricing?.travelFee ?? 35));
    setDraftMinimumTotal(Number(selectedService.pricing?.minimumTotal ?? 80));
    setDraftMaximumTotal(Number(selectedService.pricing?.maximumTotal ?? 500));
    setDraftRequiresPortfolioSelection(Boolean(selectedService.requiresPortfolioSelection));
    setDraftInheritBundleImages(selectedService.inheritBundleImages !== false);
    setDraftRequiredQuestions(mapQuestionDrafts(
      (selectedService.questionnaire?.required?.length ? selectedService.questionnaire.required : preset.required),
      true,
    ));
    setDraftOptionalQuestions(mapQuestionDrafts(
      (selectedService.questionnaire?.optional?.length ? selectedService.questionnaire.optional : preset.optional),
      false,
    ));
    setMessage('');
  }, [categoryOptions, selectedService]);

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

  const remainingUploads = Math.max(0, 10 - effectiveImages.length);

  const buildPayload = (images = []) => ({
    categoryId: draftCategoryId,
    categoryName: selectedCategory?.name || '',
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
      basePrice: Number(draftBasePrice || 0),
      travelFee: Number(draftTravelFee || 35),
      bookingFee: 0,
      minimumTotal: Number(draftMinimumTotal || 0),
      maximumTotal: Number(draftMaximumTotal || 0),
      bundleDiscountPercent: 0,
    },
    questionnaire: {
      required: normalizeQuestionDrafts(draftRequiredQuestions, true),
      optional: normalizeQuestionDrafts(draftOptionalQuestions, false),
    },
  });

  const refreshHelpers = async () => {
    const items = await listHelperProfiles();
    setHelpers(items);
  };

  const upsertSavedService = (saved) => {
    if (!saved) return;
    setCatalogEntries((current) => {
      const existing = current.some((entry) => entry.id === saved.id);
      return existing
        ? current.map((entry) => (entry.id === saved.id ? saved : entry))
        : [...current, saved];
    });
    if (serviceId !== saved.id) {
      navigate(`/services/${saved.id}`, { replace: true });
    }
  };

  const handleServiceSave = async () => {
    const targetServiceId = slugify(draftServiceId || draftLabel);
    if (!targetServiceId || !draftLabel.trim() || !draftCategoryId.trim()) {
      setMessage('Service name and category are required.');
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
      upsertSavedService(saved);

      setDraftFiles([]);
      setMessage('Service saved to Firestore.');
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
          description="Manage catalog content, bundle composition, question pricing, images, and helper approvals in one place."
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
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed"
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
                    placeholder="I want this service"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Category id</span>
                  <select
                    value={draftCategoryId}
                    onChange={(event) => {
                      const nextCategoryId = event.target.value;
                      setDraftCategoryId(nextCategoryId);
                      const preset = getAdminQuestionPreset({
                        serviceId: slugify(draftServiceId || draftLabel || selectedService?.id || ''),
                        categoryId: nextCategoryId,
                      });
                      if (!draftRequiredQuestions.length) {
                        setDraftRequiredQuestions(mapQuestionDrafts(preset.required, true));
                      }
                      if (!draftOptionalQuestions.length) {
                        setDraftOptionalQuestions(mapQuestionDrafts(preset.optional, false));
                      }
                    }}
                    className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none"
                  >
                    {categoryOptions.map((category) => (
                      <option key={category.id} value={category.id}>{category.id}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Category name</span>
                  <input
                    value={selectedCategory?.name || ''}
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

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <SliderField
                  label="Base price"
                  help="Starting labour price for this service before answer-based additions are applied."
                  min={20}
                  max={1500}
                  step={5}
                  value={draftBasePrice}
                  onChange={setDraftBasePrice}
                />
                <SliderField
                  label="Travel fee"
                  help="Standardized travel charge. This is fixed at the service level and currently defaults to R35."
                  min={0}
                  max={150}
                  step={5}
                  value={draftTravelFee}
                  onChange={setDraftTravelFee}
                />
                <SliderField
                  label="Minimum total"
                  help="The quote will not go below this amount after all calculations."
                  min={0}
                  max={1500}
                  step={5}
                  value={draftMinimumTotal}
                  onChange={setDraftMinimumTotal}
                />
                <SliderField
                  label="Maximum total"
                  help="The quote will not go above this amount. This is how you cap and effectively discount bundles."
                  min={50}
                  max={3000}
                  step={5}
                  value={draftMaximumTotal}
                  onChange={setDraftMaximumTotal}
                />
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={draftRequiresPortfolioSelection}
                      onChange={(event) => setDraftRequiresPortfolioSelection(event.target.checked)}
                    />
                    <div>
                      <p className="font-bold text-white">Requires portfolio selection</p>
                      <p className="mt-1 text-sm leading-6 text-ink-200">
                        Turn this on for services like braids, makeup, lashes, or nails where customers should browse helper photos before booking.
                      </p>
                    </div>
                  </label>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={draftActive}
                      onChange={(event) => setDraftActive(event.target.checked)}
                    />
                    <div>
                      <p className="font-bold text-white">Published</p>
                      <p className="mt-1 text-sm leading-6 text-ink-200">
                        When published, the service is visible in the helper and customer apps. Turn it off to pause the service without deleting it.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <QuestionEditor
                  title="Required questions"
                  description="These questions appear in the customer flow before continuing. Each option can add its own amount on top of the base price."
                  questions={draftRequiredQuestions}
                  onChange={setDraftRequiredQuestions}
                />
                <QuestionEditor
                  title="Optional questions"
                  description="Use these for extra detail or follow-up questions that can still influence price when selected."
                  questions={draftOptionalQuestions}
                  onChange={setDraftOptionalQuestions}
                />
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
                {message ? <p className="text-sm font-bold text-brand-soft">{message}</p> : null}
              </div>

              <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-bold text-white">Service images</p>
                    <p className="mt-1 text-sm text-ink-200">
                      Upload up to {remainingUploads} more image{remainingUploads === 1 ? '' : 's'} for this service.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <label className="inline-flex cursor-pointer items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white">
                      Upload images
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          const files = Array.from(event.target.files || []);
                          setDraftFiles(files.slice(0, Math.max(0, 10 - effectiveImages.length)));
                          if (event.target) event.target.value = '';
                        }}
                      />
                    </label>
                  </div>
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
                  <EmptyState title="No service images yet" description="Upload images, or let bundle services inherit images from their included services." />
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
