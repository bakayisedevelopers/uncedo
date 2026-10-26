'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isManuallyRetryableAssistantJob, sanitizeAssistantFailure } = require('./assistantJobRecovery');

const retryable = { status: 'failed', phase: 'classification', identityId: 'a'.repeat(64), eventId: 'b'.repeat(64), attemptCount: 1 };

test('assistant retry is limited to a failed classifier call before tools and outbound sends', () => {
  assert.equal(isManuallyRetryableAssistantJob(retryable), true);
  assert.equal(isManuallyRetryableAssistantJob({ ...retryable, toolExecutionStarted: true }), false);
  assert.equal(isManuallyRetryableAssistantJob({ ...retryable, outboundAttempted: true }), false);
  assert.equal(isManuallyRetryableAssistantJob({ ...retryable, phase: 'workflow' }), false);
  assert.equal(isManuallyRetryableAssistantJob({ ...retryable, attemptCount: 2 }), false);
  assert.equal(isManuallyRetryableAssistantJob({ ...retryable, status: 'processing' }), false);
});

test('admin diagnostic projection omits identity, event and message content', () => {
  const safe = sanitizeAssistantFailure('job-1', { ...retryable, text: 'private incoming message', identityId: 'private identity' });
  assert.equal(safe.manualRecoveryAvailable, true);
  assert.equal(Object.hasOwn(safe, 'identityId'), false);
  assert.equal(Object.hasOwn(safe, 'eventId'), false);
  assert.equal(Object.hasOwn(safe, 'text'), false);
});
