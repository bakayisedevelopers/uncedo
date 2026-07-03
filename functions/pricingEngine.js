const { logger } = require('firebase-functions');

const PRICING_CONFIG_VERSION = 'pricing-v2.1.0';

const DEFAULT_PRICING_CONFIG = {
  version: PRICING_CONFIG_VERSION,
  currency: 'ZAR',
  quoteTtlSeconds: 300,
  durationAdjustment: {
    shortSessionBoostUnderMinutes: 15,
    shortSessionBoostMultiplier: 1.02,
    longSessionDiscountFromMinutes: 60,
    longSessionDiscountMultiplier: 0.97,
  },
  durationRateDiscounts: {
    enabled: true,
    minimumDiscountedRatePerMinute: 1.5,
    tiers: [
      { minMinutes: 1, maxMinutes: 10, discountPercent: 0 },
      { minMinutes: 11, maxMinutes: 20, discountPercent: 5 },
      { minMinutes: 21, maxMinutes: 30, discountPercent: 10 },
      { minMinutes: 31, maxMinutes: 40, discountPercent: 15 },
      { minMinutes: 41, maxMinutes: 50, discountPercent: 20 },
      { minMinutes: 51, maxMinutes: 60, discountPercent: 25 },
      { minMinutes: 61, maxMinutes: 75, discountPercent: 30 },
      { minMinutes: 76, maxMinutes: null, discountPercent: 35 },
    ],
  },
  bands: {
    low: { base: 5, ratePerMinute: 3.0 },
    normal: { base: 7, ratePerMinute: 3.6 },
    high: { base: 8, ratePerMinute: 4.5 },
  },
  multiplierCaps: {
    min: 0.9,
    max: 1.25,
  },
  timeOfDayMultipliers: {
    overnight: 0.96,
    morning: 0.98,
    afternoon: 1.02,
    peak: 1.06,
    evening: 1.03,
  },
  demandMultipliers: {
    low: 0.97,
    normal: 1,
    high: 1.05,
  },
  availabilityMultipliers: {
    high: 0.97,
    normal: 1,
    low: 1.05,
  },
  seasonMultipliers: {
    offSeason: 0.98,
    normal: 1,
    examSeason: 1.05,
  },
  subjectMultipliers: {
    english: 1,
    languages: 1,
    general: 1,
    mathematics: 1.05,
    math: 1.05,
    science: 1.05,
    accounting: 1.05,
    'advanced mathematics': 1.1,
    'advanced math': 1.1,
    physics: 1.1,
  },
};

const LEGACY_SAFE_PRICING_SNAPSHOT = {
  pricingBand: 'normal',
  baseAmount: 7,
  ratePerMinute: 3.6,
  adjustedBaseAmount: 7,
  adjustedRatePerMinute: 3.6,
  durationMinutes: 10,
  totalAmount: 42,
  configVersion: `${PRICING_CONFIG_VERSION}-legacy-safe`,
  explanationLabel: 'Standard pricing',
  currency: 'ZAR',
};

function roundCurrency(value) {
  return Number((Number(value || 0)).toFixed(2));
}

function getTimeOfDayBucket(hour) {
  if (hour < 6) return 'overnight';
  if (hour < 12) return 'morning';
  if (hour < 16) return 'afternoon';
  if (hour < 20) return 'peak';
  return 'evening';
}

function getSeasonBucket(dateObj = new Date()) {
  const month = dateObj.getUTCMonth() + 1;
  if ([5, 6, 10, 11].includes(month)) return 'examSeason';
  if ([1, 7, 12].includes(month)) return 'offSeason';
  return 'normal';
}

function chooseBand({ demandLevel, availabilityLevel, timeBucket, seasonBucket }) {
  let score = 0;
  if (demandLevel === 'high') score += 1;
  if (availabilityLevel === 'low') score += 1;
  if (timeBucket === 'peak') score += 1;
  if (seasonBucket === 'examSeason') score += 1;

  if (demandLevel === 'low') score -= 1;
  if (availabilityLevel === 'high') score -= 1;

  if (score >= 2) return 'high';
  if (score <= -1) return 'low';
  return 'normal';
}

