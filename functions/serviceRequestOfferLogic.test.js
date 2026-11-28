'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDeclinedOfferLists,
  buildExpiredOfferLists,
  buildHelperCancelRematchTransition,
  evaluateOfferExpiry,
  evaluateHelperRequestTransition,
  evaluateOfferResponse,
  normalizeExpiredPendingOffer,
  resolveNextServiceHelperSelection,
} = require('./serviceRequestOfferLogic');
const { resolveHelperSelectionWithBusyFallback } = require('./busyHelperFallbackLogic');

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

test('declined helper is permanently excluded while selection moves to the next helper in queue', () => {
  const declinedLists = buildDeclinedOfferLists({
    helperQueue: ['helper-1', 'helper-2', 'helper-3'],
    offerCycleExcludedHelperIds: [],
    declinedHelperIds: [],
  }, 'helper-1');

  const secondSelection = resolveNextServiceHelperSelection({
    ...declinedLists,
    lastOfferAt: 10_000,
  }, ['helper-1', 'helper-2', 'helper-3'], 20_000, { reofferCooldownMs: 60_000 });

  assert.equal(secondSelection.selectedHelperId, 'helper-2');
  assert.deepEqual(secondSelection.queue, ['helper-2', 'helper-3']);

  // Even after helper-2 and helper-3 decline and cooldown elapses, helper-1 is not re-offered.
  const afterAllDeclined = resolveNextServiceHelperSelection({
    helperQueue: [],
    offerCycleExcludedHelperIds: ['helper-1', 'helper-2', 'helper-3'],
    declinedHelperIds: ['helper-1', 'helper-2', 'helper-3'],
    lastOfferAt: 10_000,
  }, ['helper-1', 'helper-2', 'helper-3'], 200_000, { reofferCooldownMs: 60_000 });

  assert.equal(afterAllDeclined.selectedHelperId, '');
  assert.equal(afterAllDeclined.reofferAfterCooldown, false);
});

test('timed-out offer cleans queues, excludes helper for current cycle, advances to next helper, and allows cooldown retry', () => {
  const expiredLists = buildExpiredOfferLists({
    helperQueue: ['helper-1', 'helper-2'],
    busyHelperQueue: ['helper-1', 'busy-1'],
    offerCycleExcludedHelperIds: [],
  }, 'helper-1');

  assert.deepEqual(expiredLists, {
    helperQueue: ['helper-2'],
    busyHelperQueue: ['busy-1'],
    offerCycleExcludedHelperIds: ['helper-1'],
  });

  const nextFree = resolveNextServiceHelperSelection({
    ...expiredLists,
    declinedHelperIds: [],
    lastOfferAt: 10_000,
  }, ['helper-1', 'helper-2'], 41_000, { reofferCooldownMs: 60_000 });

  assert.equal(nextFree.selectedHelperId, 'helper-2');
  assert.deepEqual(nextFree.queue, ['helper-2', 'helper-1']);

  // Once cooldown elapses and no fresh helper is available, non-declined timed-out helper can be retried.
  const retryAfterCooldown = resolveNextServiceHelperSelection({
    helperQueue: ['helper-1'],
    offerCycleExcludedHelperIds: ['helper-1', 'helper-2'],
    declinedHelperIds: ['helper-2'],
    lastOfferAt: 10_000,
  }, ['helper-1', 'helper-2'], 75_000, { reofferCooldownMs: 60_000 });

  assert.equal(retryAfterCooldown.selectedHelperId, 'helper-1');
  assert.equal(retryAfterCooldown.resetExcludedHelperIds, true);
  assert.equal(retryAfterCooldown.reofferAfterCooldown, true);
});

test('normalizeExpiredPendingOffer prevents re-offering a stale timed-out helper and advances to next free or busy helper', () => {
  const staleOfferRequest = {
    status: 'helper_found',
    currentOfferHelperId: 'helper-1',
    offerToken: 'tok-1',
    offerRevision: 1,
    offerExpiresAt: 30_000,
    lastOfferAt: 1_000,
    helperQueue: ['helper-1', 'helper-2'],
    busyHelperQueue: ['busy-1'],
    offerCycleExcludedHelperIds: [],
    declinedHelperIds: [],
  };

  const normalized = normalizeExpiredPendingOffer(staleOfferRequest, 31_000);
  assert.equal(normalized.expired, true);
  assert.equal(normalized.helperId, 'helper-1');
  assert.equal(normalized.request.status, 'matching');
  assert.equal(normalized.request.currentOfferHelperId, null);
  assert.deepEqual(normalized.request.offerCycleExcludedHelperIds, ['helper-1']);

  const nextSelection = resolveNextServiceHelperSelection(
    normalized.request,
    ['helper-1', 'helper-2'],
    31_000,
    { reofferCooldownMs: 60_000 },
  );
  assert.equal(nextSelection.selectedHelperId, 'helper-2');

  // If no free helpers remain after normalizing a timed-out offer, advance into busy fallback queue cleanly.
  const onlyOneFreeExpired = normalizeExpiredPendingOffer({
    ...staleOfferRequest,
    helperQueue: ['helper-1'],
  }, 31_000);
  const freeNone = resolveNextServiceHelperSelection(
    onlyOneFreeExpired.request,
    ['helper-1'],
    31_000,
    { reofferCooldownMs: 60_000 },
  );
  const busySelection = resolveHelperSelectionWithBusyFallback({
    request: onlyOneFreeExpired.request,
    freeSelection: freeNone,
    busyCandidateQueue: ['helper-1', 'busy-1'],
  });
  assert.equal(busySelection.selectedHelperId, 'busy-1');
  assert.equal(busySelection.isBusyFallback, true);
});

