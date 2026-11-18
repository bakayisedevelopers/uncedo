import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Image as ImageIcon, Loader2, Pencil, Plus, RotateCcw, Sparkles, Trash2, X, ZoomIn } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Card, ConfirmDialog, EmptyState, LoadingState, SectionTitle } from '../components/ui';
import { getAdminCatalogCategories } from '../constants/serviceCatalog';
import { getAdminQuestionPreset } from '../constants/serviceQuestionPresets';
import { getAdminServiceSuggestionMatch, getAdminServiceSuggestionsByCategory } from '../constants/serviceTemplateSuggestions';
import { generateAdminOptionImage, generateAdminServiceDraft } from '../services/adminAiService';
import { flattenProviderServices, listHelperProfiles } from '../services/adminService';
import {
  buildServiceCatalogView,
  deleteServiceCatalogEntry,
  deleteServiceCatalogImage,
  saveServiceCatalogEntry,
  subscribeToServiceCatalog,
  uploadServiceCatalogImages,
} from '../services/serviceCatalogService';
import { finalizeAiGeneratedImage, isDataUrlImage } from '../utils/aiImageBranding';
import { groupRowsByHelper, isPendingServiceOfferingStatus, matchesCatalogItem } from '../utils/moderationView';

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

function createServiceOptionDraft(option = {}, index = 0) {
  return {
    draftKey: String(option.draftKey || option.id || '').trim() || createDraftKey('service_option'),
    id: String(option.id || `option_${index + 1}`).trim(),
    title: String(option.title || option.label || '').trim(),
    description: String(option.description || '').trim(),
    imageUrl: String(option.imageUrl || '').trim(),
    price: Number(option.price ?? option.priceAdder ?? 0),
    selectedQuestionIds: Array.isArray(option.selectedQuestionIds) ? option.selectedQuestionIds : [],
    requiresNoOptionSpecificQuestions: Boolean(option.requiresNoOptionSpecificQuestions),
  };
}

function isServiceOptionComplete(option = {}) {
  const title = String(option.title || '').trim();
  const description = String(option.description || '').trim();
  const price = Number(option.price);
  return Boolean(title && description && Number.isFinite(price) && price >= 0);
}

function hasQuestionDependency(question = {}) {
  return Boolean(
    String(
      question?.dependencyRule?.dependsOnQuestionId
      || question?.dependsOn?.questionId
      || '',
    ).trim(),
  );
}

function isOptionSpecificQuestion(question = {}) {
  return (
    String(question?.type || 'option-specific').trim().toLowerCase() !== 'standard'
    && String(question?.type || '').trim().toLowerCase() !== 'dependent'
    && !hasQuestionDependency(question)
  );
}

function normalizeServiceOptions(options = [], questions = null) {
  const allowedOptionSpecificIds = Array.isArray(questions)
    ? new Set(questions.filter(isOptionSpecificQuestion).map((q) => String(q.id || '').trim()).filter(Boolean))
    : null;

  return (Array.isArray(options) ? options : [])
    .filter((option) => String(option.title || '').trim() || String(option.description || '').trim())
    .map((option, index) => ({
      id: String(option.id || slugify(option.title) || `option_${index + 1}`).trim(),
      title: String(option.title || '').trim(),
      description: String(option.description || '').trim(),
      imageUrl: String(option.imageUrl || '').trim(),
      price: Number(option.price || 0),
      selectedQuestionIds: (Array.isArray(option.selectedQuestionIds) ? option.selectedQuestionIds : [])
        .map((id) => String(id || '').trim())
        .filter((id) => Boolean(id) && (!allowedOptionSpecificIds || allowedOptionSpecificIds.has(id))),
      requiresNoOptionSpecificQuestions: Boolean(option.requiresNoOptionSpecificQuestions),
    }));
}

function getQuestionOptionSlug(option = {}, index = 0) {
  return slugify(option?.value || option?.label || `option_${index + 1}`);
}

function wouldCreateDependencyCycle(questionId, candidateParentId, sourceQuestions = []) {
  const startId = String(questionId || '').trim();
  let currentId = String(candidateParentId || '').trim();
  if (!startId || !currentId) return false;
  if (currentId === startId) return true;
  const byId = new Map(sourceQuestions.map((q) => [String(q?.id || '').trim(), q]));
  const seen = new Set([startId]);
  while (currentId) {
    if (seen.has(currentId)) return true;
    seen.add(currentId);
    const parent = byId.get(currentId);
    currentId = String(parent?.dependencyRule?.dependsOnQuestionId || '').trim();
  }
  return false;
}

function getDependencyTriggerValues(depRule = null, legacyDependsOn = null) {
  const rawList = [
    ...(Array.isArray(depRule?.dependsOnOptionValues) ? depRule.dependsOnOptionValues : []),
    ...(Array.isArray(legacyDependsOn?.optionValues) ? legacyDependsOn.optionValues : []),
    ...(depRule?.dependsOnOptionValue ? [depRule.dependsOnOptionValue] : []),
    ...(legacyDependsOn?.optionValue ? [legacyDependsOn.optionValue] : []),
  ];
  const seen = new Set();
  const values = [];
  rawList.forEach((entry) => {
    const clean = String(entry || '').trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) return;
    seen.add(key);
    values.push(clean);
  });
  return values;
}

function createOptionDraft(option = {}, index = 0) {
  const value = String(option.value || '').trim();
  const numericFactor = Number(option.factor ?? option.multiplier ?? 1);
  return {
    draftKey: String(option.draftKey || option.clientId || '').trim() || createDraftKey('option'),
    value,
    label: String(option.label ?? value).trim(),
    imageUrl: String(option.imageUrl || option.imageUri || '').trim(),
    priceAdder: Number(option.priceAdder || 0),
    materialAdder: Number(option.materialAdder || 0),
    pricingType: String(option.pricingType || (numericFactor !== 1 ? 'multiplier' : 'adder')).trim(),
    factor: Number.isFinite(numericFactor) && numericFactor > 0 ? numericFactor : 1,
  };
}

function createQuestionDraft(question = {}, index = 0, required = true) {
  const depRule = question.dependencyRule && typeof question.dependencyRule === 'object'
    ? question.dependencyRule
    : null;
  const legacyDependsOn = question.dependsOn && typeof question.dependsOn === 'object'
    ? question.dependsOn
    : null;
  const depQuestionId = String(depRule?.dependsOnQuestionId || legacyDependsOn?.questionId || '').trim();
  const depOptionValues = getDependencyTriggerValues(depRule, legacyDependsOn);
  const rawType = String(question.type || 'option-specific').trim().toLowerCase();
  const effectiveType = depQuestionId
    ? 'dependent'
    : (rawType === 'standard' ? 'standard' : 'option-specific');

  return {
    draftKey: String(question.draftKey || question.clientId || '').trim() || createDraftKey('question'),
    id: String(question.id || `question_${index + 1}`).trim(),
    prompt: String(question.prompt || question.label || '').trim(),
    type: effectiveType,
    answerType: String(question.answerType || 'enum').trim().toLowerCase(),
    answerHint: String(question.answerHint || '').trim(),
    required,
    enabled: question.enabled !== false,
    dependencyRule: {
      dependsOnQuestionId: depQuestionId,
      dependsOnOptionValue: depOptionValues[0] || '',
      dependsOnOptionValues: depOptionValues,
    },
    options: (Array.isArray(question.options) ? question.options : []).map((option, optionIndex) => createOptionDraft(option, optionIndex)),
  };
}

function mapQuestionDrafts(questions = [], required = true) {
  return (Array.isArray(questions) ? questions : []).map((question, index) => createQuestionDraft(question, index, required));
}

function isQuestionComplete(question = {}) {
  const prompt = String(question.prompt || '').trim();
  if (!prompt) return false;
  if (question.answerType === 'text') return true;
  return (Array.isArray(question.options) ? question.options : [])
    .some((option) => String(option?.label || '').trim());
}

function normalizeQuestionDrafts(questions = [], required = true) {
  return (Array.isArray(questions) ? questions : [])
    .filter((question) => question.enabled !== false && String(question.prompt || '').trim())
    .map((question, index) => {
      const prompt = String(question.prompt || '').trim();
      const depQuestionId = String(question.dependencyRule?.dependsOnQuestionId || '').trim();
      const depOptionValues = getDependencyTriggerValues(question.dependencyRule, question.dependsOn);
      const hasDep = Boolean(depQuestionId && depOptionValues.length > 0);
      const type = hasDep ? 'dependent' : (question.type === 'standard' ? 'standard' : 'option-specific');
      const options = (Array.isArray(question.options) ? question.options : [])
        .filter((option) => String(option.label || '').trim())
        .map((option, optionIndex) => {
          const parsedFactor = Number(option.factor);
          const safeFactor = Number.isFinite(parsedFactor) && parsedFactor > 0 ? parsedFactor : 1;
          return {
            value: getQuestionOptionSlug(option, optionIndex),
            label: String(option.label || '').trim(),
            imageUrl: String(option.imageUrl || '').trim(),
            priceAdder: Number(option.priceAdder || 0),
            materialAdder: Number(option.materialAdder || 0),
            pricingType: option.pricingType === 'multiplier' ? 'multiplier' : 'adder',
            factor: safeFactor,
            multiplier: option.pricingType === 'multiplier' ? safeFactor : 1,
          };
        });

      return {
        id: String(question.id || slugify(prompt) || `question_${index + 1}`).trim(),
        prompt,
        type,
        answerType: question.answerType === 'text' ? 'text' : 'enum',
        answerHint: String(question.answerHint || '').trim(),
        required,
        dependencyRule: hasDep
          ? {
              dependsOnQuestionId: depQuestionId,
              dependsOnOptionValue: depOptionValues[0],
              dependsOnOptionValues: depOptionValues,
            }
          : null,
        options,
      };
    });
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function snapToStep(value, min, step) {
  if (!step) return value;
  return min + (Math.round((value - min) / step) * step);
}

function coerceSliderValue(rawValue, min, max, step) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return min;
  return clampNumber(snapToStep(parsed, min, step), min, max);
}

const AI_INPUT_HIGHLIGHT_CLASS = 'border-amber-400/75 bg-amber-500/10 ring-1 ring-amber-400/35';
const AI_CARD_HIGHLIGHT_CLASS = 'border-amber-400/70 bg-amber-500/10 ring-1 ring-amber-400/30';

