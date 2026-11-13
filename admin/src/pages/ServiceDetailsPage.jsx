import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Image as ImageIcon, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Card, EmptyState, LoadingState, SectionTitle } from '../components/ui';
import { getAdminCatalogCategories } from '../constants/serviceCatalog';
import { getAdminQuestionPreset } from '../constants/serviceQuestionPresets';
import { getAdminServiceSuggestionMatch, getAdminServiceSuggestionsByCategory } from '../constants/serviceTemplateSuggestions';
import { flattenProviderServices, listHelperProfiles } from '../services/adminService';
import {
  buildServiceCatalogView,
  deleteServiceCatalogImage,
  saveServiceCatalogEntry,
  subscribeToServiceCatalog,
  uploadServiceCatalogImages,
} from '../services/serviceCatalogService';
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

function createOptionDraft(option = {}, index = 0) {
  const value = String(option.value || '').trim() || `option_${index + 1}`;
  return {
    draftKey: String(option.draftKey || option.clientId || '').trim() || createDraftKey('option'),
    value,
    label: String(option.label || value).trim(),
    priceAdder: Number(option.priceAdder || 0),
    materialAdder: Number(option.materialAdder || 0),
    pricingType: String(option.pricingType || (Number(option.multiplier || 1) !== 1 ? 'multiplier' : 'adder')).trim(),
    factor: Number(option.factor || option.multiplier || 1),
    imageUrl: String(option.imageUrl || '').trim(),
  };
}

