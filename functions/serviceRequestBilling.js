'use strict';

const SERVICE_BOOKING_FEE_RATE = 0.01;
const SERVICE_BOOKING_FEE_CAP = 5;
const SERVICE_TRAVEL_RATE_PER_KM = 4;
const SERVICE_DEFAULT_TRAVEL_FEE = 35;
const HELPER_LABOR_PAYOUT_RATE = 0.75;
const PLATFORM_LABOR_SHARE_RATE = 0.25;
const WAITING_FREE_GRACE_MINUTES = 2;
const WAITING_RATE_PER_MINUTE = 1;

function toMoney(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Number(numeric.toFixed(6));
}

function toRand(value) {
  return Number(toMoney(value).toFixed(2));
}

function toWholeRand(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric);
}

function formatWholeRandDisplay(value) {
  return String(toWholeRand(value));
}

function resolveFiniteNonNegativeNumber(candidates = []) {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return numeric;
    }
  }
  return null;
}

function computeServiceBookingFee(baseAmount = 0) {
  const normalizedBase = Math.max(0, Number(baseAmount || 0));
  if (!Number.isFinite(normalizedBase) || normalizedBase <= 0) return 0;
  return Math.round(Math.min(SERVICE_BOOKING_FEE_CAP, normalizedBase * SERVICE_BOOKING_FEE_RATE));
}

function computeWaitingTimeCharge({ arrivedAtMs = 0, endedAtMs = 0 } = {}) {
  const startMs = Number(arrivedAtMs || 0);
  const endMs = Number(endedAtMs || 0);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs <= 0 || endMs <= startMs) {
    return {
      waitingMinutes: 0,
      chargeableWaitingMinutes: 0,
      waitingCost: 0,
    };
  }
  const waitingMinutes = Number(((endMs - startMs) / 60000).toFixed(2));
  const chargeableWaitingMinutes = waitingMinutes > WAITING_FREE_GRACE_MINUTES
    ? Math.round(waitingMinutes - WAITING_FREE_GRACE_MINUTES)
    : 0;
  const waitingCost = toWholeRand(chargeableWaitingMinutes * WAITING_RATE_PER_MINUTE);
  return {
    waitingMinutes,
    chargeableWaitingMinutes,
    waitingCost,
  };
}

function getServiceTravelFee(request = {}) {
  const explicit = resolveFiniteNonNegativeNumber([
    request?.pricingSnapshot?.travelFee,
    request?.requestPayload?.pricingSnapshot?.travelFee,
  ]);
  return explicit !== null ? toRand(explicit) : SERVICE_DEFAULT_TRAVEL_FEE;
}

function getStoredServiceBookingFee(request = {}) {
  const explicit = resolveFiniteNonNegativeNumber([
    request?.pricingSnapshot?.bookingFee,
    request?.requestPayload?.pricingSnapshot?.bookingFee,
  ]);
  return explicit !== null ? toWholeRand(explicit) : null;
}

function getServiceQuoteTotal(request = {}) {
  const explicit = resolveFiniteNonNegativeNumber([
    request?.pricingSnapshot?.total,
    request?.pricingSnapshot?.totalAmount,
    request?.pricingSnapshot?.finalAmount,
    request?.pricingSnapshot?.finalPrice,
    request?.requestPayload?.pricingSnapshot?.total,
    request?.requestPayload?.pricingSnapshot?.totalAmount,
    request?.requestPayload?.pricingSnapshot?.finalAmount,
    request?.requestPayload?.pricingSnapshot?.finalPrice,
  ]);
  return explicit !== null ? toRand(explicit) : 0;
}

function getServiceQuoteSubtotal(request = {}) {
  const explicitSubtotal = resolveFiniteNonNegativeNumber([
    request?.pricingSnapshot?.subtotal,
    request?.requestPayload?.pricingSnapshot?.subtotal,
  ]);
  if (explicitSubtotal !== null && explicitSubtotal > 0) {
    return toRand(explicitSubtotal);
  }

  const breakdown = Array.isArray(request?.pricingSnapshot?.serviceBreakdown)
    ? request.pricingSnapshot.serviceBreakdown
    : Array.isArray(request?.requestPayload?.pricingSnapshot?.serviceBreakdown)
      ? request.requestPayload.pricingSnapshot.serviceBreakdown
      : [];
  if (breakdown.length > 0) {
    const summed = breakdown.reduce((sum, item) => sum + Math.max(0, Number(item?.subtotal || 0)), 0);
    if (Number.isFinite(summed) && summed > 0) {
      return toRand(summed);
    }
  }

  const total = getServiceQuoteTotal(request);
  const travelFee = getServiceTravelFee(request);
  const storedBookingFee = getStoredServiceBookingFee(request) || 0;
  return toRand(Math.max(0, total - travelFee - storedBookingFee));
}

function getServiceBookingFee(request = {}) {
  const storedBookingFee = getStoredServiceBookingFee(request);
  if (storedBookingFee !== null) {
    return storedBookingFee;
  }
  const baseAmount = getServiceQuoteSubtotal(request) + getServiceTravelFee(request);
  return computeServiceBookingFee(baseAmount);
}

