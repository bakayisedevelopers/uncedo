'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isExpectedWhatsAppRelayRecipient, isWhatsAppRelayRequestOpen } = require('./relayAuthorization');

test('request-scoped relay requires an active assigned request', () => {
  assert.equal(isWhatsAppRelayRequestOpen({ status: 'work_started', helperAssignment: { helperId: 'helper-1' } }), true);
  assert.equal(isWhatsAppRelayRequestOpen({ status: 'completed', helperAssignment: { helperId: 'helper-1' } }), false);
  assert.equal(isWhatsAppRelayRequestOpen({ status: 'accepted', helperAssignment: null }), false);
});

test('relay recipients must be the exact linked customer or helper on the current request', () => {
  assert.equal(isExpectedWhatsAppRelayRecipient({
    senderRole: 'customer', customerId: 'customer-1', helperId: 'helper-1',
    recipientIdentity: { role: 'helper', linkedFirebaseUid: 'helper-1' },
  }), true);
  assert.equal(isExpectedWhatsAppRelayRecipient({
    senderRole: 'customer', customerId: 'customer-1', helperId: 'helper-1',
    recipientIdentity: { role: 'helper', linkedFirebaseUid: 'helper-2' },
  }), false);
  assert.equal(isExpectedWhatsAppRelayRecipient({
    senderRole: 'helper', customerId: 'customer-1', helperId: 'helper-1',
    recipientIdentity: { role: 'customer', linkedFirebaseUid: 'customer-1' },
  }), true);
  assert.equal(isExpectedWhatsAppRelayRecipient({
    senderRole: 'helper', customerId: 'guest_principal', helperId: 'helper-1',
    recipientIdentity: { role: 'customer', guestPrincipalId: 'guest_principal' },
  }), true);
  assert.equal(isExpectedWhatsAppRelayRecipient({
    senderRole: 'helper', customerId: 'customer-1', helperId: 'helper-1',
    recipientIdentity: { role: 'helper', linkedFirebaseUid: 'helper-1' },
  }), false);
});
