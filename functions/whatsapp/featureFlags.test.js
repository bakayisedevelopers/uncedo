'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isWhatsAppCancellationEnabled,
  isWhatsAppImageInterpretationEnabled,
  isWhatsAppMediaEnabled,
  isWhatsAppMessagingEnabled,
  isWhatsAppTranscriptionEnabled,
} = require('./featureFlags');

test('WhatsApp messaging stays disabled unless explicitly enabled', () => {
  assert.equal(isWhatsAppMessagingEnabled({}), false);
  assert.equal(isWhatsAppMessagingEnabled({ WHATSAPP_MESSAGING_ENABLED: 'false' }), false);
  assert.equal(isWhatsAppMessagingEnabled({ WHATSAPP_MESSAGING_ENABLED: 'TRUE' }), true);
});

test('media and transcription stay disabled unless both messaging and their own flags are enabled', () => {
  assert.equal(isWhatsAppMediaEnabled({ WHATSAPP_MEDIA_ENABLED: 'true' }), false);
  assert.equal(isWhatsAppTranscriptionEnabled({ WHATSAPP_MESSAGING_ENABLED: 'true', WHATSAPP_MEDIA_ENABLED: 'true' }), false);
  const enabled = { WHATSAPP_MESSAGING_ENABLED: 'true', WHATSAPP_MEDIA_ENABLED: 'true', WHATSAPP_TRANSCRIPTION_ENABLED: 'true' };
  assert.equal(isWhatsAppMediaEnabled(enabled), true);
  assert.equal(isWhatsAppTranscriptionEnabled(enabled), true);
});

test('image interpretation and cancellation each require their parent feature flags', () => {
  assert.equal(isWhatsAppImageInterpretationEnabled({ WHATSAPP_IMAGE_INTERPRETATION_ENABLED: 'true' }), false);
  assert.equal(isWhatsAppCancellationEnabled({ WHATSAPP_CANCELLATION_ENABLED: 'true' }), false);
  const imageFlags = {
    WHATSAPP_MESSAGING_ENABLED: 'true', WHATSAPP_MEDIA_ENABLED: 'true',
    WHATSAPP_AI_ENABLED: 'true', WHATSAPP_IMAGE_INTERPRETATION_ENABLED: 'true',
  };
  assert.equal(isWhatsAppImageInterpretationEnabled(imageFlags), true);
  assert.equal(isWhatsAppCancellationEnabled({ WHATSAPP_MESSAGING_ENABLED: 'true', WHATSAPP_CANCELLATION_ENABLED: 'true' }), true);
});