function AiChangeBadge({ status = '' }) {
  if (!status) return null;
  const isAdded = status === 'added';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
        isAdded
          ? 'border-emerald-400/45 bg-emerald-500/20 text-emerald-200'
          : 'border-amber-400/45 bg-amber-500/20 text-amber-200'
      }`}
    >
      <Sparkles className="h-2.5 w-2.5 shrink-0" />
      {isAdded ? 'AI added' : 'AI updated'}
    </span>
  );
}

function sameSortedStrings(left = [], right = []) {
  const a = [...new Set((Array.isArray(left) ? left : []).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))].sort();
  const b = [...new Set((Array.isArray(right) ? right : []).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))].sort();
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
}

function getOptionHighlight(option = {}, baselineOptions = []) {
  if (!Array.isArray(baselineOptions)) return null;
  const optId = String(option?.id || '').trim().toLowerCase();
  const optTitleSlug = slugify(option?.title || '');
  const baseline = baselineOptions.find((candidate) => {
    const candId = String(candidate?.id || '').trim().toLowerCase();
    const candSlug = slugify(candidate?.title || '');
    return (optId && candId === optId) || (optTitleSlug && candSlug === optTitleSlug);
  });

  if (!baseline) {
    return {
      status: 'added',
      changedFields: new Set(['title', 'price', 'description', 'requiresNoOptionSpecificQuestions', 'selectedQuestionIds']),
    };
  }

  const changedFields = new Set();
  if (String(option?.title || '').trim() !== String(baseline?.title || '').trim()) changedFields.add('title');
  if (Number(option?.price || 0) !== Number(baseline?.price || 0)) changedFields.add('price');
  if (String(option?.description || '').trim() !== String(baseline?.description || '').trim()) changedFields.add('description');
  if (Boolean(option?.requiresNoOptionSpecificQuestions) !== Boolean(baseline?.requiresNoOptionSpecificQuestions)) {
    changedFields.add('requiresNoOptionSpecificQuestions');
  }
  if (!sameSortedStrings(option?.selectedQuestionIds, baseline?.selectedQuestionIds)) {
    changedFields.add('selectedQuestionIds');
  }

  return changedFields.size > 0 ? { status: 'updated', changedFields } : null;
}

function getQuestionHighlight(question = {}, baselineQuestions = []) {
  if (!Array.isArray(baselineQuestions)) return null;
  const qId = slugify(question?.id || '');
  const qPromptSlug = slugify(question?.prompt || '');
  const baseline = baselineQuestions.find((candidate) => {
    const candId = slugify(candidate?.id || '');
    const candPromptSlug = slugify(candidate?.prompt || '');
    return (qId && candId === qId) || (qPromptSlug && candPromptSlug === qPromptSlug);
  });

  const subOptionHighlights = new Map();
  const currentOpts = Array.isArray(question?.options) ? question.options : [];
  if (!baseline) {
    currentOpts.forEach((opt, optIdx) => {
      const key = String(opt?.draftKey || getQuestionOptionSlug(opt, optIdx));
      subOptionHighlights.set(key, 'added');
    });
    return {
      status: 'added',
      changedFields: new Set(['prompt', 'type', 'answerType', 'answerHint', 'dependencyRule', 'options']),
      subOptionHighlights,
    };
  }

  const changedFields = new Set();
  if (String(question?.prompt || '').trim() !== String(baseline?.prompt || '').trim()) changedFields.add('prompt');
  if (String(question?.type || 'option-specific') !== String(baseline?.type || 'option-specific')) changedFields.add('type');
  if (String(question?.answerType || 'enum') !== String(baseline?.answerType || 'enum')) changedFields.add('answerType');
  if (String(question?.answerHint || '').trim() !== String(baseline?.answerHint || '').trim()) changedFields.add('answerHint');

  const curDepQ = String(question?.dependencyRule?.dependsOnQuestionId || '').trim().toLowerCase();
  const baseDepQ = String(baseline?.dependencyRule?.dependsOnQuestionId || '').trim().toLowerCase();
  const curDepVals = getDependencyTriggerValues(question?.dependencyRule, question?.dependsOn);
  const baseDepVals = getDependencyTriggerValues(baseline?.dependencyRule, baseline?.dependsOn);
  if (curDepQ !== baseDepQ || !sameSortedStrings(curDepVals, baseDepVals)) {
    changedFields.add('dependencyRule');
  }

  const baselineOpts = Array.isArray(baseline?.options) ? baseline.options : [];
  if (currentOpts.length !== baselineOpts.length) changedFields.add('options');

  currentOpts.forEach((opt, optIdx) => {
    const optSlug = getQuestionOptionSlug(opt, optIdx);
    const key = String(opt?.draftKey || optSlug);
    const baseOpt = baselineOpts.find((candidate, candIdx) => getQuestionOptionSlug(candidate, candIdx) === optSlug);
    if (!baseOpt) {
      subOptionHighlights.set(key, 'added');
      changedFields.add('options');
      return;
    }
    const optDiffers = String(opt?.label || '').trim() !== String(baseOpt?.label || '').trim()
      || String(opt?.pricingType || 'adder') !== String(baseOpt?.pricingType || 'adder')
      || Number(opt?.priceAdder || 0) !== Number(baseOpt?.priceAdder || 0)
      || Number(opt?.factor ?? 1) !== Number(baseOpt?.factor ?? 1);
    if (optDiffers) {
      subOptionHighlights.set(key, 'updated');
      changedFields.add('options');
    }
  });

  return changedFields.size > 0
    ? { status: 'updated', changedFields, subOptionHighlights }
    : null;
}

function dataUrlToImageFile(dataUrl = '', fileNamePrefix = 'ai_option') {
  const match = String(dataUrl || '').trim().match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let idx = 0; idx < binary.length; idx += 1) {
    bytes[idx] = binary.charCodeAt(idx);
  }
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const safePrefix = slugify(fileNamePrefix) || 'ai_option';
  return new File([bytes], `${safePrefix}_${Date.now()}.${ext}`, { type: mimeType });
}

function ServiceOptionEditor({
  option,
  siblingOptions = [],
  allQuestions = [],
  serviceContext = {},
  highlight = null,
  onChange,
  onPreviewImage,
  onRemove,
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [imageError, setImageError] = useState('');
  const [matchSiblingStyle, setMatchSiblingStyle] = useState(true);
  const changed = highlight?.changedFields || new Set();

  const referenceSibling = useMemo(
    () => siblingOptions.find((candidate) => (
      candidate
      && candidate.draftKey !== option.draftKey
      && String(candidate.imageUrl || '').trim()
    )) || null,
    [option.draftKey, siblingOptions],
  );

  const optionSpecificCandidates = useMemo(
    () => allQuestions.filter((q) => isOptionSpecificQuestion(q)),
    [allQuestions],
  );
  const hasDependentQuestions = useMemo(
    () => allQuestions.some((q) => hasQuestionDependency(q) || q.type === 'dependent'),
    [allQuestions],
  );

  const handlePriceChange = (rawValue) => {
    onChange({ ...option, price: coerceSliderValue(rawValue, 0, 2000, 5) });
  };

  const handleImageFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setImageError('');
    try {
      const uploads = await uploadServiceCatalogImages({
        serviceId: option.draftKey || 'service_option',
        files: [file],
      });
      if (uploads && uploads[0]?.uri) {
        onChange({ ...option, imageUrl: uploads[0].uri });
      }
    } catch (err) {
      console.error('Failed to upload option image:', err);
      setImageError(err?.message || 'Failed to upload image.');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleGenerateAiImage = async () => {
    if (!String(option.title || '').trim()) {
      setImageError('Enter an option title first so AI knows what picture to generate.');
      return;
    }
    setIsGeneratingAi(true);
    setImageError('');
    try {
      const refUrl = matchSiblingStyle && referenceSibling ? String(referenceSibling.imageUrl || '').trim() : '';
      const result = await generateAdminOptionImage({
        targetType: 'service_option',
        consistencyMode: refUrl ? 'consistent' : 'unique',
        serviceContext,
        optionContext: {
          title: option.title,
          description: option.description,
          price: option.price,
        },
        referenceImageDataUrl: isDataUrlImage(refUrl) ? refUrl : '',
        referenceImageUrl: !isDataUrlImage(refUrl) && /^https:\/\//i.test(refUrl) ? refUrl : '',
      });
      const stampedUrl = await finalizeAiGeneratedImage(result.imageDataUrl);
      onChange({ ...option, imageUrl: stampedUrl });
    } catch (err) {
      setImageError(err?.message || 'Unable to generate option picture right now.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const toggleQuestionId = (questionId) => {
    const currentIds = Array.isArray(option.selectedQuestionIds) ? option.selectedQuestionIds : [];
    const exists = currentIds.includes(questionId);
    const nextIds = exists ? currentIds.filter((id) => id !== questionId) : [...currentIds, questionId];
    onChange({ ...option, selectedQuestionIds: nextIds });
  };

  const hasUnsavedAiPreview = isDataUrlImage(option.imageUrl);

  return (
    <div className="min-w-0 w-full space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Option title</span>
            {changed.has('title') ? <AiChangeBadge status={highlight?.status || 'updated'} /> : null}
          </div>
          <input
            value={option.title}
            onChange={(event) => onChange({ ...option, title: event.target.value })}
            placeholder="e.g. Executive Fade & Beard Trim"
            className={`w-full min-w-0 rounded-2xl border px-4 py-3 text-sm text-white outline-none ${
              changed.has('title') ? AI_INPUT_HIGHLIGHT_CLASS : 'border-white/10 bg-ink-950/50'
            }`}
          />
        </label>
        <div className="min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Price (R)</span>
            {changed.has('price') ? <AiChangeBadge status={highlight?.status || 'updated'} /> : null}
          </div>
          <div className={`flex min-w-0 items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold text-white ${
            changed.has('price') ? AI_INPUT_HIGHLIGHT_CLASS : 'border-white/10 bg-white/5'
          }`}>
            <span className="shrink-0">R</span>
            <input
              type="number"
              min={0}
              max={2000}
              step={5}
              value={option.price}
              onChange={(event) => handlePriceChange(event.target.value)}
              className="w-full min-w-0 bg-transparent text-right text-white outline-none"
            />
          </div>
        </div>
      </div>

      <label className="block min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Short description</span>
          {changed.has('description') ? <AiChangeBadge status={highlight?.status || 'updated'} /> : null}
        </div>
        <textarea
          value={option.description}
          onChange={(event) => onChange({ ...option, description: event.target.value })}
          rows={2}
          placeholder="Briefly describe what this option includes..."
          className={`w-full min-w-0 rounded-[22px] border px-4 py-3 text-sm text-white outline-none ${
            changed.has('description') ? AI_INPUT_HIGHLIGHT_CLASS : 'border-white/10 bg-ink-950/50'
          }`}
        />
      </label>

      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Option picture (Optional · Firebase Storage)</span>
          {hasUnsavedAiPreview ? (
            <span className="rounded-lg border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
              AI preview · saves to Firebase on Save
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          {option.imageUrl ? (
            <button
              type="button"
              onClick={() => onPreviewImage?.({
                url: option.imageUrl,
                title: option.title || 'Service option picture',
                subtitle: hasUnsavedAiPreview
                  ? 'Generated by AI (unsaved preview — will upload to Firebase Storage on save)'
                  : 'Saved in Firebase Storage',
              })}
              title="Click to expand picture"
              aria-label="Expand option picture"
              className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/15 bg-white/5 transition hover:border-brand/60 focus:outline-none"
            >
              <img src={option.imageUrl} alt="Option preview" className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition group-hover:opacity-100">
                <ZoomIn className="h-4 w-4 text-white" />
              </span>
            </button>
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-ink-400">
              <ImageIcon className="h-6 w-6" />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white hover:bg-white/10 transition">
                <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                <span>{isUploading ? 'Uploading to Firebase...' : 'Upload picture from device'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  disabled={isUploading || isGeneratingAi}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={handleGenerateAiImage}
                disabled={isGeneratingAi || isUploading}
                className="inline-flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/20 px-3 py-2 text-xs font-bold text-white transition hover:bg-brand/30 disabled:opacity-60"
              >
                {isGeneratingAi ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-soft" />
                )}
                <span>{isGeneratingAi ? 'Generating with AI...' : 'Generate by AI'}</span>
              </button>
              {option.imageUrl ? (
                <button
                  type="button"
                  onClick={() => onChange({ ...option, imageUrl: '' })}
                  disabled={isUploading || isGeneratingAi}
                  className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-500/20 disabled:opacity-60"
                >
                  Remove image
                </button>
              ) : null}
            </div>
            {referenceSibling ? (
              <label className="inline-flex items-center gap-2 text-xs text-ink-300">
                <input
                  type="checkbox"
                  checked={matchSiblingStyle}
                  onChange={(event) => setMatchSiblingStyle(event.target.checked)}
                />
                <span>Match visual style of existing option picture ({referenceSibling.title || 'other option'})</span>
              </label>
            ) : null}
            {imageError ? (
              <p className="text-xs font-bold text-rose-300">{imageError}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className={`min-w-0 rounded-[20px] border p-3 space-y-3 ${
        changed.has('selectedQuestionIds') || changed.has('requiresNoOptionSpecificQuestions')
          ? AI_CARD_HIGHLIGHT_CLASS
          : 'border-white/10 bg-white/5'
      }`}>
        <label className="flex min-w-0 items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 shrink-0"
            checked={Boolean(option.requiresNoOptionSpecificQuestions)}
            onChange={(event) => onChange({ ...option, requiresNoOptionSpecificQuestions: event.target.checked })}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-white">Requires no option-specific questions</p>
              {changed.has('requiresNoOptionSpecificQuestions') ? <AiChangeBadge status="updated" /> : null}
            </div>
            <p className="text-xs text-ink-300">When checked, this option skips option-specific questions and uses only standard questions.</p>
          </div>
        </label>

        {!option.requiresNoOptionSpecificQuestions && optionSpecificCandidates.length > 0 ? (
          <div className="min-w-0 space-y-2 pt-2 border-t border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Associated Option-Specific Questions</p>
              {changed.has('selectedQuestionIds') ? <AiChangeBadge status={highlight?.status || 'updated'} /> : null}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {optionSpecificCandidates.map((q) => {
                const isSelected = (option.selectedQuestionIds || []).includes(q.id);
                return (
                  <label key={q.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-ink-950/30 px-3 py-2 text-xs text-white">
                    <input
                      type="checkbox"
                      className="shrink-0"
                      checked={isSelected}
                      onChange={() => toggleQuestionId(q.id)}
                    />
                    <span className="min-w-0 flex-1 truncate">{q.prompt || q.id}</span>
                  </label>
                );
              })}
            </div>
            {hasDependentQuestions ? (
              <p className="text-[11px] text-ink-300">
                Dependent questions are excluded here because they follow their parent question automatically once selected.
              </p>
            ) : null}
          </div>
        ) : !option.requiresNoOptionSpecificQuestions && hasDependentQuestions ? (
          <p className="text-[11px] text-ink-300 pt-2 border-t border-white/10">
            Only non-dependent option-specific questions can be assigned here; dependent follow-up questions unlock automatically from their parent question.
          </p>
        ) : null}
      </div>
    </div>
  );
}



function mergeQuestionDrafts(current = [], suggestions = [], required = true) {
  const currentQuestions = Array.isArray(current) ? current : [];
  const nextQuestions = [...currentQuestions];
  const seen = new Set(
    currentQuestions.map((question) => (
      `${String(question.id || '').trim().toLowerCase()}::${String(question.prompt || '').trim().toLowerCase()}`
    )),
  );

  (Array.isArray(suggestions) ? suggestions : []).forEach((question, index) => {
    const draft = createQuestionDraft(question, currentQuestions.length + index, required);
    const key = `${String(draft.id || '').trim().toLowerCase()}::${String(draft.prompt || '').trim().toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    nextQuestions.push(draft);
  });

  return nextQuestions;
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
  isHighlighted = false,
}) {
  const handleValueChange = (rawValue) => {
    onChange(coerceSliderValue(rawValue, min, max, step));
  };

  return (
    <label className={`space-y-3 rounded-2xl p-2 transition ${isHighlighted ? 'bg-amber-500/10 ring-1 ring-amber-400/40' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">{label}</span>
            {isHighlighted ? <AiChangeBadge status="updated" /> : null}
          </div>
          {help ? <p className="mt-1 text-xs leading-5 text-ink-300">{help}</p> : null}
        </div>
        <div className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-bold text-white ${
          isHighlighted ? AI_INPUT_HIGHLIGHT_CLASS : 'border-white/10 bg-white/5'
        }`}>
          <span>{prefix}</span>
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => handleValueChange(event.target.value)}
            className="w-20 bg-transparent text-right text-white outline-none"
          />
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => handleValueChange(event.target.value)}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#ff7a59]"
      />
    </label>
  );
}

