'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyMetaDeliveryError, shouldApplyDeliveryStatus } = require('./deliveryStatus');

test('Meta delivery errors distinguish explicit rejection from uncertain outcome', () => {
  assert.equal(classifyMetaDeliveryError({ code: 'meta_http_400' }), 'failed');
  assert.equal(classifyMetaDeliveryError({ code: 'template-required' }), 'blocked_template_required');
  assert.equal(classifyMetaDeliveryError({ code: 'meta_http_503' }), 'outcome_unknown');
  assert.equal(classifyMetaDeliveryError({ code: 'ETIMEDOUT' }), 'outcome_unknown');
});

test('delivery callbacks advance state without allowing stale callbacks to regress it', () => {
  assert.equal(shouldApplyDeliveryStatus({ status: 'sent', statusTimestampMs: 10 }, { status: 'delivered', timestampMs: 20 }), true);
  assert.equal(shouldApplyDeliveryStatus({ status: 'delivered', statusTimestampMs: 20 }, { status: 'sent', timestampMs: 10 }), false);
  assert.equal(shouldApplyDeliveryStatus({ status: 'read', statusTimestampMs: 20 }, { status: 'failed', timestampMs: 30 }), false);
  assert.equal(shouldApplyDeliveryStatus({ status: 'sent', statusTimestampMs: 20 }, { status: 'failed', timestampMs: 30 }), true);
});
