'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { selectUniqueVerifiedWhatsAppAccount } = require('./accountResolution');

test('only uniquely matched, server-verified customer/helper phone records auto-resolve', () => {
  assert.deepEqual(selectUniqueVerifiedWhatsAppAccount([{
    uid: 'customer-1', authPhone: '+27600000001', authPhoneVerified: true,
    profile: { role: 'customer' },
  }], '+27600000001'), { uid: 'customer-1', role: 'customer' });
});

test('unverified editable profile phone numbers do not auto-link accounts', () => {
  assert.equal(selectUniqueVerifiedWhatsAppAccount([{
    uid: 'customer-1', profile: { role: 'customer', phoneNumber: '+27600000001' },
  }], '+27600000001'), null);
});

test('duplicate verified matches and mixed-role profiles are not auto-linked', () => {
  const record = { authPhone: '+27600000001', authPhoneVerified: true, profile: { role: 'helper' } };
  assert.equal(selectUniqueVerifiedWhatsAppAccount([{ ...record, uid: 'one' }, { ...record, uid: 'two' }], '+27600000001'), null);
  assert.equal(selectUniqueVerifiedWhatsAppAccount([{
    uid: 'mixed', authPhone: '+27600000001', authPhoneVerified: true,
    profile: { role: 'customer', roles: ['customer', 'helper'] },
  }], '+27600000001'), null);
});

test('verified Firestore phone fields are accepted only with a protected verification marker', () => {
  assert.deepEqual(selectUniqueVerifiedWhatsAppAccount([{
    uid: 'helper-1', profile: {
      role: 'helper', phoneNumber: '+27600000001',
      phoneNumberVerified: true, phoneNumberVerifiedAt: 1730000000000,
    },
  }], '+27600000001'), { uid: 'helper-1', role: 'helper' });
});
