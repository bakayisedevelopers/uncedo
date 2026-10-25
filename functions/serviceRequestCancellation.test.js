'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateCustomerCancellationTerms,
  cancellationQuoteMatches,
} = require('./serviceRequestCancellation');

function samplePayout({ billingRule, travelledKm, travelFeeAmount, bookingFeeAmount }) {
  const helperAmount = billingRule === 'travelled_distance_plus_booking_fee'
    ? Math.round(travelledKm * 400) / 100
    : billingRule === 'travel_fee_plus_booking_fee' ? travelFeeAmount : 0;
  return { helperAmount, platformAmount: bookingFeeAmount, customerChargeAmount: helperAmount + bookingFeeAmount };
}

test('pre-assignment cancellation has no charge and post-assignment terms follow current billing rules', () => {
  assert.deepEqual(calculateCustomerCancellationTerms({ request: { status: 'matching' } }), {
    code: 'eligible', status: 'matching', billingRule: 'pre_assignment', cancellationAmount: 0,
    cancellationDistanceKm: 0,
    helperPayoutBreakdown: { helperAmount: 0, platformAmount: 0, customerChargeAmount: 0 },
  });

  const driving = calculateCustomerCancellationTerms({
    request: { status: 'driving' },
    distanceTravelledMeters: 2750,
    bookingFee: 5,
    travelFee: 35,
    payoutBreakdown: samplePayout,
  });
  assert.equal(driving.billingRule, 'travelled_distance_plus_booking_fee');
  assert.equal(driving.cancellationDistanceKm, 2.75);
  assert.equal(driving.cancellationAmount, 16);

  const arrived = calculateCustomerCancellationTerms({
    request: { status: 'arrived' },
    distanceTravelledMeters: 2750,
    bookingFee: 5,
    travelFee: 35,
    payoutBreakdown: samplePayout,
  });
  assert.equal(arrived.billingRule, 'travel_fee_plus_booking_fee');
  assert.equal(arrived.cancellationAmount, 40);
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
