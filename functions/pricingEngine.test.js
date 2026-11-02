const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeFinalAmountFromSnapshot,
  computePricingQuote,
  DEFAULT_PRICING_CONFIG,
  LEGACY_SAFE_PRICING_SNAPSHOT,
  sanitizePricingSnapshot,
} = require('./pricingEngine');

function createFlatPricingConfig(overrides = {}) {
  return {
    ...DEFAULT_PRICING_CONFIG,
    ...overrides,
    bands: {
      ...DEFAULT_PRICING_CONFIG.bands,
      ...(overrides.bands || {}),
    },
    multiplierCaps: {
      ...DEFAULT_PRICING_CONFIG.multiplierCaps,
      min: 0.01,
      max: 100,
      ...(overrides.multiplierCaps || {}),
    },
    timeOfDayMultipliers: {
      ...DEFAULT_PRICING_CONFIG.timeOfDayMultipliers,
      overnight: 1,
      morning: 1,
      afternoon: 1,
      peak: 1,
      evening: 1,
      ...(overrides.timeOfDayMultipliers || {}),
    },
    demandMultipliers: {
      ...DEFAULT_PRICING_CONFIG.demandMultipliers,
      low: 1,
      normal: 1,
      high: 1,
      ...(overrides.demandMultipliers || {}),
    },
    availabilityMultipliers: {
      ...DEFAULT_PRICING_CONFIG.availabilityMultipliers,
      high: 1,
      normal: 1,
      low: 1,
      ...(overrides.availabilityMultipliers || {}),
    },
    seasonMultipliers: {
      ...DEFAULT_PRICING_CONFIG.seasonMultipliers,
      offSeason: 1,
      normal: 1,
      examSeason: 1,
      ...(overrides.seasonMultipliers || {}),
    },
    subjectMultipliers: {
      ...DEFAULT_PRICING_CONFIG.subjectMultipliers,
      english: 1,
      languages: 1,
      general: 1,
      mathematics: 1,
      math: 1,
      science: 1,
      accounting: 1,
      'advanced mathematics': 1,
      'advanced math': 1,
      physics: 1,
      ...(overrides.subjectMultipliers || {}),
    },
    durationAdjustment: {
      ...DEFAULT_PRICING_CONFIG.durationAdjustment,
      shortSessionBoostUnderMinutes: 0,
      shortSessionBoostMultiplier: 1,
      longSessionDiscountFromMinutes: 999,
      longSessionDiscountMultiplier: 1,
      ...(overrides.durationAdjustment || {}),
    },
    durationRateDiscounts: {
      ...DEFAULT_PRICING_CONFIG.durationRateDiscounts,
      ...(overrides.durationRateDiscounts || {}),
      tiers: overrides.durationRateDiscounts?.tiers || DEFAULT_PRICING_CONFIG.durationRateDiscounts.tiers,
    },
  };
}

function createFlatSignalContext() {
  return {
    now: new Date('2026-04-13T10:00:00Z'),
    demandLevel: 'normal',
    availabilityLevel: 'normal',
    timeOfDayBucket: 'morning',
    seasonBucket: 'normal',
  };
}

test('computes normal quote near baseline for 10 minutes', () => {
  const quote = computePricingQuote({
    minutes: 10,
    subject: 'english',
    signalContext: createFlatSignalContext(),
    config: DEFAULT_PRICING_CONFIG,
  });

  assert.equal(quote.pricingBand, 'normal');
  assert.equal(quote.durationMinutes, 10);
  assert.equal(quote.baseAmount, 7);
  assert.equal(quote.adjustedBaseAmount, 7);
  assert.equal(quote.adjustedRatePerMinute, 4);
  assert.equal(quote.durationDiscountApplied, false);
  assert.equal(quote.totalAmount, 47);
});

test('10 minutes has no duration discount in progressive billing', () => {
  const quote = computePricingQuote({
    minutes: 10,
    subject: 'english',
    signalContext: createFlatSignalContext(),
    config: createFlatPricingConfig(),
  });

  assert.equal(quote.durationDiscountApplied, false);
  assert.equal(quote.durationDiscountAmount, 0);
  assert.equal(quote.durationDiscountedMinuteAmount, 40);
  assert.equal(quote.totalAmount, 47);
  assert.equal(quote.durationDiscountBreakdown.tieredAmounts.length, 1);
  assert.deepEqual(
    quote.durationDiscountBreakdown.tieredAmounts[0],
    {
      minMinutes: 1,
      maxMinutes: 10,
      minutes: 10,
      discountPercent: 0,
      discountMultiplier: 1,
      discountedRatePerMinute: 4,
      segmentDiscountedAmount: 40,
      segmentDiscountAmount: 0,
    },
  );
});

