'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getWhatsAppSignupUrl,
  getWhatsAppAccountLinkUrl,
  getWhatsAppHelperAgreementUrl,
} = require('./signupLinks');

test('WhatsApp signup links use the customer and helper custom domains', () => {
  assert.equal(getWhatsAppSignupUrl({ role: 'customer' }).toString(), 'https://uncedo.bakayise.com/sign-up?source=whatsapp');
  assert.equal(getWhatsAppSignupUrl({ role: 'helper' }).toString(), 'https://helpers.bakayise.com/sign-up?source=whatsapp');
});

test('existing-account WhatsApp links use sign-in on the role-specific domain', () => {
  assert.equal(getWhatsAppSignupUrl({ role: 'customer', mode: 'signin' }).toString(), 'https://uncedo.bakayise.com/sign-in?source=whatsapp');
  assert.equal(getWhatsAppSignupUrl({ role: 'helper', mode: 'signin' }).toString(), 'https://helpers.bakayise.com/sign-in?source=whatsapp');
});

test('WhatsApp account verification pages use the role-specific custom domain', () => {
  assert.equal(getWhatsAppAccountLinkUrl({ role: 'customer' }).toString(), 'https://uncedo.bakayise.com/whatsapp-link');
  assert.equal(getWhatsAppAccountLinkUrl({ role: 'helper' }).toString(), 'https://helpers.bakayise.com/whatsapp-link');
});

test('WhatsApp helper agreement uses the helper custom domain', () => {
  assert.equal(getWhatsAppHelperAgreementUrl(), 'https://helpers.bakayise.com/sign-agreement');
});

test('configured account URLs retain their host while selecting the correct route', () => {
  const url = getWhatsAppSignupUrl({
    role: 'helper',
    mode: 'signin',
    env: { WHATSAPP_HELPER_SIGNUP_URL: 'https://custom.example/start?tenant=helper' },
  });
  assert.equal(url.origin, 'https://custom.example');
  assert.equal(url.pathname, '/sign-in');
  assert.equal(url.searchParams.get('tenant'), 'helper');
  assert.equal(url.searchParams.get('source'), 'whatsapp');
});

test('WhatsApp account URLs reject unsupported roles, modes, and insecure schemes', () => {
  assert.throws(() => getWhatsAppSignupUrl({ role: 'admin' }), /role/);
  assert.throws(() => getWhatsAppSignupUrl({ role: 'helper', mode: 'register' }), /mode/);
  assert.throws(() => getWhatsAppSignupUrl({ role: 'helper', env: { WHATSAPP_HELPER_SIGNUP_URL: 'http://example.test/sign-up' } }), /HTTPS/);
  assert.throws(() => getWhatsAppHelperAgreementUrl({ env: { WHATSAPP_HELPER_AGREEMENT_URL: 'http://example.test/sign-agreement' } }), /HTTPS/);
});