function clampMultiplier(value, caps = {}) {
  const min = Number(caps.min || 0.9);
  const max = Number(caps.max || 1.25);
  return Math.min(max, Math.max(min, Number(value || 1)));
}

function getDurationAdjustment(minutes, config) {
  const settings = config.durationAdjustment || {};
  const shortUnder = Number(settings.shortSessionBoostUnderMinutes || 15);
  const shortMultiplier = Number(settings.shortSessionBoostMultiplier || 1.02);
  const longFrom = Number(settings.longSessionDiscountFromMinutes || 60);

  if (minutes < shortUnder) {
    return { multiplier: shortMultiplier, label: 'short_session_adjustment' };
  }

  if (minutes >= longFrom) {
    // Long-session pricing is now applied only to the minute-rate portion.
    // Keep this legacy adjustment neutral so base pricing does not change.
    return { multiplier: 1, label: 'long_session_discount_neutralized' };
  }

  return { multiplier: 1, label: 'standard_duration' };
}

function normalizeDurationRateDiscounts(durationRateDiscounts = {}, fallback = DEFAULT_PRICING_CONFIG.durationRateDiscounts) {
  const source = durationRateDiscounts && typeof durationRateDiscounts === 'object'
    ? durationRateDiscounts
    : fallback;

  const tiers = Array.isArray(source.tiers) ? source.tiers : fallback.tiers;
  const normalizedTiers = tiers
    .map((tier) => ({
      minMinutes: Math.max(1, Math.floor(Number(tier.minMinutes || 0))),
      maxMinutes: tier.maxMinutes == null ? null : Math.max(1, Math.floor(Number(tier.maxMinutes || 0))),
      discountPercent: Math.max(0, Number(tier.discountPercent || 0)),
    }))
    .filter((tier) => tier.minMinutes >= 1 && (tier.maxMinutes == null || tier.maxMinutes >= tier.minMinutes))
    .sort((left, right) => left.minMinutes - right.minMinutes);

  if (!normalizedTiers.length) {
    return null;
  }

  return {
    enabled: source.enabled !== false,
    minimumDiscountedRatePerMinute: Math.max(
      0,
      Number(source.minimumDiscountedRatePerMinute ?? fallback.minimumDiscountedRatePerMinute ?? 0),
    ),
    tiers: normalizedTiers,
  };
}

