'use strict';

function normalizeWhatsAppNumber(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  return digits.length >= 8 && digits.length <= 15 ? digits : '';
}

function isWhatsAppTestModeEnabled(env = process.env) {
  // Test mode is fail-closed unless an operator explicitly disables it after
  // a controlled cohort has completed.
  return String(env.WHATSAPP_TEST_MODE_ENABLED || 'true').trim().toLowerCase() !== 'false';
}

function getWhatsAppTestAllowlist(env = process.env) {
  return new Set(String(env.WHATSAPP_TEST_PHONE_ALLOWLIST || '')
    .split(/[,;\r\n]+/)
    .map(normalizeWhatsAppNumber)
    .filter(Boolean));
}

function isWhatsAppRecipientAllowed(phone, env = process.env) {
  const normalized = normalizeWhatsAppNumber(phone);
  if (!normalized) return false;
  if (!isWhatsAppTestModeEnabled(env)) return true;
  return getWhatsAppTestAllowlist(env).has(normalized);
}

module.exports = {
  getWhatsAppTestAllowlist,
  isWhatsAppRecipientAllowed,
  isWhatsAppTestModeEnabled,
  normalizeWhatsAppNumber,
};
