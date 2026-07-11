const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_REWARD_CONFIG } = require('../rewards/config');
const { txIdFromKey } = require('../rewards/rewardService');
const shared = require('../../shared/rewards');
test('shared constants expose required levels and directions', () => {
  assert.deepEqual(shared.MEMBERSHIP_LEVELS, ['neighbour', 'partner', 'friend', 'family']);
  assert.deepEqual(shared.MASTERY_LEVELS, ['beginner', 'specialist', 'master', 'legend']);
  assert.equal(shared.RATING_DIRECTIONS.CUSTOMER_TO_HELPER, 'customer_to_helper');
  assert.equal(shared.RATING_DIRECTIONS.HELPER_TO_CUSTOMER, 'helper_to_customer');
});
test('default reward config contains required global and customer values', () => {
  assert.equal(DEFAULT_REWARD_CONFIG.global.pointsPerRand, 10);
  assert.equal(DEFAULT_REWARD_CONFIG.global.customerPointExpiryMonths, 6);
  assert.equal(DEFAULT_REWARD_CONFIG.customer.rewards.profileCompleted, 20);
  assert.equal(DEFAULT_REWARD_CONFIG.customer.rewards.paymentMethodVerified, 50);
  assert.equal(DEFAULT_REWARD_CONFIG.customer.rewards.firstCompletedPaidBooking, 100);
  assert.equal(DEFAULT_REWARD_CONFIG.customer.ratingReceivedEffects[1], -50);
  assert.equal(DEFAULT_REWARD_CONFIG.customer.ratingReceivedEffects[5], 50);
});
test('idempotency transaction ids are deterministic and safe', () => {
  assert.equal(txIdFromKey('customer:u1:request:r1:completed-paid'), txIdFromKey('customer:u1:request:r1:completed-paid'));
  assert.notEqual(txIdFromKey('a'), txIdFromKey('b'));
  assert.match(txIdFromKey('a'), /^[a-f0-9]{40}$/);
});
test('integer point validation rejects fractional values', () => {
  assert.equal(shared.assertIntegerPoints(10), 10);
  assert.throws(() => shared.assertIntegerPoints(1.5), /integer/);
});
test('referral code normalization removes unsafe characters', () => {
  assert.equal(shared.normalizeReferralCode(' ab-12 uid '), 'AB12UID');
});
