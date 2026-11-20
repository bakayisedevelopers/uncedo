'use strict';

const { canAccessWhatsAppRequest } = require('./participantAccess');

function timestampMs(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function validRequestId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{6,128}$/.test(id) ? id : '';
}

function normalizeRequestAccessRole(identity = {}) {
  const rawRole = String(identity.role || '').trim().toLowerCase();
  return (!rawRole || rawRole === 'guest') && identity.guestPrincipalId ? 'customer' : rawRole;
}

async function getWhatsAppRequestForIdentity({ db, identity = {}, extraCustomerIds = [], requestId } = {}) {
  const safeRequestId = validRequestId(requestId);
  if (!db || !safeRequestId) return { code: 'invalid-request' };
  const snapshot = await db.collection('serviceRequests').doc(safeRequestId).get();
  if (!snapshot.exists) return { code: 'not-found' };

  const request = { id: snapshot.id, ...(snapshot.data() || {}) };
  const customerId = String(request.customerId || '').trim();
  const normalizedExtraIds = (Array.isArray(extraCustomerIds) ? extraCustomerIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  let guestOwnerUid = '';
  if (customerId.startsWith('guest_') && identity.linkedFirebaseUid) {
    if (normalizedExtraIds.includes(customerId)) {
      guestOwnerUid = String(identity.linkedFirebaseUid || '').trim();
    } else {
      const ownerSnapshot = await db.collection('whatsappGuestOwnership').doc(customerId).get();
      guestOwnerUid = String(ownerSnapshot.data()?.uid || '').trim();
    }
  }
  if (!canAccessWhatsAppRequest({ request, identity, guestOwnerUid })) return { code: 'forbidden' };
  return { code: 'found', request };
}

async function listWhatsAppRequests({ db, identity = {}, extraCustomerIds = [], perPrincipalLimit = 25, resultLimit = 5 } = {}) {
  if (!db) return [];
  const role = normalizeRequestAccessRole(identity);
  const uid = String(identity.linkedFirebaseUid || '').trim();
  const guestPrincipalId = String(identity.guestPrincipalId || '').trim();
  const principalIds = new Set();
  const queries = [];

  if (role === 'customer') {
    if (uid) principalIds.add(uid);
    if (guestPrincipalId) principalIds.add(guestPrincipalId);
    for (const extraId of Array.isArray(extraCustomerIds) ? extraCustomerIds : []) {
      const trimmed = String(extraId || '').trim();
      if (trimmed) principalIds.add(trimmed);
    }
    for (const customerId of principalIds) {
      queries.push(db.collection('serviceRequests')
        .where('customerId', '==', customerId)
        .orderBy('createdAt', 'desc')
        .limit(perPrincipalLimit).get());
    }
  } else if (role === 'helper' && uid) {
    queries.push(db.collection('serviceRequests')
      .where('helperAssignment.helperId', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(perPrincipalLimit).get());
  } else {
    return [];
  }

  const snapshots = await Promise.all(queries);
  const byId = new Map();
  for (const querySnapshot of snapshots) {
    for (const document of querySnapshot.docs || []) {
      if (!byId.has(document.id)) byId.set(document.id, { id: document.id, ...(document.data() || {}) });
    }
  }

  return [...byId.values()]
    .sort((left, right) => timestampMs(right.createdAtMs ?? right.createdAt) - timestampMs(left.createdAtMs ?? left.createdAt))
    .slice(0, Math.max(1, Math.min(25, Number(resultLimit) || 5)));
}

module.exports = { getWhatsAppRequestForIdentity, listWhatsAppRequests, validRequestId };
