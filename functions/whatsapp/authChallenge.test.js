'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  constantTimeHashMatch,
  generateWhatsAppOtp,
  hashWhatsAppOtp,
  normalizeWhatsAppAuthInput,
  profileAllowsRole,
} = require('./authChallenge');

test('normalizes a WhatsApp authentication signup request', () => {
  assert.deepEqual(normalizeWhatsAppAuthInput({
    phoneNumber: '+27 71 234 5678',
    role: 'customer',
    mode: 'signup',
    name: '  Jane Doe ',
    email: ' JANE@example.com ',
  }), {
    phoneNumber: '+27712345678',
    role: 'customer',
    mode: 'signup',
    name: 'Jane Doe',
    email: 'jane@example.com',
  });
});

test('rejects invalid numbers, roles and incomplete registrations', () => {
  assert.throws(() => normalizeWhatsAppAuthInput({ phoneNumber: '0712345678', role: 'customer', mode: 'login' }), { code: 'invalid-phone' });
  assert.throws(() => normalizeWhatsAppAuthInput({ phoneNumber: '+27712345678', role: 'admin', mode: 'login' }), { code: 'invalid-role' });
  assert.throws(() => normalizeWhatsAppAuthInput({ phoneNumber: '+27712345678', role: 'helper', mode: 'signup', name: 'Test' }), { code: 'invalid-registration' });
});

test('generates a six digit code and stores only a keyed digest', () => {
  assert.equal(generateWhatsAppOtp(() => 7), '000007');
  const one = hashWhatsAppOtp({ challengeId: 'challenge-1', code: '123456', secret: 'test-secret' });
  const same = hashWhatsAppOtp({ challengeId: 'challenge-1', code: '123456', secret: 'test-secret' });
  const otherChallenge = hashWhatsAppOtp({ challengeId: 'challenge-2', code: '123456', secret: 'test-secret' });
  assert.equal(constantTimeHashMatch(one, same), true);
  assert.equal(constantTimeHashMatch(one, otherChallenge), false);
  assert.equal(constantTimeHashMatch(one, 'not-a-hash'), false);
});

test('checks the existing profile role before returning an account', () => {
  assert.equal(profileAllowsRole({ roles: ['customer'] }, 'customer'), true);
  assert.equal(profileAllowsRole({ role: 'helper' }, 'customer'), false);
  assert.equal(profileAllowsRole({ activeRole: 'provider' }, 'helper'), true);
});
