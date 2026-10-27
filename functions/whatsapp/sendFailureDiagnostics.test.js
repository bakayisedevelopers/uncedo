'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildWhatsAppSendFailureDiagnostics,
  normalizeSafeErrorCode,
  withWhatsAppFailureStage,
} = require('./sendFailureDiagnostics');

test('Meta HTTP failures retain only status and numeric Meta diagnostics', () => {
  const error = Object.assign(new Error('private response body must not be logged'), {
    code: 'meta_http_401', metaCode: 190, metaSubcode: 463,
  });
  const diagnostics = buildWhatsAppSendFailureDiagnostics(error, 'meta_send_request');
  assert.deepEqual(diagnostics, {
    failureStage: 'meta_send_request', errorCode: 'meta_http_401', errorName: 'Error',
    metaHttpStatus: 401, metaCode: '190', metaSubcode: '463',
  });
  assert.doesNotMatch(JSON.stringify(diagnostics), /private response body|token|secret/i);
});

test('unknown error messages and untrusted codes are not included in diagnostics', () => {
  const diagnostics = buildWhatsAppSendFailureDiagnostics({
    name: 'PrivateCustomError',
    code: 'token=secret-value',
    message: 'Bearer private-token and recipient 27820001111',
  }, 'persist_conversation_memory');
  assert.deepEqual(diagnostics, {
    failureStage: 'persist_conversation_memory', errorCode: 'unclassified_error', errorName: 'Error',
  });
  assert.equal(normalizeSafeErrorCode({ code: 'meta_http_400' }), 'meta_http_400');
});

test('failure stage annotation preserves the original error code and first failing stage', () => {
  const original = Object.assign(new Error('internal detail'), { code: 'meta_send_network_error' });
  const tagged = withWhatsAppFailureStage(original, 'meta_send_request');
  withWhatsAppFailureStage(tagged, 'mark_assistant_send_complete');
  assert.equal(tagged.code, 'meta_send_network_error');
  assert.deepEqual(buildWhatsAppSendFailureDiagnostics(tagged), {
    failureStage: 'meta_send_request', errorCode: 'meta_send_network_error', errorName: 'Error',
  });
});

test('ReferenceError diagnostics identify only a safe missing symbol and source location', () => {
  const error = new ReferenceError('sendAssistantReply is not defined');
  error.stack = "ReferenceError: sendAssistantReply is not defined\n    at handler (/workspace/uncedo/functions/index.js:4678:32)\n    at node:internal/process/task_queues:95:5";
  const diagnostics = buildWhatsAppSendFailureDiagnostics(error);
  assert.deepEqual(diagnostics, {
    failureStage: 'unknown',
    errorCode: 'unclassified_error',
    errorName: 'ReferenceError',
    referenceIdentifier: 'sendAssistantReply',
    sourceLocation: 'functions/index.js:4678:32',
  });
  assert.doesNotMatch(JSON.stringify(diagnostics), /workspace|token|secret/i);
});
