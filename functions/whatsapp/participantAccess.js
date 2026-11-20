'use strict';

function canAccessWhatsAppRequest({ request = {}, identity = {}, guestOwnerUid = '' } = {}) {
  const rawRole = String(identity.role || '').trim().toLowerCase();
  const role = (!rawRole || rawRole === 'guest') && identity.guestPrincipalId ? 'customer' : rawRole;
  const uid = String(identity.linkedFirebaseUid || '').trim();
  const customerId = String(request.customerId || '').trim();
  const helperId = String(request.helperAssignment?.helperId || '').trim();

  if (role === 'helper') return Boolean(uid && helperId && helperId === uid);
  if (role !== 'customer') return false;
  return Boolean(customerId && (
    (uid && customerId === uid)
    || (identity.guestPrincipalId && customerId === String(identity.guestPrincipalId))
    || (uid && guestOwnerUid && guestOwnerUid === uid)
  ));
}

module.exports = { canAccessWhatsAppRequest };
