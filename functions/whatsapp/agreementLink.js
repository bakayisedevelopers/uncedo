'use strict';

function normalizeAgreementLinkToken(value) {
  const token = String(value || '').trim();
  return /^[A-Za-z0-9_-]{40,60}$/.test(token) ? token : '';
}

function validateAgreementLinkChallenge({ challenge = {}, uid = '', nowMs = Date.now() } = {}) {
  if (!uid || String(challenge.uid || '') !== String(uid)) return { valid: false, code: 'account-mismatch' };
  if (challenge.role !== 'helper') return { valid: false, code: 'role-mismatch' };
  if (Number(challenge.expiresAtMs || 0) <= nowMs) return { valid: false, code: 'expired' };
  if (!['pending', 'claimed', 'accepting', 'completed'].includes(String(challenge.status || ''))) return { valid: false, code: 'unavailable' };
  if (challenge.revokedAt) return { valid: false, code: 'revoked' };
  if (!challenge.identityId || !challenge.phoneHash) return { valid: false, code: 'invalid-challenge' };
  return { valid: true, code: 'valid' };
}

function buildHelperAgreementLink(baseUrl, token) {
  const safeToken = normalizeAgreementLinkToken(token);
  if (!safeToken) throw new Error('A valid agreement link token is required.');
  const url = new URL(String(baseUrl || ''));
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('The helper agreement page must use HTTPS.');
  url.hash = new URLSearchParams({ wa_agreement_token: safeToken }).toString();
  return url.toString();
}

function buildWhatsAppReturnUrl(phoneNumber = '', fallback = '27605239926') {
  const normalize = (value) => String(value || '').replace(/[^0-9]/g, '');
  const configured = normalize(phoneNumber);
  const defaultNumber = normalize(fallback);
  const number = configured.length >= 8 && configured.length <= 15
    ? configured
    : defaultNumber.length >= 8 && defaultNumber.length <= 15 ? defaultNumber : '';
  return number ? `https://wa.me/${number}` : '';
}

module.exports = { buildHelperAgreementLink, buildWhatsAppReturnUrl, normalizeAgreementLinkToken, validateAgreementLinkChallenge };
