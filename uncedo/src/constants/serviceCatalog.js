function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toTitleCase(value = '') {
  return String(value || '')
    .trim()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeEnumOptions(options = []) {
  return (Array.isArray(options) ? options : [])
    .map((option) => {
      if (!option) return null;
      if (typeof option === 'string') {
        const value = String(option || '').trim();
        return value ? { value, label: value } : null;
      }

      const value = String(option.value || option.id || '').trim();
      if (!value) return null;

      return {
        value,
        label: String(option.label || value).trim(),
      };
    })
    .filter(Boolean);
}

function normalizeServiceOption(option = {}, index = 0) {
  if (!option || typeof option !== 'object') return null;
  const rawTitle = String(option.title || option.label || '').trim();
  const id = String(option.id || slugify(rawTitle || `option_${index + 1}`)).trim().toLowerCase();
  if (!id && !rawTitle) return null;

  return {
    draftKey: String(option.draftKey || id || `option_${index + 1}`).trim(),
    id,
    title: rawTitle || id,
    description: String(option.description || '').trim(),
    imageUrl: String(option.imageUrl || '').trim(),
    price: Math.max(0, Math.round(Number(option.price ?? option.priceAdder ?? 0) || 0)),
    selectedQuestionIds: [...new Set(
      (Array.isArray(option.selectedQuestionIds) ? option.selectedQuestionIds : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    )],
    requiresNoOptionSpecificQuestions: Boolean(option.requiresNoOptionSpecificQuestions),
  };
}

function normalizeLiveQuestion(question = {}) {
  const id = String(question.id || '').trim();
  if (!id) return null;

  const rawType = String(question.type || 'option-specific').trim().toLowerCase();
  const depQuestionId = String(
    question.dependencyRule?.dependsOnQuestionId
    || question.dependsOn?.questionId
    || '',
  ).trim();
  const depOptionValue = String(
    question.dependencyRule?.dependsOnOptionValue
    || question.dependsOn?.optionValue
    || '',
  ).trim();

  return {
    id,
    prompt: String(question.prompt || question.label || id).trim(),
    answerType: String(question.answerType || 'text').trim().toLowerCase(),
    answerHint: String(question.answerHint || '').trim(),
    options: normalizeEnumOptions(question.options),
    required: question.required !== false,
    type: rawType === 'standard' ? 'standard' : 'option-specific',
    dependsOn: depQuestionId ? {
      questionId: depQuestionId,
      optionValue: depOptionValue,
    } : null,
    dependencyRule: depQuestionId ? {
      dependsOnQuestionId: depQuestionId,
      dependsOnOptionValue: depOptionValue,
    } : null,
  };
}

function normalizeImage(image) {
  if (!image) return null;
  if (typeof image === 'string') {
    const uri = String(image || '').trim();
    return uri ? { id: `img_${slugify(uri).slice(0, 24)}`, uri, objectPath: '', uploadedAt: null } : null;
  }

  const uri = String(image.uri || image.downloadUrl || '').trim();
  if (!uri) return null;

  return {
    id: String(image.id || `img_${Math.random().toString(36).slice(2, 10)}`),
    uri,
    objectPath: String(image.objectPath || '').trim(),
    uploadedAt: image.uploadedAt || null,
  };
}

function buildLiveServiceEntry(entry = {}) {
  const id = String(entry.id || entry.serviceId || '').trim().toLowerCase();
  const categoryId = String(entry.categoryId || '').trim().toLowerCase();
  if (!id || !categoryId) return null;

  const questionnaire = entry.questionnaire && typeof entry.questionnaire === 'object'
    ? entry.questionnaire
    : { required: entry.requiredQuestions, optional: entry.optionalQuestions };
  const type = String(entry.type || 'service').trim().toLowerCase();
  const rawOptionMode = String(entry.optionApplicationMode || '').trim().toLowerCase();

  return {
    id,
    categoryId,
    label: String(entry.label || entry.serviceName || id).trim(),
    promptLabel: String(entry.promptLabel || entry.label || entry.serviceName || id).trim(),
    type: type === 'bundle' || type === 'package' ? 'bundle' : 'service',
    description: String(entry.description || '').trim(),
    includedServiceIds: (Array.isArray(entry.includedServiceIds) ? entry.includedServiceIds : [])
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean),
    packageQuestions: [],
    optionApplicationMode: rawOptionMode === 'unified' ? 'unified' : 'per_option',
    options: (Array.isArray(entry.options) ? entry.options : [])
      .map((option, index) => normalizeServiceOption(option, index))
      .filter(Boolean),
    pricing: entry.pricing && typeof entry.pricing === 'object' ? { ...entry.pricing } : {},
    questionnaire: {
      required: (Array.isArray(questionnaire?.required) ? questionnaire.required : [])
        .map((question) => normalizeLiveQuestion({ ...question, required: true }))
        .filter(Boolean),
      optional: (Array.isArray(questionnaire?.optional) ? questionnaire.optional : [])
        .map((question) => normalizeLiveQuestion({ ...question, required: false }))
        .filter(Boolean),
    },
    requiresPortfolioSelection: Boolean(entry.requiresPortfolioSelection),
    sensitive: Boolean(entry.sensitive),
    active: entry.active !== false,
    approved: entry.approved !== false,
    images: (Array.isArray(entry.images) ? entry.images : [])
      .map(normalizeImage)
      .filter(Boolean),
    categoryName: String(entry.categoryName || toTitleCase(categoryId)).trim(),
    source: 'live',
  };
}

function compareByLabel(left, right) {
  return String(left?.label || left?.name || '').localeCompare(String(right?.label || right?.name || ''));
}

const liveServiceMap = new Map();
const liveCategoryMap = new Map();

export const CUSTOMER_SERVICE_CATALOG = [];
export const CUSTOMER_SERVICE_CATEGORY_OPTIONS = [];
export const CUSTOMER_SERVICE_OPTIONS = [];
export const CUSTOMER_CATEGORY_LABELS = [];
export const CUSTOMER_SERVICE_LABELS = [];

function rebuildMutableCatalogExports() {
  const categories = [...liveCategoryMap.values()]
    .sort(compareByLabel)
    .map((category) => ({
      ...category,
      packages: [...liveServiceMap.values()]
        .filter((service) => service.categoryId === category.id && service.type === 'bundle')
        .sort(compareByLabel),
      services: [...liveServiceMap.values()]
        .filter((service) => service.categoryId === category.id && service.type !== 'bundle')
        .sort(compareByLabel),
    }));

  const options = [...liveServiceMap.values()].sort(compareByLabel);

  CUSTOMER_SERVICE_CATALOG.splice(0, CUSTOMER_SERVICE_CATALOG.length, ...categories);
  CUSTOMER_SERVICE_OPTIONS.splice(0, CUSTOMER_SERVICE_OPTIONS.length, ...options);
  CUSTOMER_SERVICE_CATEGORY_OPTIONS.splice(0, CUSTOMER_SERVICE_CATEGORY_OPTIONS.length, ...categories.map((category) => ({
    id: category.id,
    label: category.label,
    description: category.description,
    pricingEngineId: category.pricingEngineId || category.id,
  })));
  CUSTOMER_CATEGORY_LABELS.splice(0, CUSTOMER_CATEGORY_LABELS.length, ...categories.map((category) => category.label));
  CUSTOMER_SERVICE_LABELS.splice(0, CUSTOMER_SERVICE_LABELS.length, ...options.map((service) => service.label));
}

export function hydrateLiveServiceCatalog(entries = []) {
  liveServiceMap.clear();
  liveCategoryMap.clear();

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const normalized = buildLiveServiceEntry(entry);
    if (!normalized || normalized.active === false || normalized.approved === false) {
      return;
    }

    liveServiceMap.set(normalized.id, normalized);

    if (!liveCategoryMap.has(normalized.categoryId)) {
      liveCategoryMap.set(normalized.categoryId, {
        id: normalized.categoryId,
        label: normalized.categoryName || toTitleCase(normalized.categoryId),
        description: '',
        pricingEngineId: normalized.categoryId,
      });
    }
  });

  rebuildMutableCatalogExports();
}

