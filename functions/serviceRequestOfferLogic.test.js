'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDeclinedOfferLists,
  evaluateOfferExpiry,
  evaluateHelperRequestTransition,
  evaluateOfferResponse,
} = require('./serviceRequestOfferLogic');

const validOffer = {
  status: 'helper_found',
  currentOfferHelperId: 'helper-1',
  offerToken: 'opaque-token',
  offerRevision: 4,
  offerExpiresAt: 30_000,
};

test('accepts an action only for the current helper, token, revision, and unexpired offer', () => {
  assert.deepEqual(evaluateOfferResponse(validOffer, {
    action: 'accept',
    helperId: 'helper-1',
    offerToken: 'opaque-token',
    offerRevision: 4,
  }, 29_999), { ok: true, idempotent: false, action: 'accept' });

  for (const override of [
    { helperId: 'helper-2' },
    { offerToken: 'wrong-token' },
    { offerRevision: 3 },
  ]) {
    assert.equal(evaluateOfferResponse(validOffer, {
      action: 'accept',
      helperId: 'helper-1',
      offerToken: 'opaque-token',
      offerRevision: 4,
      ...override,
    }, 29_999).ok, false);
  }

  assert.equal(evaluateOfferResponse(validOffer, {
    action: 'accept', helperId: 'helper-1', offerToken: 'opaque-token', offerRevision: 4,
  }, 30_000).code, 'offer-expired');
});

test('helper lifecycle transitions require assignment and follow the existing job progression', () => {
  assert.deepEqual(evaluateHelperRequestTransition({
    status: 'accepted', helperAssignment: { helperId: 'helper-1' },
  }, { helperId: 'helper-1', nextStatus: 'driving' }), {
    ok: true, currentStatus: 'accepted', nextStatus: 'driving',
  });
  assert.equal(evaluateHelperRequestTransition({
    status: 'accepted', helperAssignment: { helperId: 'helper-1' },
  }, { helperId: 'helper-2', nextStatus: 'driving' }).code, 'not-assigned-helper');
  assert.equal(evaluateHelperRequestTransition({
    status: 'accepted', helperAssignment: { helperId: 'helper-1' },
  }, { helperId: 'helper-1', nextStatus: 'completed' }).code, 'invalid-status-transition');
  assert.equal(evaluateHelperRequestTransition({
    status: 'work_started', helperAssignment: { helperId: 'helper-1' },
  }, { helperId: 'helper-1', nextStatus: 'arrived' }).code, 'invalid-status-transition');
});

test('replays of the same completed offer action are idempotent', () => {
  const request = {
    ...validOffer,
    status: 'accepted',
    currentOfferHelperId: null,
    lastOfferResponse: {
      helperId: 'helper-1',
      offerToken: 'opaque-token',
      offerRevision: 4,
      action: 'accept',
    },
  };

  assert.deepEqual(evaluateOfferResponse(request, {
    action: 'accept', helperId: 'helper-1', offerToken: 'opaque-token', offerRevision: 4,
  }), { ok: true, idempotent: true, action: 'accept' });
  assert.equal(evaluateOfferResponse(request, {
    action: 'decline', helperId: 'helper-1', offerToken: 'opaque-token', offerRevision: 4,
  }).ok, false);
});

test('expiry only applies to the same offer after its deadline', () => {
  assert.deepEqual(evaluateOfferExpiry(validOffer, {
    helperId: 'helper-1', offerToken: 'opaque-token', offerRevision: 4,
  }, 30_000), { shouldExpire: true });
  assert.equal(evaluateOfferExpiry(validOffer, {
    helperId: 'helper-1', offerToken: 'opaque-token', offerRevision: 4,
  }, 29_999).code, 'offer-not-expired');
  assert.equal(evaluateOfferExpiry(validOffer, {
    helperId: 'helper-1', offerToken: 'old-token', offerRevision: 3,
  }, 30_000).shouldExpire, false);
});

test('decline and expiry exclusions are deduplicated and remove the selected helper from the queue', () => {
  assert.deepEqual(buildDeclinedOfferLists({
    helperQueue: ['helper-1', 'helper-2', 'helper-1'],
    offerCycleExcludedHelperIds: ['helper-3'],
    declinedHelperIds: ['helper-3'],
  }, 'helper-1'), {
    helperQueue: ['helper-2'],
    offerCycleExcludedHelperIds: ['helper-3', 'helper-1'],
    declinedHelperIds: ['helper-3', 'helper-1'],
  });
});
