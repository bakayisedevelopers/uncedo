'use strict';

const ACTIVE_RELAY_STATUSES = new Set([
  'accepted', 'driving', 'en_route', 'buying_resources', 'arrived', 'work_started',
]);

function isWhatsAppRelayRequestOpen(request = {}) {
  const status = String(request.status || '').trim().toLowerCase();
  return Boolean(request.helperAssignment?.helperId && ACTIVE_RELAY_STATUSES.has(status));
}

function isExpectedWhatsAppRelayRecipient({ senderRole, customerId, helperId, recipientIdentity = {} } = {}) {
  const sender = String(senderRole || '').trim().toLowerCase();
  const recipientRole = String(recipientIdentity.role || '').trim().toLowerCase();
  const recipientUid = String(recipientIdentity.linkedFirebaseUid || '').trim();
  const customer = String(customerId || '').trim();
  const helper = String(helperId || '').trim();
  if (sender === 'customer') return recipientRole === 'helper' && Boolean(helper && recipientUid === helper);
  if (sender === 'helper') {
    return recipientRole === 'customer' && Boolean(customer
      && (recipientUid === customer || String(recipientIdentity.guestPrincipalId || '').trim() === customer));
  }
  return false;
}

module.exports = { ACTIVE_RELAY_STATUSES, isExpectedWhatsAppRelayRecipient, isWhatsAppRelayRequestOpen };