export function getLiveQuestionnaireForService(serviceId = '') {
  return liveServiceMap.get(String(serviceId || '').trim().toLowerCase())?.questionnaire || null;
}

export function getLiveServiceOption(serviceId = '', optionId = '') {
  const service = liveServiceMap.get(String(serviceId || '').trim().toLowerCase()) || null;
  const options = Array.isArray(service?.options) ? service.options : [];
  if (!options.length) return null;
  const targetRaw = String(optionId || '').trim().toLowerCase();
  if (!targetRaw) return null;
  const targetSlug = slugify(targetRaw);

  return options.find((opt) => {
    const optId = String(opt?.id || '').trim().toLowerCase();
    const optSlug = slugify(optId);
    const titleSlug = slugify(opt?.title || '');
    return optId === targetRaw
      || (targetSlug && (optSlug === targetSlug || titleSlug === targetSlug));
  }) || null;
}

export function getCustomerServiceCategoryById(categoryId) {
  const normalizedCategoryId = String(categoryId || '').trim().toLowerCase();
  if (!normalizedCategoryId) return null;
  return CUSTOMER_SERVICE_CATALOG.find((category) => category.id === normalizedCategoryId) || null;
}

export function getCustomerServiceById(serviceId) {
  const normalizedServiceId = String(serviceId || '').trim().toLowerCase();
  if (!normalizedServiceId) return null;
  return liveServiceMap.get(normalizedServiceId) || null;
}

export function getCustomerServicesForCategory(categoryId) {
  const normalizedCategoryId = String(categoryId || '').trim().toLowerCase();
  return CUSTOMER_SERVICE_OPTIONS.filter((service) => service.categoryId === normalizedCategoryId && service.type !== 'bundle');
}

export function getCustomerPackagesForCategory(categoryId) {
  const normalizedCategoryId = String(categoryId || '').trim().toLowerCase();
  return CUSTOMER_SERVICE_OPTIONS.filter((service) => service.categoryId === normalizedCategoryId && service.type === 'bundle');
}

export function buildJobRequestSuggestions(limit = 8) {
  return CUSTOMER_SERVICE_OPTIONS
    .filter((service) => service.promptLabel)
    .slice(0, Math.max(1, limit))
    .map((service) => service.promptLabel);
}