function getServiceHelperPayoutBreakdown(request = {}, options = {}) {
  const closureType = String(options.closureType || 'completed').trim().toLowerCase();
  const waitingCost = toWholeRand(options.waitingCost || 0);
  const travelledKm = Math.max(0, Number(options.travelledKm || 0));
  const bookingFee = toWholeRand(
    options.bookingFeeAmount
    ?? options.bookingFee
    ?? getServiceBookingFee(request),
  );
  const baseTravelFee = toRand(
    options.travelFeeAmount
    ?? options.travelFee
    ?? getServiceTravelFee(request),
  );
  const quoteSubtotal = getServiceQuoteSubtotal(request);
  const laborAmount = toRand(quoteSubtotal);

  if (closureType === 'completed') {
    const quotedTotal = getServiceQuoteTotal(request);
    const shouldUseQuotedBase = options.preserveQuotedTotal !== false && quotedTotal > 0;
    const customerChargeAmount = shouldUseQuotedBase
      ? toWholeRand(quotedTotal + waitingCost)
      : toWholeRand(laborAmount + baseTravelFee + bookingFee + waitingCost);
    const rawHelperLaborAmount = toRand(laborAmount * HELPER_LABOR_PAYOUT_RATE);
    const rawHelperTravelAmount = baseTravelFee;
    const rawHelperWaitingAmount = waitingCost;
    const rawHelperAmount = toRand(rawHelperLaborAmount + rawHelperTravelAmount + rawHelperWaitingAmount);
    const helperAmount = customerChargeAmount > 0
      ? toRand(Math.min(customerChargeAmount, rawHelperAmount))
      : rawHelperAmount;

    let remainingHelper = helperAmount;
    const helperWaitingAmount = toRand(Math.min(remainingHelper, rawHelperWaitingAmount));
    remainingHelper = toRand(Math.max(0, remainingHelper - helperWaitingAmount));
    const helperTravelAmount = toRand(Math.min(remainingHelper, rawHelperTravelAmount));
    remainingHelper = toRand(Math.max(0, remainingHelper - helperTravelAmount));
    const helperLaborAmount = toRand(Math.min(remainingHelper, rawHelperLaborAmount));

    const platformAmount = toRand(Math.max(0, customerChargeAmount - helperAmount));
    const platformBookingAmount = Math.min(platformAmount, bookingFee);
    const platformLaborAmount = toRand(Math.max(0, platformAmount - platformBookingAmount));

    return {
      version: 'service_request_v1',
      closureType: 'completed',
      payoutRule: 'labor_split_plus_travel_and_booking_fee',
      helperAmount,
      helperLaborAmount,
      helperTravelAmount,
      helperWaitingAmount,
      platformAmount,
      platformLaborAmount,
      platformBookingAmount,
      laborAmount,
      travelAmount: helperTravelAmount,
      bookingFeeAmount: platformBookingAmount,
      waitingCost: helperWaitingAmount,
      travelledKm: Number(travelledKm.toFixed(2)),
      customerChargeAmount,
    };
  }

  const billingRule = String(options.billingRule || 'booking_fee_only').trim().toLowerCase();
  let helperTravelAmount = 0;
  let helperWaitingAmount = 0;
  let platformBookingAmount = 0;
  let payoutRule = billingRule;

  switch (billingRule) {
    case 'travelled_distance_plus_booking_fee':
      helperTravelAmount = toRand(travelledKm * SERVICE_TRAVEL_RATE_PER_KM);
      platformBookingAmount = bookingFee;
      payoutRule = 'travelled_distance_plus_booking_fee';
      break;
    case 'travel_fee_plus_booking_fee':
      helperTravelAmount = baseTravelFee;
      helperWaitingAmount = waitingCost;
      platformBookingAmount = bookingFee;
      payoutRule = 'travel_fee_plus_booking_fee';
      break;
    case 'booking_fee_only':
    default:
      helperTravelAmount = 0;
      platformBookingAmount = bookingFee;
      payoutRule = 'booking_fee_only';
      break;
  }

  const helperAmount = toRand(helperTravelAmount + helperWaitingAmount);
  const platformAmount = toRand(platformBookingAmount);

  return {
    version: 'service_request_v1',
    closureType: 'canceled',
    payoutRule,
    helperAmount,
    helperLaborAmount: 0,
    helperTravelAmount,
    helperWaitingAmount,
    platformAmount,
    platformLaborAmount: 0,
    platformBookingAmount,
    laborAmount: 0,
    travelAmount: helperTravelAmount,
    bookingFeeAmount: platformBookingAmount,
    waitingCost: helperWaitingAmount,
    travelledKm: Number(travelledKm.toFixed(2)),
    customerChargeAmount: toRand(helperAmount + platformAmount),
  };
}

module.exports = {
  HELPER_LABOR_PAYOUT_RATE,
  PLATFORM_LABOR_SHARE_RATE,
  SERVICE_BOOKING_FEE_CAP,
  SERVICE_BOOKING_FEE_RATE,
  SERVICE_DEFAULT_TRAVEL_FEE,
  SERVICE_TRAVEL_RATE_PER_KM,
  WAITING_FREE_GRACE_MINUTES,
  WAITING_RATE_PER_MINUTE,
  computeServiceBookingFee,
  computeWaitingTimeCharge,
  formatWholeRandDisplay,
  getServiceBookingFee,
  getServiceHelperPayoutBreakdown,
  getServiceQuoteSubtotal,
  getServiceQuoteTotal,
  getServiceTravelFee,
  toMoney,
  toRand,
  toWholeRand,
};
