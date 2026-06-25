export const PLATFORM_FEE_RATE = 0.3;
export const HELPER_PAYOUT_RATE = 0.7;

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

export function toDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getWeekRange(dateInput) {
  const date = toDateValue(dateInput) || new Date();
  const utcDay = date.getUTCDay();
  const dayOffsetFromMonday = (utcDay + 6) % 7;
  const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  weekStart.setUTCDate(weekStart.getUTCDate() - dayOffsetFromMonday);
  const weekEnd = new Date(weekStart.getTime() + (6 * 24 * 60 * 60 * 1000));
  weekEnd.setUTCHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

export function getWeekKey(dateInput) {
  const { weekStart } = getWeekRange(dateInput);
  const thursday = new Date(weekStart.getTime());
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4UtcDay = jan4.getUTCDay();
  const jan4Offset = (jan4UtcDay + 6) % 7;
  const firstWeekStart = new Date(Date.UTC(year, 0, 4 - jan4Offset));
  const weekNumber = Math.floor((weekStart.getTime() - firstWeekStart.getTime()) / WEEK_IN_MS) + 1;
  return `${year}-W${String(Math.max(weekNumber, 1)).padStart(2, '0')}`;
}

export function formatCurrency(amount, currency = 'ZAR') {
  const normalized = Math.round(Number(amount || 0));
  if (!Number.isFinite(normalized)) return 'R0';
  if (currency && currency !== 'ZAR') {
    return `${currency} ${normalized}`;
  }
  return `R${normalized}`;
}

export function formatDate(value) {
  const parsed = toDateValue(value);
  if (!parsed) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

export function formatWeekRangeLabel(weekStartInput, weekEndInput) {
  const weekStart = toDateValue(weekStartInput);
  const weekEnd = toDateValue(weekEndInput);
  if (!weekStart || !weekEnd) return 'Unknown week';

  const formatter = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return `${formatter.format(weekStart)} - ${formatter.format(weekEnd)}`;
}

export function getPayoutTone(status) {
  const normalized = String(status || 'unpaid').toLowerCase();
  if (normalized === 'paid') return 'success';
  if (normalized === 'processing') return 'warning';
  if (normalized === 'failed' || normalized === 'unsuccessful') return 'danger';
  return 'neutral';
}

function toCurrencyAmount(value) {
  const numeric = Number(value || 0);
  return Number(Number.isFinite(numeric) ? numeric.toFixed(2) : 0);
}

function getStatusValue(job = {}) {
  return String(job?.status || '').trim().toLowerCase();
}

function getPricingSnapshot(job = {}) {
  return job?.helperPayoutBreakdown?.version ? null : (job?.pricingSnapshot || job?.raw?.pricingSnapshot || null);
}

function getBreakdown(job = {}) {
  const breakdown = job?.helperPayoutBreakdown || job?.raw?.helperPayoutBreakdown || null;
  if (!breakdown || typeof breakdown !== 'object') return null;

  return {
    closureType: String(breakdown.closureType || '').trim().toLowerCase(),
    payoutRule: String(breakdown.payoutRule || '').trim().toLowerCase(),
    customerChargeAmount: toCurrencyAmount(breakdown.customerChargeAmount),
    helperAmount: toCurrencyAmount(breakdown.helperAmount),
    helperLaborAmount: toCurrencyAmount(breakdown.helperLaborAmount),
    helperTravelAmount: toCurrencyAmount(breakdown.helperTravelAmount),
    platformAmount: toCurrencyAmount(breakdown.platformAmount),
    platformLaborAmount: toCurrencyAmount(breakdown.platformLaborAmount),
    platformBookingAmount: toCurrencyAmount(breakdown.platformBookingAmount),
    laborAmount: toCurrencyAmount(breakdown.laborAmount),
    travelAmount: toCurrencyAmount(breakdown.travelAmount),
    bookingFeeAmount: toCurrencyAmount(breakdown.bookingFeeAmount),
    waitingCost: toCurrencyAmount(breakdown.waitingCost),
    travelledKm: Number(breakdown.travelledKm || 0) || 0,
  };
}

function getLegacyLaborAmount(job = {}) {
  const pricingSnapshot = getPricingSnapshot(job);
  const subtotal = Number(
    pricingSnapshot?.subtotal
    ?? pricingSnapshot?.labourAmount
    ?? pricingSnapshot?.laborAmount
    ?? 0,
  );
  const waitingCost = Number(job?.waitingCost ?? pricingSnapshot?.waitingCost ?? 0);
  return toCurrencyAmount(Math.max(0, subtotal) + Math.max(0, waitingCost));
}

function getLegacyTravelAmount(job = {}) {
  const pricingSnapshot = getPricingSnapshot(job);
  return toCurrencyAmount(
    pricingSnapshot?.cancellationTravelCharge
    ?? pricingSnapshot?.travelFee
    ?? 35,
  );
}

function getLegacyBookingAmount(job = {}) {
  const pricingSnapshot = getPricingSnapshot(job);
  return toCurrencyAmount(
    pricingSnapshot?.bookingFee
    ?? 0,
  );
}

function getLegacyCancellationRule(job = {}) {
  const pricingSnapshot = getPricingSnapshot(job);
  return String(pricingSnapshot?.cancellationBillingRule || '').trim().toLowerCase();
}

export function getJobPayoutLabel(job = {}) {
  const breakdown = getBreakdown(job);
  const payoutRule = breakdown?.payoutRule || getLegacyCancellationRule(job);
  const status = getStatusValue(job);

  if (status === 'completed') {
    return 'Completed job';
  }

  switch (payoutRule) {
    case 'booking_fee_only':
      return 'Canceled before traveling';
    case 'travelled_distance_plus_booking_fee':
      return 'Canceled while traveling';
    case 'travel_fee_plus_booking_fee':
      return 'Canceled after arrival';
    default:
      return status === 'canceled' ? 'Canceled job' : 'Job settled';
  }
}

export function computeJobAmounts(job) {
  const breakdown = getBreakdown(job);
  if (breakdown) {
    return {
      totalAmount: breakdown.customerChargeAmount,
      helperAmount: breakdown.helperAmount,
      platformAmount: breakdown.platformAmount,
      helperLaborAmount: breakdown.helperLaborAmount,
      helperTravelAmount: breakdown.helperTravelAmount,
      platformLaborAmount: breakdown.platformLaborAmount,
      platformBookingAmount: breakdown.platformBookingAmount,
      laborAmount: breakdown.laborAmount,
      travelAmount: breakdown.travelAmount,
      bookingFeeAmount: breakdown.bookingFeeAmount,
      waitingCost: breakdown.waitingCost,
      closureType: breakdown.closureType || getStatusValue(job),
      payoutRule: breakdown.payoutRule || '',
      summaryLabel: getJobPayoutLabel(job),
    };
  }

  const status = getStatusValue(job);
  const laborAmount = getLegacyLaborAmount(job);
  const travelAmount = getLegacyTravelAmount(job);
  const bookingFeeAmount = getLegacyBookingAmount(job);
  const payoutRule = getLegacyCancellationRule(job);

  if (status === 'completed') {
    const helperLaborAmount = toCurrencyAmount(laborAmount * HELPER_PAYOUT_RATE);
    const platformLaborAmount = toCurrencyAmount(laborAmount * PLATFORM_FEE_RATE);
    const helperTravelAmount = travelAmount;
    const platformBookingAmount = bookingFeeAmount;
    const helperAmount = toCurrencyAmount(helperLaborAmount + helperTravelAmount);
    const platformAmount = toCurrencyAmount(platformLaborAmount + platformBookingAmount);

    return {
      totalAmount: toCurrencyAmount(helperAmount + platformAmount),
      helperAmount,
      platformAmount,
      helperLaborAmount,
      helperTravelAmount,
      platformLaborAmount,
      platformBookingAmount,
      laborAmount,
      travelAmount,
      bookingFeeAmount,
      waitingCost: toCurrencyAmount(job?.waitingCost ?? getPricingSnapshot(job)?.waitingCost ?? 0),
      closureType: 'completed',
      payoutRule: 'labor_split_plus_travel_and_booking_fee',
      summaryLabel: 'Completed job',
    };
  }

  let helperTravelAmount = 0;
  let platformBookingAmount = bookingFeeAmount;
  if (payoutRule === 'travelled_distance_plus_booking_fee' || payoutRule === 'travel_fee_plus_booking_fee') {
    helperTravelAmount = toCurrencyAmount(
      getPricingSnapshot(job)?.cancellationTravelCharge
      ?? travelAmount,
    );
  }

  return {
    totalAmount: toCurrencyAmount(helperTravelAmount + platformBookingAmount),
    helperAmount: helperTravelAmount,
    platformAmount: platformBookingAmount,
    helperLaborAmount: 0,
    helperTravelAmount,
    platformLaborAmount: 0,
    platformBookingAmount,
    laborAmount: 0,
    travelAmount: helperTravelAmount,
    bookingFeeAmount,
    waitingCost: 0,
    closureType: 'canceled',
    payoutRule: payoutRule || 'booking_fee_only',
    summaryLabel: getJobPayoutLabel(job),
  };
}

export function shouldIncludeJobInPayouts(job = {}) {
  const status = getStatusValue(job);
  return status === 'completed' || status === 'canceled';
}

export function groupCompletedJobsByWeek(jobs = [], weeklyPayouts = []) {
  const payoutByWeek = weeklyPayouts.reduce((acc, item) => {
    acc[item.weekKey] = item;
    return acc;
  }, {});

  const grouped = new Map();

  jobs.forEach((job) => {
    const completedDate = toDateValue(job.completedAt || job.updatedAt || job.createdAt);
    if (!completedDate) return;
    if (!shouldIncludeJobInPayouts(job)) return;

    const weekKey = getWeekKey(completedDate);
    const { weekStart, weekEnd } = getWeekRange(completedDate);
    const payoutRecord = payoutByWeek[weekKey] || null;
    const existing = grouped.get(weekKey) || {
      weekKey,
      weekStart,
      weekEnd,
      jobs: [],
      totalJobs: 0,
      grossAmount: 0,
      helperAmount: 0,
      platformAmount: 0,
      status: payoutRecord?.status || 'unpaid',
      notes: payoutRecord?.notes || '',
      paidAt: payoutRecord?.paidAt || null,
    };

    const amounts = computeJobAmounts(job);
    existing.jobs.push({
      ...job,
      completedDate,
      computedAmounts: amounts,
    });
    existing.totalJobs += 1;
    existing.grossAmount = Number((existing.grossAmount + amounts.totalAmount).toFixed(2));
    existing.helperAmount = Number((existing.helperAmount + amounts.helperAmount).toFixed(2));
    existing.platformAmount = Number((existing.platformAmount + amounts.platformAmount).toFixed(2));
    grouped.set(weekKey, existing);
  });

  return Array.from(grouped.values())
    .sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime())
    .map((group) => ({
      ...group,
      jobs: group.jobs.sort((a, b) => b.completedDate.getTime() - a.completedDate.getTime()),
    }));
}