async function prepareQuestionOptionImageFile(file) {
  if (!file || typeof document === 'undefined' || typeof Image === 'undefined') return file;
  const mime = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  const needsConversion = mime === 'image/webp'
    || mime === 'image/avif'
    || mime === 'image/gif'
    || mime === 'image/svg+xml'
    || /\.(?:webp|avif|gif|svg)$/i.test(name);
  if (!needsConversion) return file;

  let objectUrl = '';
  try {
    objectUrl = URL.createObjectURL(file);
    const img = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Image decode failed'));
      element.src = objectUrl;
    });
    const width = img.naturalWidth || img.width || 1024;
    const height = img.naturalHeight || img.height || 1024;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) return file;
    const baseName = String(file.name || 'option_picture').replace(/\.[^.]+$/, '') || 'option_picture';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } catch (_error) {
    return file;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function QuestionOptionEditor({
  option,
  question,
  siblingOptions = [],
  serviceContext = {},
  consistencyMode = 'consistent',
  storageScope = 'question_option',
  aiStatus = '',
  isBatchGenerating = false,
  onChange,
  onPreviewImage,
  onRemove,
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const referenceSiblingUrl = useMemo(() => {
    if (consistencyMode !== 'consistent') return '';
    const match = (Array.isArray(siblingOptions) ? siblingOptions : []).find((candidate) => (
      candidate
      && (candidate.draftKey ? candidate.draftKey !== option.draftKey : candidate !== option)
      && String(candidate.imageUrl || '').trim()
    ));
    return match ? String(match.imageUrl || '').trim() : '';
  }, [consistencyMode, option, siblingOptions]);

  const handlePriceAdderChange = (rawValue) => {
    onChange({ ...option, priceAdder: coerceSliderValue(rawValue, 0, 5000, 5) });
  };

  const handleFactorChange = (rawValue) => {
    if (rawValue === '') {
      onChange({ ...option, factor: '' });
      return;
    }
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed)) {
      onChange({ ...option, factor: Math.max(0.01, Math.min(1000, parsed)) });
    }
  };

  const handlePictureUpload = async (event) => {
    const pickedFile = event.target.files?.[0];
    if (!pickedFile) return;
    setIsUploading(true);
    setUploadError('');
    try {
      const uploadFile = await prepareQuestionOptionImageFile(pickedFile);
      const uploads = await uploadServiceCatalogImages({
        serviceId: storageScope || option.draftKey || 'question_option',
        files: [uploadFile],
      });
      if (uploads && uploads[0]?.uri) {
        onChange({ ...option, imageUrl: uploads[0].uri });
      }
    } catch (error) {
      setUploadError(error?.message || 'Unable to upload picture.');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleGenerateAiPicture = async () => {
    if (!String(option.label || '').trim()) {
      setUploadError('Enter an option label before generating a picture with AI.');
      return;
    }
    setIsGeneratingAi(true);
    setUploadError('');
    try {
      const siblingLabels = (Array.isArray(siblingOptions) ? siblingOptions : [])
        .map((item) => String(item?.label || '').trim())
        .filter(Boolean);
      const result = await generateAdminOptionImage({
        targetType: 'question_option',
        consistencyMode: consistencyMode === 'unique' ? 'unique' : 'consistent',
        serviceContext,
        questionContext: {
          questionId: question?.id || '',
          prompt: question?.prompt || '',
          optionLabel: option.label,
          siblingOptionLabels: siblingLabels,
        },
        referenceImageDataUrl: isDataUrlImage(referenceSiblingUrl) ? referenceSiblingUrl : '',
        referenceImageUrl: !isDataUrlImage(referenceSiblingUrl) && /^https:\/\//i.test(referenceSiblingUrl) ? referenceSiblingUrl : '',
      });
      const stampedUrl = await finalizeAiGeneratedImage(result.imageDataUrl);
      onChange({ ...option, imageUrl: stampedUrl });
    } catch (error) {
      setUploadError(error?.message || 'Unable to generate AI picture.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const isMultiplier = option.pricingType === 'multiplier';
  const hasUnsavedAiPreview = isDataUrlImage(option.imageUrl);
  const busy = isUploading || isGeneratingAi || isBatchGenerating;

  return (
    <div className={`rounded-2xl border p-3 space-y-3 ${
      aiStatus ? AI_CARD_HIGHLIGHT_CLASS : 'border-white/10 bg-ink-950/30'
    }`}>
      {aiStatus ? (
        <div className="flex items-center justify-between">
          <AiChangeBadge status={aiStatus} />
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto]">
        <input
          value={option.label}
          onChange={(event) => onChange({ ...option, label: event.target.value })}
          placeholder="Option label"
          className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none"
        />
        <select
          value={option.pricingType || 'adder'}
          onChange={(event) => onChange({ ...option, pricingType: event.target.value })}
          className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-3 py-3 text-sm text-white outline-none"
        >
          <option value="adder">Adder (R)</option>
          <option value="multiplier">Multiplier (×)</option>
        </select>
        {isMultiplier ? (
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <span className="text-sm font-bold text-ink-200">×</span>
            <input
              type="number"
              min={0.01}
              max={1000}
              step="any"
              value={option.factor === '' ? '' : (option.factor ?? 1)}
              onChange={(event) => handleFactorChange(event.target.value)}
              onBlur={() => {
                const parsed = Number(option.factor);
                if (!Number.isFinite(parsed) || parsed <= 0) {
                  onChange({ ...option, factor: 1 });
                }
              }}
              className="w-full bg-transparent text-white outline-none text-sm font-bold"
              placeholder="1.0"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white">
            <span>R</span>
            <input
              type="number"
              min={0}
              max={5000}
              step={5}
              value={option.priceAdder}
              onChange={(event) => handlePriceAdderChange(event.target.value)}
              className="w-full bg-transparent text-right text-white outline-none"
            />
          </div>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        {option.imageUrl ? (
          <button
            type="button"
            onClick={() => onPreviewImage?.({
              url: option.imageUrl,
              title: option.label || 'Question option picture',
              subtitle: hasUnsavedAiPreview
                ? 'Generated by AI (unsaved preview — will upload to Firebase Storage on save)'
                : 'Saved in Firebase Storage',
            })}
            title="Click to expand picture"
            aria-label="Expand question option picture"
            className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/15 bg-white/5 transition hover:border-brand/60 focus:outline-none"
          >
            <img
              src={option.imageUrl}
              alt={option.label || 'Question option preview'}
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition group-hover:opacity-100">
              <ZoomIn className="h-3.5 w-3.5 text-white" />
            </span>
          </button>
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/5 text-ink-400">
            <ImageIcon className="h-5 w-5" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/10">
            <ImageIcon className="h-3.5 w-3.5 shrink-0" />
            <span>
              {isUploading
                ? 'Uploading picture...'
                : option.imageUrl
                  ? 'Change picture'
                  : 'Upload picture'}
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={handlePictureUpload}
              disabled={busy}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={handleGenerateAiPicture}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/20 px-3 py-2 text-xs font-bold text-white transition hover:bg-brand/30 disabled:opacity-60"
          >
            {isGeneratingAi || isBatchGenerating ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-soft" />
            )}
            <span>{isGeneratingAi ? 'Generating...' : 'Generate using AI'}</span>
          </button>
          {option.imageUrl ? (
            <button
              type="button"
              onClick={() => onChange({ ...option, imageUrl: '' })}
              disabled={busy}
              className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-500/20 disabled:opacity-60"
            >
              Remove picture
            </button>
          ) : null}
          {hasUnsavedAiPreview ? (
            <span className="rounded-lg border border-amber-400/40 bg-amber-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200">
              AI preview · unsaved
            </span>
          ) : null}
        </div>
        {uploadError ? (
          <p className="w-full text-xs font-bold text-red-300">{uploadError}</p>
        ) : null}
      </div>
    </div>
  );
}

function MultiSelectAnswerDropdown({ options = [], selectedValues = [], onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const selectedLower = new Set((Array.isArray(selectedValues) ? selectedValues : [])
    .map((val) => String(val || '').trim().toLowerCase())
    .filter(Boolean));
  const selectedLabels = options
    .filter((opt) => selectedLower.has(String(opt.value || '').trim().toLowerCase()))
    .map((opt) => opt.label);

  const summaryText = selectedLabels.length === 0
    ? 'Select triggering answer(s)...'
    : selectedLabels.length <= 2
      ? selectedLabels.join(', ')
      : `${selectedLabels.slice(0, 2).join(', ')} (+${selectedLabels.length - 2} more)`;

  const toggleOptionValue = (optionValue) => {
    const normalized = String(optionValue || '').trim();
    const normalizedLower = normalized.toLowerCase();
    const exists = selectedLower.has(normalizedLower);
    const nextValues = exists
      ? (Array.isArray(selectedValues) ? selectedValues : []).filter(
        (item) => String(item || '').trim().toLowerCase() !== normalizedLower,
      )
      : [...(Array.isArray(selectedValues) ? selectedValues : []), normalized];
    onChange(nextValues);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-white/10 bg-ink-950/50 px-3 py-2.5 text-left text-sm text-white outline-none transition hover:border-white/20"
      >
        <span className={`truncate ${selectedLabels.length === 0 ? 'text-ink-300' : 'text-white font-medium'}`}>
          {summaryText}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-300 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen ? (
        <div className="mt-2 rounded-2xl border border-white/15 bg-ink-950/95 p-2.5 shadow-xl space-y-2">
          {options.length > 1 ? (
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2 text-xs">
              <button
                type="button"
                onClick={() => onChange(options.map((opt) => opt.value))}
                className="font-bold text-brand-soft hover:underline"
              >
                Select all
              </button>
              {selectedValues.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="font-bold text-ink-300 hover:text-white"
                >
                  Clear
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
            {options.map((opt) => {
              const checked = selectedLower.has(String(opt.value || '').trim().toLowerCase());
              return (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition ${
                    checked ? 'bg-brand/20 text-white' : 'text-ink-200 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOptionValue(opt.value)}
                    className="shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function QuestionEditor({
  title,
  description,
  required = true,
  questions,
  allQuestions = [],
  suggestions = [],
  serviceContext = {},
  storageScope = 'question_option',
  highlightMap = null,
  onChange,
  onUpdateQuestionByKey,
  onDependencyAssigned,
  onPreviewImage,
  onPersistQuestions,
  isMutating = false,
  resetKey = '',
  saveVersion = 0,
}) {
  const [expandedQuestionIndex, setExpandedQuestionIndex] = useState(-1);
  const [questionStatusMessage, setQuestionStatusMessage] = useState('');
  const [consistencyModeByQuestion, setConsistencyModeByQuestion] = useState({});
  const [batchImageStateByQuestion, setBatchImageStateByQuestion] = useState({});
  const allSourceQuestions = allQuestions.length ? allQuestions : questions;

  useEffect(() => {
    setExpandedQuestionIndex(-1);
    setQuestionStatusMessage('');
  }, [resetKey]);

  useEffect(() => {
    if (!saveVersion) return;
    setExpandedQuestionIndex(-1);
    setQuestionStatusMessage('');
  }, [saveVersion]);

  const updateQuestion = (targetIndex, nextQuestion) => {
    onChange(questions.map((question, index) => (index === targetIndex ? nextQuestion : question)));
  };

  const handleGenerateAllPictures = async (question) => {
    const qKey = question.draftKey || question.id;
    const mode = consistencyModeByQuestion[qKey] === 'unique' ? 'unique' : 'consistent';
    const labeledEntries = (Array.isArray(question.options) ? question.options : [])
      .map((opt, idx) => ({ opt, idx }))
      .filter(({ opt }) => String(opt?.label || '').trim());

    if (!labeledEntries.length) {
      setBatchImageStateByQuestion((prev) => ({
        ...prev,
        [qKey]: { busy: false, progress: '', error: 'Add at least one option label before generating AI pictures.' },
      }));
      return;
    }

    const siblingLabels = labeledEntries.map(({ opt }) => String(opt.label || '').trim());
    let completedCount = 0;
    const totalCount = labeledEntries.length;

    const setProgress = (progressText, errorText = '', busy = true) => {
      setBatchImageStateByQuestion((prev) => ({
        ...prev,
        [qKey]: { busy, progress: progressText, error: errorText },
      }));
    };

    const assignOptionImage = (targetDraftKey, targetIdx, nextImageUrl) => {
      if (typeof onUpdateQuestionByKey === 'function') {
        onUpdateQuestionByKey(question.draftKey, (latestQuestion) => ({
          ...latestQuestion,
          options: (Array.isArray(latestQuestion.options) ? latestQuestion.options : []).map((item, idx) => {
            const match = targetDraftKey ? item.draftKey === targetDraftKey : idx === targetIdx;
            return match ? { ...item, imageUrl: nextImageUrl } : item;
          }),
        }));
      }
    };

    setProgress(`Generating 1 of ${totalCount}...`);
    try {
      const requestForEntry = async (entry, refDataUrl = '') => {
        const result = await generateAdminOptionImage({
          targetType: 'question_option',
          consistencyMode: mode,
          serviceContext,
          questionContext: {
            questionId: question.id,
            prompt: question.prompt,
            optionLabel: entry.opt.label,
            siblingOptionLabels: siblingLabels,
          },
          referenceImageDataUrl: refDataUrl,
        });
        return finalizeAiGeneratedImage(result.imageDataUrl);
      };

      if (mode === 'consistent') {
        const firstEntry = labeledEntries[0];
        const anchorUrl = await requestForEntry(firstEntry, '');
        assignOptionImage(firstEntry.opt.draftKey, firstEntry.idx, anchorUrl);
        completedCount += 1;

        const remaining = labeledEntries.slice(1);
        for (let cursor = 0; cursor < remaining.length; cursor += 2) {
          const chunk = remaining.slice(cursor, cursor + 2);
          setProgress(`Generating ${Math.min(totalCount, completedCount + 1)}–${Math.min(totalCount, completedCount + chunk.length)} of ${totalCount} (matching first picture)...`);
          await Promise.all(
            chunk.map(async (entry) => {
              const compactUrl = await requestForEntry(entry, anchorUrl);
              assignOptionImage(entry.opt.draftKey, entry.idx, compactUrl);
              completedCount += 1;
            }),
          );
        }
      } else {
        for (let cursor = 0; cursor < labeledEntries.length; cursor += 3) {
          const chunk = labeledEntries.slice(cursor, cursor + 3);
          setProgress(`Generating ${Math.min(totalCount, completedCount + 1)}–${Math.min(totalCount, completedCount + chunk.length)} of ${totalCount}...`);
          await Promise.all(
            chunk.map(async (entry) => {
              const compactUrl = await requestForEntry(entry, '');
              assignOptionImage(entry.opt.draftKey, entry.idx, compactUrl);
              completedCount += 1;
            }),
          );
        }
      }

      setProgress(`Generated ${completedCount} picture${completedCount === 1 ? '' : 's'} (unsaved previews).`, '', false);
    } catch (error) {
      setProgress('', error?.message || 'Failed to generate all option pictures.', false);
    }
  };

  const removeQuestion = (targetIndex) => {
    onChange(questions.filter((_, index) => index !== targetIndex));
    if (expandedQuestionIndex === targetIndex) setExpandedQuestionIndex(-1);
    else if (expandedQuestionIndex > targetIndex) setExpandedQuestionIndex((prev) => prev - 1);
  };

  const autoSavePreviousOpenQuestion = async (nextIndex = -1) => {
    if (expandedQuestionIndex < 0 || expandedQuestionIndex === nextIndex) return;
    const openQuestion = questions[expandedQuestionIndex];
    if (!openQuestion || !isQuestionComplete(openQuestion) || typeof onPersistQuestions !== 'function') return;
    try {
      const persisted = await onPersistQuestions(questions);
      if (persisted) {
        setQuestionStatusMessage('Previous question auto-saved.');
      }
    } catch (error) {
      setQuestionStatusMessage(error.message || 'Could not auto-save previous question.');
    }
  };

  const addQuestion = async () => {
    setQuestionStatusMessage('');
    await autoSavePreviousOpenQuestion(-1);
    const usedIds = new Set(allSourceQuestions.map((q) => String(q.id || '').trim()).filter(Boolean));
    let seq = allSourceQuestions.length + 1;
    while (usedIds.has(`question_${seq}`)) seq += 1;
    const nextQuestions = [
      ...questions,
      createQuestionDraft({
        id: `question_${seq}`,
        prompt: '',
        answerType: 'enum',
        options: [],
      }, seq - 1, required),
    ];
    onChange(nextQuestions);
    setExpandedQuestionIndex(nextQuestions.length - 1);
  };

  const handleEditQuestion = async (targetIndex) => {
    setQuestionStatusMessage('');
    await autoSavePreviousOpenQuestion(targetIndex);
    setExpandedQuestionIndex(targetIndex);
  };

  const handleSaveSingleQuestion = async (targetIndex) => {
    const question = questions[targetIndex];
    if (!question) return;
    if (!isQuestionComplete(question)) {
      setQuestionStatusMessage('Please enter a question prompt and at least one option (or switch to Text answer) before saving.');
      return;
    }
    const depQ = String(question.dependencyRule?.dependsOnQuestionId || '').trim();
    const depVals = getDependencyTriggerValues(question.dependencyRule, question.dependsOn);
    if (depQ && depVals.length === 0) {
      setQuestionStatusMessage('Please choose at least one parent answer that triggers this dependency (or select None) before saving.');
      return;
    }

    setQuestionStatusMessage('');
    try {
      const persisted = typeof onPersistQuestions === 'function'
        ? await onPersistQuestions(questions)
        : false;
      setExpandedQuestionIndex(-1);
      setQuestionStatusMessage(
        persisted
          ? 'Question saved to Firestore.'
          : 'Question staged. Click "Create service" below to save the new service.',
      );
    } catch (error) {
      setQuestionStatusMessage(error.message || 'Unable to save question.');
    }
  };

  const appendSuggestedQuestion = (question) => {
    setQuestionStatusMessage('');
    onChange(mergeQuestionDrafts(questions, [question], true));
  };

  const appendAllSuggestedQuestions = () => {
    setQuestionStatusMessage('');
    onChange(mergeQuestionDrafts(questions, suggestions, required));
  };

  return (
    <div className="min-w-0 w-full rounded-[24px] border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white">{title}</p>
          <p className="mt-1 text-sm leading-6 text-ink-200">{description}</p>
        </div>
        <button
          type="button"
          onClick={addQuestion}
          disabled={isMutating}
          className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          Add question
        </button>
      </div>

      {questionStatusMessage ? (
        <p className="mt-3 text-xs font-bold text-brand-soft">{questionStatusMessage}</p>
      ) : null}

      {suggestions.length ? (
        <div className="mt-4 rounded-[20px] border border-dashed border-white/10 bg-ink-950/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-white">Suggested questions</p>
              <p className="mt-1 text-xs leading-5 text-ink-300">Click one to add it, or apply the whole suggested set for this service.</p>
            </div>
            <button
              type="button"
              onClick={appendAllSuggestedQuestions}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white"
            >
              <Sparkles className="h-4 w-4" />
              Apply all
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((question, index) => (
              <button
                key={`${question.id || question.prompt || 'question'}_${index}`}
                type="button"
                onClick={() => appendSuggestedQuestion(question)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-ink-100 transition hover:border-white/20 hover:bg-white/10"
              >
                {question.prompt}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 min-w-0 w-full space-y-3">
        {questions.length ? questions.map((question, index) => {
          const isExpanded = expandedQuestionIndex === index;
          const qHighlight = highlightMap?.get(question.draftKey || question.id || index) || null;
          const changed = qHighlight?.changedFields || new Set();
          const answerSummary = question.answerType === 'text'
            ? 'Text answer'
            : `Options (${Array.isArray(question.options) ? question.options.length : 0})`;
          const pictureCount = question.answerType === 'text'
            ? 0
            : (Array.isArray(question.options) ? question.options.filter((opt) => String(opt?.imageUrl || '').trim()).length : 0);
          const pictureSummary = pictureCount > 0
            ? ` • ${pictureCount} picture${pictureCount === 1 ? '' : 's'}`
            : '';
          const isDependent = hasQuestionDependency(question) || question.type === 'dependent';
          const typeSummary = isDependent
            ? 'Dependent (follows parent)'
            : question.type === 'standard'
              ? 'Standard'
              : 'Option-specific';
          const depQuestionId = String(question.dependencyRule?.dependsOnQuestionId || '').trim();
          const depOptionValues = getDependencyTriggerValues(question.dependencyRule, question.dependsOn);
          const eligibleParentQuestions = allSourceQuestions.filter((candidate) => (
            candidate
            && candidate.id
            && candidate.id !== question.id
            && candidate.enabled !== false
            && !wouldCreateDependencyCycle(question.id, candidate.id, allSourceQuestions)
          ));
          const parentQuestion = allSourceQuestions.find((candidate) => candidate.id === depQuestionId && candidate.id !== question.id) || null;
          const parentOptions = (Array.isArray(parentQuestion?.options) ? parentQuestion.options : [])
            .map((opt, optIdx) => ({
              value: getQuestionOptionSlug(opt, optIdx),
              label: String(opt?.label || opt?.value || '').trim(),
            }))
            .filter((opt) => opt.label && opt.value);
          const matchedParentLabels = depOptionValues.map((val) => {
            const match = parentOptions.find((opt) => opt.value.toLowerCase() === val.toLowerCase());
            return match?.label || val;
          });
          const dependencySummary = depQuestionId
            ? ` • Depends on: ${parentQuestion?.prompt || depQuestionId} = ${matchedParentLabels.length ? matchedParentLabels.join(' or ') : 'select answer(s)'}`
            : '';

          const qKey = question.draftKey || question.id;
          const consistencyMode = consistencyModeByQuestion[qKey] === 'unique' ? 'unique' : 'consistent';
          const batchState = batchImageStateByQuestion[qKey] || { busy: false, progress: '', error: '' };

          return (
            <div
              key={question.draftKey || `question_${index}`}
              className={`min-w-0 w-full rounded-[22px] border p-3 sm:p-4 transition ${
                qHighlight ? AI_CARD_HIGHLIGHT_CLASS : 'border-white/10 bg-ink-950/40'
              }`}
            >
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/25 text-brand-soft font-bold text-sm">
                    #{index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-bold text-white text-sm sm:text-base">{question.prompt || `Question ${index + 1} (Untitled)`}</p>
                      {qHighlight ? <AiChangeBadge status={qHighlight.status} /> : null}
                    </div>
                    <p className="truncate text-xs text-ink-300">
                      {typeSummary} • {answerSummary}{pictureSummary}{dependencySummary}{question.enabled === false ? ' • Disabled' : ''}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {isExpanded ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSaveSingleQuestion(index)}
                        disabled={isMutating}
                        title="Save question details"
                        aria-label="Save question details"
                        className="inline-flex items-center justify-center rounded-xl bg-emerald-500/20 p-2 text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-60"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedQuestionIndex(-1);
                          setQuestionStatusMessage('');
                        }}
                        title="Collapse question"
                        aria-label="Collapse question"
                        className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 text-ink-200 transition hover:bg-white/10 hover:text-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleEditQuestion(index)}
                      title="Edit question details"
                      aria-label="Edit question details"
                      className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 text-brand-soft transition hover:bg-white/10"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => removeQuestion(index)}
                    title="Remove question"
                    aria-label="Remove question"
                    className="inline-flex items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 p-2 text-red-300 transition hover:bg-red-500/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {isExpanded ? (
                <div className="mt-4 min-w-0 w-full space-y-4 pt-4 border-t border-white/10">
                  <label className="flex items-center gap-2 text-sm text-ink-200">
                    <input
                      type="checkbox"
                      checked={question.enabled !== false}
                      onChange={(event) => updateQuestion(index, { ...question, enabled: event.target.checked })}
                    />
                    Enabled
                  </label>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
                    <input
                      value={question.prompt}
                      onChange={(event) => updateQuestion(index, {
                        ...question,
                        prompt: event.target.value,
                      })}
                      placeholder="Question prompt"
                      className={`w-full rounded-2xl border px-4 py-3 text-sm text-white outline-none ${
                        changed.has('prompt') ? AI_INPUT_HIGHLIGHT_CLASS : 'border-white/10 bg-ink-950/50'
                      }`}
                    />
                    {depQuestionId ? (
                      <select
                        value="dependent"
                        disabled
                        title="Dependent questions automatically follow their parent question and cannot be assigned as option-specific"
                        className="w-full cursor-not-allowed rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-ink-200 outline-none"
                      >
                        <option value="dependent">Dependent (Follows parent)</option>
                      </select>
                    ) : (
                      <select
                        value={question.type === 'standard' ? 'standard' : 'option-specific'}
                        onChange={(event) => updateQuestion(index, { ...question, type: event.target.value })}
                        className={`w-full rounded-2xl border px-4 py-3 text-sm text-white outline-none ${
                          changed.has('type') ? AI_INPUT_HIGHLIGHT_CLASS : 'border-white/10 bg-ink-950/50'
                        }`}
                      >
                        <option value="option-specific">Option-specific</option>
                        <option value="standard">Standard (Always asked)</option>
                      </select>
                    )}
                    <select
                      value={question.answerType}
                      onChange={(event) => updateQuestion(index, { ...question, answerType: event.target.value })}
                      className={`w-full rounded-2xl border px-4 py-3 text-sm text-white outline-none ${
                        changed.has('answerType') ? AI_INPUT_HIGHLIGHT_CLASS : 'border-white/10 bg-ink-950/50'
                      }`}
                    >
                      <option value="enum">Options</option>
                      <option value="text">Text answer</option>
                    </select>
                  </div>

                  <div className={`rounded-2xl border p-3 space-y-3 ${
                    changed.has('dependencyRule') ? AI_CARD_HIGHLIGHT_CLASS : 'border-white/10 bg-white/5'
                  }`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Question dependency (Optional)</p>
                        <p className="mt-1 text-xs text-ink-300">
                          Only ask this question when the customer chooses one or more selected answers on an earlier question.
                        </p>
                      </div>
                      {changed.has('dependencyRule') ? <AiChangeBadge status={qHighlight?.status || 'updated'} /> : null}
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="block space-y-1.5">
                        <span className="text-xs font-bold text-ink-200">Depends on question</span>
                        <select
                          value={depQuestionId}
                          onChange={(event) => {
                            const nextParentId = event.target.value;
                            const nextType = nextParentId ? 'dependent' : 'option-specific';
                            updateQuestion(index, {
                              ...question,
                              type: nextType,
                              dependencyRule: {
                                dependsOnQuestionId: nextParentId,
                                dependsOnOptionValue: '',
                                dependsOnOptionValues: [],
                              },
                            });
                            if (nextParentId && typeof onDependencyAssigned === 'function') {
                              onDependencyAssigned(question.id);
                            }
                          }}
                          className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-3 py-2.5 text-sm text-white outline-none"
                        >
                          <option value="">None — always ask within option scope</option>
                          {eligibleParentQuestions.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.prompt || candidate.id}
                            </option>
                          ))}
                        </select>
                      </label>

                      {depQuestionId ? (
                        <div className="block space-y-1.5">
                          <span className="text-xs font-bold text-ink-200">Show this question when answer is (any of)</span>
                          {parentOptions.length > 0 ? (
                            <MultiSelectAnswerDropdown
                              options={parentOptions}
                              selectedValues={depOptionValues}
                              onChange={(nextValues) => updateQuestion(index, {
                                ...question,
                                type: 'dependent',
                                dependencyRule: {
                                  dependsOnQuestionId: depQuestionId,
                                  dependsOnOptionValue: nextValues[0] || '',
                                  dependsOnOptionValues: nextValues,
                                },
                              })}
                            />
                          ) : (
                            <input
                              value={depOptionValues.join(', ')}
                              onChange={(event) => {
                                const nextValues = event.target.value
                                  .split(',')
                                  .map((entry) => entry.trim())
                                  .filter(Boolean);
                                updateQuestion(index, {
                                  ...question,
                                  type: 'dependent',
                                  dependencyRule: {
                                    dependsOnQuestionId: depQuestionId,
                                    dependsOnOptionValue: nextValues[0] || '',
                                    dependsOnOptionValues: nextValues,
                                  },
                                });
                              }}
                              placeholder="Type exact answer(s), separated by commas..."
                              className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-3 py-2.5 text-sm text-white outline-none"
                            />
                          )}
                        </div>
                      ) : null}
                    </div>
                    {depQuestionId ? (
                      <p className="text-xs text-ink-200">
                        {depOptionValues.length === 0 ? (
                          <span className="font-bold text-amber-300">
                            Select one or more answers from "{parentQuestion?.prompt || depQuestionId}" that should trigger this question.{' '}
                          </span>
                        ) : null}
                        Dependent questions cannot be manually assigned as option-specific—they automatically become available whenever "{parentQuestion?.prompt || depQuestionId}" is active and triggered.
                      </p>
                    ) : null}
                  </div>

                  {question.answerType === 'text' ? (
                    <input
                      value={question.answerHint}
                      onChange={(event) => updateQuestion(index, { ...question, answerHint: event.target.value })}
                      placeholder="Answer hint for customers"
                      className={`w-full rounded-2xl border px-4 py-3 text-sm text-white outline-none ${
                        changed.has('answerHint') ? AI_INPUT_HIGHLIGHT_CLASS : 'border-white/10 bg-ink-950/50'
                      }`}
                    />
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-white">Options and added price</p>
                          {changed.has('options') ? <AiChangeBadge status={qHighlight?.status || 'updated'} /> : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {question.options.length > 0 ? (
                            <>
                              <select
                                value={consistencyMode}
                                disabled={batchState.busy}
                                onChange={(event) => setConsistencyModeByQuestion((prev) => ({
                                  ...prev,
                                  [qKey]: event.target.value,
                                }))}
                                aria-label="AI image consistency mode"
                                className="rounded-2xl border border-white/10 bg-ink-950/60 px-3 py-2 text-xs font-bold text-white outline-none disabled:opacity-60"
                              >
                                <option value="consistent">Consistent (same subject)</option>
                                <option value="unique">Unique images</option>
                              </select>
                              <button
                                type="button"
                                disabled={batchState.busy || isMutating}
                                onClick={() => handleGenerateAllPictures(question)}
                                className="inline-flex items-center gap-2 rounded-2xl border border-brand/40 bg-brand/20 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand/30 disabled:opacity-60"
                              >
                                {batchState.busy ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Sparkles className="h-4 w-4 text-brand-soft" />
                                )}
                                {batchState.busy ? 'Generating pictures...' : 'Generate pictures for all options'}
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            disabled={batchState.busy}
                            onClick={() => updateQuestion(index, {
                              ...question,
                              options: [...question.options, createOptionDraft({}, question.options.length)],
                            })}
                            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                          >
                            <Plus className="h-4 w-4" />
                            Add option
                          </button>
                        </div>
                      </div>
                      {batchState.progress ? (
                        <p className="text-xs font-bold text-emerald-300">{batchState.progress}</p>
                      ) : null}
                      {batchState.error ? (
                        <p className="text-xs font-bold text-rose-300">{batchState.error}</p>
                      ) : null}
                      {question.options.length ? question.options.map((option, optionIndex) => {
                        const subKey = String(option?.draftKey || getQuestionOptionSlug(option, optionIndex));
                        const subAiStatus = qHighlight?.subOptionHighlights?.get(subKey) || '';
                        return (
                          <QuestionOptionEditor
                            key={option.draftKey || `option_${optionIndex}`}
                            option={option}
                            question={question}
                            siblingOptions={question.options}
                            serviceContext={serviceContext}
                            consistencyMode={consistencyMode}
                            storageScope={storageScope}
                            aiStatus={subAiStatus}
                            isBatchGenerating={batchState.busy}
                            onPreviewImage={onPreviewImage}
                            onChange={(nextOption) => updateQuestion(index, {
                              ...question,
                              options: question.options.map((currentOption, currentIndex) => (currentIndex === optionIndex ? nextOption : currentOption)),
                            })}
                            onRemove={() => updateQuestion(index, {
                              ...question,
                              options: question.options.filter((_, currentIndex) => currentIndex !== optionIndex),
                            })}
                          />
                        );
                      }) : (
                        <p className="text-sm text-ink-300">Add at least one option so the admin can control the added price for each answer.</p>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        }) : (
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
  const initializedServiceIdRef = useRef('');
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
  const [draftType, setDraftType] = useState('service');
  const [draftActive, setDraftActive] = useState(true);
  const [draftFiles, setDraftFiles] = useState([]);
  const [draftAiServiceImages, setDraftAiServiceImages] = useState([]);
  const [isGeneratingServiceImage, setIsGeneratingServiceImage] = useState(false);
  const [serviceImageAiError, setServiceImageAiError] = useState('');
  const [draftIncludedServiceIds, setDraftIncludedServiceIds] = useState([]);
  const [draftTravelFee, setDraftTravelFee] = useState(35);
  const [draftMinimumTotal, setDraftMinimumTotal] = useState(80);
  const [draftMaximumTotal, setDraftMaximumTotal] = useState(500);
  const [draftRequiresPortfolioSelection, setDraftRequiresPortfolioSelection] = useState(false);
  const [draftOptionApplicationMode, setDraftOptionApplicationMode] = useState('per_option');
  const [draftInheritBundleImages, setDraftInheritBundleImages] = useState(true);
  const [draftQuestions, setDraftQuestions] = useState([]);
  const [draftOptions, setDraftOptions] = useState([]);
  const [expandedOptionIndex, setExpandedOptionIndex] = useState(-1);
  const [optionStatusMessage, setOptionStatusMessage] = useState('');
  const [questionSaveVersion, setQuestionSaveVersion] = useState(0);
  const [aiInstructions, setAiInstructions] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiErrorMessage, setAiErrorMessage] = useState('');
  const [aiResultSummary, setAiResultSummary] = useState('');
  const [aiUndoStack, setAiUndoStack] = useState([]);
  const [aiBaselineSnapshot, setAiBaselineSnapshot] = useState(null);
  const [previewModalImage, setPreviewModalImage] = useState(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingService, setIsDeletingService] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState('');

  useEffect(() => {
    if (!previewModalImage) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setPreviewModalImage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewModalImage]);

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
        type: 'service',
        persisted: false,
        active: true,
        approved: true,
        images: [],
        pricing: {},
        includedServiceIds: [],
        questionnaire: { required: [], optional: [] },
        requiresPortfolioSelection: false,
        optionApplicationMode: 'per_option',
        inheritBundleImages: true,
      };
    }
    return catalogEntries.find((item) => item.id === serviceId) || null;
  }, [catalogEntries, categoryOptions, isNewService, serviceId]);

  const selectedCategory = useMemo(
    () => categoryOptions.find((category) => category.id === draftCategoryId) || null,
    [categoryOptions, draftCategoryId],
  );

  const serviceSuggestions = useMemo(
    () => getAdminServiceSuggestionsByCategory(draftCategoryId),
    [draftCategoryId],
  );

  const matchedSuggestion = useMemo(
    () => getAdminServiceSuggestionMatch({
      categoryId: draftCategoryId,
      serviceId: draftServiceId,
      label: draftLabel,
    }),
    [draftCategoryId, draftLabel, draftServiceId],
  );

  const suggestedQuestions = useMemo(() => {
    const preset = getAdminQuestionPreset({
      serviceId: matchedSuggestion?.id || slugify(draftServiceId || draftLabel),
      categoryId: draftCategoryId,
    });
    const combined = mergeQuestionDrafts(
      [],
      [
        ...preset.required,
        ...(matchedSuggestion?.requiredQuestions || []),
        ...preset.optional,
        ...(matchedSuggestion?.optionalQuestions || []),
      ],
      true,
    );
    const hasTiming = combined.some((q) => q.id === 'timing_preference');
    return combined.map((q) => (
      q.id === 'scheduled_for_text' && !q.dependencyRule?.dependsOnQuestionId && hasTiming
        ? {
            ...q,
            dependencyRule: {
              dependsOnQuestionId: 'timing_preference',
              dependsOnOptionValue: 'later',
              dependsOnOptionValues: ['later'],
            },
          }
        : q
    ));
  }, [draftCategoryId, draftLabel, draftServiceId, matchedSuggestion]);

  useEffect(() => {
    if (!selectedService) return;
    if (initializedServiceIdRef.current === selectedService.id) return;
    initializedServiceIdRef.current = selectedService.id;
    const nextCategoryId = selectedService.categoryId || categoryOptions[0]?.id || '';

    setDraftServiceId(selectedService.id === 'new' ? '' : selectedService.id);
    setDraftLabel(selectedService.label || '');
    setDraftPromptLabel(selectedService.promptLabel || selectedService.label || '');
    setDraftDescription(selectedService.description || '');
    setDraftCategoryId(nextCategoryId);
    setDraftType(selectedService.type || 'service');
    setDraftActive(selectedService.persisted ? selectedService.active !== false : true);
    setDraftFiles([]);
    setDraftAiServiceImages([]);
    setServiceImageAiError('');
    setDraftIncludedServiceIds(Array.isArray(selectedService.includedServiceIds) ? selectedService.includedServiceIds : []);
    setDraftTravelFee(Number(selectedService.pricing?.travelFee ?? 35));
    setDraftMinimumTotal(Number(selectedService.pricing?.minimumTotal ?? 80));
    setDraftMaximumTotal(Number(selectedService.pricing?.maximumTotal ?? 500));
    setDraftRequiresPortfolioSelection(Boolean(selectedService.requiresPortfolioSelection));
    setDraftOptionApplicationMode(selectedService.optionApplicationMode === 'unified' ? 'unified' : 'per_option');
    setDraftInheritBundleImages(selectedService.inheritBundleImages !== false);
    const mergedLoadedQuestions = mergeQuestionDrafts(
      mapQuestionDrafts(selectedService.questionnaire?.required || [], true),
      selectedService.questionnaire?.optional || [],
      true,
    );
    const hasTiming = mergedLoadedQuestions.some((q) => q.id === 'timing_preference');
    const normalizedLoadedQuestions = mergedLoadedQuestions.map((q) => (
      q.id === 'scheduled_for_text' && !q.dependencyRule?.dependsOnQuestionId && hasTiming
        ? {
            ...q,
            type: 'dependent',
            dependencyRule: {
              dependsOnQuestionId: 'timing_preference',
              dependsOnOptionValue: 'later',
              dependsOnOptionValues: ['later'],
            },
          }
        : q
    ));
    setDraftQuestions(normalizedLoadedQuestions);
    const nonOptionSpecificIds = new Set(
      normalizedLoadedQuestions.filter((q) => !isOptionSpecificQuestion(q)).map((q) => q.id),
    );
    setDraftOptions(
      Array.isArray(selectedService.options) && selectedService.options.length
        ? selectedService.options.map((opt, idx) => {
            const cleanSelected = (Array.isArray(opt.selectedQuestionIds) ? opt.selectedQuestionIds : [])
              .filter((qid) => !nonOptionSpecificIds.has(qid));
            return createServiceOptionDraft({ ...opt, selectedQuestionIds: cleanSelected }, idx);
          })
        : []
    );
    setExpandedOptionIndex(-1);
    setOptionStatusMessage('');
    setAiInstructions('');
    setAiErrorMessage('');
    setAiResultSummary('');
    setAiUndoStack([]);
    setAiBaselineSnapshot(null);
    setPreviewModalImage(null);
    setMessage('');
  }, [categoryOptions, selectedService]);

  const serviceRows = useMemo(() => {
    if (!selectedService || selectedService.id === 'new') return [];
    return flattenProviderServices(helpers).filter((row) => matchesCatalogItem(row, selectedService));
  }, [helpers, selectedService]);

  const helperGroups = useMemo(() => groupRowsByHelper(serviceRows), [serviceRows]);
  const pendingSubmissionCount = useMemo(
    () => serviceRows.filter((row) => isPendingServiceOfferingStatus(row.offeringStatus)).length,
    [serviceRows],
  );

  const selectableBundleServices = useMemo(
    () => catalogEntries.filter((entry) => entry.id !== selectedService?.id && entry.type !== 'bundle'),
    [catalogEntries, selectedService?.id],
  );

  const referencingBundles = useMemo(
    () => (selectedService?.id && selectedService.id !== 'new'
      ? catalogEntries.filter((entry) => entry.type === 'bundle' && Array.isArray(entry.includedServiceIds) && entry.includedServiceIds.includes(selectedService.id))
      : []),
    [catalogEntries, selectedService?.id],
  );

  const inheritedBundleImages = useMemo(() => {
    if (draftType !== 'bundle' || draftInheritBundleImages === false) return [];
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
  }, [catalogEntries, draftIncludedServiceIds, draftInheritBundleImages, draftType]);

  const effectiveImages = useMemo(
    () => ([...(selectedService?.images || []), ...inheritedBundleImages].slice(0, 10)),
    [inheritedBundleImages, selectedService?.images],
  );

  const remainingUploads = Math.max(0, 10 - effectiveImages.length - draftFiles.length - draftAiServiceImages.length);

  const applyServiceSuggestion = (suggestion, { replaceQuestions = true } = {}) => {
    if (!suggestion) return;

    const preset = getAdminQuestionPreset({ serviceId: suggestion.id, categoryId: draftCategoryId });
    const combinedQuestions = [
      ...preset.required,
      ...(suggestion.requiredQuestions || []),
      ...preset.optional,
      ...(suggestion.optionalQuestions || []),
    ];

    if (isNewService) {
      setDraftServiceId(suggestion.id);
    }
    setDraftLabel(suggestion.label || '');
    setDraftPromptLabel(suggestion.promptLabel || suggestion.label || '');
    setDraftDescription(suggestion.description || '');
    setDraftTravelFee(Number(suggestion.pricing?.travelFee ?? 35));
    setDraftMinimumTotal(Number(suggestion.pricing?.minimumTotal ?? 80));
    setDraftMaximumTotal(Number(suggestion.pricing?.maximumTotal ?? 500));
    setDraftRequiresPortfolioSelection(Boolean(suggestion.requiresPortfolioSelection));

    if (replaceQuestions) {
      setDraftQuestions(mergeQuestionDrafts([], combinedQuestions, true));
      return;
    }

    setDraftQuestions((current) => mergeQuestionDrafts(current, combinedQuestions, true));
  };

  const captureDraftSnapshot = () => ({
    draftServiceId,
    draftType,
    draftLabel,
    draftPromptLabel,
    draftDescription,
    draftCategoryId,
    draftActive,
    draftIncludedServiceIds: [...draftIncludedServiceIds],
    draftTravelFee,
    draftMinimumTotal,
    draftMaximumTotal,
    draftRequiresPortfolioSelection,
    draftOptionApplicationMode,
    draftInheritBundleImages,
    draftOptions: JSON.parse(JSON.stringify(draftOptions)),
    draftQuestions: JSON.parse(JSON.stringify(draftQuestions)),
    aiResultSummary,
  });

  const restoreDraftSnapshot = (snapshot) => {
    if (!snapshot) return;
    setDraftServiceId(snapshot.draftServiceId ?? '');
    setDraftType(snapshot.draftType ?? 'service');
    setDraftLabel(snapshot.draftLabel ?? '');
    setDraftPromptLabel(snapshot.draftPromptLabel ?? '');
    setDraftDescription(snapshot.draftDescription ?? '');
    setDraftCategoryId(snapshot.draftCategoryId ?? '');
    setDraftActive(snapshot.draftActive !== false);
    setDraftIncludedServiceIds(Array.isArray(snapshot.draftIncludedServiceIds) ? snapshot.draftIncludedServiceIds : []);
    setDraftTravelFee(Number(snapshot.draftTravelFee ?? 35));
    setDraftMinimumTotal(Number(snapshot.draftMinimumTotal ?? 80));
    setDraftMaximumTotal(Number(snapshot.draftMaximumTotal ?? 500));
    setDraftRequiresPortfolioSelection(Boolean(snapshot.draftRequiresPortfolioSelection));
    setDraftOptionApplicationMode(snapshot.draftOptionApplicationMode === 'unified' ? 'unified' : 'per_option');
    setDraftInheritBundleImages(snapshot.draftInheritBundleImages !== false);
    setDraftOptions(Array.isArray(snapshot.draftOptions) ? snapshot.draftOptions : []);
    setDraftQuestions(Array.isArray(snapshot.draftQuestions) ? snapshot.draftQuestions : []);
    setExpandedOptionIndex(-1);
    setOptionStatusMessage('');
    setQuestionSaveVersion((prev) => prev + 1);
    setAiResultSummary(snapshot.aiResultSummary || '');
  };

  const aiFieldChanges = useMemo(() => {
    if (!aiBaselineSnapshot) return new Set();
    const changed = new Set();
    if (String(draftServiceId || '') !== String(aiBaselineSnapshot.draftServiceId || '')) changed.add('serviceId');
    if (String(draftType || 'service') !== String(aiBaselineSnapshot.draftType || 'service')) changed.add('type');
    if (String(draftLabel || '') !== String(aiBaselineSnapshot.draftLabel || '')) changed.add('label');
    if (String(draftPromptLabel || '') !== String(aiBaselineSnapshot.draftPromptLabel || '')) changed.add('promptLabel');
    if (String(draftDescription || '') !== String(aiBaselineSnapshot.draftDescription || '')) changed.add('description');
    if (String(draftCategoryId || '') !== String(aiBaselineSnapshot.draftCategoryId || '')) changed.add('categoryId');
    if (Boolean(draftActive) !== Boolean(aiBaselineSnapshot.draftActive)) changed.add('active');
    if (!sameSortedStrings(draftIncludedServiceIds, aiBaselineSnapshot.draftIncludedServiceIds)) changed.add('includedServiceIds');
    if (Boolean(draftInheritBundleImages) !== Boolean(aiBaselineSnapshot.draftInheritBundleImages)) changed.add('inheritBundleImages');
    if (Number(draftTravelFee || 0) !== Number(aiBaselineSnapshot.draftTravelFee || 0)) changed.add('travelFee');
    if (Number(draftMinimumTotal || 0) !== Number(aiBaselineSnapshot.draftMinimumTotal || 0)) changed.add('minimumTotal');
    if (Number(draftMaximumTotal || 0) !== Number(aiBaselineSnapshot.draftMaximumTotal || 0)) changed.add('maximumTotal');
    if (Boolean(draftRequiresPortfolioSelection) !== Boolean(aiBaselineSnapshot.draftRequiresPortfolioSelection)) changed.add('requiresPortfolioSelection');
    if (String(draftOptionApplicationMode || 'per_option') !== String(aiBaselineSnapshot.draftOptionApplicationMode || 'per_option')) changed.add('optionApplicationMode');
    return changed;
  }, [
    aiBaselineSnapshot,
    draftActive,
    draftCategoryId,
    draftDescription,
    draftIncludedServiceIds,
    draftInheritBundleImages,
    draftLabel,
    draftMaximumTotal,
    draftMinimumTotal,
    draftOptionApplicationMode,
    draftPromptLabel,
    draftRequiresPortfolioSelection,
    draftServiceId,
    draftTravelFee,
    draftType,
  ]);

  const optionAiHighlightMap = useMemo(() => {
    const map = new Map();
    if (!aiBaselineSnapshot) return map;
    draftOptions.forEach((opt, idx) => {
      const highlight = getOptionHighlight(opt, aiBaselineSnapshot.draftOptions || []);
      if (highlight) map.set(opt.draftKey || opt.id || idx, highlight);
    });
    return map;
  }, [aiBaselineSnapshot, draftOptions]);

  const questionAiHighlightMap = useMemo(() => {
    const map = new Map();
    if (!aiBaselineSnapshot) return map;
    draftQuestions.forEach((question, idx) => {
      const highlight = getQuestionHighlight(question, aiBaselineSnapshot.draftQuestions || []);
      if (highlight) map.set(question.draftKey || question.id || idx, highlight);
    });
    return map;
  }, [aiBaselineSnapshot, draftQuestions]);

  const handleGenerateWithAi = async (overrideInstructions) => {
    const promptText = typeof overrideInstructions === 'string' ? overrideInstructions : aiInstructions;
    if (typeof overrideInstructions === 'string') {
      setAiInstructions(overrideInstructions);
    }

    setIsGeneratingAi(true);
    setAiErrorMessage('');
    try {
      const currentDraft = {
        serviceId: isNewService ? slugify(draftServiceId || draftLabel) : (selectedService?.id || slugify(draftServiceId)),
        type: draftType,
        label: draftLabel,
        promptLabel: draftPromptLabel,
        description: draftDescription,
        categoryId: draftCategoryId,
        active: draftActive,
        requiresPortfolioSelection: draftRequiresPortfolioSelection,
        optionApplicationMode: draftOptionApplicationMode,
        includedServiceIds: draftType === 'bundle' ? draftIncludedServiceIds : [],
        inheritBundleImages: draftInheritBundleImages,
        pricing: {
          travelFee: Number(draftTravelFee ?? 35),
          minimumTotal: Number(draftMinimumTotal ?? 80),
          maximumTotal: Number(draftMaximumTotal ?? 500),
        },
        options: normalizeServiceOptions(draftOptions, draftQuestions),
        questions: normalizeQuestionDrafts(draftQuestions, true),
      };

      const result = await generateAdminServiceDraft({
        mode: isNewService ? 'create' : 'edit',
        instructions: promptText,
        currentDraft,
      });

      const aiDraft = result.draft;
      const snapshot = captureDraftSnapshot();
      setAiUndoStack((prev) => [...prev, snapshot]);
      setAiBaselineSnapshot((prevBaseline) => prevBaseline || snapshot);

      // Preserve uploaded images for matching service options and question options
      const existingServiceOptImages = new Map();
      draftOptions.forEach((opt) => {
        const uri = String(opt?.imageUrl || '').trim();
        if (!uri) return;
        if (opt.id) existingServiceOptImages.set(String(opt.id).toLowerCase(), uri);
        if (opt.title) existingServiceOptImages.set(slugify(opt.title), uri);
      });

      const existingQuestionOptImages = new Map();
      draftQuestions.forEach((question) => {
        const qId = slugify(question?.id || '');
        const qPromptSlug = slugify(question?.prompt || '');
        (Array.isArray(question?.options) ? question.options : []).forEach((opt, optIdx) => {
          const uri = String(opt?.imageUrl || '').trim();
          if (!uri) return;
          const optSlug = getQuestionOptionSlug(opt, optIdx);
          if (qId && optSlug) existingQuestionOptImages.set(`${qId}::${optSlug}`, uri);
          if (qPromptSlug && optSlug) existingQuestionOptImages.set(`${qPromptSlug}::${optSlug}`, uri);
        });
      });

      const mergeQuestionWithImages = (question, idx) => {
        const qId = slugify(question?.id || '');
        const qPromptSlug = slugify(question?.prompt || '');
        const nextOptions = (Array.isArray(question?.options) ? question.options : []).map((opt, optIdx) => {
          const optSlug = getQuestionOptionSlug(opt, optIdx);
          const preservedImage = existingQuestionOptImages.get(`${qId}::${optSlug}`)
            || existingQuestionOptImages.get(`${qPromptSlug}::${optSlug}`)
            || '';
          return {
            ...opt,
            imageUrl: String(opt?.imageUrl || preservedImage || '').trim(),
          };
        });
        return createQuestionDraft({ ...question, options: nextOptions }, idx, true);
      };

      if (isNewService && aiDraft.serviceId) {
        setDraftServiceId(aiDraft.serviceId);
      }
      setDraftType(aiDraft.type === 'bundle' ? 'bundle' : 'service');
      setDraftLabel(aiDraft.label || '');
      setDraftPromptLabel(aiDraft.promptLabel || aiDraft.label || '');
      setDraftDescription(aiDraft.description || '');
      if (aiDraft.categoryId) {
        setDraftCategoryId(aiDraft.categoryId);
      }
      if (typeof aiDraft.active === 'boolean') {
        setDraftActive(aiDraft.active);
      }
      setDraftIncludedServiceIds(aiDraft.type === 'bundle' && Array.isArray(aiDraft.includedServiceIds)
        ? aiDraft.includedServiceIds
        : []);
      if (typeof aiDraft.inheritBundleImages === 'boolean') {
        setDraftInheritBundleImages(aiDraft.inheritBundleImages);
      }
      setDraftTravelFee(coerceSliderValue(aiDraft.pricing?.travelFee ?? 35, 0, 150, 5));
      setDraftMinimumTotal(coerceSliderValue(aiDraft.pricing?.minimumTotal ?? 80, 0, 1500, 5));
      setDraftMaximumTotal(coerceSliderValue(aiDraft.pricing?.maximumTotal ?? 500, 50, 3000, 5));
      setDraftRequiresPortfolioSelection(Boolean(aiDraft.requiresPortfolioSelection));
      setDraftOptionApplicationMode(aiDraft.optionApplicationMode === 'unified' ? 'unified' : 'per_option');

      setDraftOptions(
        (Array.isArray(aiDraft.options) ? aiDraft.options : []).map((opt, idx) => {
          const matchedImage = existingServiceOptImages.get(String(opt.id || '').toLowerCase())
            || existingServiceOptImages.get(slugify(opt.title || ''))
            || '';
          return createServiceOptionDraft({ ...opt, imageUrl: matchedImage }, idx);
        }),
      );
      const aiQuestions = Array.isArray(aiDraft.questions)
        ? aiDraft.questions
        : [...(Array.isArray(aiDraft.requiredQuestions) ? aiDraft.requiredQuestions : []), ...(Array.isArray(aiDraft.optionalQuestions) ? aiDraft.optionalQuestions : [])];
      setDraftQuestions(aiQuestions.map((q, idx) => mergeQuestionWithImages(q, idx)));

      setExpandedOptionIndex(-1);
      setOptionStatusMessage('');
      setQuestionSaveVersion((prev) => prev + 1);
      setAiResultSummary(result.summary || 'AI suggestions populated into the draft fields below.');
      setMessage('AI populated suggestions into the form (not saved to Firestore yet). Changed fields are highlighted in amber/green below.');
    } catch (error) {
      setAiErrorMessage(error?.message || 'Unable to generate AI service suggestions right now.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleUndoAiChanges = () => {
    if (!aiUndoStack.length) return;
    const previous = aiUndoStack[aiUndoStack.length - 1];
    const remaining = aiUndoStack.slice(0, -1);
    setAiUndoStack(remaining);
    if (remaining.length === 0) {
      setAiBaselineSnapshot(null);
    }
    restoreDraftSnapshot(previous);
    setAiErrorMessage('');
    setMessage('Reverted AI suggestions back to your previous fields.');
  };

  const serviceAiContext = useMemo(() => ({
    serviceId: draftServiceId || selectedService?.id || '',
    label: draftLabel || selectedService?.label || '',
    categoryId: draftCategoryId,
    categoryName: selectedCategory?.name || selectedService?.categoryName || '',
    description: draftDescription || '',
    optionTitles: draftOptions.map((opt) => String(opt?.title || '').trim()).filter(Boolean),
  }), [draftCategoryId, draftDescription, draftLabel, draftOptions, draftServiceId, selectedCategory?.name, selectedService?.categoryName, selectedService?.id, selectedService?.label]);

  const stripDependentQuestionFromServiceOptions = (dependentQuestionId) => {
    const cleanId = String(dependentQuestionId || '').trim();
    if (!cleanId) return;
    setDraftOptions((current) => current.map((opt) => ({
      ...opt,
      selectedQuestionIds: (Array.isArray(opt.selectedQuestionIds) ? opt.selectedQuestionIds : []).filter(
        (id) => id !== cleanId,
      ),
    })));
  };

  const handleUpdateQuestionByKey = (questionDraftKey, updater) => {
    setDraftQuestions((current) => current.map((q) => (
      q.draftKey === questionDraftKey && typeof updater === 'function' ? updater(q) : q
    )));
  };

  const materializePendingOptionImages = async (targetServiceId, optionsToSave = draftOptions, questionsToSave = draftQuestions) => {
    const scope = slugify(targetServiceId) || 'service_option';
    let didUpload = false;

    const resolvedOptions = await Promise.all(
      (Array.isArray(optionsToSave) ? optionsToSave : []).map(async (opt, idx) => {
        const uri = String(opt?.imageUrl || '').trim();
        if (!isDataUrlImage(uri)) return opt;
        const file = dataUrlToImageFile(uri, `${scope}_opt_${opt.id || idx + 1}`);
        if (!file) return opt;
        const uploads = await uploadServiceCatalogImages({ serviceId: opt.draftKey || scope, files: [file] });
        if (uploads?.[0]?.uri) {
          didUpload = true;
          return { ...opt, imageUrl: uploads[0].uri };
        }
        return opt;
      }),
    );

    const resolvedQuestions = await Promise.all(
      (Array.isArray(questionsToSave) ? questionsToSave : []).map(async (question, qIdx) => {
        if (!Array.isArray(question?.options) || !question.options.length) return question;
        const resolvedSubOptions = await Promise.all(
          question.options.map(async (subOpt, subIdx) => {
            const uri = String(subOpt?.imageUrl || '').trim();
            if (!isDataUrlImage(uri)) return subOpt;
            const file = dataUrlToImageFile(uri, `${scope}_q${qIdx + 1}_${subOpt.value || subIdx + 1}`);
            if (!file) return subOpt;
            const uploads = await uploadServiceCatalogImages({ serviceId: scope, files: [file] });
            if (uploads?.[0]?.uri) {
              didUpload = true;
              return { ...subOpt, imageUrl: uploads[0].uri };
            }
            return subOpt;
          }),
        );
        return { ...question, options: resolvedSubOptions };
      }),
    );

    if (didUpload) {
      setDraftOptions(resolvedOptions);
      setDraftQuestions(resolvedQuestions);
    }

    return { resolvedOptions, resolvedQuestions };
  };

  const buildPayload = (images = [], resolvedOptions = draftOptions, resolvedQuestions = draftQuestions) => ({
    categoryId: draftCategoryId,
    categoryName: selectedCategory?.name || '',
    label: String(draftLabel || '').trim(),
    promptLabel: String(draftPromptLabel || draftLabel || '').trim(),
    description: String(draftDescription || '').trim(),
    type: draftType,
    active: draftActive,
    approved: true,
    images,
    includedServiceIds: draftType === 'bundle' ? draftIncludedServiceIds : [],
    requiresPortfolioSelection: draftRequiresPortfolioSelection,
    optionApplicationMode: draftOptionApplicationMode === 'unified' ? 'unified' : 'per_option',
    inheritBundleImages: draftInheritBundleImages,
    pricing: {
      basePrice: resolvedOptions.length ? 0 : Number(selectedService?.pricing?.basePrice || 0),
      travelFee: Number(draftTravelFee || 35),
      bookingFee: 0,
      minimumTotal: Number(draftMinimumTotal || 0),
      maximumTotal: Number(draftMaximumTotal || 0),
      bundleDiscountPercent: 0,
    },
    options: normalizeServiceOptions(resolvedOptions, resolvedQuestions),
    questionnaire: {
      required: normalizeQuestionDrafts(resolvedQuestions, true),
      optional: [],
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

  const persistServiceOptions = async (nextOptions) => {
    const targetServiceId = slugify(draftServiceId || draftLabel);
    if (!targetServiceId || !draftLabel.trim() || !draftCategoryId.trim() || selectedService?.id === 'new') {
      return false;
    }

    const { resolvedOptions, resolvedQuestions } = await materializePendingOptionImages(
      targetServiceId,
      nextOptions,
      draftQuestions,
    );
    const saved = await saveServiceCatalogEntry(
      targetServiceId,
      buildPayload(effectiveImages, resolvedOptions, resolvedQuestions),
    );
    upsertSavedService(saved);
    return true;
  };

  const handleAddServiceOption = async () => {
    setOptionStatusMessage('');
    let currentOptions = draftOptions;

    if (expandedOptionIndex >= 0 && currentOptions[expandedOptionIndex]) {
      const openOpt = currentOptions[expandedOptionIndex];
      if (isServiceOptionComplete(openOpt)) {
        try {
          const persisted = await persistServiceOptions(currentOptions);
          if (persisted) {
            setOptionStatusMessage('Previous option saved.');
          }
        } catch (error) {
          setOptionStatusMessage(error.message || 'Could not auto-save previous option.');
        }
      }
    }

    setDraftOptions((current) => [...current, createServiceOptionDraft({}, current.length)]);
    setExpandedOptionIndex(-1);
  };

  const handleEditOption = async (optIndex) => {
    setOptionStatusMessage('');
    if (expandedOptionIndex >= 0 && expandedOptionIndex !== optIndex && draftOptions[expandedOptionIndex]) {
      const openOpt = draftOptions[expandedOptionIndex];
      if (isServiceOptionComplete(openOpt)) {
        try {
          const persisted = await persistServiceOptions(draftOptions);
          if (persisted) {
            setOptionStatusMessage('Previous option auto-saved.');
          }
        } catch (error) {
          setOptionStatusMessage(error.message || 'Could not auto-save previous option.');
        }
      }
    }
    setExpandedOptionIndex(optIndex);
  };

  const handleSaveSingleOption = async (optIndex) => {
    const opt = draftOptions[optIndex];
    if (!opt) return;
    if (!isServiceOptionComplete(opt)) {
      setOptionStatusMessage('Please fill in option title, description, and price before saving (image is optional).');
      return;
    }

    setIsMutating(true);
    setOptionStatusMessage('');
    try {
      const persisted = await persistServiceOptions(draftOptions);
      setExpandedOptionIndex(-1);
      setOptionStatusMessage(
        persisted
          ? 'Option & any AI pictures saved to Firebase.'
          : 'Option staged. Click "Create service" below to save the new service.',
      );
    } catch (error) {
      setOptionStatusMessage(error.message || 'Unable to save option.');
    } finally {
      setIsMutating(false);
    }
  };

  const persistQuestionnaireSection = async (nextQuestions) => {
    const targetServiceId = slugify(draftServiceId || draftLabel);
    if (!targetServiceId || !draftLabel.trim() || !draftCategoryId.trim() || selectedService?.id === 'new') {
      return false;
    }

    setIsMutating(true);
    try {
      const { resolvedOptions, resolvedQuestions } = await materializePendingOptionImages(
        targetServiceId,
        draftOptions,
        nextQuestions,
      );
      const saved = await saveServiceCatalogEntry(
        targetServiceId,
        buildPayload(effectiveImages, resolvedOptions, resolvedQuestions),
      );
      upsertSavedService(saved);
      return true;
    } finally {
      setIsMutating(false);
    }
  };

  const handleGenerateOneServiceImage = async () => {
    if (remainingUploads <= 0) {
      setServiceImageAiError('Maximum of 10 service images reached. Remove an image first before generating another.');
      return;
    }
    const labelText = String(draftLabel || selectedService?.label || draftServiceId || '').trim();
    if (!labelText) {
      setServiceImageAiError('Enter a service name first so AI knows what picture to generate.');
      return;
    }

    setIsGeneratingServiceImage(true);
    setServiceImageAiError('');
    try {
      const nextImageNumber = effectiveImages.length + draftFiles.length + draftAiServiceImages.length + 1;
      const result = await generateAdminOptionImage({
        targetType: 'service_image',
        consistencyMode: 'unique',
        serviceContext: serviceAiContext,
        serviceImageContext: {
          imageNumber: nextImageNumber,
          existingCount: effectiveImages.length + draftFiles.length + draftAiServiceImages.length,
          maxImages: 10,
        },
      });
      const stampedUrl = await finalizeAiGeneratedImage(result.imageDataUrl);
      setDraftAiServiceImages((current) => {
        const availableSlots = Math.max(0, 10 - effectiveImages.length - draftFiles.length - current.length);
        if (availableSlots <= 0) return current;
        return [
          ...current,
          {
            id: createDraftKey('ai_service_img'),
            uri: stampedUrl,
            isAiPreview: true,
            createdAt: new Date().toISOString(),
          },
        ];
      });
    } catch (error) {
      setServiceImageAiError(error?.message || 'Unable to generate a service image right now.');
    } finally {
      setIsGeneratingServiceImage(false);
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
    setServiceImageAiError('');
    try {
      const aiServiceFiles = draftAiServiceImages
        .map((entry, idx) => dataUrlToImageFile(entry.uri, `${targetServiceId}_service_${idx + 1}`))
        .filter(Boolean);
      const allPendingServiceFiles = [...draftFiles, ...aiServiceFiles];
      const uploads = allPendingServiceFiles.length
        ? await uploadServiceCatalogImages({ serviceId: targetServiceId, files: allPendingServiceFiles })
        : [];
      const { resolvedOptions, resolvedQuestions } = await materializePendingOptionImages(
        targetServiceId,
        draftOptions,
        draftQuestions,
      );
      const images = [...(selectedService?.images || []), ...uploads, ...inheritedBundleImages].slice(0, 10);
      const saved = await saveServiceCatalogEntry(
        targetServiceId,
        buildPayload(images, resolvedOptions, resolvedQuestions),
      );
      upsertSavedService(saved);

      setDraftFiles([]);
      setDraftAiServiceImages([]);
      setExpandedOptionIndex(-1);
      setOptionStatusMessage('');
      setQuestionSaveVersion((prev) => prev + 1);
      setAiUndoStack([]);
      setAiBaselineSnapshot(null);
      setAiResultSummary('');
      setAiErrorMessage('');
      setMessage('Service & pictures saved to Firebase.');
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

  const handleOpenDeleteDialog = () => {
    if (!selectedService?.persisted || isNewService) return;
    setDeleteErrorMessage('');
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDeleteService = async () => {
    if (!selectedService?.id || selectedService.id === 'new' || !selectedService.persisted) return;
    setIsDeletingService(true);
    setDeleteErrorMessage('');
    try {
      await deleteServiceCatalogEntry(selectedService.id);
      setIsDeleteDialogOpen(false);
      navigate('/services', {
        replace: true,
        state: { deletedServiceLabel: selectedService.label || selectedService.id },
      });
    } catch (error) {
      setDeleteErrorMessage(error?.message || 'Unable to delete this service.');
    } finally {
      setIsDeletingService(false);
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
    <div className="min-w-0 w-full space-y-6">
      <Card>
        <SectionTitle
          eyebrow="Service details"
          title={isNewService ? 'Create service' : (selectedService.label || 'Service details')}
          description="Manage catalog content, bundle composition, question pricing, images, and helper approvals in one place."
          action={(
            <div className="flex flex-wrap items-center gap-3">
              {!isNewService && selectedService?.persisted ? (
                <button
                  type="button"
                  onClick={handleOpenDeleteDialog}
                  disabled={isMutating || isDeletingService}
                  className="inline-flex items-center gap-2 rounded-2xl border border-rose-400/30 bg-rose-500/15 px-4 py-3 text-sm font-bold text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete service
                </button>
              ) : null}
              <Link
                to="/services"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to services
              </Link>
            </div>
          )}
        />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)]">
          <div className="min-w-0 w-full space-y-6">
            <Card className="border border-brand/30 bg-gradient-to-br from-brand/10 via-white/5 to-ink-950/40">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-soft">AI Service Architect</p>
                    <Badge tone={aiUndoStack.length ? 'warning' : 'neutral'}>
                      {aiUndoStack.length ? 'Unsaved AI draft' : 'Gemini 3.5 Flash Lite'}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-sm leading-6 text-ink-200">
                    Reads what you have entered so far plus the live catalog to suggest service details, options, questions, multi-select dependencies, and adder/multiplier pricing.
                    Changes populate into the form below for review and are <strong className="text-white">never saved automatically</strong>.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {aiUndoStack.length > 0 ? (
                    <button
                      type="button"
                      onClick={handleUndoAiChanges}
                      disabled={isGeneratingAi || isMutating || isDeletingService}
                      className="inline-flex items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/15 px-4 py-3 text-sm font-bold text-amber-200 transition hover:bg-amber-500/25 disabled:opacity-60"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Undo AI suggestions
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleGenerateWithAi()}
                    disabled={isGeneratingAi || isMutating || isDeletingService}
                    className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60"
                  >
                    {isGeneratingAi ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {isGeneratingAi
                      ? 'Generating suggestions...'
                      : isNewService
                        ? 'Generate with AI'
                        : 'Suggest edits with AI'}
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-2.5">
                <label className="block space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">
                    Optional AI instructions (or leave blank to generate from current fields)
                  </span>
                  <textarea
                    value={aiInstructions}
                    onChange={(event) => setAiInstructions(event.target.value)}
                    rows={2}
                    disabled={isGeneratingAi}
                    placeholder={isNewService
                      ? 'e.g. Create a Gel Manicure service with Normal nails, Press-ons, and Natural nails; make Nail length depend on Normal nails or Press-ons; add multiplier pricing for extra length.'
                      : 'e.g. Refine the options, add a follow-up question that depends on Event, or add multiplier pricing for larger spaces.'}
                    className="w-full rounded-[20px] border border-white/10 bg-ink-950/50 px-4 py-2.5 text-sm text-white outline-none disabled:opacity-60"
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  {[
                    {
                      label: 'Build complete service, options & detailed questions',
                      prompt: 'Generate complete service details, 3 to 5 distinct Service Options with ZAR prices and linked option-specific questions, plus detailed intake questions with concrete choices (such as colors, people counts, sizes, lengths, conditions), realistic adders/multipliers, and multi-select dependencies.',
                    },
                    {
                      label: 'Generate Service Options + sub-options',
                      prompt: 'Create realistic Service Options (packages/tiers/styles with descriptions and ZAR prices) AND detailed question choices including specific colors, group sizes / number of people, lengths, or room counts, and wire selectedQuestionIds properly.',
                    },
                    {
                      label: 'Add multi-select dependencies',
                      prompt: 'Keep the current service options and questions, and add smart conditional follow-up questions with multi-select dependsOnOptionValues triggers where multiple parent answers share a follow-up.',
                    },
                    {
                      label: 'Optimize ZAR adders & labor multipliers',
                      prompt: 'Review and refine all service option base prices, travel/min/max bounds, flat ZAR adders, and labor-only multipliers (for scale/people/effort).',
                    },
                  ].map((starter) => (
                    <button
                      key={starter.label}
                      type="button"
                      disabled={isGeneratingAi || isMutating}
                      onClick={() => setAiInstructions(starter.prompt)}
                      className="rounded-xl border border-white/10 bg-ink-950/40 px-3 py-1.5 text-xs font-medium text-ink-200 transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-60"
                    >
                      {starter.label}
                    </button>
                  ))}
                </div>
              </div>

              {aiErrorMessage ? (
                <div className="mt-3 rounded-2xl border border-rose-400/30 bg-rose-500/15 px-4 py-3 text-xs font-bold text-rose-200">
                  {aiErrorMessage}
                </div>
              ) : null}

              {aiResultSummary ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-bold text-emerald-200">AI suggestions applied to draft (unsaved)</p>
                    <p className="leading-5 text-emerald-100/90">{aiResultSummary}</p>
                    {aiBaselineSnapshot ? (
                      <p className="font-semibold text-amber-200">
                        Highlighted changes: {aiFieldChanges.size} service detail{aiFieldChanges.size === 1 ? '' : 's'} · {optionAiHighlightMap.size} service option{optionAiHighlightMap.size === 1 ? '' : 's'} · {questionAiHighlightMap.size} question{questionAiHighlightMap.size === 1 ? '' : 's'}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {aiBaselineSnapshot ? (
                      <button
                        type="button"
                        onClick={() => setAiBaselineSnapshot(null)}
                        disabled={isGeneratingAi || isMutating}
                        className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-ink-100 transition hover:bg-white/10"
                      >
                        Clear highlights
                      </button>
                    ) : null}
                    {aiUndoStack.length > 0 ? (
                      <button
                        type="button"
                        onClick={handleUndoAiChanges}
                        disabled={isGeneratingAi || isMutating}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/30 bg-amber-500/20 px-3 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-500/30"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Undo
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </Card>

            <Card className="bg-white/7">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Service id</span>
                    {aiFieldChanges.has('serviceId') ? <AiChangeBadge status="updated" /> : null}
                  </div>
                  <input
                    value={draftServiceId}
                    onChange={(event) => setDraftServiceId(event.target.value)}
                    disabled={!isNewService}
                    className={`w-full rounded-2xl border px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed ${
                      aiFieldChanges.has('serviceId') ? AI_INPUT_HIGHLIGHT_CLASS : 'border-white/10 bg-white/5'
                    }`}
                    placeholder="executive_car_wash"
                  />
                </label>

                <label className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Service type</span>
                    {aiFieldChanges.has('type') ? <AiChangeBadge status="updated" /> : null}
                  </div>
                  <select
                    value={draftType}
                    onChange={(event) => setDraftType(event.target.value)}
                    className={`w-full rounded-2xl border px-4 py-3 text-sm text-white outline-none ${
                      aiFieldChanges.has('type') ? AI_INPUT_HIGHLIGHT_CLASS : 'border-white/10 bg-ink-950/50'
                    }`}
                  >
                    <option value="service">Standard service</option>
                    <option value="bundle">Bundle service</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Service name</span>
                    {aiFieldChanges.has('label') ? <AiChangeBadge status="updated" /> : null}
                  </div>
                  <input
                    value={draftLabel}
                    onChange={(event) => setDraftLabel(event.target.value)}
                    className={`w-full rounded-2xl border px-4 py-3 text-sm text-white outline-none ${
                      aiFieldChanges.has('label') ? AI_INPUT_HIGHLIGHT_CLASS : 'border-white/10 bg-ink-950/50'
                    }`}
                  />
                </label>

                <label className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Prompt label</span>
                    {aiFieldChanges.has('promptLabel') ? <AiChangeBadge status="updated" /> : null}
                  </div>
                  <input
                    value={draftPromptLabel}
                    onChange={(event) => setDraftPromptLabel(event.target.value)}
                    className={`w-full rounded-2xl border px-4 py-3 text-sm text-white outline-none ${
                      aiFieldChanges.has('promptLabel') ? AI_INPUT_HIGHLIGHT_CLASS : 'border-white/10 bg-ink-950/50'
                    }`}
                    placeholder="I want this service"
                  />
                </label>

                <label className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Category id</span>
                    {aiFieldChanges.has('categoryId') ? <AiChangeBadge status="updated" /> : null}
                  </div>
                  <select
                    value={draftCategoryId}
                    onChange={(event) => {
                      const nextCategoryId = event.target.value;
                      setDraftCategoryId(nextCategoryId);
                    }}
                    className={`w-full rounded-2xl border px-4 py-3 text-sm text-white outline-none ${
                      aiFieldChanges.has('categoryId') ? AI_INPUT_HIGHLIGHT_CLASS : 'border-white/10 bg-ink-950/50'
                    }`}
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
                    className={`w-full cursor-not-allowed rounded-2xl border px-4 py-3 text-sm text-ink-200 outline-none ${
                      aiFieldChanges.has('categoryId') ? AI_INPUT_HIGHLIGHT_CLASS : 'border-white/10 bg-white/5'
                    }`}
                  />
                </label>
              </div>

              <label className="mt-4 block space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Description</span>
                  {aiFieldChanges.has('description') ? <AiChangeBadge status="updated" /> : null}
                </div>
                <textarea
                  value={draftDescription}
                  onChange={(event) => setDraftDescription(event.target.value)}
                  rows={4}
                  className={`w-full rounded-[22px] border px-4 py-3 text-sm text-white outline-none ${
                    aiFieldChanges.has('description') ? AI_INPUT_HIGHLIGHT_CLASS : 'border-white/10 bg-ink-950/50'
                  }`}
                />
              </label>

              <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-white">Service suggestions</p>
                    <p className="mt-1 text-sm leading-6 text-ink-200">
                      Pick a category template to prefill the service name, description, pricing, and common questions.
                    </p>
                  </div>
                  {matchedSuggestion ? (
                    <button
                      type="button"
                      onClick={() => applyServiceSuggestion(matchedSuggestion)}
                      className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white"
                    >
                      <Sparkles className="h-4 w-4" />
                      Apply matched template
                    </button>
                  ) : null}
                </div>

                {serviceSuggestions.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {serviceSuggestions.map((suggestion) => {
                      const isActiveSuggestion = matchedSuggestion?.id === suggestion.id;
                      return (
                        <button
                          key={suggestion.id}
                          type="button"
                          onClick={() => applyServiceSuggestion(suggestion)}
                          className={`rounded-full border px-3 py-2 text-sm transition ${
                            isActiveSuggestion
                              ? 'border-brand bg-brand/20 text-white'
                              : 'border-white/10 bg-ink-950/30 text-ink-100 hover:border-white/20 hover:bg-white/10'
                          }`}
                        >
                          {suggestion.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-ink-300">No category suggestions are configured yet.</p>
                )}

                {matchedSuggestion ? (
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-[20px] border border-white/10 bg-ink-950/30 px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Travel</p>
                      <p className="mt-2 text-lg font-bold text-white">R{matchedSuggestion.pricing.travelFee}</p>
                    </div>
                    <div className="rounded-[20px] border border-white/10 bg-ink-950/30 px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Minimum</p>
                      <p className="mt-2 text-lg font-bold text-white">R{matchedSuggestion.pricing.minimumTotal}</p>
                    </div>
                    <div className="rounded-[20px] border border-white/10 bg-ink-950/30 px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Maximum</p>
                      <p className="mt-2 text-lg font-bold text-white">R{matchedSuggestion.pricing.maximumTotal}</p>
                    </div>
                  </div>
                ) : null}
              </div>

              {draftType === 'bundle' ? (
                <div className={`mt-5 rounded-[24px] border p-4 ${
                  aiFieldChanges.has('includedServiceIds') || aiFieldChanges.has('inheritBundleImages')
                    ? AI_CARD_HIGHLIGHT_CLASS
                    : 'border-white/10 bg-white/5'
                }`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-white">Included services</p>
                        {aiFieldChanges.has('includedServiceIds') ? <AiChangeBadge status="updated" /> : null}
                      </div>
                      <p className="mt-1 text-sm text-ink-200">Select the individual services that make up this bundle.</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-ink-200">
                      <input
                        type="checkbox"
                        checked={draftInheritBundleImages}
                        onChange={(event) => setDraftInheritBundleImages(event.target.checked)}
                      />
                      <span>Inherit service images</span>
                      {aiFieldChanges.has('inheritBundleImages') ? <AiChangeBadge status="updated" /> : null}
                    </label>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
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

              <div className="mt-5 rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-xs leading-5 text-ink-200">
                Base prices are configured individually on each <strong className="text-white">Service Option</strong> below rather than at the top-level service.
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <SliderField
                  label="Travel fee"
                  help="Standardized travel charge. This is fixed at the service level and currently defaults to R35."
                  min={0}
                  max={150}
                  step={5}
                  value={draftTravelFee}
                  onChange={setDraftTravelFee}
                  isHighlighted={aiFieldChanges.has('travelFee')}
                />
                <SliderField
                  label="Minimum total"
                  help="Fallback minimum when using legacy service-level pricing without configured options."
                  min={0}
                  max={1500}
                  step={5}
                  value={draftMinimumTotal}
                  onChange={setDraftMinimumTotal}
                  isHighlighted={aiFieldChanges.has('minimumTotal')}
                />
                <SliderField
                  label="Maximum total"
                  help="Fallback maximum cap for legacy pricing or bundle caps."
                  min={50}
                  max={3000}
                  step={5}
                  value={draftMaximumTotal}
                  onChange={setDraftMaximumTotal}
                  isHighlighted={aiFieldChanges.has('maximumTotal')}
                />
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className={`rounded-[24px] border p-4 ${
                  aiFieldChanges.has('requiresPortfolioSelection') ? AI_CARD_HIGHLIGHT_CLASS : 'border-white/10 bg-white/5'
                }`}>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={draftRequiresPortfolioSelection}
                      onChange={(event) => setDraftRequiresPortfolioSelection(event.target.checked)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-white">Requires portfolio selection</p>
                        {aiFieldChanges.has('requiresPortfolioSelection') ? <AiChangeBadge status="updated" /> : null}
                      </div>
                      <p className="mt-1 text-sm leading-6 text-ink-200">
                        Turn this on for services like braids, makeup, lashes, or nails where customers should browse helper photos before booking.
                      </p>
                    </div>
                  </label>
                </div>
                <div className={`rounded-[24px] border p-4 ${
                  aiFieldChanges.has('active') ? AI_CARD_HIGHLIGHT_CLASS : 'border-white/10 bg-white/5'
                }`}>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={draftActive}
                      onChange={(event) => setDraftActive(event.target.checked)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-white">Published</p>
                        {aiFieldChanges.has('active') ? <AiChangeBadge status="updated" /> : null}
                      </div>
                      <p className="mt-1 text-sm leading-6 text-ink-200">
                        When published, the service is visible in the helper and customer apps. Turn it off to pause the service without deleting it.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className={`mt-4 rounded-[24px] border p-4 ${
                aiFieldChanges.has('optionApplicationMode') ? AI_CARD_HIGHLIGHT_CLASS : 'border-white/10 bg-white/5'
              }`}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-white">Helper option application mode</p>
                  {aiFieldChanges.has('optionApplicationMode') ? <AiChangeBadge status="updated" /> : null}
                </div>
                <p className="mt-1 text-sm leading-6 text-ink-200">
                  Control whether helpers must select and upload proof per option (e.g. Hairstyles, Barbering) or submit one service application that covers all options (e.g. Cleaning, Yard Maintenance).
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition ${
                    draftOptionApplicationMode !== 'unified' ? 'border-brand bg-brand/15' : 'border-white/10 bg-ink-950/30'
                  }`}>
                    <input
                      type="radio"
                      name="optionApplicationMode"
                      value="per_option"
                      checked={draftOptionApplicationMode !== 'unified'}
                      onChange={() => setDraftOptionApplicationMode('per_option')}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-bold text-white">Per-option proof & approval</p>
                      <p className="mt-1 text-xs text-ink-200">Helpers choose specific options, upload photos per option, and only match requests for approved options.</p>
                    </div>
                  </label>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition ${
                    draftOptionApplicationMode === 'unified' ? 'border-brand bg-brand/15' : 'border-white/10 bg-ink-950/30'
                  }`}>
                    <input
                      type="radio"
                      name="optionApplicationMode"
                      value="unified"
                      checked={draftOptionApplicationMode === 'unified'}
                      onChange={() => setDraftOptionApplicationMode('unified')}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-bold text-white">Unified service approval (all options)</p>
                      <p className="mt-1 text-xs text-ink-200">Helpers apply once for the whole service and are eligible for all options once approved.</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="mt-5 min-w-0 w-full rounded-[24px] border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-white">Service Options</p>
                      {optionAiHighlightMap.size > 0 ? (
                        <AiChangeBadge status="updated" />
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-ink-200">Configure distinct options/packages for this service, each with title, description, image, price, and associated questions.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddServiceOption}
                    className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white"
                  >
                    <Plus className="h-4 w-4" />
                    Add service option
                  </button>
                </div>

                {optionStatusMessage ? (
                  <p className="mt-3 text-xs font-bold text-brand-soft">{optionStatusMessage}</p>
                ) : null}

                <div className="mt-4 min-w-0 w-full space-y-3">
                  {draftOptions.length ? draftOptions.map((opt, optIndex) => {
                    const isExpanded = expandedOptionIndex === optIndex;
                    const optHighlight = optionAiHighlightMap.get(opt.draftKey || opt.id || optIndex) || null;
                    return (
                      <div
                        key={opt.draftKey || `opt_${optIndex}`}
                        className={`min-w-0 w-full rounded-[22px] border p-3 sm:p-4 transition ${
                          optHighlight ? AI_CARD_HIGHLIGHT_CLASS : 'border-white/10 bg-ink-950/40'
                        }`}
                      >
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/25 text-brand-soft font-bold text-sm">
                              #{optIndex + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate font-bold text-white text-sm sm:text-base">{opt.title || `Option ${optIndex + 1} (Untitled)`}</p>
                                {optHighlight ? <AiChangeBadge status={optHighlight.status} /> : null}
                              </div>
                              <p className="truncate text-xs text-ink-300">
                                Price: R{opt.price || 0}
                                {opt.requiresNoOptionSpecificQuestions
                                  ? ' • Standard questions only'
                                  : Array.isArray(opt.selectedQuestionIds) && opt.selectedQuestionIds.length
                                    ? ` • ${opt.selectedQuestionIds.length} linked question${opt.selectedQuestionIds.length === 1 ? '' : 's'}`
                                    : ''}
                                {opt.description ? ` • ${opt.description}` : ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            {isExpanded ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSaveSingleOption(optIndex)}
                                  disabled={isMutating}
                                  title="Save option details"
                                  aria-label="Save option details"
                                  className="inline-flex items-center justify-center rounded-xl bg-emerald-500/20 p-2 text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-60"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedOptionIndex(-1);
                                    setOptionStatusMessage('');
                                  }}
                                  title="Collapse option"
                                  aria-label="Collapse option"
                                  className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 text-ink-200 transition hover:bg-white/10 hover:text-white"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleEditOption(optIndex)}
                                title="Edit option details"
                                aria-label="Edit option details"
                                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 text-brand-soft transition hover:bg-white/10"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setDraftOptions((current) => current.filter((_, idx) => idx !== optIndex));
                                if (expandedOptionIndex === optIndex) setExpandedOptionIndex(-1);
                                else if (expandedOptionIndex > optIndex) setExpandedOptionIndex((prev) => prev - 1);
                              }}
                              title="Remove option"
                              aria-label="Remove option"
                              className="inline-flex items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 p-2 text-red-300 transition hover:bg-red-500/20"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {isExpanded ? (
                          <div className="mt-4 min-w-0 w-full pt-4 border-t border-white/10">
                            <ServiceOptionEditor
                              option={opt}
                              siblingOptions={draftOptions}
                              allQuestions={draftQuestions}
                              serviceContext={serviceAiContext}
                              highlight={optHighlight}
                              onPreviewImage={setPreviewModalImage}
                              onChange={(nextOpt) => setDraftOptions((current) => current.map((item, idx) => (idx === optIndex ? nextOpt : item)))}
                              onRemove={() => {
                                setDraftOptions((current) => current.filter((_, idx) => idx !== optIndex));
                                setExpandedOptionIndex(-1);
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  }) : (
                    <EmptyState title="No service options configured" description="Add configurable service options (e.g., packages, cuts, styles) with their own prices and descriptions." />
                  )}
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <QuestionEditor
                  title="Service questions"
                  description="Configure standard, option-specific, and dependent questions for the customer flow, including answer choices, pictures, dependencies, and adder or labor-multiplier pricing."
                  required
                  questions={draftQuestions}
                  allQuestions={draftQuestions}
                  suggestions={suggestedQuestions}
                  serviceContext={serviceAiContext}
                  storageScope={selectedService?.id && selectedService.id !== 'new' ? selectedService.id : (slugify(draftServiceId || draftLabel) || 'question_option')}
                  highlightMap={questionAiHighlightMap}
                  onChange={setDraftQuestions}
                  onUpdateQuestionByKey={handleUpdateQuestionByKey}
                  onDependencyAssigned={stripDependentQuestionFromServiceOptions}
                  onPreviewImage={setPreviewModalImage}
                  onPersistQuestions={persistQuestionnaireSection}
                  isMutating={isMutating}
                  resetKey={selectedService?.id || 'new'}
                  saveVersion={questionSaveVersion}
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleServiceSave}
                    disabled={isMutating || isDeletingService || isGeneratingAi}
                    className="rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {selectedService.persisted ? 'Save changes' : 'Create service'}
                  </button>
                  {aiUndoStack.length > 0 ? (
                    <button
                      type="button"
                      onClick={handleUndoAiChanges}
                      disabled={isMutating || isDeletingService || isGeneratingAi}
                      className="inline-flex items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/15 px-4 py-3 text-sm font-bold text-amber-200 transition hover:bg-amber-500/25 disabled:opacity-60"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Undo AI suggestions
                    </button>
                  ) : null}
                  {message ? <p className="text-sm font-bold text-brand-soft">{message}</p> : null}
                </div>
                {!isNewService && selectedService.persisted ? (
                  <button
                    type="button"
                    onClick={handleOpenDeleteDialog}
                    disabled={isMutating || isDeletingService}
                    className="inline-flex items-center gap-2 rounded-2xl border border-rose-400/30 bg-rose-500/15 px-4 py-3 text-sm font-bold text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete service
                  </button>
                ) : null}
              </div>

              <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-bold text-white">Service images</p>
                    <p className="mt-1 text-sm text-ink-200">
                      Upload or generate up to {remainingUploads} more image{remainingUploads === 1 ? '' : 's'} for this service.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10">
                      <ImageIcon className="h-4 w-4 shrink-0" />
                      <span>Upload images</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={isMutating || isGeneratingServiceImage || remainingUploads <= 0}
                        className="hidden"
                        onChange={(event) => {
                          const files = Array.from(event.target.files || []);
                          const maxFiles = Math.max(0, 10 - effectiveImages.length - draftAiServiceImages.length);
                          setDraftFiles(files.slice(0, maxFiles));
                          if (event.target) event.target.value = '';
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateOneServiceImage}
                      disabled={isGeneratingServiceImage || isMutating || isGeneratingAi || remainingUploads <= 0}
                      className="inline-flex items-center gap-2 rounded-2xl border border-brand/40 bg-brand/20 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand/30 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isGeneratingServiceImage ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 shrink-0 text-brand-soft" />
                      )}
                      <span>{isGeneratingServiceImage ? 'Generating image...' : 'Generate one more image'}</span>
                    </button>
                  </div>
                </div>
                {serviceImageAiError ? (
                  <p className="mt-3 text-xs font-bold text-rose-300">{serviceImageAiError}</p>
                ) : null}
                {draftFiles.length ? (
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {draftFiles.map((file, fileIdx) => (
                      <div key={`${file.name}-${file.lastModified}-${fileIdx}`} className="flex items-center justify-between gap-3 rounded-[20px] border border-white/10 bg-ink-950/40 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-white">{file.name}</p>
                          <p className="mt-1 text-xs text-ink-300">{Math.ceil(file.size / 1024)} KB · staged file</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDraftFiles((current) => current.filter((_, idx) => idx !== fileIdx))}
                          className="shrink-0 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-500/20"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {effectiveImages.length || draftAiServiceImages.length ? (
                  <>
                    {effectiveImages.map((picture) => (
                      <div key={picture.id} className="overflow-hidden rounded-[20px] border border-white/10 bg-white/5">
                        <button
                          type="button"
                          onClick={() => setPreviewModalImage({
                            url: picture.uri,
                            title: draftLabel || 'Service image',
                            subtitle: picture.inherited ? 'Inherited from bundled service' : 'Saved in Firebase Storage',
                          })}
                          title="Click to expand picture"
                          aria-label="Expand service image"
                          className="group relative block h-40 w-full overflow-hidden bg-black/20 focus:outline-none"
                        >
                          <img src={picture.uri} alt={draftLabel || 'Service'} className="h-full w-full object-cover" />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                            <ZoomIn className="h-5 w-5 text-white" />
                          </span>
                        </button>
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
                    ))}
                    {draftAiServiceImages.map((picture, aiIdx) => (
                      <div key={picture.id} className="overflow-hidden rounded-[20px] border border-amber-400/40 bg-amber-500/10">
                        <button
                          type="button"
                          onClick={() => setPreviewModalImage({
                            url: picture.uri,
                            title: `${draftLabel || 'Service'} (AI preview #${aiIdx + 1})`,
                            subtitle: 'Generated by AI (unsaved preview — will upload to Firebase Storage on save)',
                          })}
                          title="Click to expand picture"
                          aria-label="Expand AI service preview image"
                          className="group relative block h-40 w-full overflow-hidden bg-black/20 focus:outline-none"
                        >
                          <img src={picture.uri} alt={`${draftLabel || 'Service'} AI preview ${aiIdx + 1}`} className="h-full w-full object-cover" />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                            <ZoomIn className="h-5 w-5 text-white" />
                          </span>
                        </button>
                        <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-amber-200">
                          <span className="truncate font-bold uppercase tracking-wider text-[10px]">AI preview · saves on Save</span>
                          <button
                            type="button"
                            onClick={() => setDraftAiServiceImages((current) => current.filter((item) => item.id !== picture.id))}
                            disabled={isMutating || isGeneratingServiceImage}
                            className="inline-flex shrink-0 items-center gap-1 font-bold text-rose-300 hover:text-rose-200 disabled:opacity-60"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <EmptyState title="No service images yet" description="Upload images, generate one with AI, or let bundle services inherit images from their included services." />
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

      <ConfirmDialog
        open={isDeleteDialogOpen}
        title={`Delete "${selectedService.label || selectedService.id}"?`}
        description="This permanently removes the service from the live Firestore catalog so it will no longer appear in the admin, helper, or customer flows."
        details={[
          `Service ID: ${selectedService.id}`,
          ...(helperGroups.length
            ? [`${helperGroups.length} helper profile${helperGroups.length === 1 ? '' : 's'} currently have ${serviceRows.length} submission${serviceRows.length === 1 ? '' : 's'} linked to this service.`]
            : []),
          ...(referencingBundles.length
            ? [`Included in ${referencingBundles.length} bundle${referencingBundles.length === 1 ? '' : 's'} (${referencingBundles.map((b) => b.label).join(', ')}). It will be removed from those bundles.`]
            : []),
          'This action cannot be undone.',
        ]}
        confirmLabel="Delete service"
        cancelLabel="Cancel"
        tone="danger"
        isBusy={isDeletingService}
        errorMessage={deleteErrorMessage}
        onCancel={() => {
          if (!isDeletingService) {
            setIsDeleteDialogOpen(false);
            setDeleteErrorMessage('');
          }
        }}
        onConfirm={handleConfirmDeleteService}
      />

      {previewModalImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setPreviewModalImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label={previewModalImage.title || 'Picture preview'}
        >
          <div
            className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/15 bg-ink-950 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate font-bold text-white">{previewModalImage.title || 'Picture preview'}</p>
                {previewModalImage.subtitle ? (
                  <p className="mt-0.5 text-xs text-ink-300">{previewModalImage.subtitle}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalImage(null)}
                aria-label="Close picture preview"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex max-h-[75vh] items-center justify-center bg-black/40 p-4">
              <img
                src={previewModalImage.url}
                alt={previewModalImage.title || 'Expanded preview'}
                className="max-h-[68vh] w-auto max-w-full rounded-2xl object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
