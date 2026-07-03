import { getFirebaseClients } from '../firebase/config';
import { normalizePricingSnapshot } from '../utils/pricing';

const PRICING_CONFIG_VERSION = 'pricing-v2.1.0-client';

const DEFAULT_PRICING_CONFIG = {
  version: PRICING_CONFIG_VERSION,
  currency: 'ZAR',
  durationAdjustment: {
    shortSessionBoostUnderMinutes: 15,
    shortSessionBoostMultiplier: 1.02,
    longSessionDiscountFromMinutes: 60,
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
    return { multiplier: 1, label: 'long_session_discount_neutralized' };
  }
  return { multiplier: 1, label: 'standard_duration' };
}

function normalizeLevel(value, allowed, fallback) {
  const next = String(value || '').trim().toLowerCase();
  return allowed.includes(next) ? next : fallback;
}

function normalizeSubject(subject) {
  return String(subject || 'general').trim().toLowerCase();
}

function getDurationRateDiscountSnapshot(minutes, adjustedRatePerMinute, durationRateDiscounts) {
  const durationMinutes = Math.max(1, Math.floor(Number(minutes || 0)));
  const rate = Number(adjustedRatePerMinute || 0);
  const policy = durationRateDiscounts || DEFAULT_PRICING_CONFIG.durationRateDiscounts;
  const undiscountedMinuteAmount = roundCurrency(durationMinutes * rate);
  if (!policy?.enabled) {
    return {
      durationDiscountApplied: false,
      durationDiscountPercent: 0,
      durationDiscountAmount: 0,
      durationDiscountedMinuteAmount: undiscountedMinuteAmount,
      undiscountedMinuteAmount,
      effectiveRatePerMinute: roundCurrency(rate),
      durationDiscountBreakdown: null,
    };
  }

  const minimumDiscountedRatePerMinute = Number(policy.minimumDiscountedRatePerMinute || 0);
  let durationDiscountedMinuteAmount = 0;
  let highestDiscountPercent = 0;
  const tieredAmounts = [];

  for (const tier of policy.tiers || []) {
    const tierStart = Math.max(1, Number(tier.minMinutes || 1));
    const tierEnd = tier.maxMinutes == null ? durationMinutes : Math.max(tierStart, Number(tier.maxMinutes || tierStart));
    if (durationMinutes < tierStart) continue;
    const segmentEnd = Math.min(durationMinutes, tierEnd);
    const segmentMinutes = Math.max(0, segmentEnd - tierStart + 1);
    if (!segmentMinutes) continue;

    const discountPercent = Math.max(0, Number(tier.discountPercent || 0));
    const discountMultiplier = Math.max(0, 1 - (discountPercent / 100));
    const discountedRatePerMinute = Math.max(rate * discountMultiplier, minimumDiscountedRatePerMinute);
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
      discountedRatePerMinute: roundCurrency(discountedRatePerMinute),
      segmentDiscountedAmount,
      segmentDiscountAmount,
    });
  }

  return {
    durationDiscountApplied: roundCurrency(undiscountedMinuteAmount - durationDiscountedMinuteAmount) > 0,
    durationDiscountPercent: highestDiscountPercent,
    durationDiscountAmount: roundCurrency(undiscountedMinuteAmount - durationDiscountedMinuteAmount),
    durationDiscountedMinuteAmount,
    undiscountedMinuteAmount,
    effectiveRatePerMinute: roundCurrency(durationDiscountedMinuteAmount / durationMinutes),
    durationDiscountBreakdown: {
      applied: roundCurrency(undiscountedMinuteAmount - durationDiscountedMinuteAmount) > 0,
      discountPercent: highestDiscountPercent,
      minimumDiscountedRatePerMinute,
      tieredAmounts,
      undiscountedMinuteAmount,
      durationDiscountedMinuteAmount,
      durationDiscountAmount: roundCurrency(undiscountedMinuteAmount - durationDiscountedMinuteAmount),
    },
  };
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

function computeLocalPricingQuote({ minutes, subject, config = DEFAULT_PRICING_CONFIG }) {
  const duration = Math.max(1, Math.floor(Number(minutes || 0)));
  const subjectKey = normalizeSubject(subject);
  const now = new Date();
  const timeBucket = getTimeOfDayBucket(now.getHours());
  const seasonBucket = getSeasonBucket(now);
  const demandLevel = normalizeLevel('normal', ['low', 'normal', 'high'], 'normal');
  const availabilityLevel = normalizeLevel('normal', ['low', 'normal', 'high'], 'normal');
  const band = chooseBand({ demandLevel, availabilityLevel, timeBucket, seasonBucket });
  const bandConfig = config.bands[band] || config.bands.normal;
  const subjectMultiplier = Number(config.subjectMultipliers[subjectKey] || config.subjectMultipliers.general || 1);
  const timeOfDayMultiplier = Number(config.timeOfDayMultipliers[timeBucket] || 1);
  const demandMultiplier = Number(config.demandMultipliers[demandLevel] || 1);
  const availabilityMultiplier = Number(config.availabilityMultipliers[availabilityLevel] || 1);
  const seasonMultiplier = Number(config.seasonMultipliers[seasonBucket] || 1);
  const durationAdjustment = getDurationAdjustment(duration, config);
  const combinedMultiplier = clampMultiplier(
    subjectMultiplier
      * timeOfDayMultiplier
      * demandMultiplier
      * availabilityMultiplier
      * seasonMultiplier
      * Number(durationAdjustment.multiplier || 1),
    config.multiplierCaps,
  );

  const adjustedBaseAmount = roundCurrency(Number(bandConfig.base || 0) * combinedMultiplier);
  const adjustedRatePerMinute = roundCurrency(Number(bandConfig.ratePerMinute || 0) * combinedMultiplier);
  const durationDiscount = getDurationRateDiscountSnapshot(duration, adjustedRatePerMinute, config.durationRateDiscounts);
  const totalAmount = roundCurrency(adjustedBaseAmount + durationDiscount.durationDiscountedMinuteAmount);

  return normalizePricingSnapshot({
    quoteId: null,
    pricingBand: band,
    baseAmount: roundCurrency(bandConfig.base),
    ratePerMinute: roundCurrency(bandConfig.ratePerMinute),
    adjustedBaseAmount,
    adjustedRatePerMinute,
    durationMinutes: duration,
    subject: subjectKey,
    subjectMultiplier,
    timeOfDayMultiplier,
    demandMultiplier,
    availabilityMultiplier,
    seasonMultiplier,
    durationAdjustment,
    combinedMultiplier,
    durationDiscountApplied: durationDiscount.durationDiscountApplied,
    durationDiscountPercent: durationDiscount.durationDiscountPercent,
    durationDiscountAmount: durationDiscount.durationDiscountAmount,
    durationDiscountedMinuteAmount: durationDiscount.durationDiscountedMinuteAmount,
    undiscountedMinuteAmount: durationDiscount.undiscountedMinuteAmount,
    effectiveRatePerMinute: durationDiscount.effectiveRatePerMinute,
    durationDiscountBreakdown: durationDiscount.durationDiscountBreakdown,
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
    quotedAt: new Date().toISOString(),
  });
}

export async function fetchPricingQuote({ durationMinutes, subject }) {
  const clients = getFirebaseClients();
  if (!clients?.auth?.currentUser) {
    throw new Error('You must be signed in to request a pricing quote.');
  }

  return computeLocalPricingQuote({ minutes: durationMinutes, subject });
}
