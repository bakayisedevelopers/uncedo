'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { transcribeWhatsAppAudio } = require('./transcription');

test('voice transcription sends audio to the configured provider and bounds returned text', async () => {
  let call;
  const text = await transcribeWhatsAppAudio({
    buffer: Buffer.from('fake audio fixture'), mimeType: 'audio/ogg', apiKey: 'test-key', model: 'gpt-4o-mini-transcribe',
    fetchImpl: async (url, options) => {
      call = { url, options };
      return { ok: true, json: async () => ({ text: `  Need a car wash.\u0000${'x'.repeat(9000)}` }) };
    },
  });
  assert.match(call.url, /audio\/transcriptions$/);
  assert.equal(call.options.headers.Authorization, 'Bearer test-key');
  assert.equal(call.options.body.get('model'), 'gpt-4o-mini-transcribe');
  assert.equal(text.length, 8000);
  assert.doesNotMatch(text, /\u0000/);
});

test('transcription fails closed without explicit configuration or a usable response', async () => {
  await assert.rejects(transcribeWhatsAppAudio({ buffer: Buffer.from('audio'), mimeType: 'audio/ogg' }), /not configured/);
  await assert.rejects(transcribeWhatsAppAudio({
    buffer: Buffer.from('audio'), mimeType: 'audio/ogg', apiKey: 'test', model: 'configured-model',
    fetchImpl: async () => ({ ok: true, json: async () => ({ text: '' }) }),
  }), /no usable text/);
});