test('15 minutes discounts only minutes 11 through 15', () => {
  const quote = computePricingQuote({
    minutes: 15,
    subject: 'english',
    signalContext: createFlatSignalContext(),
    config: createFlatPricingConfig(),
  });

  assert.equal(quote.baseAmount, 7);
  assert.equal(quote.adjustedBaseAmount, 7);
  assert.equal(quote.adjustedRatePerMinute, 4);
  assert.equal(quote.durationDiscountPercent, 5);
  assert.equal(quote.durationDiscountAmount, 1);
  assert.equal(quote.durationDiscountedMinuteAmount, 59);
  assert.equal(quote.totalAmount, 66);
  assert.deepEqual(
    quote.durationDiscountBreakdown.tieredAmounts.map(({ minutes, discountPercent }) => ({ minutes, discountPercent })),
    [
      { minutes: 10, discountPercent: 0 },
      { minutes: 5, discountPercent: 5 },
    ],
  );
});

test('20 minutes discounts only minutes 11 through 20', () => {
  const quote = computePricingQuote({
    minutes: 20,
    subject: 'english',
    signalContext: createFlatSignalContext(),
    config: createFlatPricingConfig(),
  });

  assert.equal(quote.durationDiscountPercent, 5);
  assert.equal(quote.durationDiscountAmount, 2);
  assert.equal(quote.durationDiscountedMinuteAmount, 78);
  assert.equal(quote.totalAmount, 85);
  assert.deepEqual(
    quote.durationDiscountBreakdown.tieredAmounts.map(({ minutes, discountPercent }) => ({ minutes, discountPercent })),
    [
      { minutes: 10, discountPercent: 0 },
      { minutes: 10, discountPercent: 5 },
    ],
  );
});

test('30 minutes applies 0, 5, and 10 percent brackets progressively', () => {
  const quote = computePricingQuote({
    minutes: 30,
    subject: 'english',
    signalContext: createFlatSignalContext(),
    config: createFlatPricingConfig(),
  });

  assert.equal(quote.durationDiscountPercent, 10);
  assert.equal(quote.durationDiscountAmount, 6);
  assert.equal(quote.durationDiscountedMinuteAmount, 114);
  assert.equal(quote.totalAmount, 121);
  assert.deepEqual(
    quote.durationDiscountBreakdown.tieredAmounts.map(({ minutes, discountPercent }) => ({ minutes, discountPercent })),
    [
      { minutes: 10, discountPercent: 0 },
      { minutes: 10, discountPercent: 5 },
      { minutes: 10, discountPercent: 10 },
    ],
  );
});

test('60 minutes applies all progressive brackets up to 25 percent', () => {
  const quote = computePricingQuote({
    minutes: 60,
    subject: 'english',
    signalContext: createFlatSignalContext(),
    config: createFlatPricingConfig(),
  });

  assert.equal(quote.durationDiscountPercent, 25);
  assert.equal(quote.durationDiscountAmount, 30);
  assert.equal(quote.durationDiscountedMinuteAmount, 210);
  assert.equal(quote.effectiveRatePerMinute, 4);
  assert.equal(quote.totalAmount, 217);
  assert.equal(quote.baseAmount, 7);
  assert.equal(quote.adjustedBaseAmount, 7);
  assert.equal(quote.adjustedRatePerMinute, 4);
});

test('90 minutes applies all progressive brackets up to 35 percent', () => {
  const quote = computePricingQuote({
    minutes: 90,
    subject: 'english',
    signalContext: createFlatSignalContext(),
    config: createFlatPricingConfig(),
  });

  assert.equal(quote.durationDiscountPercent, 35);
  assert.equal(quote.durationDiscountAmount, 69);
  assert.equal(quote.durationDiscountedMinuteAmount, 291);
  assert.equal(quote.totalAmount, 298);
  assert.equal(quote.durationDiscountBreakdown.tieredAmounts.at(-1).discountPercent, 35);
  assert.equal(quote.durationDiscountBreakdown.tieredAmounts.at(-1).minutes, 15);
});

test('sanitizes legacy snapshot safely', () => {
  const sanitized = sanitizePricingSnapshot({
    ratePerMinute: 1.8,
    durationMinutes: 20,
    totalAmount: 48,
  });

  assert.equal(sanitized.durationMinutes, 20);
  assert.equal(sanitized.totalAmount, 48);
  assert.equal(sanitized.pricingBand, 'normal');
});

test('falls back to safe legacy pricing snapshot when pricing data is missing', () => {
  const sanitized = sanitizePricingSnapshot({});

  assert.equal(sanitized.durationMinutes, LEGACY_SAFE_PRICING_SNAPSHOT.durationMinutes);
  assert.equal(sanitized.adjustedBaseAmount, LEGACY_SAFE_PRICING_SNAPSHOT.adjustedBaseAmount);
  assert.equal(sanitized.adjustedRatePerMinute, 4);
  assert.equal(sanitized.totalAmount, LEGACY_SAFE_PRICING_SNAPSHOT.totalAmount);
});

