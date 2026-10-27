'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  selectUniqueVerifiedWhatsAppAccount,
  selectUniqueWhatsAppAccountCandidate,
} = require('./accountResolution');

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

test('an unverified signup phone can identify one account for a possession-link challenge without auto-linking', () => {
  const records = [{ uid: 'customer-2', profile: { role: 'customer', phoneNumber: '+27 60 000 0002' } }];
  assert.deepEqual(selectUniqueWhatsAppAccountCandidate(records, '+27600000002'), { uid: 'customer-2', role: 'customer' });
  assert.equal(selectUniqueVerifiedWhatsAppAccount(records, '+27600000002'), null);
});

test('multiple profile matches, mixed roles, and conflicting Auth phone claims are never link candidates', () => {
  const a = { uid: 'one', profile: { role: 'customer', phoneNumber: '+27600000003' } };
  const b = { uid: 'two', profile: { role: 'helper', phoneNumber: '+27600000003' } };
  assert.equal(selectUniqueWhatsAppAccountCandidate([a, b], '+27600000003'), null);
  assert.equal(selectUniqueWhatsAppAccountCandidate([{
    uid: 'mixed', profile: { role: 'customer', roles: ['customer', 'helper'], phoneNumber: '+27600000003' },
  }], '+27600000003'), null);
  assert.equal(selectUniqueWhatsAppAccountCandidate([{
    uid: 'conflict', authPhone: '+27600000004', profile: { role: 'customer', phoneNumber: '+27600000003' },
  }], '+27600000003'), null);
});
