const DEFAULT_TRAVEL_FEE = 35;
const DEFAULT_BOOKING_FEE = 0;
const BOOKING_FEE_RATE = 0.01;
const BOOKING_FEE_CAP = 5;
const DEFAULT_CURRENCY = 'ZAR';

function roundCurrency(value) {
  return Number(Number(value || 0).toFixed(2));
}

function computeDynamicBookingFee(baseAmount = 0) {
  return roundCurrency(Math.min(BOOKING_FEE_CAP, Math.max(0, Number(baseAmount || 0)) * BOOKING_FEE_RATE));
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

  return {
    value,
    label: String(option.label || value).trim(),
    priceAdder: roundCurrency(normalizeNumber(option.priceAdder, 0)),
    materialAdder: roundCurrency(normalizeNumber(option.materialAdder, 0)),
    multiplier: Math.max(0, normalizeNumber(option.multiplier, 1)),
  };
}

function normalizeQuestion(question = {}) {
  const id = String(question.id || '').trim();
  if (!id) return null;

  return {
    id,
    prompt: String(question.prompt || question.label || id).trim(),
    answerType: String(question.answerType || 'text').trim().toLowerCase(),
    required: normalizeBoolean(question.required, false),
    answerHint: String(question.answerHint || '').trim(),
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

  return {
    id,
    categoryId: String(entry.categoryId || '').trim().toLowerCase(),
    categoryName: String(entry.categoryName || '').trim(),
    label: String(entry.label || entry.skillName || id).trim(),
    promptLabel: String(entry.promptLabel || entry.label || id).trim(),
    description: String(entry.description || '').trim(),
    kind: String(entry.kind || 'service').trim().toLowerCase(),
    active: entry.active !== false,
    approved: entry.approved !== false,
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

function getQuestionAdjustments(service, structuredAnswers = {}) {
  let subtotalAdder = 0;
  let materialAdder = 0;
  let multiplier = 1;
  const lines = [];

  [...(service.questionnaire?.required || []), ...(service.questionnaire?.optional || [])].forEach((question) => {
    const answerValue = String(structuredAnswers?.[question.id] || '').trim().toLowerCase();
    if (!answerValue || !Array.isArray(question.options) || !question.options.length) {
      return;
    }

    const selectedOption = question.options.find((option) => String(option.value || '').trim().toLowerCase() === answerValue);
    if (!selectedOption) return;

    subtotalAdder += Number(selectedOption.priceAdder || 0);
    materialAdder += Number(selectedOption.materialAdder || 0);
    multiplier *= Number(selectedOption.multiplier || 1);

    if (selectedOption.priceAdder) {
      lines.push({
        label: `${service.label}: ${selectedOption.label}`,
        amount: roundCurrency(selectedOption.priceAdder),
      });
    }
    if (selectedOption.materialAdder) {
      lines.push({
        label: `${service.label}: ${selectedOption.label} materials`,
        amount: roundCurrency(selectedOption.materialAdder),
      });
    }
  });

  return {
    subtotalAdder: roundCurrency(subtotalAdder),
    materialAdder: roundCurrency(materialAdder),
    multiplier,
    lines,
  };
}

function createLeafQuote(service, structuredAnswers = {}, signalContext = {}) {
  const pricing = normalizePricing(service.pricing || {});
  const questionAdjustments = getQuestionAdjustments(service, structuredAnswers);
  const schedule = getScheduleMultiplier(pricing, signalContext);
  const signalMultiplier = getSignalMultiplier(pricing, signalContext);
  const combinedMultiplier = schedule.multiplier * signalMultiplier * questionAdjustments.multiplier;
  const baseLabor = pricing.basePrice + questionAdjustments.subtotalAdder;
  const materialFee = pricing.materialFee + questionAdjustments.materialAdder;
  const laborTotal = roundCurrency(baseLabor * combinedMultiplier);
  const subtotal = roundCurrency(laborTotal + materialFee);
  const clampedTotal = pricing.maximumTotal > 0 || pricing.minimumTotal > 0
    ? roundCurrency(clamp(subtotal, pricing.minimumTotal || 0, pricing.maximumTotal || Number.POSITIVE_INFINITY))
    : subtotal;

  const lines = [
    {
      label: `${service.label}: base labor`,
      amount: roundCurrency(pricing.basePrice),
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

  if (service.kind !== 'bundle' || !service.includedServiceIds.length) {
    return createLeafQuote(service, structuredAnswers, signalContext);
  }

  const nextStack = new Set(stack);
  nextStack.add(service.id);
  const components = service.includedServiceIds
    .map((includedId) => computeServiceNode({
      serviceId: includedId,
      catalogIndex,
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
  normalizeServiceCatalogEntry,
};

