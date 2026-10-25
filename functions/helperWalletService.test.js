'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isWalletEarningEligible } = require('./helperWalletService');

test('wallet earnings require a versioned request with verified payment settlement', () => {
  assert.equal(isWalletEarningEligible({ helperWalletAccountingVersion: 1, paymentStatus: 'unpaid' }), false);
  assert.equal(isWalletEarningEligible({ helperWalletAccountingVersion: 1, paymentStatus: 'payment_processing' }), false);
  assert.equal(isWalletEarningEligible({ helperWalletAccountingVersion: 1, paymentStatus: 'paid' }), true);
  assert.equal(isWalletEarningEligible({ paymentStatus: 'paid' }), false);
  assert.equal(isWalletEarningEligible({ helperWalletAccountingVersion: 1, paymentStatus: 'paid', cashPayment: { status: 'helper_confirmed' } }), false);
});
