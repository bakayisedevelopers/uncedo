import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHelperRewardNotificationRoute } from '../rewardNavigation.js';

test('routes reward notifications into the Helper Rewards experience', () => {
  assert.deepEqual(resolveHelperRewardNotificationRoute({ type: 'reward_credit', targetPath: '/rewards' }), {
    key: 'HelperRewardsOverview',
    params: { parentTab: 'Profile' },
  });
  assert.deepEqual(resolveHelperRewardNotificationRoute({ type: 'membership_level_achieved' }), {
    key: 'HelperMembership',
    params: { parentTab: 'Profile' },
  });
});

test('routes mastery notification safely to its service where available', () => {
  assert.deepEqual(resolveHelperRewardNotificationRoute({ type: 'mastery_level_achieved', metadata: { serviceId: 'cleaning' } }), {
    key: 'HelperServiceMasteryDetails',
    params: { parentTab: 'Profile', serviceId: 'cleaning' },
  });
});

test('keeps unrelated helper notification routes on home', () => {
  assert.deepEqual(resolveHelperRewardNotificationRoute({ targetPath: '/app/helper' }), {
    key: 'Home',
    params: {},
  });
});