function getDurationRateDiscountSnapshot(minutes, adjustedRatePerMinute, durationRateDiscounts) {
  const durationMinutes = Math.max(1, Math.floor(Number(minutes || 0)));
  const rate = Number(adjustedRatePerMinute || 0);
  const policy = normalizeDurationRateDiscounts(durationRateDiscounts);

  const undiscountedMinuteAmount = roundCurrency(durationMinutes * rate);
  if (!policy || policy.enabled === false) {
    return {
      durationRateDiscounts: policy,
      durationDiscountApplied: false,
      durationDiscountPercent: 0,
      durationDiscountAmount: 0,
      durationDiscountedMinuteAmount: undiscountedMinuteAmount,
      undiscountedMinuteAmount,
      effectiveRatePerMinute: roundCurrency(rate),
      durationDiscountBreakdown: {
        applied: false,
        discountPercent: 0,
        minimumDiscountedRatePerMinute: policy?.minimumDiscountedRatePerMinute || null,
        tieredAmounts: [],
        discountedRatePerMinute: roundCurrency(rate),
        undiscountedMinuteAmount,
        durationDiscountedMinuteAmount: undiscountedMinuteAmount,
        durationDiscountAmount: 0,
      },
    };
  }

  const minimumDiscountedRatePerMinute = Number(policy.minimumDiscountedRatePerMinute || 0);
  let durationDiscountedMinuteAmount = 0;
  let highestDiscountPercent = 0;
  const tieredAmounts = [];

  for (const tier of policy.tiers) {
    const tierStart = Math.max(1, Number(tier.minMinutes || 1));
    const tierEnd = tier.maxMinutes == null
      ? durationMinutes
      : Math.max(tierStart, Number(tier.maxMinutes || tierStart));
    if (durationMinutes < tierStart) continue;

    const segmentStart = tierStart;
    const segmentEnd = Math.min(durationMinutes, tierEnd);
    const segmentMinutes = Math.max(0, segmentEnd - segmentStart + 1);
    if (!segmentMinutes) continue;

    const discountPercent = Math.max(0, Number(tier.discountPercent || 0));
    const discountMultiplier = Math.max(0, 1 - (discountPercent / 100));
    const rawDiscountedRatePerMinute = rate * discountMultiplier;
    const discountedRatePerMinute = Math.max(rawDiscountedRatePerMinute, minimumDiscountedRatePerMinute);
    const segmentDiscountedAmount = roundCurrency(segmentMinutes * discountedRatePerMinute);
    const segmentUndiscountedAmount = roundCurrency(segmentMinutes * rate);
    const segmentDiscountAmount = roundCurrency(segmentUndiscountedAmount - segmentDiscountedAmount);

    durationDiscountedMinuteAmount = roundCurrency(durationDiscountedMinuteAmount + segmentDiscountedAmount);
    highestDiscountPercent = Math.max(highestDiscountPercent, discountPercent);
    tieredAmounts.push({
      minMinutes: tier.minMinutes,
      maxMinutes: tier.maxMinutes,
      minutes: segmentMinutes,
      discountPercent,
      discountMultiplier,
      discountedRatePerMinute: roundCurrency(discountedRatePerMinute),
      segmentDiscountedAmount,
      segmentDiscountAmount,
    });
  }

  const durationDiscountAmount = roundCurrency(undiscountedMinuteAmount - durationDiscountedMinuteAmount);
  const effectiveRatePerMinute = roundCurrency(durationDiscountedMinuteAmount / durationMinutes);
  const durationDiscountApplied = durationDiscountAmount > 0;

  return {
    durationRateDiscounts: policy,
    durationDiscountApplied,
    durationDiscountPercent: highestDiscountPercent,
    durationDiscountAmount,
    durationDiscountedMinuteAmount,
    undiscountedMinuteAmount,
    effectiveRatePerMinute,
    durationDiscountBreakdown: {
      applied: durationDiscountApplied,
      discountPercent: highestDiscountPercent,
      minimumDiscountedRatePerMinute,
      tieredAmounts,
      discountedRatePerMinute: effectiveRatePerMinute,
      undiscountedMinuteAmount,
      durationDiscountedMinuteAmount,
      durationDiscountAmount,
    },
  };
}

function normalizeLevel(value, allowed, fallback) {
  const next = String(value || '').trim().toLowerCase();
  return allowed.includes(next) ? next : fallback;
}

function inferDemandLevel({ activeRequests = 0, onlineTutors = 0 }) {
  if (!onlineTutors) return 'normal';
  const ratio = activeRequests / onlineTutors;
  if (ratio > 1.3) return 'high';
  if (ratio < 0.6) return 'low';
  return 'normal';
}

function inferAvailabilityLevel({ onlineTutors = 0, verifiedTutors = 0 }) {
  const ratio = verifiedTutors ? (onlineTutors / verifiedTutors) : 0;
  if (ratio > 0.5) return 'high';
  if (ratio > 0.2) return 'normal';
  return 'low';
}

function normalizeSubject(subject) {
  return String(subject || 'general').trim().toLowerCase();
}

function buildExplanationLabel({ band, timeBucket, demandLevel, availabilityLevel, seasonBucket }) {
  if (band === 'high') {
    return `High demand pricing (${timeBucket}, ${demandLevel} demand, ${availabilityLevel} availability, ${seasonBucket})`;
  }
  if (band === 'low') {
    return `Lower traffic pricing (${timeBucket}, ${demandLevel} demand, ${availabilityLevel} availability)`;
  }
  return 'Standard pricing';
}

