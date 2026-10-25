'use strict';

function isWhatsAppMessagingEnabled(env = process.env) {
  return String(env.WHATSAPP_MESSAGING_ENABLED || '').trim().toLowerCase() === 'true';
}

function isWhatsAppMediaEnabled(env = process.env) {
  return isWhatsAppMessagingEnabled(env)
    && String(env.WHATSAPP_MEDIA_ENABLED || '').trim().toLowerCase() === 'true';
}

function isWhatsAppTranscriptionEnabled(env = process.env) {
  return isWhatsAppMediaEnabled(env)
    && String(env.WHATSAPP_TRANSCRIPTION_ENABLED || '').trim().toLowerCase() === 'true';
}

function isWhatsAppImageInterpretationEnabled(env = process.env) {
  return isWhatsAppMediaEnabled(env)
    && String(env.WHATSAPP_AI_ENABLED || '').trim().toLowerCase() === 'true'
    && String(env.WHATSAPP_IMAGE_INTERPRETATION_ENABLED || '').trim().toLowerCase() === 'true';
}

function isWhatsAppCancellationEnabled(env = process.env) {
  return isWhatsAppMessagingEnabled(env)
    && String(env.WHATSAPP_CANCELLATION_ENABLED || '').trim().toLowerCase() === 'true';
}

module.exports = {
  isWhatsAppCancellationEnabled,
  isWhatsAppImageInterpretationEnabled,
  isWhatsAppMediaEnabled,
  isWhatsAppMessagingEnabled,
  isWhatsAppTranscriptionEnabled,
};
