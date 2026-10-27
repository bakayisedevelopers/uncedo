'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  WHATSAPP_POLICY_ACCEPTANCE_VERSION,
  WHATSAPP_POLICY_URLS,
  buildWhatsAppPolicyConsent,
  hasCurrentWhatsAppPolicyAcceptance,
} = require('./policyConsent');

test('WhatsApp consent message links to the public terms and privacy pages without naming AI providers', () => {
  const consent = buildWhatsAppPolicyConsent();

  assert.match(consent.text, /Terms and Conditions/);
  assert.match(consent.text, new RegExp(WHATSAPP_POLICY_URLS.terms.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(consent.text, /Privacy Policy/);
  assert.match(consent.text, new RegExp(WHATSAPP_POLICY_URLS.privacy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(consent.text, /Choose Agree to accept these policies/);
  assert.doesNotMatch(consent.text, /AI|OpenAI|Gemini|model/i);
});

test('policy consent retains the existing deterministic Agree and No thanks button actions', () => {
  const { interactive } = buildWhatsAppPolicyConsent();

  assert.equal(interactive.type, 'button');
  assert.deepEqual(interactive.action.buttons.map(({ reply }) => ({ id: reply.id, title: reply.title })), [
    { id: 'wa_ai_consent_yes', title: 'Agree' },
    { id: 'wa_ai_consent_no', title: 'No thanks' },
  ]);
});

test('only an explicit acknowledgement of the current policy version opens WhatsApp assistance', () => {
  assert.equal(hasCurrentWhatsAppPolicyAcceptance({ aiConsentAtMs: 123 }), false);
  assert.equal(hasCurrentWhatsAppPolicyAcceptance({
    whatsappPolicyAcceptedAtMs: 123,
    whatsappPolicyAcceptedVersion: 'older-version',
  }), false);
  assert.equal(hasCurrentWhatsAppPolicyAcceptance({
    whatsappPolicyAcceptedAtMs: 123,
    whatsappPolicyAcceptedVersion: WHATSAPP_POLICY_ACCEPTANCE_VERSION,
  }), true);
});
