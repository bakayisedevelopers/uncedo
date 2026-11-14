const DEFAULT_TRAVEL_FEE = 35;
const DEFAULT_BOOKING_FEE = 0;
const BOOKING_FEE_RATE = 0.01;
const BOOKING_FEE_CAP = 5;
const DEFAULT_CURRENCY = 'ZAR';

function roundCurrency(value) {
  return Math.round(Number(value || 0));
}

function computeDynamicBookingFee(baseAmount = 0) {
  const numericBase = Number(baseAmount || 0);
  if (numericBase <= 0) return 0;
  const calculated = numericBase * BOOKING_FEE_RATE;
  return Math.round(Math.min(BOOKING_FEE_CAP, Math.max(1, calculated)));
}

function clamp(value, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
  return Math.min(Math.max(Number(value || 0), Number(min)), Number(max));
}

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === 'no') return false;
  }
  return fallback;
}

function normalizeOption(option = {}) {
  const value = String(option.value || option.id || '').trim();
  if (!value) return null;

  const pricingType = String(option.pricingType || (option.multiplier && option.multiplier !== 1 ? 'multiplier' : 'adder')).trim().toLowerCase();
  return {
    value,
    label: String(option.label || value).trim(),
    pricingType,
    priceAdder: pricingType === 'adder' ? roundCurrency(normalizeNumber(option.priceAdder ?? option.priceValue, 0)) : 0,
    materialAdder: roundCurrency(normalizeNumber(option.materialAdder, 0)),
    multiplier: pricingType === 'multiplier' ? Math.max(0, normalizeNumber(option.multiplier, 1)) : 1,
    imageUrl: String(option.imageUrl || '').trim(),
    dependsOn: option.dependsOn && typeof option.dependsOn === 'object' && option.dependsOn.questionId ? {
      questionId: String(option.dependsOn.questionId).trim(),
      optionValue: String(option.dependsOn.optionValue || '').trim(),
    } : null,
  };
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
    price: Math.max(0, roundCurrency(normalizeNumber(option.price ?? option.priceAdder ?? 0, 0))),
    selectedQuestionIds: [...new Set(
      (Array.isArray(option.selectedQuestionIds) ? option.selectedQuestionIds : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    )],
    requiresNoOptionSpecificQuestions: normalizeBoolean(option.requiresNoOptionSpecificQuestions, false),
  };
}

