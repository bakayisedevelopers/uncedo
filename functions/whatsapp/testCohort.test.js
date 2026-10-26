'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getWhatsAppTestAllowlist,
  isWhatsAppRecipientAllowed,
  isWhatsAppTestModeEnabled,
  normalizeWhatsAppNumber,
} = require('./testCohort');

test('controlled testing defaults to deny and normalizes the allowlisted E.164 numbers', () => {
  assert.equal(isWhatsAppTestModeEnabled({}), true);
  assert.equal(isWhatsAppRecipientAllowed('+27820001111', {}), false);
  const env = { WHATSAPP_TEST_PHONE_ALLOWLIST: '+27 82 000 1111, 14155550123' };
  assert.deepEqual([...getWhatsAppTestAllowlist(env)].sort(), ['14155550123', '27820001111']);
  assert.equal(isWhatsAppRecipientAllowed('27820001111', env), true);
  assert.equal(isWhatsAppRecipientAllowed('27820001112', env), false);
});

test('only the explicit false flag opens the ordinary messaging cohort', () => {
  assert.equal(isWhatsAppTestModeEnabled({ WHATSAPP_TEST_MODE_ENABLED: 'false' }), false);
  assert.equal(isWhatsAppRecipientAllowed('+27820001111', { WHATSAPP_TEST_MODE_ENABLED: 'false' }), true);
  assert.equal(isWhatsAppRecipientAllowed('not-a-phone', { WHATSAPP_TEST_MODE_ENABLED: 'false' }), false);
  assert.equal(isWhatsAppTestModeEnabled({ WHATSAPP_TEST_MODE_ENABLED: '0' }), true);
});

test('invalid or ambiguous phone numbers never match the test allowlist', () => {
  assert.equal(normalizeWhatsAppNumber('123'), '');
  assert.equal(normalizeWhatsAppNumber('1234567890123456'), '');
  assert.equal(isWhatsAppRecipientAllowed('bad-number', { WHATSAPP_TEST_PHONE_ALLOWLIST: 'bad-number' }), false);
});
