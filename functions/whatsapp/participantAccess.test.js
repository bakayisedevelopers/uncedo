'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canAccessWhatsAppRequest } = require('./participantAccess');

test('guest customer can access only a request owned by the current guest principal', () => {
  const identity = { guestPrincipalId: 'guest_current' };
  assert.equal(canAccessWhatsAppRequest({ request: { customerId: 'guest_current' }, identity }), true);
  assert.equal(canAccessWhatsAppRequest({ request: { customerId: 'guest_previous' }, identity }), false);
});

test('linked customer can access own Firebase requests and verified linked guest history', () => {
  const identity = { role: 'customer', linkedFirebaseUid: 'customer-1', guestPrincipalId: 'guest-1' };
  assert.equal(canAccessWhatsAppRequest({ request: { customerId: 'customer-1' }, identity }), true);
  assert.equal(canAccessWhatsAppRequest({ request: { customerId: 'guest-1' }, identity }), true);
  assert.equal(canAccessWhatsAppRequest({ request: { customerId: 'guest-2' }, identity, guestOwnerUid: 'customer-1' }), true);
  assert.equal(canAccessWhatsAppRequest({ request: { customerId: 'customer-2' }, identity }), false);
});

test('helper can access only requests assigned to that helper', () => {
  const identity = { role: 'helper', linkedFirebaseUid: 'helper-1' };
  assert.equal(canAccessWhatsAppRequest({ request: { customerId: 'customer-1', helperAssignment: { helperId: 'helper-1' } }, identity }), true);
  assert.equal(canAccessWhatsAppRequest({ request: { helperAssignment: { helperId: 'helper-2' } }, identity }), false);
  assert.equal(canAccessWhatsAppRequest({ request: { helperAssignment: { helperId: 'helper-1' } }, identity: { ...identity, role: 'customer' } }), false);
});
