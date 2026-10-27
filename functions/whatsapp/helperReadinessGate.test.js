'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isWhatsAppHelperProfileCaptureStage,
  resolveWhatsAppHelperReadinessState,
} = require('./helperReadinessGate');

test('incomplete helper profile is re-gated when a completed conversation receives another message', () => {
  const result = resolveWhatsAppHelperReadinessState({ state: { stage: 'complete' }, ready: false, nowMs: 100 });
  assert.equal(result.changed, true);
  assert.equal(result.state.stage, 'helper_readiness');
  assert.equal(result.state.role, 'helper');
});

test('a newly accepted current agreement releases a helper from the agreement gate', () => {
  const result = resolveWhatsAppHelperReadinessState({ state: { stage: 'awaiting_helper_agreement' }, ready: true, nowMs: 200 });
  assert.equal(result.changed, true);
  assert.equal(result.state.stage, 'complete');
});

test('readiness rechecks do not interrupt an active profile answer step', () => {
  assert.equal(isWhatsAppHelperProfileCaptureStage('awaiting_home_address'), true);
  const result = resolveWhatsAppHelperReadinessState({ state: { stage: 'awaiting_home_address' }, ready: false });
  assert.equal(result.changed, false);
  assert.equal(result.state.stage, 'awaiting_home_address');
});