test('early cancellation bills booking fee only', () => {
  const result = computeFinalAmountFromSnapshot({
    snapshot: {
      baseAmount: 12,
      adjustedBaseAmount: 12,
      ratePerMinute: 1.8,
      adjustedRatePerMinute: 1.8,
      durationMinutes: 30,
      totalAmount: 66,
      durationRateDiscounts: DEFAULT_PRICING_CONFIG.durationRateDiscounts,
    },
    billedMinutes: 0.75,
    selectedDurationMinutes: 30,
    closureType: 'canceled_during',
    bookingFee: 9.9,
  });

  assert.equal(result.isEarlyCancellation, true);
  assert.equal(result.bookingFeeApplied, true);
  assert.equal(result.billingRule, 'booking_fee_only');
  assert.equal(result.totalAmount, 10);
});

test('cancellation after 1 minute and before 20 percent bills base only', () => {
  const result = computeFinalAmountFromSnapshot({
    snapshot: {
      baseAmount: 12,
      adjustedBaseAmount: 12,
      ratePerMinute: 1.8,
      adjustedRatePerMinute: 1.8,
      durationMinutes: 30,
      totalAmount: 66,
      durationRateDiscounts: DEFAULT_PRICING_CONFIG.durationRateDiscounts,
    },
    billedMinutes: 4,
    selectedDurationMinutes: 30,
    closureType: 'canceled_during',
    bookingFee: 9.9,
  });

  assert.equal(result.isEarlyCancellation, false);
  assert.equal(result.isBaseOnlyCancellation, true);
  assert.equal(result.billingRule, 'base_only_cancellation');
  assert.equal(result.totalAmount, 12);
});

test('late cancellation with legacy snapshots bills base plus minute usage', () => {
  const result = computeFinalAmountFromSnapshot({
    snapshot: {
      baseAmount: 12,
      adjustedBaseAmount: 12,
      ratePerMinute: 1.8,
      adjustedRatePerMinute: 1.8,
      durationMinutes: 30,
      totalAmount: 66,
    },
    billedMinutes: 8,
    selectedDurationMinutes: 30,
    closureType: 'canceled_during',
  });

  assert.equal(result.isEarlyCancellation, false);
  assert.equal(result.totalAmount, 28);
  assert.equal(result.durationDiscountApplied, false);
  assert.equal(result.bookingFeeApplied, false);
});

test('final billing uses actual billed minutes with the locked discount policy and adds booking fee', () => {
  const quote = computePricingQuote({
    minutes: 60,
    subject: 'english',
    signalContext: createFlatSignalContext(),
    config: createFlatPricingConfig(),
  });

  const result = computeFinalAmountFromSnapshot({
    snapshot: quote,
    billedMinutes: 75,
    selectedDurationMinutes: 60,
    closureType: 'completed',
    bookingFee: 11.5,
  });

  assert.equal(result.isEarlyCancellation, false);
  assert.equal(result.baseAmount, 7);
  assert.equal(result.perMinuteRate, 4);
  assert.equal(result.durationDiscountPercent, 30);
  assert.equal(result.effectiveRatePerMinute, 3);
  assert.equal(result.bookingFeeApplied, true);
  assert.equal(result.totalAmount, 271);
});

test('old snapshots without discount fields still bill using legacy behavior plus booking fee on completion', () => {
  const result = computeFinalAmountFromSnapshot({
    snapshot: {
      baseAmount: 7,
      adjustedBaseAmount: 7,
      ratePerMinute: 3.6,
      adjustedRatePerMinute: 4,
      durationMinutes: 60,
      totalAmount: 223,
    },
    billedMinutes: 75,
    selectedDurationMinutes: 60,
    closureType: 'completed',
    bookingFee: 8.25,
  });

  assert.equal(result.isEarlyCancellation, false);
  assert.equal(result.durationDiscountApplied, false);
  assert.equal(result.totalAmount, 315);
});

test('minimum discounted rate is respected', () => {
  const config = createFlatPricingConfig({
    bands: {
      ...DEFAULT_PRICING_CONFIG.bands,
      normal: { base: 7, ratePerMinute: 2.0 },
    },
  });

  const quote = computePricingQuote({
    minutes: 90,
    subject: 'english',
    signalContext: createFlatSignalContext(),
    config,
  });

  assert.equal(quote.adjustedRatePerMinute, 2);
  assert.equal(quote.durationDiscountPercent, 35);
  assert.equal(quote.effectiveRatePerMinute, 2);
  assert.equal(quote.totalAmount, 158);
});