function computePricingQuote({ minutes, subject, signalContext = {}, config = DEFAULT_PRICING_CONFIG }) {
  const duration = Math.max(1, Math.floor(Number(minutes || 0)));
  const subjectKey = normalizeSubject(subject);
  const now = signalContext.now instanceof Date ? signalContext.now : new Date();

  const timeBucket = signalContext.timeOfDayBucket || getTimeOfDayBucket(now.getHours());
  const seasonBucket = signalContext.seasonBucket || getSeasonBucket(now);
  const demandLevel = normalizeLevel(
    signalContext.demandLevel || inferDemandLevel(signalContext),
    ['low', 'normal', 'high'],
    'normal',
  );
  const availabilityLevel = normalizeLevel(
    signalContext.availabilityLevel || inferAvailabilityLevel(signalContext),
    ['low', 'normal', 'high'],
    'normal',
  );

  const band = chooseBand({ demandLevel, availabilityLevel, timeBucket, seasonBucket });
  const bandConfig = config.bands[band] || config.bands.normal;
  const subjectMultiplier = Number(config.subjectMultipliers[subjectKey] || config.subjectMultipliers.general || 1);
  const timeMultiplier = Number(config.timeOfDayMultipliers[timeBucket] || 1);
  const demandMultiplier = Number(config.demandMultipliers[demandLevel] || 1);
  const availabilityKey = availabilityLevel === 'high' ? 'high' : availabilityLevel === 'low' ? 'low' : 'normal';
  const availabilityMultiplier = Number(config.availabilityMultipliers[availabilityKey] || 1);
  const seasonMultiplier = Number(config.seasonMultipliers[seasonBucket] || 1);

  const durationAdjustment = getDurationAdjustment(duration, config);

  const combinedMultiplier = clampMultiplier(
    subjectMultiplier
    * timeMultiplier
    * demandMultiplier
    * availabilityMultiplier
    * seasonMultiplier
    * Number(durationAdjustment.multiplier || 1),
    config.multiplierCaps,
  );

  const adjustedBase = roundCurrency(Number(bandConfig.base || 0) * combinedMultiplier);
  const adjustedRate = roundCurrency(Number(bandConfig.ratePerMinute || 0) * combinedMultiplier);
  const durationRateDiscount = getDurationRateDiscountSnapshot(duration, adjustedRate, config.durationRateDiscounts);
  const totalAmount = roundCurrency(adjustedBase + durationRateDiscount.durationDiscountedMinuteAmount);

  return {
    pricingBand: band,
    baseAmount: roundCurrency(bandConfig.base),
    ratePerMinute: roundCurrency(bandConfig.ratePerMinute),
    adjustedBaseAmount: adjustedBase,
    adjustedRatePerMinute: adjustedRate,
    durationMinutes: duration,
    subject: subjectKey,
    subjectMultiplier,
    timeOfDayBucket: timeBucket,
    timeOfDayMultiplier: timeMultiplier,
    demandLevel,
    demandMultiplier,
    availabilityLevel,
    availabilityMultiplier,
    seasonBucket,
    seasonMultiplier,
    durationAdjustment,
    combinedMultiplier,
    durationRateDiscounts: durationRateDiscount.durationRateDiscounts,
    durationDiscountApplied: durationRateDiscount.durationDiscountApplied,
    durationDiscountPercent: durationRateDiscount.durationDiscountPercent,
    durationDiscountAmount: durationRateDiscount.durationDiscountAmount,
    durationDiscountedMinuteAmount: durationRateDiscount.durationDiscountedMinuteAmount,
    undiscountedMinuteAmount: durationRateDiscount.undiscountedMinuteAmount,
    effectiveRatePerMinute: durationRateDiscount.effectiveRatePerMinute,
    durationDiscountBreakdown: durationRateDiscount.durationDiscountBreakdown,
    totalAmount,
    currency: config.currency || 'ZAR',
    configVersion: config.version || PRICING_CONFIG_VERSION,
    explanationLabel: buildExplanationLabel({
      band,
      timeBucket,
      demandLevel,
      availabilityLevel,
      seasonBucket,
    }),
  };
}

