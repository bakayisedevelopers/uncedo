import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getParentTab,
  resolveDeepLink,
  resolveNotificationRoute,
} from '../../../navigation/navigationLinking.js';

test('preserves existing service request and session deep links', () => {
  assert.deepEqual(resolveDeepLink('uncedo://service-request/req_123'), {
    key: 'ServiceRequestTracking',
    params: { requestId: 'req_123', parentTab: 'Requests' },
  });

  assert.deepEqual(resolveDeepLink('uncedo://session/sess_555'), {
    key: 'SessionRoom',
    params: { sessionId: 'sess_555', parentTab: 'Requests' },
  });
});

test('routes reward notifications into customer reward screens', () => {
  assert.deepEqual(resolveNotificationRoute({
    type: 'points_earned',
    metadata: { reasonCode: 'payment_method_verified' },
  }), {
    key: 'CustomerRewardsOverview',
    params: {},
  });

  assert.deepEqual(resolveNotificationRoute({
    type: 'points_earned',
    metadata: { reasonCode: 'referral_stage_one' },
  }), {
    key: 'CustomerReferrals',
    params: {},
  });
});

test('keeps reward routes attached to the profile tab and request routes to requests', () => {
  assert.equal(getParentTab('CustomerRewardsOverview', {}), 'Profile');
  assert.equal(getParentTab('CustomerMembershipDetails', {}), 'Profile');
  assert.equal(getParentTab('ServiceRequestTracking', {}), 'Requests');
});
