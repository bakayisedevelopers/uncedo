'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeServiceBookingFee,
  computeWaitingTimeCharge,
  formatWholeRandDisplay,
  getServiceBookingFee,
  getServiceHelperPayoutBreakdown,
  getServiceQuoteSubtotal,
  getServiceQuoteTotal,
  toWholeRand,
} = require('./serviceRequestBilling');

test('preserves confirmed 374 booking quote without double-counting booking fee', () => {
  const request = {
    pricingSnapshot: {
      subtotal: 338,
      travelFee: 32,
      bookingFee: 4,
      total: 374,
    },
  };

  assert.equal(getServiceQuoteTotal(request), 374);
  assert.equal(getServiceQuoteSubtotal(request), 338);
  assert.equal(getServiceBookingFee(request), 4);

  const breakdown = getServiceHelperPayoutBreakdown(request, {
    closureType: 'completed',
    waitingCost: 0,
  });

  assert.equal(breakdown.customerChargeAmount, 374);
  assert.equal(breakdown.helperAmount, 285.5);
  assert.equal(breakdown.platformAmount, 88.5);
  assert.equal(breakdown.helperAmount + breakdown.platformAmount, breakdown.customerChargeAmount);
});

test('falls back cleanly when legacy pricingSnapshot omits subtotal', () => {
  const legacyRequest = {
    pricingSnapshot: {
      travelFee: 32,
      bookingFee: 4,
      total: 374,
    },
  };

  assert.equal(getServiceQuoteSubtotal(legacyRequest), 338);
  assert.equal(getServiceBookingFee(legacyRequest), 4);

  const breakdown = getServiceHelperPayoutBreakdown(legacyRequest, {
    closureType: 'completed',
    waitingCost: 0,
  });

  assert.equal(breakdown.customerChargeAmount, 374);
  assert.equal(Number.isInteger(breakdown.customerChargeAmount), true);
  assert.equal(breakdown.helperAmount + breakdown.platformAmount, 374);
});

test('includes after-2-minutes waiting charge in quoted completed checkout total and routes 100% to helper', () => {
  assert.deepEqual(computeWaitingTimeCharge({ arrivedAtMs: 1_000, endedAtMs: 121_000 }), {
    waitingMinutes: 2,
    chargeableWaitingMinutes: 0,
    waitingCost: 0,
  });
  assert.deepEqual(computeWaitingTimeCharge({ arrivedAtMs: 1_000, endedAtMs: 1_000 + 8 * 60_000 }), {
    waitingMinutes: 8,
    chargeableWaitingMinutes: 6,
    waitingCost: 6,
  });

  const quotedRequest = {
    pricingSnapshot: {
      subtotal: 300,
      travelFee: 35,
      bookingFee: 3,
      total: 338,
    },
  };

  const breakdown = getServiceHelperPayoutBreakdown(quotedRequest, {
    closureType: 'completed',
    waitingCost: 6,
  });

  // Customer pays confirmed R338 + R6 waiting = R344
  assert.equal(breakdown.customerChargeAmount, 344);
  // Helper receives 75% of 300 (225) + 35 travel + 100% of 6 waiting = R266
  assert.equal(breakdown.helperLaborAmount, 225);
  assert.equal(breakdown.helperTravelAmount, 35);
  assert.equal(breakdown.helperWaitingAmount, 6);
  assert.equal(breakdown.helperAmount, 266);
  assert.equal(breakdown.waitingCost, 6);
  // Platform receives 25% of 300 (75) + booking fee (3) = R78
  assert.equal(breakdown.platformAmount, 78);
  assert.equal(breakdown.helperAmount + breakdown.platformAmount, breakdown.customerChargeAmount);
});

test('post-arrival cancellation includes R35 travel + 100% of after-2-min waiting charge for helper plus booking fee', () => {
  const request = {
    pricingSnapshot: {
      subtotal: 200,
      travelFee: 35,
      bookingFee: 2,
      total: 237,
    },
  };

  const breakdown = getServiceHelperPayoutBreakdown(request, {
    closureType: 'canceled',
    billingRule: 'travel_fee_plus_booking_fee',
    travelFeeAmount: 35,
    bookingFeeAmount: 2,
    waitingCost: 8,
  });

  assert.equal(breakdown.helperTravelAmount, 35);
  assert.equal(breakdown.helperWaitingAmount, 8);
  assert.equal(breakdown.helperAmount, 43);
  assert.equal(breakdown.waitingCost, 8);
  assert.equal(breakdown.platformBookingAmount, 2);
  assert.equal(breakdown.platformAmount, 2);
  assert.equal(breakdown.customerChargeAmount, 45);
});

test('formats whole Rand customer amounts with no decimals', () => {
  assert.equal(toWholeRand(374), 374);
  assert.equal(toWholeRand(374.00), 374);
  assert.equal(toWholeRand(377.74), 378);
  assert.equal(formatWholeRandDisplay(374), '374');
  assert.equal(formatWholeRandDisplay(374.0), '374');
  assert.equal(computeServiceBookingFee(370), 4);
});