function sanitizePricingSnapshot(snapshot = {}) {
  if (!snapshot || typeof snapshot !== 'object' || Object.keys(snapshot).length === 0) {
    snapshot = LEGACY_SAFE_PRICING_SNAPSHOT;
  }

  const durationMinutes = Math.max(
    1,
    Math.floor(Number(snapshot.durationMinutes || LEGACY_SAFE_PRICING_SNAPSHOT.durationMinutes)),
  );
  const adjustedRatePerMinute = roundCurrency(
    snapshot.adjustedRatePerMinute
    || snapshot.ratePerMinute
    || LEGACY_SAFE_PRICING_SNAPSHOT.adjustedRatePerMinute,
  );
  const adjustedBaseAmount = roundCurrency(
    snapshot.adjustedBaseAmount
    || snapshot.baseAmount
    || LEGACY_SAFE_PRICING_SNAPSHOT.adjustedBaseAmount,
  );
  const sanitizedDurationRateDiscounts = snapshot.durationRateDiscounts
    ? normalizeDurationRateDiscounts(snapshot.durationRateDiscounts)
    : null;
  const totalAmount = roundCurrency(
    snapshot.totalAmount ?? (adjustedBaseAmount + (adjustedRatePerMinute * durationMinutes)),
  );

  return {
    quoteId: snapshot.quoteId || null,
    pricingBand: snapshot.pricingBand || LEGACY_SAFE_PRICING_SNAPSHOT.pricingBand,
    baseAmount: roundCurrency(snapshot.baseAmount || adjustedBaseAmount),
    ratePerMinute: roundCurrency(snapshot.ratePerMinute || adjustedRatePerMinute),
    adjustedBaseAmount,
    adjustedRatePerMinute,
    durationMinutes,
    subject: snapshot.subject || 'general',
    subjectMultiplier: Number(snapshot.subjectMultiplier || 1),
    timeOfDayMultiplier: Number(snapshot.timeOfDayMultiplier || 1),
    demandMultiplier: Number(snapshot.demandMultiplier || 1),
    availabilityMultiplier: Number(snapshot.availabilityMultiplier || 1),
    seasonMultiplier: Number(snapshot.seasonMultiplier || 1),
    durationAdjustment: snapshot.durationAdjustment || { multiplier: 1, label: 'legacy' },
    combinedMultiplier: Number(snapshot.combinedMultiplier || 1),
    durationRateDiscounts: sanitizedDurationRateDiscounts,
    durationDiscountApplied: Boolean(snapshot.durationDiscountApplied),
    durationDiscountPercent: Number(snapshot.durationDiscountPercent || 0),
    durationDiscountAmount: roundCurrency(snapshot.durationDiscountAmount || 0),
    durationDiscountedMinuteAmount: roundCurrency(
      snapshot.durationDiscountedMinuteAmount
      ?? (snapshot.effectiveRatePerMinute
        ? durationMinutes * Number(snapshot.effectiveRatePerMinute)
        : adjustedRatePerMinute * durationMinutes),
    ),
    undiscountedMinuteAmount: roundCurrency(
      snapshot.undiscountedMinuteAmount || (adjustedRatePerMinute * durationMinutes),
    ),
    effectiveRatePerMinute: roundCurrency(
      snapshot.effectiveRatePerMinute || snapshot.adjustedRatePerMinute || adjustedRatePerMinute,
    ),
    durationDiscountBreakdown: snapshot.durationDiscountBreakdown || null,
    totalAmount,
    configVersion: snapshot.configVersion || LEGACY_SAFE_PRICING_SNAPSHOT.configVersion,
    explanationLabel: snapshot.explanationLabel || LEGACY_SAFE_PRICING_SNAPSHOT.explanationLabel,
    quotedAt: snapshot.quotedAt || new Date().toISOString(),
    lockedAt: snapshot.lockedAt || new Date().toISOString(),
    lockExpiresAt: snapshot.lockExpiresAt || null,
    currency: snapshot.currency || LEGACY_SAFE_PRICING_SNAPSHOT.currency,
  };
}

