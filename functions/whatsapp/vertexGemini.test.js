'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { safeProviderFailures } = require('./aiProviderDiagnostics');
const { createVertexGeminiClient, createVertexGeminiError, geminiResponseText, normalizeVertexConfig } = require('./vertexGemini');

test('Vertex Gemini client uses project ADC, global location, bounded timeout, and no retry', () => {
  let options;
  class FakeGoogleGenAI {
    constructor(value) { options = value; }
  }
  const client = createVertexGeminiClient({
    projectId: 'uncedo-test-123',
    GoogleGenAIClass: FakeGoogleGenAI,
  });
  assert.ok(client instanceof FakeGoogleGenAI);
  assert.deepEqual(options, {
    vertexai: true,
    project: 'uncedo-test-123',
    location: 'global',
    httpOptions: { timeout: 15_000, retryOptions: { attempts: 1 } },
  });
  assert.equal(Object.hasOwn(options, 'apiKey'), false);
});

test('Vertex project and location configuration are validated without requiring an API key', () => {
  assert.deepEqual(normalizeVertexConfig({ projectId: 'uncedo-test-123' }), {
    projectId: 'uncedo-test-123', location: 'global', timeoutMs: 15_000,
  });
  assert.throws(() => createVertexGeminiClient({ projectId: '' }), { code: 'gemini_vertex_project_missing' });
  assert.throws(() => normalizeVertexConfig({ projectId: 'uncedo-test-123', location: 'bad/region' }), { code: 'gemini_vertex_location_invalid' });
});

test('Vertex provider errors expose a safe code and diagnostic, not provider request details', () => {
  const error = createVertexGeminiError(Object.assign(new Error('private request content; responseSchema was invalid'), { status: 400 }), 'gemini-3.5-flash-lite');
  assert.equal(error.code, 'gemini_vertex_http_400');
  assert.equal(error.message, 'Gemini Agent Platform request failed.');
  assert.deepEqual(safeProviderFailures([error])[0], {
    provider: 'gemini', httpStatus: 400, model: 'gemini-3.5-flash-lite', failureClass: 'invalid_request_schema',
  });
  assert.doesNotMatch(`${error.message} ${JSON.stringify(error.providerFailure)}`, /private request|responseSchema/i);

  const disabled = createVertexGeminiError(new Error('Vertex API has not been used in project 123 before or it is disabled'), 'gemini-3.5-flash-lite');
  assert.equal(disabled.code, 'gemini_vertex_service_disabled');
  assert.equal(safeProviderFailures([disabled])[0].failureClass, 'service_not_enabled');
  assert.doesNotMatch(`${disabled.message} ${JSON.stringify(disabled.providerFailure)}`, /123/);
});

test('Vertex response text helper reads SDK text or candidate text parts', () => {
  assert.equal(geminiResponseText({ text: '{"ok":true}' }), '{"ok":true}');
  assert.equal(geminiResponseText({ candidates: [{ content: { parts: [{ text: 'answer' }, { text: '!' }] } }] }), 'answer!');
  assert.equal(geminiResponseText({}), '');
});
