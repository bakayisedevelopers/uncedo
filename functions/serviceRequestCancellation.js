'use strict';

const { computeWaitingTimeCharge } = require('./serviceRequestBilling');

const PRE_ASSIGNMENT_STATUSES = new Set([
  'collecting_details',
  'scheduled_pending',
  'scheduled',
  'pending',
  'offered',
  'matching',
  'helper_found',
  'busy_helper_confirmation',
  'helper_queued',
  'no_helper_available',
]);

const ZERO_FEE_POST_ASSIGNMENT_STATUSES = new Set([
  'accepted',
]);

const POST_ASSIGNMENT_STATUSES = new Set([
  'accepted',
  'driving',
  'en_route',
  'buying_resources',
  'arrived',
  'work_started',
]);

function normalizeTimestampMs(value) {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value.toMillis === 'function') return Number(value.toMillis()) || 0;
  if (typeof value === 'object' && Number.isFinite(Number(value._seconds))) {
    return Number(value._seconds) * 1000 + Math.round(Number(value._nanoseconds || 0) / 1e6);
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isCustomerCancellableStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return PRE_ASSIGNMENT_STATUSES.has(normalized) || POST_ASSIGNMENT_STATUSES.has(normalized);
}

function calculateCustomerCancellationTerms({
  request = {},
  distanceTravelledMeters = 0,
  bookingFee = 0,
  travelFee = 0,
  travelRatePerKm = 4,
  now = Date.now(),
  arrivedAtMs = 0,
  workStartedAtMs = 0,
  toMoney = (value) => Number(Number(value || 0).toFixed(2)),
  payoutBreakdown,
} = {}) {
  const status = String(request.status || '').trim().toLowerCase();
  if (['canceled', 'cancelled'].includes(status)) return { code: 'already-cancelled', status };
  if (status === 'completed') return { code: 'already-completed', status };
  if (status === 'expired') return { code: 'not-cancellable', status };

  if (PRE_ASSIGNMENT_STATUSES.has(status)) {
    return {
      code: 'eligible',
      status,
      billingRule: 'pre_assignment',
      cancellationAmount: 0,
      cancellationDistanceKm: 0,
      helperPayoutBreakdown: {
        helperAmount: 0,
        platformAmount: 0,
        customerChargeAmount: 0,
      },
    };
  }
  if (ZERO_FEE_POST_ASSIGNMENT_STATUSES.has(status)) {
    return {
      code: 'eligible',
      status,
      billingRule: 'accepted_before_travel',
      cancellationAmount: 0,
      cancellationDistanceKm: 0,
      travelCharge: 0,
      helperPayoutBreakdown: {
        helperAmount: 0,
        platformAmount: 0,
        customerChargeAmount: 0,
      },
    };
  }
  if (!POST_ASSIGNMENT_STATUSES.has(status)) return { code: 'not-cancellable', status };
  if (typeof payoutBreakdown !== 'function') throw new Error('Cancellation payout calculator is required.');

  const integerBookingFee = Math.round(Math.max(0, Number(bookingFee || 0)));
  const distanceKm = Math.max(0, Number(distanceTravelledMeters || 0) / 1000);
  let billingRule = 'booking_fee_only';
  let travelCharge = 0;
  let waitingMinutes = 0;
  let waitingCost = 0;

  if (['driving', 'en_route', 'buying_resources'].includes(status)) {
    billingRule = 'travelled_distance_plus_booking_fee';
    travelCharge = toMoney(distanceKm * Number(travelRatePerKm || 0));
  } else if (['arrived', 'work_started'].includes(status)) {
    billingRule = 'travel_fee_plus_booking_fee';
    travelCharge = toMoney(travelFee);
    const resolvedArrivedAtMs = normalizeTimestampMs(arrivedAtMs)
      || normalizeTimestampMs(request.arrivedAt)
      || normalizeTimestampMs(request.helperAssignment?.arrivedAt);
    const resolvedWorkStartedAtMs = normalizeTimestampMs(workStartedAtMs)
      || normalizeTimestampMs(request.workStartedAt)
      || normalizeTimestampMs(request.helperAssignment?.workStartedAt);
    const waitEndMs = status === 'work_started'
      ? (resolvedWorkStartedAtMs || Number(now || Date.now()))
      : Number(now || Date.now());
    const waitStats = computeWaitingTimeCharge({
      arrivedAtMs: resolvedArrivedAtMs,
      endedAtMs: waitEndMs,
    });
    waitingMinutes = waitStats.waitingMinutes;
    waitingCost = waitStats.waitingCost;
  }

  const breakdown = payoutBreakdown({
    billingRule,
    travelledKm: distanceKm,
    travelFeeAmount: billingRule === 'travelled_distance_plus_booking_fee' ? travelCharge : travelFee,
    bookingFeeAmount: integerBookingFee,
    waitingCost,
  });
  const cancellationAmount = Math.max(0, toMoney(breakdown?.customerChargeAmount || 0));
  return {
    code: 'eligible',
    status,
    billingRule,
    cancellationAmount,
    cancellationDistanceKm: Number(distanceKm.toFixed(2)),
    travelCharge,
    waitingMinutes,
    waitingCost,
    helperPayoutBreakdown: breakdown,
  };
}

function cancellationQuoteMatches(expected = {}, actual = {}) {
  const expectedStatus = String(expected.status || '').trim().toLowerCase();
  const actualStatus = String(actual.status || '').trim().toLowerCase();
  const expectedAmount = Number(expected.cancellationAmount);
  const actualAmount = Number(actual.cancellationAmount);
  return Boolean(expectedStatus && expectedStatus === actualStatus
    && Number.isFinite(expectedAmount) && Number.isFinite(actualAmount)
    && Math.round(expectedAmount * 100) === Math.round(actualAmount * 100));
}

module.exports = {
  POST_ASSIGNMENT_STATUSES,
  PRE_ASSIGNMENT_STATUSES,
  calculateCustomerCancellationTerms,
  cancellationQuoteMatches,
  isCustomerCancellableStatus,
};