function computeFinalAmountFromSnapshot({
  snapshot,
  billedMinutes = 0,
  closureType = 'completed',
  selectedDurationMinutes = null,
  bookingFee = 0,
}) {
  const safeSnapshot = sanitizePricingSnapshot(snapshot);
  const safeBilledMinutes = Math.max(0, Number(billedMinutes || 0));
  const selectedDuration = Math.max(
    1,
    Number(selectedDurationMinutes || safeSnapshot?.durationMinutes || 1),
  );
  const bookingFeeWindowMinutes = 1;
  const earlyCancelThresholdMinutes = bookingFeeWindowMinutes;
  const baseOnlyThresholdMinutes = Number((selectedDuration * 0.2).toFixed(2));
  const isCancel = closureType === 'canceled' || closureType === 'canceled_during';
  const isEarlyCancellation = isCancel && safeBilledMinutes <= earlyCancelThresholdMinutes;
  const isBaseOnlyCancellation = isCancel
    && safeBilledMinutes > bookingFeeWindowMinutes
    && safeBilledMinutes < baseOnlyThresholdMinutes;
  const baseAmount = roundCurrency(safeSnapshot?.adjustedBaseAmount || safeSnapshot?.baseAmount || 0);
  const perMinuteRate = roundCurrency(safeSnapshot?.adjustedRatePerMinute || safeSnapshot?.ratePerMinute || 0);
  const bookingFeeAmount = roundCurrency(bookingFee || 0);
  const discountPolicy = safeSnapshot.durationRateDiscounts;
  const hasLockedDurationDiscountPolicy = Boolean(
    discountPolicy
    && Array.isArray(discountPolicy.tiers)
    && discountPolicy.tiers.length
    && discountPolicy.enabled !== false,
  );

  if (isEarlyCancellation) {
    return {
      totalAmount: bookingFeeAmount,
      perMinuteRate,
      baseAmount,
      bookingFeeAmount,
      bookingFeeApplied: true,
      billingRule: 'booking_fee_only',
      earlyCancelThresholdMinutes,
      baseOnlyThresholdMinutes,
      isEarlyCancellation,
      isBaseOnlyCancellation: false,
      selectedDurationMinutes: selectedDuration,
      durationDiscountApplied: false,
      durationDiscountPercent: 0,
      durationDiscountAmount: 0,
      durationDiscountedMinuteAmount: 0,
      undiscountedMinuteAmount: 0,
      effectiveRatePerMinute: 0,
      durationDiscountBreakdown: null,
    };
  }

  if (isBaseOnlyCancellation) {
    return {
      totalAmount: baseAmount,
      perMinuteRate,
      baseAmount,
      bookingFeeAmount,
      bookingFeeApplied: false,
      billingRule: 'base_only_cancellation',
      earlyCancelThresholdMinutes,
      baseOnlyThresholdMinutes,
      isEarlyCancellation: false,
      isBaseOnlyCancellation: true,
      selectedDurationMinutes: selectedDuration,
      durationDiscountApplied: false,
      durationDiscountPercent: 0,
      durationDiscountAmount: 0,
      durationDiscountedMinuteAmount: 0,
      undiscountedMinuteAmount: 0,
      effectiveRatePerMinute: 0,
      durationDiscountBreakdown: null,
    };
  }

  if (!hasLockedDurationDiscountPolicy) {
    const serviceAmount = roundCurrency(baseAmount + (safeBilledMinutes * perMinuteRate));
    const totalAmount = roundCurrency(serviceAmount + (isCancel ? 0 : bookingFeeAmount));
    return {
      totalAmount,
      perMinuteRate,
      baseAmount,
      bookingFeeAmount,
      bookingFeeApplied: !isCancel && bookingFeeAmount > 0,
      billingRule: isCancel ? 'base_plus_elapsed_cancellation' : 'base_plus_elapsed_completed',
      earlyCancelThresholdMinutes,
      baseOnlyThresholdMinutes,
      isEarlyCancellation,
      isBaseOnlyCancellation: false,
      selectedDurationMinutes: selectedDuration,
      durationDiscountApplied: false,
      durationDiscountPercent: 0,
      durationDiscountAmount: 0,
      durationDiscountedMinuteAmount: roundCurrency(safeBilledMinutes * perMinuteRate),
      undiscountedMinuteAmount: roundCurrency(safeBilledMinutes * perMinuteRate),
      effectiveRatePerMinute: perMinuteRate,
      durationDiscountBreakdown: null,
    };
  }

  const billingDurationRateDiscount = getDurationRateDiscountSnapshot(
    safeBilledMinutes,
    perMinuteRate,
    discountPolicy,
  );
  const serviceAmount = roundCurrency(baseAmount + billingDurationRateDiscount.durationDiscountedMinuteAmount);
  const totalAmount = roundCurrency(serviceAmount + (isCancel ? 0 : bookingFeeAmount));

  return {
    totalAmount,
    perMinuteRate,
    baseAmount,
    bookingFeeAmount,
    bookingFeeApplied: !isCancel && bookingFeeAmount > 0,
    billingRule: isCancel ? 'base_plus_elapsed_cancellation' : 'base_plus_elapsed_completed',
    earlyCancelThresholdMinutes,
    baseOnlyThresholdMinutes,
    isEarlyCancellation,
    isBaseOnlyCancellation: false,
    selectedDurationMinutes: selectedDuration,
    durationDiscountApplied: billingDurationRateDiscount.durationDiscountApplied,
    durationDiscountPercent: billingDurationRateDiscount.durationDiscountPercent,
    durationDiscountAmount: billingDurationRateDiscount.durationDiscountAmount,
    durationDiscountedMinuteAmount: billingDurationRateDiscount.durationDiscountedMinuteAmount,
    undiscountedMinuteAmount: billingDurationRateDiscount.undiscountedMinuteAmount,
    effectiveRatePerMinute: billingDurationRateDiscount.effectiveRatePerMinute,
    durationDiscountBreakdown: billingDurationRateDiscount.durationDiscountBreakdown,
  };
}

