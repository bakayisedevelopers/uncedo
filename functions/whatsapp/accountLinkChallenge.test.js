'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  WHATSAPP_ACCOUNT_LINK_TTL_MS,
  buildWhatsAppAccountLinkUrl,
  createWhatsAppAccountLinkChallenge,
  isWhatsAppAccountLinkChallengeLive,
} = require('./accountLinkChallenge');

test('account-link challenges store hashes, have a 24-hour lifetime, and never persist the opaque token', () => {
  const nowMs = 1_700_000_000_000;
  const result = createWhatsAppAccountLinkChallenge({
    uid: 'customer-1', role: 'customer', identityId: 'identity-1',
    phoneNumber: '+27600000001', sourceEventId: 'event-1', nowMs,
  });
  assert.match(result.token, /^[A-Za-z0-9_-]{40,60}$/);
  assert.match(result.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(result.tokenHash.includes(result.token), false);
  assert.equal(result.challenge.expiresAtMs, nowMs + WHATSAPP_ACCOUNT_LINK_TTL_MS);
  assert.equal(JSON.stringify(result.challenge).includes(result.token), false);
  assert.equal(isWhatsAppAccountLinkChallengeLive(result.challenge, nowMs), true);
  assert.equal(isWhatsAppAccountLinkChallengeLive(result.challenge, result.challenge.expiresAtMs), false);
});

test('account-link URL puts the opaque token in the URL fragment and requires HTTPS', () => {
  const result = createWhatsAppAccountLinkChallenge({ uid: 'helper-1', role: 'helper', identityId: 'id', phoneNumber: '+27600000001' });
  const url = new URL(buildWhatsAppAccountLinkUrl('https://helpers.example/whatsapp-link', result.token));
  assert.equal(url.pathname, '/whatsapp-link');
  assert.equal(url.search, '');
  assert.equal(new URLSearchParams(url.hash.slice(1)).get('wa_link_token'), result.token);
  assert.throws(() => buildWhatsAppAccountLinkUrl('http://helpers.example/whatsapp-link', result.token), /HTTPS/);
});

test('account-link challenges reject invalid roles and identities', () => {
  assert.throws(() => createWhatsAppAccountLinkChallenge({ uid: 'u', role: 'admin', identityId: 'i', phoneNumber: '+27600000001' }));
  assert.throws(() => createWhatsAppAccountLinkChallenge({ uid: 'u', role: 'customer', identityId: '', phoneNumber: '+27600000001' }));
  assert.throws(() => createWhatsAppAccountLinkChallenge({ uid: 'u', role: 'customer', identityId: 'i', phoneNumber: '0712345678' }));
});