function normalizeQuestion(question = {}) {
  const id = String(question.id || '').trim();
  if (!id) return null;

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
  const rawType = String(question.type || 'option-specific').trim().toLowerCase();

  return {
    id,
    prompt: String(question.prompt || question.label || id).trim(),
    answerType: String(question.answerType || 'text').trim().toLowerCase(),
    required: normalizeBoolean(question.required, false),
    type: rawType === 'standard' ? 'standard' : 'option-specific',
    answerHint: String(question.answerHint || '').trim(),
    dependsOn: depQuestionId ? {
      questionId: depQuestionId,
      optionValue: depOptionValue,
    } : null,
    dependencyRule: depQuestionId ? {
      dependsOnQuestionId: depQuestionId,
      dependsOnOptionValue: depOptionValue,
    } : null,
    options: (Array.isArray(question.options) ? question.options : [])
      .map(normalizeOption)
      .filter(Boolean),
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

function normalizePricing(pricing = {}) {
  return {
    pricingMode: String(pricing.pricingMode || 'fixed').trim().toLowerCase(),
    basePrice: roundCurrency(normalizeNumber(pricing.basePrice, 0)),
    materialFee: roundCurrency(normalizeNumber(pricing.materialFee, 0)),
    bookingFee: roundCurrency(normalizeNumber(pricing.bookingFee, DEFAULT_BOOKING_FEE)),
    travelFee: roundCurrency(normalizeNumber(pricing.travelFee, DEFAULT_TRAVEL_FEE)),
    minimumTotal: roundCurrency(normalizeNumber(pricing.minimumTotal, 0)),
    maximumTotal: roundCurrency(normalizeNumber(pricing.maximumTotal, 0)),
    durationMinutes: Math.max(0, Math.round(normalizeNumber(pricing.durationMinutes, 0))),
    demandMultiplierLow: Math.max(0, normalizeNumber(pricing.demandMultiplierLow, 0.98)),
    demandMultiplierNormal: Math.max(0, normalizeNumber(pricing.demandMultiplierNormal, 1)),
    demandMultiplierHigh: Math.max(0, normalizeNumber(pricing.demandMultiplierHigh, 1.08)),
    availabilityMultiplierHigh: Math.max(0, normalizeNumber(pricing.availabilityMultiplierHigh, 0.98)),
    availabilityMultiplierNormal: Math.max(0, normalizeNumber(pricing.availabilityMultiplierNormal, 1)),
    availabilityMultiplierLow: Math.max(0, normalizeNumber(pricing.availabilityMultiplierLow, 1.08)),
    weekendMultiplier: Math.max(0, normalizeNumber(pricing.weekendMultiplier, 1.08)),
    fridayMultiplier: Math.max(0, normalizeNumber(pricing.fridayMultiplier, 1.04)),
    weekdayMultiplier: Math.max(0, normalizeNumber(pricing.weekdayMultiplier, 1)),
    morningMultiplier: Math.max(0, normalizeNumber(pricing.morningMultiplier, 1)),
    afternoonMultiplier: Math.max(0, normalizeNumber(pricing.afternoonMultiplier, 1.02)),
    eveningMultiplier: Math.max(0, normalizeNumber(pricing.eveningMultiplier, 1.08)),
    overnightMultiplier: Math.max(0, normalizeNumber(pricing.overnightMultiplier, 1.12)),
    bundleDiscountPercent: clamp(normalizeNumber(pricing.bundleDiscountPercent, 0), 0, 100),
  };
}

function normalizeServiceCatalogEntry(entry = {}) {
  const id = String(entry.id || entry.serviceId || '').trim().toLowerCase();
  if (!id) return null;

  const questionSets = entry.questionnaire && typeof entry.questionnaire === 'object'
    ? entry.questionnaire
    : { required: entry.requiredQuestions, optional: entry.optionalQuestions };
  const rawOptionMode = String(entry.optionApplicationMode || '').trim().toLowerCase();

  return {
    id,
    categoryId: String(entry.categoryId || '').trim().toLowerCase(),
    categoryName: String(entry.categoryName || '').trim(),
    label: String(entry.label || entry.serviceName || id).trim(),
    promptLabel: String(entry.promptLabel || entry.label || id).trim(),
    description: String(entry.description || '').trim(),
    type: String(entry.type || 'service').trim().toLowerCase(),
    active: entry.active !== false,
    approved: entry.approved !== false,
    optionApplicationMode: rawOptionMode === 'unified' ? 'unified' : 'per_option',
    requiresPortfolioSelection: normalizeBoolean(entry.requiresPortfolioSelection, false),
    requiresHelperPortfolio: normalizeBoolean(entry.requiresHelperPortfolio, true),
    inheritBundleImages: normalizeBoolean(entry.inheritBundleImages, true),
    createdAt: entry.createdAt || null,
    updatedAt: entry.updatedAt || null,
    createdBy: String(entry.createdBy || '').trim(),
    includedServiceIds: (Array.isArray(entry.includedServiceIds) ? entry.includedServiceIds : [])
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean),
    images: (Array.isArray(entry.images) ? entry.images : [])
      .map(normalizeImage)
      .filter(Boolean),
    options: (Array.isArray(entry.options) ? entry.options : [])
      .map((opt, index) => normalizeServiceOption(opt, index))
      .filter(Boolean),
    pricing: normalizePricing(entry.pricing || {}),
    questionnaire: {
      required: (Array.isArray(questionSets?.required) ? questionSets.required : [])
        .map((question) => normalizeQuestion({ ...question, required: true }))
        .filter(Boolean),
      optional: (Array.isArray(questionSets?.optional) ? questionSets.optional : [])
        .map((question) => normalizeQuestion({ ...question, required: false }))
        .filter(Boolean),
    },
  };
}

function resolveSelectedServiceOption(service = {}, selectedOptionId = '') {
  const options = Array.isArray(service?.options) ? service.options : [];
  if (!options.length) return null;
  const targetRaw = String(selectedOptionId || '').trim().toLowerCase();
  if (!targetRaw) return null;
  const targetSlug = slugify(targetRaw);

  return options.find((opt) => {
    const optId = String(opt?.id || '').trim().toLowerCase();
    const optSlug = slugify(optId);
    const titleSlug = slugify(opt?.title || opt?.label || '');
    return optId === targetRaw
      || (targetSlug && (optSlug === targetSlug || titleSlug === targetSlug));
  }) || null;
}

function isQuestionIncludedForOption(question = {}, service = {}, selectedOption = null) {
  const options = Array.isArray(service?.options) ? service.options : [];
  if (!options.length) return true;

  const qType = String(question?.type || 'option-specific').trim().toLowerCase();
  if (qType === 'standard') return true;
  if (!selectedOption) return false;
  if (selectedOption.requiresNoOptionSpecificQuestions) return false;
  const selectedIds = new Set(
    (Array.isArray(selectedOption.selectedQuestionIds) ? selectedOption.selectedQuestionIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
  return selectedIds.has(String(question?.id || '').trim());
}

function getTimeBucket(date = new Date()) {
  const hour = date.getHours();
  if (hour < 6) return 'overnight';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function getDayBucket(date = new Date()) {
  const day = date.getDay();
  if (day === 5) return 'friday';
  if (day === 6 || day === 0) return 'weekend';
  return 'weekday';
}

function getSignalMultiplier(pricing = {}, signalContext = {}) {
  const demandLevel = String(signalContext.demandLevel || 'normal').trim().toLowerCase();
  const availabilityLevel = String(signalContext.availabilityLevel || 'normal').trim().toLowerCase();

  const demandMultiplier = demandLevel === 'high'
    ? pricing.demandMultiplierHigh
    : demandLevel === 'low'
      ? pricing.demandMultiplierLow
      : pricing.demandMultiplierNormal;

  const availabilityMultiplier = availabilityLevel === 'low'
    ? pricing.availabilityMultiplierLow
    : availabilityLevel === 'high'
      ? pricing.availabilityMultiplierHigh
      : pricing.availabilityMultiplierNormal;

  return demandMultiplier * availabilityMultiplier;
}

function getScheduleMultiplier(pricing = {}, signalContext = {}) {
  const now = signalContext.now instanceof Date ? signalContext.now : new Date();
  const timeBucket = getTimeBucket(now);
  const dayBucket = getDayBucket(now);

  const timeMultiplier = timeBucket === 'overnight'
    ? pricing.overnightMultiplier
    : timeBucket === 'evening'
      ? pricing.eveningMultiplier
      : timeBucket === 'afternoon'
        ? pricing.afternoonMultiplier
        : pricing.morningMultiplier;

  const dayMultiplier = dayBucket === 'weekend'
    ? pricing.weekendMultiplier
    : dayBucket === 'friday'
      ? pricing.fridayMultiplier
      : pricing.weekdayMultiplier;

  return {
    timeBucket,
    dayBucket,
    multiplier: timeMultiplier * dayMultiplier,
  };
}

function getQuestionAdjustments(service, structuredAnswers = {}, selectedOption = null) {
  let subtotalAdder = 0;
  let materialAdder = 0;
  let multiplier = 1;
  const lines = [];

  [...(service.questionnaire?.required || []), ...(service.questionnaire?.optional || [])].forEach((question) => {
    if (!isQuestionIncludedForOption(question, service, selectedOption)) {
      return;
    }

    const depQuestionId = question.dependencyRule?.dependsOnQuestionId || question.dependsOn?.questionId;
    const depOptionValue = question.dependencyRule?.dependsOnOptionValue || question.dependsOn?.optionValue;
    if (depQuestionId) {
      const parentAnswer = String(structuredAnswers?.[depQuestionId] || '').trim().toLowerCase();
      if (parentAnswer !== String(depOptionValue || '').trim().toLowerCase()) {
        return;
      }
    }

    const rawAnswer = structuredAnswers?.[question.id];
    const answerValues = Array.isArray(rawAnswer)
      ? rawAnswer.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean)
      : [String(rawAnswer || '').trim().toLowerCase()].filter(Boolean);
    if (!answerValues.length || !Array.isArray(question.options) || !question.options.length) {
      return;
    }

    answerValues.forEach((answerValue) => {
      const selectedChoice = question.options.find((option) => String(option.value || '').trim().toLowerCase() === answerValue);
      if (!selectedChoice) return;

      if (selectedChoice.dependsOn && selectedChoice.dependsOn.questionId) {
        const parentAnswer = String(structuredAnswers?.[selectedChoice.dependsOn.questionId] || '').trim().toLowerCase();
        if (parentAnswer !== String(selectedChoice.dependsOn.optionValue || '').trim().toLowerCase()) {
          return;
        }
      }

      const optionPriceAdder = Number(selectedChoice.priceAdder || 0);
      const optionMultiplier = Number(selectedChoice.multiplier || 1);

      subtotalAdder += optionPriceAdder;
      materialAdder += Number(selectedChoice.materialAdder || 0);
      if (optionMultiplier && optionMultiplier !== 1) {
        multiplier *= optionMultiplier;
      }

      if (optionPriceAdder) {
        lines.push({
          label: `${service.label}: ${selectedChoice.label}`,
          amount: roundCurrency(optionPriceAdder),
        });
      }
      if (selectedChoice.materialAdder) {
        lines.push({
          label: `${service.label}: ${selectedChoice.label} materials`,
          amount: roundCurrency(selectedChoice.materialAdder),
        });
      }
      if (optionMultiplier && optionMultiplier !== 1) {
        lines.push({
          label: `${service.label}: ${selectedChoice.label} multiplier (×${optionMultiplier})`,
          amount: roundCurrency(0),
        });
      }
    });
  });

  return {
    subtotalAdder: roundCurrency(subtotalAdder),
    materialAdder: roundCurrency(materialAdder),
    multiplier,
    lines,
  };
}

function createLeafQuote(service, structuredAnswers = {}, signalContext = {}, selectedOptionId = '') {
  const pricing = normalizePricing(service.pricing || {});
  const selectedOption = resolveSelectedServiceOption(service, selectedOptionId || structuredAnswers?.selectedOptionId || '');
  const baseOptionPrice = selectedOption ? Math.max(0, roundCurrency(Number(selectedOption.price || 0))) : pricing.basePrice;
  const questionAdjustments = getQuestionAdjustments(service, structuredAnswers, selectedOption);
  const schedule = getScheduleMultiplier(pricing, signalContext);
  const signalMultiplier = getSignalMultiplier(pricing, signalContext);
  const combinedMultiplier = schedule.multiplier * signalMultiplier * questionAdjustments.multiplier;
  const baseLabor = baseOptionPrice + questionAdjustments.subtotalAdder;
  const materialFee = pricing.materialFee + questionAdjustments.materialAdder;
  const laborTotal = roundCurrency(baseLabor * combinedMultiplier);
  const subtotal = roundCurrency(laborTotal + materialFee);
  const clampedTotal = (!selectedOption && (pricing.maximumTotal > 0 || pricing.minimumTotal > 0))
    ? roundCurrency(clamp(subtotal, pricing.minimumTotal || 0, pricing.maximumTotal || Number.POSITIVE_INFINITY))
    : subtotal;

  const lines = [
    {
      label: selectedOption ? `${service.label}: ${selectedOption.title}` : `${service.label}: base labor`,
      amount: roundCurrency(baseOptionPrice),
    },
    ...questionAdjustments.lines,
  ];

  if (schedule.multiplier !== 1) {
    lines.push({
      label: `${service.label}: ${schedule.dayBucket} ${schedule.timeBucket} multiplier`,
      amount: roundCurrency(laborTotal - baseLabor - questionAdjustments.subtotalAdder),
    });
  }

  if (materialFee > 0) {
    lines.push({
      label: `${service.label}: materials`,
      amount: roundCurrency(materialFee),
    });
  }

  if (clampedTotal !== subtotal) {
    lines.push({
      label: `${service.label}: price cap adjustment`,
      amount: roundCurrency(clampedTotal - subtotal),
    });
  }

  return {
    serviceId: service.id,
    label: service.label,
    selectedOptionId: selectedOption?.id || null,
    selectedOptionTitle: selectedOption?.title || null,
    subtotal: clampedTotal,
    estimatedDurationMinutes: pricing.durationMinutes || 0,
    lines,
    pricingMode: pricing.pricingMode,
  };
}

function computeBundleAdjustment(componentTotal, bundlePricing = {}) {
  let adjusted = Number(componentTotal || 0);
  const discountPercent = Number(bundlePricing.bundleDiscountPercent || 0);
  if (discountPercent > 0) {
    adjusted = adjusted * (1 - (discountPercent / 100));
  }
  if (bundlePricing.minimumTotal > 0 || bundlePricing.maximumTotal > 0) {
    adjusted = clamp(adjusted, bundlePricing.minimumTotal || 0, bundlePricing.maximumTotal || Number.POSITIVE_INFINITY);
  }
  return roundCurrency(adjusted);
}

function computeServiceNode({
  serviceId,
  catalogIndex,
  selectedOptionId = '',
  structuredAnswers = {},
  signalContext = {},
  stack = new Set(),
}) {
  const service = catalogIndex.get(String(serviceId || '').trim().toLowerCase());
  if (!service) {
    return null;
  }

  if (stack.has(service.id)) {
    throw new Error(`Circular service bundle detected for ${service.id}.`);
  }

  if (service.type !== 'bundle' || !service.includedServiceIds.length) {
    return createLeafQuote(service, structuredAnswers, signalContext, selectedOptionId);
  }

  const nextStack = new Set(stack);
  nextStack.add(service.id);
  const components = service.includedServiceIds
    .map((includedId) => computeServiceNode({
      serviceId: includedId,
      catalogIndex,
      selectedOptionId,
      structuredAnswers,
      signalContext,
      stack: nextStack,
    }))
    .filter(Boolean);

  const componentTotal = components.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  const bundlePricing = normalizePricing(service.pricing || {});
  const adjustedSubtotal = computeBundleAdjustment(componentTotal, bundlePricing);
  const adjustmentAmount = roundCurrency(adjustedSubtotal - componentTotal);

  const lines = components.flatMap((item) => item.lines || []);
  if (adjustmentAmount !== 0) {
    lines.push({
      label: `${service.label}: bundle adjustment`,
      amount: adjustmentAmount,
    });
  }

  return {
    serviceId: service.id,
    label: service.label,
    subtotal: adjustedSubtotal,
    estimatedDurationMinutes: components.reduce((sum, item) => sum + Number(item.estimatedDurationMinutes || 0), 0),
    lines,
    componentServices: components.map((item) => item.serviceId),
    pricingMode: bundlePricing.pricingMode || 'fixed',
  };
}

function inferSignalLevels({ onlineHelpers = 0, activeRequests = 0 }) {
  if (!onlineHelpers) {
    return { demandLevel: 'normal', availabilityLevel: 'low' };
  }

  const ratio = activeRequests / onlineHelpers;
  const demandLevel = ratio >= 1.2 ? 'high' : ratio <= 0.4 ? 'low' : 'normal';
  const availabilityLevel = onlineHelpers >= 6 ? 'high' : onlineHelpers <= 2 ? 'low' : 'normal';
  return { demandLevel, availabilityLevel };
}

function computeMarketplaceQuote({
  categoryId = '',
  serviceIds = [],
  selectedOptionId = '',
  structuredAnswers = {},
  catalogEntries = [],
  signalContext = {},
  currency = DEFAULT_CURRENCY,
} = {}) {
  const catalogIndex = new Map(
    (Array.isArray(catalogEntries) ? catalogEntries : [])
      .map(normalizeServiceCatalogEntry)
      .filter(Boolean)
      .map((entry) => [entry.id, entry]),
  );

  const selectedServices = (Array.isArray(serviceIds) ? serviceIds : [])
    .map((serviceId) => String(serviceId || '').trim().toLowerCase())
    .filter(Boolean);

  const normalizedSignals = {
    ...signalContext,
    ...inferSignalLevels(signalContext),
    now: signalContext.now instanceof Date ? signalContext.now : new Date(),
  };

  const serviceBreakdown = selectedServices
    .map((serviceId) => computeServiceNode({
      serviceId,
      catalogIndex,
      selectedOptionId,
      structuredAnswers,
      signalContext: normalizedSignals,
    }))
    .filter(Boolean);

  const travelFee = roundCurrency(DEFAULT_TRAVEL_FEE);
  const serviceTotal = roundCurrency(serviceBreakdown.reduce((sum, item) => sum + Number(item.subtotal || 0), 0));
  const bookingFeeBase = roundCurrency(serviceTotal + travelFee);
  const bookingFee = computeDynamicBookingFee(bookingFeeBase);
  const total = roundCurrency(serviceTotal + travelFee + bookingFee);

  return {
    categoryId: String(categoryId || '').trim().toLowerCase(),
    selectedOptionId: String(selectedOptionId || '').trim().toLowerCase() || null,
    currency,
    serviceBreakdown,
    lines: [
      ...serviceBreakdown.flatMap((item) => item.lines || []),
      { label: 'Travel fee', amount: travelFee },
      ...(bookingFee > 0 ? [{ label: 'Booking fee', amount: bookingFee }] : []),
    ],
    subtotal: serviceTotal,
    travelFee,
    bookingFee,
    bookingFeeRate: BOOKING_FEE_RATE,
    bookingFeeCap: BOOKING_FEE_CAP,
    total,
    estimatedDurationMinutes: serviceBreakdown.reduce((sum, item) => sum + Number(item.estimatedDurationMinutes || 0), 0),
    demandLevel: normalizedSignals.demandLevel,
    availabilityLevel: normalizedSignals.availabilityLevel,
    quotedAt: new Date().toISOString(),
  };
}

module.exports = {
  DEFAULT_BOOKING_FEE,
  BOOKING_FEE_CAP,
  BOOKING_FEE_RATE,
  DEFAULT_CURRENCY,
  DEFAULT_TRAVEL_FEE,
  computeMarketplaceQuote,
  inferSignalLevels,
  isQuestionIncludedForOption,
  normalizeServiceCatalogEntry,
  normalizeServiceOption,
  resolveSelectedServiceOption,
};

