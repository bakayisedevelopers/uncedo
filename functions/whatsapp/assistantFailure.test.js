'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AI_UNAVAILABLE_REPLY, attemptAiUnavailableReply, canSendAiUnavailableReply } = require('./assistantFailure');

test('safe AI-unavailable reply is allowed only before tools or outbound attempts', () => {
  assert.equal(canSendAiUnavailableReply({ phase: 'classification' }), true);
  assert.equal(canSendAiUnavailableReply({ phase: 'classification', toolExecutionStarted: true }), false);
  assert.equal(canSendAiUnavailableReply({ phase: 'classification', outboundAttempted: true }), false);
  assert.equal(canSendAiUnavailableReply({ phase: 'workflow' }), false);
});

test('AI-unavailable reply does not expose model providers or internal errors', () => {
  assert.match(AI_UNAVAILABLE_REPLY, /try again shortly/i);
  assert.doesNotMatch(AI_UNAVAILABLE_REPLY, /\b(?:AI|OpenAI|Gemini|401|400|provider)\b/i);
});

test('fallback executor invokes the sender supplied by the outer error handler exactly once', async () => {
  const calls = [];
  const result = await attemptAiUnavailableReply({
    phase: 'classification',
    sendReply: async (...args) => {
      calls.push(args);
      return { sent: true };
    },
  });
  assert.deepEqual(result, { attempted: true, sent: true });
  assert.deepEqual(calls, [[AI_UNAVAILABLE_REPLY, null, 'assistant_failure_fallback']]);
});

test('fallback executor safely skips when sender is unavailable or phase is unsafe', async () => {
  assert.deepEqual(await attemptAiUnavailableReply({ phase: 'classification' }), { attempted: false, sent: false });
  assert.deepEqual(await attemptAiUnavailableReply({ phase: 'workflow', sendReply: async () => ({ sent: true }) }), { attempted: false, sent: false });
});
