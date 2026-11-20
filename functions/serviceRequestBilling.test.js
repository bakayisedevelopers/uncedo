'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeServiceBookingFee,
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

test('formats whole Rand customer amounts with no decimals', () => {
  assert.equal(toWholeRand(374), 374);
  assert.equal(toWholeRand(374.00), 374);
  assert.equal(toWholeRand(377.74), 378);
  assert.equal(formatWholeRandDisplay(374), '374');
  assert.equal(formatWholeRandDisplay(374.0), '374');
  assert.equal(computeServiceBookingFee(370), 4);
});
