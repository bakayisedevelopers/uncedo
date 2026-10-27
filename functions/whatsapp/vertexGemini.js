'use strict';

const { GoogleGenAI } = require('@google/genai');
const { classifyFailure } = require('./aiProviderDiagnostics');

const clientCache = new Map();

function normalizeVertexConfig({ projectId, location = 'global', timeoutMs = 15_000 } = {}) {
  const project = String(projectId || '').trim();
  const region = String(location || 'global').trim();
  const timeout = Number(timeoutMs);
  if (!/^[a-z0-9][a-z0-9-]{4,62}$/.test(project)) {
    const error = new Error('Google Cloud project configuration is missing or invalid.');
    error.code = 'gemini_vertex_project_missing';
    throw error;
  }
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(region)) {
    const error = new Error('Gemini Agent Platform location configuration is invalid.');
    error.code = 'gemini_vertex_location_invalid';
    throw error;
  }
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 60_000) {
    const error = new Error('Gemini Agent Platform timeout configuration is invalid.');
    error.code = 'gemini_vertex_timeout_invalid';
    throw error;
  }
  return { projectId: project, location: region, timeoutMs: timeout };
}

function createVertexGeminiClient({ projectId, location = 'global', timeoutMs = 15_000, GoogleGenAIClass = GoogleGenAI } = {}) {
  const config = normalizeVertexConfig({ projectId, location, timeoutMs });
  const cacheKey = `${config.projectId}:${config.location}:${config.timeoutMs}`;
  const options = {
    vertexai: true,
    project: config.projectId,
    location: config.location,
    // Avoid SDK retries after an uncertain response; callers already have a
    // deterministic fallback and another generation could incur extra cost.
    httpOptions: { timeout: config.timeoutMs, retryOptions: { attempts: 1 } },
  };
  if (GoogleGenAIClass !== GoogleGenAI) return new GoogleGenAIClass(options);
  if (!clientCache.has(cacheKey)) {
    clientCache.set(cacheKey, new GoogleGenAIClass(options));
  }
  return clientCache.get(cacheKey);
}

function geminiResponseText(response) {
  const direct = typeof response?.text === 'string' ? response.text : '';
  if (direct.trim()) return direct;
  return (Array.isArray(response?.candidates?.[0]?.content?.parts)
    ? response.candidates[0].content.parts
    : [])
    .map((part) => String(part?.text || ''))
    .join('');
}

function createVertexGeminiError(error, model) {
  const status = Number(error?.status || error?.response?.status || error?.statusCode || 0);
  const message = String(error?.message || '').toLowerCase();
  let code = 'gemini_vertex_request_failed';
  if (/api.{0,50}(disabled|not been used)|serviceusage.*disabled/.test(message)) {
    code = 'gemini_vertex_service_disabled';
  } else if (/billing.{0,50}(disabled|not enabled|closed)|billing account.{0,50}(disabled|closed)/.test(message)) {
    code = 'gemini_vertex_billing_disabled';
  } else if (status > 0) {
    code = `gemini_vertex_http_${status}`;
  } else if (/timeout|timed out|abort/.test(message) || error?.name === 'AbortError') {
    code = 'gemini_vertex_timeout';
  } else if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED'].includes(String(error?.code || ''))) {
    code = 'gemini_vertex_network_error';
  }

  const normalized = new Error('Gemini Agent Platform request failed.');
  normalized.code = code;
  const diagnostic = classifyFailure({
    provider: 'gemini',
    status,
    payload: { error: { status: code.toUpperCase().replace(/[^A-Z0-9_]/g, '_') } },
    model,
  });
  if (code === 'gemini_vertex_service_disabled') diagnostic.failureClass = 'service_not_enabled';
  else if (code === 'gemini_vertex_billing_disabled') diagnostic.failureClass = 'billing_disabled';
  else if (code === 'gemini_vertex_timeout') diagnostic.failureClass = 'timeout';
  else if (code === 'gemini_vertex_network_error') diagnostic.failureClass = 'network_error';
  else if (status === 400 && /schema|response.?mime|structured output/.test(message)) diagnostic.failureClass = 'invalid_request_schema';
  normalized.providerFailure = diagnostic;
  return normalized;
}

async function generateVertexGeminiContent({ client, model, contents, config } = {}) {
  try {
    return await client.models.generateContent({ model, contents, config });
  } catch (error) {
    throw createVertexGeminiError(error, model);
  }
}

module.exports = {
  createVertexGeminiClient,
  createVertexGeminiError,
  generateVertexGeminiContent,
  geminiResponseText,
  normalizeVertexConfig,
};
