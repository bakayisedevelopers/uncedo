'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildHelperAgreementLink, buildWhatsAppReturnUrl, normalizeAgreementLinkToken, validateAgreementLinkChallenge } = require('./agreementLink');

const token = 'a'.repeat(43);

test('agreement link token is opaque, validated, and placed only in the URL fragment', () => {
  assert.equal(normalizeAgreementLinkToken(token), token);
  assert.equal(normalizeAgreementLinkToken('short'), '');
  const link = buildHelperAgreementLink('https://helpers.example/sign-agreement', token);
  const url = new URL(link);
  assert.equal(url.search, '');
  assert.equal(new URLSearchParams(url.hash.slice(1)).get('wa_agreement_token'), token);
  assert.throws(() => buildHelperAgreementLink('http://helpers.example/sign-agreement', token), /HTTPS/);
});

test('agreement challenge is restricted to the linked helper account and expiry', () => {
  const challenge = { uid: 'helper-1', role: 'helper', identityId: 'identity-1', phoneHash: 'hash', expiresAtMs: 5000, status: 'pending' };
  assert.deepEqual(validateAgreementLinkChallenge({ challenge, uid: 'helper-1', nowMs: 1000 }), { valid: true, code: 'valid' });
  assert.equal(validateAgreementLinkChallenge({ challenge, uid: 'other', nowMs: 1000 }).code, 'account-mismatch');
  assert.equal(validateAgreementLinkChallenge({ challenge: { ...challenge, role: 'customer' }, uid: 'helper-1', nowMs: 1000 }).code, 'role-mismatch');
  assert.equal(validateAgreementLinkChallenge({ challenge, uid: 'helper-1', nowMs: 5000 }).code, 'expired');
  assert.equal(validateAgreementLinkChallenge({ challenge: { ...challenge, revokedAt: 1 }, uid: 'helper-1', nowMs: 1000 }).code, 'revoked');
});

test('post-acceptance return link opens the business WhatsApp chat without a prefilled message', () => {
  assert.equal(buildWhatsAppReturnUrl(' +27 (60) 523-9926 '), 'https://wa.me/27605239926');
  assert.equal(buildWhatsAppReturnUrl(''), 'https://wa.me/27605239926');
  assert.equal(buildWhatsAppReturnUrl('', 'invalid'), '');
});