async function loadPricingConfig(db, fallback = DEFAULT_PRICING_CONFIG) {
  try {
    const snap = await db.collection('systemConfig').doc('pricingEngine').get();
    if (!snap.exists) return fallback;
    const data = snap.data() || {};
    return {
      ...fallback,
      ...data,
      bands: { ...fallback.bands, ...(data.bands || {}) },
      multiplierCaps: { ...fallback.multiplierCaps, ...(data.multiplierCaps || {}) },
      timeOfDayMultipliers: { ...fallback.timeOfDayMultipliers, ...(data.timeOfDayMultipliers || {}) },
      demandMultipliers: { ...fallback.demandMultipliers, ...(data.demandMultipliers || {}) },
      availabilityMultipliers: { ...fallback.availabilityMultipliers, ...(data.availabilityMultipliers || {}) },
      seasonMultipliers: { ...fallback.seasonMultipliers, ...(data.seasonMultipliers || {}) },
      subjectMultipliers: { ...fallback.subjectMultipliers, ...(data.subjectMultipliers || {}) },
      durationAdjustment: { ...fallback.durationAdjustment, ...(data.durationAdjustment || {}) },
      durationRateDiscounts: {
        ...fallback.durationRateDiscounts,
        ...(data.durationRateDiscounts || {}),
        tiers: Array.isArray(data.durationRateDiscounts?.tiers)
          ? data.durationRateDiscounts.tiers
          : fallback.durationRateDiscounts.tiers,
      },
    };
  } catch (error) {
    logger.error('Failed to load pricing config; using defaults.', { message: error.message });
    return fallback;
  }
}

module.exports = {
  DEFAULT_PRICING_CONFIG,
  LEGACY_SAFE_PRICING_SNAPSHOT,
  PRICING_CONFIG_VERSION,
  computePricingQuote,
  loadPricingConfig,
  sanitizePricingSnapshot,
  computeFinalAmountFromSnapshot,
  roundCurrency,
};