function createQuestionDraft(question = {}, index = 0, required = true) {
  return {
    draftKey: String(question.draftKey || question.clientId || '').trim() || createDraftKey('question'),
    id: String(question.id || `question_${index + 1}`).trim(),
    prompt: String(question.prompt || question.label || '').trim(),
    type: String(question.type || 'option-specific').trim().toLowerCase() === 'standard' ? 'standard' : 'option-specific',
    answerType: String(question.answerType || 'enum').trim().toLowerCase(),
    answerHint: String(question.answerHint || '').trim(),
    required,
    enabled: question.enabled !== false,
    dependencyRule: question.dependencyRule || { dependsOnQuestionId: '', dependsOnOptionValue: '' },
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
      const type = question.type === 'standard' ? 'standard' : 'option-specific';
      const options = (Array.isArray(question.options) ? question.options : [])
        .filter((option) => String(option.label || '').trim())
        .map((option, optionIndex) => ({
          value: slugify(option.value || option.label || `option_${optionIndex + 1}`),
          label: String(option.label || '').trim(),
          priceAdder: Number(option.priceAdder || 0),
          materialAdder: Number(option.materialAdder || 0),
          pricingType: option.pricingType === 'multiplier' ? 'multiplier' : 'adder',
          factor: Number(option.factor || 1),
          multiplier: option.pricingType === 'multiplier' ? Number(option.factor || 1) : 1,
          imageUrl: String(option.imageUrl || '').trim(),
        }));

      return {
        id: String(question.id || slugify(prompt) || `question_${index + 1}`).trim(),
        prompt,
        type,
        answerType: question.answerType === 'text' ? 'text' : 'enum',
        answerHint: String(question.answerHint || '').trim(),
        required,
        dependencyRule: question.dependencyRule && question.dependencyRule.dependsOnQuestionId
          ? {
              dependsOnQuestionId: String(question.dependencyRule.dependsOnQuestionId).trim(),
              dependsOnOptionValue: String(question.dependencyRule.dependsOnOptionValue).trim(),
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

function ServiceOptionEditor({ option, allQuestions = [], onChange, onRemove }) {
  const handlePriceChange = (rawValue) => {
    onChange({ ...option, price: coerceSliderValue(rawValue, 0, 2000, 5) });
  };

  const toggleQuestionId = (questionId) => {
    const currentIds = Array.isArray(option.selectedQuestionIds) ? option.selectedQuestionIds : [];
    const exists = currentIds.includes(questionId);
    const nextIds = exists ? currentIds.filter(id => id !== questionId) : [...currentIds, questionId];
    onChange({ ...option, selectedQuestionIds: nextIds });
  };

  return (
    <div className="rounded-[24px] border border-white/10 bg-ink-950/30 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Service Option</span>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white"
        >
          <Trash2 className="h-4 w-4" />
          Remove option
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Option title</span>
          <input
            value={option.title}
            onChange={(event) => onChange({ ...option, title: event.target.value })}
            placeholder="e.g. Executive Fade & Beard Trim"
            className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none"
          />
        </label>
        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Price (R)</span>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white">
            <span>R</span>
            <input
              type="number"
              min={0}
              max={2000}
              step={5}
              value={option.price}
              onChange={(event) => handlePriceChange(event.target.value)}
              className="w-full bg-transparent text-right text-white outline-none"
            />
          </div>
        </div>
      </div>

      <label className="block space-y-2">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Short description</span>
        <textarea
          value={option.description}
          onChange={(event) => onChange({ ...option, description: event.target.value })}
          rows={2}
          placeholder="Briefly describe what this option includes..."
          className="w-full rounded-[22px] border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none"
        />
      </label>

      <div className="flex items-center gap-3">
        <ImageIcon className="h-4 w-4 text-ink-300" />
        <input
          value={option.imageUrl || ''}
          onChange={(event) => onChange({ ...option, imageUrl: event.target.value })}
          placeholder="Optional image URL (for WhatsApp or UI card display)"
          className="w-full rounded-xl border border-white/10 bg-ink-950/50 px-3 py-2 text-xs text-white outline-none"
        />
      </div>

      <div className="rounded-[20px] border border-white/10 bg-white/5 p-3 space-y-3">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={Boolean(option.requiresNoOptionSpecificQuestions)}
            onChange={(event) => onChange({ ...option, requiresNoOptionSpecificQuestions: event.target.checked })}
          />
          <div>
            <p className="text-sm font-bold text-white">Requires no option-specific questions</p>
            <p className="text-xs text-ink-300">When checked, this option skips option-specific questions and uses only standard questions.</p>
          </div>
        </label>

        {!option.requiresNoOptionSpecificQuestions && allQuestions.length > 0 ? (
          <div className="space-y-2 pt-2 border-t border-white/10">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Associated Option-Specific Questions</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {allQuestions.filter(q => q.type !== 'standard').map((q) => {
                const isSelected = (option.selectedQuestionIds || []).includes(q.id);
                return (
                  <label key={q.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-950/30 px-3 py-2 text-xs text-white">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleQuestionId(q.id)}
                    />
                    <span className="truncate">{q.prompt || q.id}</span>
                  </label>
                );
              })}
            </div>
          </div>
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
}) {
  const handleValueChange = (rawValue) => {
    onChange(coerceSliderValue(rawValue, min, max, step));
  };

  return (
    <label className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">{label}</span>
          {help ? <p className="mt-1 text-xs leading-5 text-ink-300">{help}</p> : null}
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white">
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

function QuestionOptionEditor({ option, onChange, onRemove }) {
  const handlePriceAdderChange = (rawValue) => {
    onChange({ ...option, priceAdder: coerceSliderValue(rawValue, 0, 500, 5) });
  };

  const handleFactorChange = (rawValue) => {
    const parsed = Number(rawValue);
    onChange({ ...option, factor: Number.isFinite(parsed) ? Math.max(0.1, Math.min(5.0, parsed)) : 1.0 });
  };

  const isMultiplier = option.pricingType === 'multiplier';

  return (
    <div className="rounded-2xl border border-white/10 bg-ink-950/30 p-3 space-y-3">
      <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr_0.8fr_auto]">
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
              min={0.1}
              max={5.0}
              step={0.05}
              value={option.factor || 1.0}
              onChange={(event) => handleFactorChange(event.target.value)}
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
              max={500}
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
          className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <ImageIcon className="h-4 w-4 text-ink-300" />
        <input
          value={option.imageUrl || ''}
          onChange={(event) => onChange({ ...option, imageUrl: event.target.value })}
          placeholder="Option Image URL (for WhatsApp Carousels, e.g. https://...)"
          className="w-full rounded-xl border border-white/10 bg-ink-950/50 px-3 py-2 text-xs text-white outline-none"
        />
      </div>
    </div>
  );
}

function QuestionEditor({
  title,
  description,
  required = true,
  questions,
  suggestions = [],
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

  const appendSuggestedQuestion = (question) => {
    onChange(mergeQuestionDrafts(questions, [question], question.required !== false));
  };

  const appendAllSuggestedQuestions = () => {
    onChange(mergeQuestionDrafts(questions, suggestions, required));
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

            <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_0.8fr_0.8fr]">
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
                value={question.type || 'option-specific'}
                onChange={(event) => updateQuestion(index, { ...question, type: event.target.value })}
                className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="option-specific">Option-specific</option>
                <option value="standard">Standard (Always asked)</option>
              </select>
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
  const [draftType, setDraftType] = useState('service');
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
        type: 'service',
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

  const suggestedQuestionSet = useMemo(() => {
    const preset = getAdminQuestionPreset({
      serviceId: matchedSuggestion?.id || slugify(draftServiceId || draftLabel),
      categoryId: draftCategoryId,
    });

    return {
      required: mergeQuestionDrafts([], [...preset.required, ...(matchedSuggestion?.requiredQuestions || [])], true),
      optional: mergeQuestionDrafts([], [...preset.optional, ...(matchedSuggestion?.optionalQuestions || [])], false),
    };
  }, [draftCategoryId, draftLabel, draftServiceId, matchedSuggestion]);

  useEffect(() => {
    if (!selectedService) return;
    const nextCategoryId = selectedService.categoryId || categoryOptions[0]?.id || '';

    setDraftServiceId(selectedService.id === 'new' ? '' : selectedService.id);
    setDraftLabel(selectedService.label || '');
    setDraftPromptLabel(selectedService.promptLabel || selectedService.label || '');
    setDraftDescription(selectedService.description || '');
    setDraftCategoryId(nextCategoryId);
    setDraftType(selectedService.type || 'service');
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
      selectedService.questionnaire?.required || [],
      true,
    ));
    setDraftOptionalQuestions(mapQuestionDrafts(
      selectedService.questionnaire?.optional || [],
      false,
    ));
    setDraftOptions(
      Array.isArray(selectedService.options) && selectedService.options.length
        ? selectedService.options.map((opt, idx) => createServiceOptionDraft(opt, idx))
        : []
    );
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

  const remainingUploads = Math.max(0, 10 - effectiveImages.length);

  const applyServiceSuggestion = (suggestion, { replaceQuestions = true } = {}) => {
    if (!suggestion) return;

    const preset = getAdminQuestionPreset({ serviceId: suggestion.id, categoryId: draftCategoryId });
    const requiredQuestions = [...preset.required, ...(suggestion.requiredQuestions || [])];
    const optionalQuestions = [...preset.optional, ...(suggestion.optionalQuestions || [])];

    if (isNewService) {
      setDraftServiceId(suggestion.id);
    }
    setDraftLabel(suggestion.label || '');
    setDraftPromptLabel(suggestion.promptLabel || suggestion.label || '');
    setDraftDescription(suggestion.description || '');
    setDraftBasePrice(Number(suggestion.pricing?.basePrice ?? 120));
    setDraftTravelFee(Number(suggestion.pricing?.travelFee ?? 35));
    setDraftMinimumTotal(Number(suggestion.pricing?.minimumTotal ?? 80));
    setDraftMaximumTotal(Number(suggestion.pricing?.maximumTotal ?? 500));
    setDraftRequiresPortfolioSelection(Boolean(suggestion.requiresPortfolioSelection));

    if (replaceQuestions) {
      setDraftRequiredQuestions(mapQuestionDrafts(requiredQuestions, true));
      setDraftOptionalQuestions(mapQuestionDrafts(optionalQuestions, false));
      return;
    }

    setDraftRequiredQuestions((current) => mergeQuestionDrafts(current, requiredQuestions, true));
    setDraftOptionalQuestions((current) => mergeQuestionDrafts(current, optionalQuestions, false));
  };

  const buildPayload = (images = []) => ({
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
                    value={draftType}
                    onChange={(event) => setDraftType(event.target.value)}
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
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-[20px] border border-white/10 bg-ink-950/30 px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Base</p>
                      <p className="mt-2 text-lg font-bold text-white">R{matchedSuggestion.pricing.basePrice}</p>
                    </div>
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

              <div className="mt-5 rounded-[24px] border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-white">Service Options</p>
                    <p className="mt-1 text-sm text-ink-200">Configure distinct options/packages for this service, each with title, description, image, price, and associated questions.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDraftOptions((current) => [...current, createServiceOptionDraft({}, current.length)])}
                    className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white"
                  >
                    <Plus className="h-4 w-4" />
                    Add service option
                  </button>
                </div>

                <div className="mt-4 space-y-4">
                  {draftOptions.length ? draftOptions.map((opt, optIndex) => (
                    <ServiceOptionEditor
                      key={opt.draftKey || `opt_${optIndex}`}
                      option={opt}
                      allQuestions={[...draftRequiredQuestions, ...draftOptionalQuestions]}
                      onChange={(nextOpt) => setDraftOptions((current) => current.map((item, idx) => (idx === optIndex ? nextOpt : item)))}
                      onRemove={() => setDraftOptions((current) => current.filter((_, idx) => idx !== optIndex))}
                    />
                  )) : (
                    <EmptyState title="No service options configured" description="Add configurable service options (e.g., packages, cuts, styles) with their own prices and descriptions." />
                  )}
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <QuestionEditor
                  title="Required questions"
                  description="These questions appear in the customer flow before continuing. Each option can add its own amount on top of the base price."
                  required
                  questions={draftRequiredQuestions}
                  suggestions={suggestedQuestionSet.required}
                  onChange={setDraftRequiredQuestions}
                />
                <QuestionEditor
                  title="Optional questions"
                  description="Use these for extra detail or follow-up questions that can still influence price when selected."
                  required={false}
                  questions={draftOptionalQuestions}
                  suggestions={suggestedQuestionSet.optional}
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
