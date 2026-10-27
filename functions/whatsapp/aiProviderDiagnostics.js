'use strict';

const SAFE_PROVIDER_CODES = new Set([
  'API_KEY_INVALID',
  'INVALID_API_KEY',
  'UNAUTHENTICATED',
  'INVALID_ARGUMENT',
  'INVALID_REQUEST_ERROR',
  'NOT_FOUND',
  'MODEL_NOT_FOUND',
  'PERMISSION_DENIED',
  'RESOURCE_EXHAUSTED',
  'RATE_LIMIT_EXCEEDED',
  'INSUFFICIENT_QUOTA',
]);

const SAFE_PROVIDER_FAILURE_CLASSES = new Set([
  'authentication',
  'invalid_request',
  'invalid_request_schema',
  'model_unavailable',
  'permission_denied',
  'quota_or_rate_limit',
  'provider_http_error',
  'service_not_enabled',
  'billing_disabled',
  'timeout',
  'network_error',
]);

function normalizeProviderCode(value) {
  const normalized = String(value || '').trim().replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
  return SAFE_PROVIDER_CODES.has(normalized) ? normalized : '';
}

function safeModelName(value) {
  const model = String(value || '').trim();
  return /^[A-Za-z0-9._-]{1,100}$/.test(model) ? model : '';
}

function classifyFailure({ provider, status, payload, model } = {}) {
  const providerName = provider === 'gemini' ? 'gemini' : provider === 'openai' ? 'openai' : '';
  const httpStatus = Number(status);
  const errorData = payload?.error && typeof payload.error === 'object' ? payload.error : {};
  const message = String(errorData.message || '').toLowerCase();
  const providerCode = normalizeProviderCode(errorData.code || errorData.status || errorData.type);
  let failureClass = 'provider_http_error';

  if (httpStatus === 401 || providerCode === 'API_KEY_INVALID' || providerCode === 'INVALID_API_KEY'
    || providerCode === 'UNAUTHENTICATED' || /api key.{0,30}(invalid|not valid)|invalid api key/.test(message)) {
    failureClass = 'authentication';
  } else if (httpStatus === 403 || providerCode === 'PERMISSION_DENIED') {
    failureClass = 'permission_denied';
  } else if (httpStatus === 404 || providerCode === 'NOT_FOUND' || providerCode === 'MODEL_NOT_FOUND'
    || /model.{0,40}(not found|not available|not supported)/.test(message)) {
    failureClass = 'model_unavailable';
  } else if (httpStatus === 429 || providerCode === 'RESOURCE_EXHAUSTED'
    || providerCode === 'RATE_LIMIT_EXCEEDED' || providerCode === 'INSUFFICIENT_QUOTA') {
    failureClass = 'quota_or_rate_limit';
  } else if (httpStatus === 400 || providerCode === 'INVALID_ARGUMENT' || providerCode === 'INVALID_REQUEST_ERROR') {
    failureClass = /schema|responseformat|response.?mime|structured output/.test(message)
      ? 'invalid_request_schema'
      : 'invalid_request';
  }

  return {
    ...(providerName ? { provider: providerName } : {}),
    ...(Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? { httpStatus } : {}),
    ...(safeModelName(model) ? { model: safeModelName(model) } : {}),
    failureClass,
    ...(providerCode ? { providerCode } : {}),
  };
}

function createProviderHttpError({ provider, response, payload, model } = {}) {
  const providerName = provider === 'gemini' ? 'gemini' : 'openai';
  const diagnostic = classifyFailure({ provider: providerName, status: response?.status, payload, model });
  const httpStatus = Number(response?.status) || 0;
  const error = new Error(`${providerName} AI provider rejected the request.`);
  error.code = `${providerName}_http_${httpStatus}`;
  error.providerFailure = diagnostic;
  return error;
}

function safeProviderFailure(error) {
  const candidate = error?.providerFailure || error;
  if (!candidate || typeof candidate !== 'object') return null;
  const provider = candidate.provider === 'openai' || candidate.provider === 'gemini' ? candidate.provider : '';
  const httpStatus = Number(candidate.httpStatus);
  const failureClass = SAFE_PROVIDER_FAILURE_CLASSES.has(candidate.failureClass) ? candidate.failureClass : '';
  const model = safeModelName(candidate.model);
  const providerCode = normalizeProviderCode(candidate.providerCode);
  if (!provider || !failureClass) return null;
  return {
    provider,
    ...(Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? { httpStatus } : {}),
    ...(model ? { model } : {}),
    failureClass,
    ...(providerCode ? { providerCode } : {}),
  };
}

function safeProviderFailures(errors = []) {
  return (Array.isArray(errors) ? errors : [])
    .map((error) => safeProviderFailure(error))
    .filter(Boolean)
    .slice(0, 2);
}

function attachProviderFailures(error, errors = []) {
  const failure = error instanceof Error ? error : new Error('AI providers failed.');
  const providerFailures = safeProviderFailures(errors);
  if (providerFailures.length) failure.providerFailures = providerFailures;
  return failure;
}

module.exports = {
  attachProviderFailures,
  classifyFailure,
  createProviderHttpError,
  safeProviderFailures,
};
