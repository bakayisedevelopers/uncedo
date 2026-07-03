export const LESSON_DURATION_OPTIONS = [10, 15, 20, 25, 30, 40, 50, 60, 75, 90];

export const DEFAULT_LESSON_DURATION = 10;

export const LEGACY_SAFE_PRICING_SNAPSHOT = {
  pricingBand: 'normal',
  baseAmount: 12,
  ratePerMinute: 1.8,
  adjustedBaseAmount: 12,
  adjustedRatePerMinute: 1.8,
  durationMinutes: DEFAULT_LESSON_DURATION,
  totalAmount: 30,
  configVersion: 'pricing-v2.0.0-legacy-safe',
  explanationLabel: 'Standard pricing',
  currency: 'ZAR',
};

export function formatRand(amount) {
  return `R${Number(amount || 0).toFixed(2)}`;
}

export function normalizePricingSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return { ...LEGACY_SAFE_PRICING_SNAPSHOT };
  }

  const durationMinutes = Math.max(1, Number(snapshot.durationMinutes || DEFAULT_LESSON_DURATION));
  const adjustedBaseAmount = Number(snapshot.adjustedBaseAmount ?? snapshot.baseAmount ?? 12);
  const adjustedRatePerMinute = Number(snapshot.adjustedRatePerMinute ?? snapshot.ratePerMinute ?? 1.8);
  const totalAmount = Number(snapshot.totalAmount ?? (adjustedBaseAmount + (adjustedRatePerMinute * durationMinutes)));

  return {
    quoteId: snapshot.quoteId || null,
    pricingBand: snapshot.pricingBand || 'normal',
    baseAmount: Number(snapshot.baseAmount ?? adjustedBaseAmount),
    ratePerMinute: Number(snapshot.ratePerMinute ?? adjustedRatePerMinute),
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
    totalAmount,
    originalPrice: Number(snapshot.originalPrice ?? totalAmount),
    discountApplied: Number(snapshot.discountApplied ?? 0),
    finalPrice: Number(snapshot.finalPrice ?? snapshot.finalAmount ?? totalAmount),
    discountSource: snapshot.discountSource || null,
    freeMinutesApplied: Number(snapshot.freeMinutesApplied ?? 0),
    requestedDurationMinutes: Number(snapshot.requestedDurationMinutes ?? durationMinutes),
    currency: snapshot.currency || 'ZAR',
    configVersion: snapshot.configVersion || LEGACY_SAFE_PRICING_SNAPSHOT.configVersion,
    explanationLabel: snapshot.explanationLabel || 'Standard pricing',
    quotedAt: snapshot.quotedAt || null,
    lockExpiresAt: snapshot.lockExpiresAt || null,
  };
}
