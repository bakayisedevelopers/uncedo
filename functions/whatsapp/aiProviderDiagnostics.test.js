'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  attachProviderFailures,
  classifyFailure,
  createProviderHttpError,
  safeProviderFailures,
} = require('./aiProviderDiagnostics');

test('classifies an invalid API key without retaining the provider error text', () => {
  const diagnostic = classifyFailure({
    provider: 'gemini',
    status: 400,
    model: 'gemini-3.5-flash-lite',
    payload: { error: { status: 'INVALID_ARGUMENT', message: 'API key not valid. Do not expose this message.' } },
  });
  assert.deepEqual(diagnostic, {
    provider: 'gemini', httpStatus: 400, model: 'gemini-3.5-flash-lite',
    failureClass: 'authentication', providerCode: 'INVALID_ARGUMENT',
  });
  assert.doesNotMatch(JSON.stringify(diagnostic), /Do not expose|API key not valid/i);
});

test('classifies a rejected Gemini response schema separately from model and credential errors', () => {
  const error = createProviderHttpError({
    provider: 'gemini',
    model: 'gemini-3.5-flash-lite',
    response: { status: 400 },
    payload: { error: { status: 'INVALID_ARGUMENT', message: 'The responseSchema is not valid.' } },
  });
  assert.equal(error.code, 'gemini_http_400');
  assert.deepEqual(error.providerFailure, {
    provider: 'gemini', httpStatus: 400, model: 'gemini-3.5-flash-lite',
    failureClass: 'invalid_request_schema', providerCode: 'INVALID_ARGUMENT',
  });
});

test('provider failure summaries are bounded and omit arbitrary fields and raw text', () => {
  const primary = createProviderHttpError({
    provider: 'openai', model: 'gpt-6-luna', response: { status: 401 },
    payload: { error: { code: 'invalid_api_key', message: 'private key and prompt must not be stored' } },
  });
  const aggregate = attachProviderFailures(new Error('providers failed'), [primary, {
    providerFailure: { provider: 'gemini', httpStatus: 400, model: 'gemini-3.5-flash-lite', failureClass: 'invalid_request', raw: 'secret' },
  }]);
  assert.deepEqual(safeProviderFailures(aggregate.providerFailures), [
    { provider: 'openai', httpStatus: 401, model: 'gpt-6-luna', failureClass: 'authentication', providerCode: 'INVALID_API_KEY' },
    { provider: 'gemini', httpStatus: 400, model: 'gemini-3.5-flash-lite', failureClass: 'invalid_request' },
  ]);
  assert.doesNotMatch(JSON.stringify(aggregate.providerFailures), /private key|prompt|secret|raw/i);
});
