'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildBusyHelperCustomerConfirmationMessage,
  buildBusyHelperEtaSummary,
  estimateCurrentRequestRemainingMinutes,
  hasNoHelperWindowExpired,
  resolveHelperSelectionWithBusyFallback,
} = require('./busyHelperFallbackLogic');

test('prefers free helper selection unchanged when a free helper is available', () => {
  const result = resolveHelperSelectionWithBusyFallback({
    request: { status: 'matching' },
    freeSelection: {
      queue: ['free-1', 'free-2'],
      selectedHelperId: 'free-1',
      excludedHelperIds: [],
      resetExcludedHelperIds: false,
      reofferAfterCooldown: false,
    },
    busyCandidateQueue: ['busy-1'],
  });

  assert.equal(result.selectedHelperId, 'free-1');
  assert.equal(result.offerType, 'standard');
  assert.equal(result.isBusyFallback, false);
});

test('falls back to eligible busy helper only when no free helper is available', () => {
  const result = resolveHelperSelectionWithBusyFallback({
    request: {
      status: 'matching',
      declinedHelperIds: ['busy-declined'],
      offerCycleExcludedHelperIds: ['busy-expired'],
      customerRejectedBusyHelperIds: ['busy-rejected-by-customer'],
    },
    freeSelection: {
      queue: [],
      selectedHelperId: '',
      excludedHelperIds: ['busy-expired'],
      resetExcludedHelperIds: false,
      reofferAfterCooldown: false,
    },
    busyCandidateQueue: [
      'busy-declined',
      'busy-expired',
      'busy-rejected-by-customer',
      'busy-eligible-1',
      'busy-eligible-2',
    ],
  });

  assert.equal(result.selectedHelperId, 'busy-eligible-1');
  assert.equal(result.offerType, 'busy_helper_fallback');
  assert.equal(result.isBusyFallback, true);
  assert.deepEqual(result.busyQueue, ['busy-eligible-1', 'busy-eligible-2']);
});

test('computes reasonable finishCurrentMinutes and arrival time ETAs across job states', () => {
  const now = Date.UTC(2026, 10, 20, 10, 0, 0); // 12:00 SAST

  const startedMins = estimateCurrentRequestRemainingMinutes({
    activeRequest: {
      status: 'work_started',
      workStartedAt: now - 25 * 60 * 1000,
      pricingSnapshot: { estimatedDurationMinutes: 45 },
    },
    now,
  });
  assert.equal(startedMins, 20);

  const etaSummary = buildBusyHelperEtaSummary({
    activeRequest: {
      status: 'work_started',
      workStartedAt: now - 25 * 60 * 1000,
      pricingSnapshot: { estimatedDurationMinutes: 45 },
    },
    travelDurationSeconds: 15 * 60,
    now,
  });
  assert.equal(etaSummary.finishCurrentMinutes, 20);
  assert.equal(etaSummary.travelMinutes, 15);
  assert.equal(etaSummary.totalArrivalMinutes, 35);
  assert.equal(etaSummary.finishClockTime, '12:20');
  assert.equal(etaSummary.arrivalClockTime, '12:35');
});

test('formats customer confirmation prompt with both finish ETA and arrival ETA', () => {
  const now = Date.UTC(2026, 10, 20, 10, 0, 0);
  const etaSummary = buildBusyHelperEtaSummary({
    activeRequest: { status: 'arrived', pricingSnapshot: { estimatedDurationMinutes: 30 } },
    travelDurationSeconds: 10 * 60,
    now,
  });
  const msg = buildBusyHelperCustomerConfirmationMessage({
    request: { serviceSummary: 'Cleaning — Laundry', publicRequestReference: 'UNC-101' },
    helperName: 'Thabo M.',
    etaSummary,
  });

  assert.match(msg.text, /Thabo M\./);
  assert.match(msg.text, /finish current job/i);
  assert.match(msg.text, /arrival at your location/i);
  assert.match(msg.text, /12:35/);
  assert.match(msg.text, /12:45/);
  assert.match(msg.interactiveBody, /continue searching/i);
});

test('evaluates 5-minute no_helper_available expiration window accurately', () => {
  const base = 1_700_000_000_000;
  assert.equal(hasNoHelperWindowExpired({ noHelperWindowExpiresAtMs: base + 300_000 }, base + 299_999), false);
  assert.equal(hasNoHelperWindowExpired({ noHelperWindowExpiresAtMs: base + 300_000 }, base + 300_000), true);
  assert.equal(hasNoHelperWindowExpired({}, base), false);
});
