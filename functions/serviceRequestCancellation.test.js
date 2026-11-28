'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateCustomerCancellationTerms,
  cancellationQuoteMatches,
} = require('./serviceRequestCancellation');

function samplePayout({ billingRule, travelledKm, travelFeeAmount, bookingFeeAmount, waitingCost = 0 }) {
  const helperTravelAmount = billingRule === 'travelled_distance_plus_booking_fee'
    ? Math.round(travelledKm * 400) / 100
    : billingRule === 'travel_fee_plus_booking_fee' ? travelFeeAmount : 0;
  const helperWaitingAmount = billingRule === 'travel_fee_plus_booking_fee' ? waitingCost : 0;
  const helperAmount = helperTravelAmount + helperWaitingAmount;
  return {
    helperAmount,
    helperTravelAmount,
    helperWaitingAmount,
    waitingCost: helperWaitingAmount,
    platformAmount: bookingFeeAmount,
    customerChargeAmount: helperAmount + bookingFeeAmount,
  };
}

test('pre-assignment cancellation has no charge and post-assignment terms follow current billing rules', () => {
  assert.deepEqual(calculateCustomerCancellationTerms({ request: { status: 'matching' } }), {
    code: 'eligible', status: 'matching', billingRule: 'pre_assignment', cancellationAmount: 0,
    cancellationDistanceKm: 0,
    helperPayoutBreakdown: { helperAmount: 0, platformAmount: 0, customerChargeAmount: 0 },
  });

  assert.deepEqual(calculateCustomerCancellationTerms({ request: { status: 'accepted' }, bookingFee: 5, travelFee: 35 }), {
    code: 'eligible', status: 'accepted', billingRule: 'accepted_before_travel', cancellationAmount: 0,
    cancellationDistanceKm: 0, travelCharge: 0,
    helperPayoutBreakdown: { helperAmount: 0, platformAmount: 0, customerChargeAmount: 0 },
  });

  const driving = calculateCustomerCancellationTerms({
    request: { status: 'driving' },
    distanceTravelledMeters: 2750,
    bookingFee: 4.6,
    travelFee: 35,
    payoutBreakdown: samplePayout,
  });
  assert.equal(driving.billingRule, 'travelled_distance_plus_booking_fee');
  assert.equal(driving.cancellationDistanceKm, 2.75);
  assert.equal(driving.helperPayoutBreakdown.platformAmount, 5);
  assert.equal(driving.cancellationAmount, 16);

  const arrived = calculateCustomerCancellationTerms({
    request: { status: 'arrived' },
    distanceTravelledMeters: 2750,
    bookingFee: 5,
    travelFee: 35,
    payoutBreakdown: samplePayout,
  });
  assert.equal(arrived.billingRule, 'travel_fee_plus_booking_fee');
  assert.equal(arrived.waitingCost, 0);
  assert.equal(arrived.cancellationAmount, 40);

  const arrivedAfterWaiting = calculateCustomerCancellationTerms({
    request: { status: 'arrived', arrivedAt: 100_000 },
    now: 100_000 + 7 * 60_000,
    distanceTravelledMeters: 2750,
    bookingFee: 5,
    travelFee: 35,
    payoutBreakdown: samplePayout,
  });
  assert.equal(arrivedAfterWaiting.billingRule, 'travel_fee_plus_booking_fee');
  assert.equal(arrivedAfterWaiting.waitingMinutes, 7);
  assert.equal(arrivedAfterWaiting.waitingCost, 5);
  assert.equal(arrivedAfterWaiting.helperPayoutBreakdown.helperTravelAmount, 35);
  assert.equal(arrivedAfterWaiting.helperPayoutBreakdown.helperWaitingAmount, 5);
  assert.equal(arrivedAfterWaiting.helperPayoutBreakdown.helperAmount, 40);
  assert.equal(arrivedAfterWaiting.cancellationAmount, 45);

  const workStartedAfterWaiting = calculateCustomerCancellationTerms({
    request: { status: 'work_started', arrivedAt: 100_000, workStartedAt: 100_000 + 10 * 60_000 },
    now: 100_000 + 30 * 60_000,
    bookingFee: 3,
    travelFee: 35,
    payoutBreakdown: samplePayout,
  });
  assert.equal(workStartedAfterWaiting.waitingMinutes, 10);
  assert.equal(workStartedAfterWaiting.waitingCost, 8);
  assert.equal(workStartedAfterWaiting.helperPayoutBreakdown.helperAmount, 43);
  assert.equal(workStartedAfterWaiting.cancellationAmount, 46);
});

test('terminal and unsupported request states cannot be quoted for cancellation', () => {
  assert.equal(calculateCustomerCancellationTerms({ request: { status: 'canceled' } }).code, 'already-cancelled');
  assert.equal(calculateCustomerCancellationTerms({ request: { status: 'completed' } }).code, 'already-completed');
  assert.equal(calculateCustomerCancellationTerms({ request: { status: 'expired' } }).code, 'not-cancellable');
  assert.equal(calculateCustomerCancellationTerms({ request: { status: 'work_completed' } }).code, 'not-cancellable');
});

test('WhatsApp confirmation quote must still match live request state and fee', () => {
  assert.equal(cancellationQuoteMatches(
    { status: 'driving', cancellationAmount: 16 },
    { status: 'driving', cancellationAmount: 16.004 },
  ), true);
  assert.equal(cancellationQuoteMatches(
    { status: 'driving', cancellationAmount: 16 },
    { status: 'driving', cancellationAmount: 20 },
  ), false);
  assert.equal(cancellationQuoteMatches(
    { status: 'driving', cancellationAmount: 16 },
    { status: 'work_started', cancellationAmount: 16 },
  ), false);
});
