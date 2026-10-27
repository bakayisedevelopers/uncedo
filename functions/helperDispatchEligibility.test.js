'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getHelperPayoutVerificationStatus, hasVerifiedHelperPayout } = require('./helperDispatchEligibility');

test('dispatch payout check accepts the canonical nested and legacy root status fields consistently', () => {
  assert.equal(getHelperPayoutVerificationStatus({ payout: { verificationStatus: 'verified' } }), 'verified');
  assert.equal(getHelperPayoutVerificationStatus({ payoutVerificationStatus: ' VERIFIED ' }), 'verified');
  assert.equal(hasVerifiedHelperPayout({ payout: { verificationStatus: 'verified' } }), true);
  assert.equal(hasVerifiedHelperPayout({ payoutVerificationStatus: 'verified' }), true);
  assert.equal(hasVerifiedHelperPayout({ payoutVerificationStatus: 'pending' }), false);
  assert.equal(hasVerifiedHelperPayout({ payout: { verificationStatus: 'pending' }, payoutVerificationStatus: 'verified' }), false);
});
