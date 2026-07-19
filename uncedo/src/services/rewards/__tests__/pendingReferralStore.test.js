import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearPendingReferralCode,
  getPendingReferralCode,
  getPendingReferralStatus,
  isTerminalReferralError,
  persistReferralCodeFromUrl,
  setPendingReferralCode,
  setPendingReferralStatus,
} from '../pendingReferralStore.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    async getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async setItem(key, value) {
      map.set(key, String(value));
    },
    async multiRemove(keys) {
      keys.forEach((key) => map.delete(key));
    },
  };
}

test('persists a referral code from a deep link and normalizes it', async () => {
  const storage = createMemoryStorage();
  const code = await persistReferralCodeFromUrl('https://uncedo.bakayise.com/signup?ref=ab-12', storage);

  assert.equal(code, 'AB12');
  assert.equal(await getPendingReferralCode(storage), 'AB12');
});

test('does not replace an existing pending referral code', async () => {
  const storage = createMemoryStorage();
  await setPendingReferralCode('FIRST99', storage);
  const result = await setPendingReferralCode('SECOND77', storage);

  assert.equal(result, 'FIRST99');
  assert.equal(await getPendingReferralCode(storage), 'FIRST99');
});

test('stores and clears pending referral status with the code', async () => {
  const storage = createMemoryStorage();
  await setPendingReferralCode('UNC123', storage);
  await setPendingReferralStatus({ state: 'retry', message: 'Temporary offline issue.' }, storage);

  const status = await getPendingReferralStatus(storage);
  assert.equal(status.state, 'retry');
  assert.equal(status.message, 'Temporary offline issue.');
  assert.ok(typeof status.updatedAt === 'number');

  await clearPendingReferralCode(storage);
  assert.equal(await getPendingReferralCode(storage), '');
  assert.equal(await getPendingReferralStatus(storage), null);
});

test('classifies existing-account and self-referral failures as terminal', () => {
  assert.equal(isTerminalReferralError(new Error('Self-referral is not allowed')), true);
  assert.equal(isTerminalReferralError(new Error('Referral codes can only be attached to a new account before activity begins.')), true);
  assert.equal(isTerminalReferralError(new Error('Network timeout while retrying.')), false);
});