test('helper cancel transitions request back to matching, clears assignment & PIN, excludes cancelling helper, and enables immediate rematch', () => {
  for (const status of ['accepted', 'driving', 'arrived', 'work_started', 'helper_queued']) {
    const request = {
      status,
      offerRevision: 3,
      helperAssignment: { helperId: 'helper-1', helperName: 'Sipho Ndlovu' },
      helperQueue: ['helper-1', 'helper-2', 'helper-3'],
      busyHelperQueue: ['helper-1', 'busy-1'],
      offerCycleExcludedHelperIds: [],
      declinedHelperIds: [],
      arrivalVerification: { required: true, pinHash: 'abc' },
      arrivedAt: 'ts-arrived',
      workStartedAt: 'ts-work',
      lastOfferResponse: { helperId: 'helper-1', offerToken: 'tok-3', offerRevision: 3, action: 'accept' },
    };

    const result = buildHelperCancelRematchTransition(request, {
      helperId: 'helper-1',
      helperName: 'Sipho Ndlovu',
      reason: 'Vehicle breakdown',
      nextPayoutBreakdown: { helperAmount: 246.5, platformAmount: 73.5, customerChargeAmount: 320 },
      now: 120_000,
      noHelperWindowMs: 300_000,
    });

    assert.equal(result.ok, true);
    assert.equal(result.canceledFromStatus, status);
    assert.equal(result.updates.status, 'matching');
    assert.equal(result.updates.helperAssignment, null);
    assert.equal(result.updates.currentOfferHelperId, null);
    assert.equal(result.updates.arrivalVerification, null);
    assert.equal(result.updates.arrivedAt, null);
    assert.equal(result.updates.workStartedAt, null);
    assert.equal(result.updates.canceledBy, null);
    assert.equal(result.updates.financialOperationId, null);
    assert.equal(result.updates.offerRevision, 3);
    assert.equal(result.updates.lastCanceledHelperId, 'helper-1');
    assert.equal(result.updates.lastCanceledHelperName, 'Sipho Ndlovu');
    assert.equal(result.updates.lastCanceledHelperReason, 'Vehicle breakdown');
    assert.equal(result.updates.noHelperWindowExpiresAtMs, 420_000);
    assert.deepEqual(result.updates.helperQueue, ['helper-2', 'helper-3']);
    assert.deepEqual(result.updates.busyHelperQueue, ['busy-1']);
    assert.deepEqual(result.updates.declinedHelperIds, ['helper-1']);
    assert.deepEqual(result.updates.offerCycleExcludedHelperIds, ['helper-1']);
    assert.deepEqual(result.updates.canceledByHelperIds, ['helper-1']);
    assert.equal(result.updates.helperCancellationHistory.length, 1);
    assert.equal(result.updates.helperCancellationHistory[0].canceledFromStatus, status);

    const rematchedSelection = resolveNextServiceHelperSelection(
      { ...request, ...result.updates },
      ['helper-1', 'helper-2', 'helper-3'],
      121_000,
      { reofferCooldownMs: 60_000 },
    );
    assert.equal(rematchedSelection.selectedHelperId, 'helper-2');
    assert.deepEqual(rematchedSelection.queue, ['helper-2', 'helper-3']);
  }

  // Wrong helper or terminal statuses fail cleanly
  assert.equal(buildHelperCancelRematchTransition({
    status: 'accepted',
    helperAssignment: { helperId: 'helper-1' },
  }, { helperId: 'helper-2' }).code, 'not-assigned-helper');

  for (const nonCancelable of ['matching', 'completed', 'canceled']) {
    assert.equal(buildHelperCancelRematchTransition({
      status: nonCancelable,
      helperAssignment: { helperId: 'helper-1' },
    }, { helperId: 'helper-1' }).code, 'request-not-cancelable');
  }
});

test('previously canceled helpers stay excluded after a second helper accepts and later cancels', () => {
  // Helper 1 canceled -> Helper 2 accepted (offer operations resets declinedHelperIds: []) -> Helper 2 cancels
  const afterSecondCancel = {
    status: 'matching',
    helperQueue: ['helper-1', 'helper-2', 'helper-3'],
    declinedHelperIds: ['helper-2'],
    canceledByHelperIds: ['helper-1', 'helper-2'],
    offerCycleExcludedHelperIds: ['helper-2'],
    lastOfferAt: 100_000,
  };
  const nextSelection = resolveNextServiceHelperSelection(
    afterSecondCancel,
    ['helper-1', 'helper-2', 'helper-3'],
    200_000,
    { reofferCooldownMs: 60_000 },
  );
  assert.equal(nextSelection.selectedHelperId, 'helper-3');
  assert.deepEqual(nextSelection.queue, ['helper-3']);

  const busyFallback = resolveHelperSelectionWithBusyFallback({
    request: afterSecondCancel,
    freeSelection: { queue: [], selectedHelperId: '' },
    busyCandidateQueue: ['helper-1', 'helper-2', 'busy-3'],
  });
  assert.equal(busyFallback.selectedHelperId, 'busy-3');
  assert.deepEqual(busyFallback.busyQueue, ['busy-3']);
});


