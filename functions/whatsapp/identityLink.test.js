'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  buildWhatsAppGuestPrincipalId,
  buildWhatsAppIdentityId,
  normalizeWhatsAppIdentityPhone,
} = require('./identityLink');

const stableEventId = (value) => createHash('sha256').update(value).digest('hex');

test('WhatsApp identity IDs are deterministic per Meta sender and verified phone', () => {
  const first = buildWhatsAppIdentityId({ phoneNumberId: 'meta-sender', phoneNumber: '+27 71 234 5678', stableEventId });
  const second = buildWhatsAppIdentityId({ phoneNumberId: 'meta-sender', phoneNumber: '+27712345678', stableEventId });
  const otherSender = buildWhatsAppIdentityId({ phoneNumberId: 'other-sender', phoneNumber: '+27712345678', stableEventId });
  assert.equal(first, second);
  assert.notEqual(first, otherSender);
  assert.equal(buildWhatsAppGuestPrincipalId(first), `guest_${first}`);
});

test('identity linking requires a valid international number', () => {
  assert.deepEqual(normalizeWhatsAppIdentityPhone('+27 (71) 234-5678'), {
    phoneNumber: '+27712345678', waId: '27712345678',
  });
  assert.throws(() => normalizeWhatsAppIdentityPhone('0712345678'), { code: 'invalid-phone' });
});
