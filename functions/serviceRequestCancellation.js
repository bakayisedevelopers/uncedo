'use strict';

const PRE_ASSIGNMENT_STATUSES = new Set([
  'collecting_details',
  'scheduled_pending',
  'matching',
  'helper_found',
  'no_helper_available',
]);

const POST_ASSIGNMENT_STATUSES = new Set([
  'accepted',
  'driving',
  'en_route',
  'buying_resources',
  'arrived',
  'work_started',
]);

function calculateCustomerCancellationTerms({
  request = {},
  distanceTravelledMeters = 0,
  bookingFee = 0,
  travelFee = 0,
  travelRatePerKm = 4,
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
  if (!POST_ASSIGNMENT_STATUSES.has(status)) return { code: 'not-cancellable', status };
  if (typeof payoutBreakdown !== 'function') throw new Error('Cancellation payout calculator is required.');

  const distanceKm = Math.max(0, Number(distanceTravelledMeters || 0) / 1000);
  let billingRule = 'booking_fee_only';
  let travelCharge = 0;
  if (['driving', 'en_route', 'buying_resources'].includes(status)) {
    billingRule = 'travelled_distance_plus_booking_fee';
    travelCharge = toMoney(distanceKm * Number(travelRatePerKm || 0));
  } else if (['arrived', 'work_started'].includes(status)) {
    billingRule = 'travel_fee_plus_booking_fee';
    travelCharge = toMoney(travelFee);
  }

  const breakdown = payoutBreakdown({
    billingRule,
    travelledKm: distanceKm,
    travelFeeAmount: billingRule === 'travelled_distance_plus_booking_fee' ? travelCharge : travelFee,
    bookingFeeAmount: bookingFee,
  });
  const cancellationAmount = Math.max(0, toMoney(breakdown?.customerChargeAmount || 0));
  return {
    code: 'eligible',
    status,
    billingRule,
    cancellationAmount,
    cancellationDistanceKm: Number(distanceKm.toFixed(2)),
    travelCharge,
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
};
