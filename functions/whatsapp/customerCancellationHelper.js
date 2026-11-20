'use strict';

const { isCustomerCancellableStatus } = require('../serviceRequestCancellation');
const { canAccessWhatsAppRequest } = require('./participantAccess');
const { getWhatsAppRequestForIdentity, listWhatsAppRequests, validRequestId } = require('./requestAccessService');

function timestampMs(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function normalizeStatus(request = {}) {
  return String(request?.status || '').trim().toLowerCase();
}

function normalizeExtraCustomerIds(userRecord = {}) {
  return [...new Set(
    (Array.isArray(userRecord?.whatsappGuestPrincipalIds) ? userRecord.whatsappGuestPrincipalIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  )];
}

async function resolveExtraCustomerIdsForIdentity({ db, callerIdentity = {} } = {}) {
  const uid = String(callerIdentity.linkedFirebaseUid || '').trim();
  if (!db || !uid) return [];
  const userSnap = await db.collection('users').doc(uid).get().catch(() => null);
  return userSnap?.exists ? normalizeExtraCustomerIds(userSnap.data() || {}) : [];
}

function matchesRequestedReference(request = {}, rawQuery = '') {
  const normalized = String(rawQuery || '').trim();
  if (!normalized) return false;
  const upper = normalized.toUpperCase();
  const docId = String(request.id || '').trim();
  const publicRef = String(request.publicRequestReference || '').trim().toUpperCase();
  return docId === normalized || docId.toUpperCase() === upper || (publicRef && publicRef === upper);
}

async function findCustomerCancellationTarget({
  db,
  callerIdentity = {},
  conversation = {},
  requestedId = '',
} = {}) {
  if (!db || !callerIdentity) return { kind: 'not-found', extraCustomerIds: [] };
  const rawRole = String(callerIdentity.role || '').trim().toLowerCase();
  if (rawRole === 'helper') {
    return { kind: 'customer-role-required', extraCustomerIds: [] };
  }

  const searchIdentity = { ...callerIdentity, role: 'customer' };
  const extraCustomerIds = await resolveExtraCustomerIdsForIdentity({ db, callerIdentity });
  const normalizedRequestedId = String(requestedId || '').trim();

  const activeDraftId = String(conversation?.activeDraftId || '').trim();
  const activeDraftRef = activeDraftId ? db.collection('whatsappServiceDrafts').doc(activeDraftId) : null;
  const activeDraftSnap = activeDraftRef ? await activeDraftRef.get().catch(() => null) : null;
  const activeDraft = activeDraftSnap?.exists ? { id: activeDraftSnap.id, ...(activeDraftSnap.data() || {}) } : null;

  const history = await listWhatsAppRequests({
    db,
    identity: searchIdentity,
    extraCustomerIds,
    perPrincipalLimit: 25,
    resultLimit: 12,
  }).catch(() => []);

  const byId = new Map();
  for (const item of history) {
    if (item?.id) byId.set(item.id, item);
  }

  const directCandidateIds = [
    String(conversation?.activeServiceRequestId || '').trim(),
    String(activeDraft?.requestId || '').trim(),
  ].filter(Boolean);

  for (const candidateId of directCandidateIds) {
    if (byId.has(candidateId) || !validRequestId(candidateId)) continue;
    const access = await getWhatsAppRequestForIdentity({
      db,
      identity: searchIdentity,
      extraCustomerIds,
      requestId: candidateId,
    }).catch(() => null);
    if (access?.code === 'found' && access.request) {
      byId.set(access.request.id, access.request);
    }
  }

  const allCandidates = [...byId.values()].sort(
    (left, right) => timestampMs(right.createdAtMs ?? right.createdAt) - timestampMs(left.createdAtMs ?? left.createdAt),
  );

  if (normalizedRequestedId) {
    let matched = allCandidates.find((item) => matchesRequestedReference(item, normalizedRequestedId)) || null;
    if (!matched && validRequestId(normalizedRequestedId)) {
      const direct = await getWhatsAppRequestForIdentity({
        db,
        identity: searchIdentity,
        extraCustomerIds,
        requestId: normalizedRequestedId,
      }).catch(() => null);
      if (direct?.code === 'found' && direct.request) {
        matched = direct.request;
      } else if (direct?.code === 'forbidden') {
        return { kind: 'forbidden', extraCustomerIds, activeDraft, activeDraftRef };
      }
    }
    if (!matched) {
      return { kind: 'not-found', requestedId: normalizedRequestedId, extraCustomerIds, activeDraft, activeDraftRef };
    }
    if (isCustomerCancellableStatus(matched.status)) {
      return { kind: 'eligible', request: matched, extraCustomerIds, activeDraft, activeDraftRef };
    }
    return { kind: 'terminal', request: matched, extraCustomerIds, activeDraft, activeDraftRef };
  }

  for (const preferredId of directCandidateIds) {
    const preferred = byId.get(preferredId);
    if (preferred && isCustomerCancellableStatus(preferred.status)) {
      return { kind: 'eligible', request: preferred, extraCustomerIds, activeDraft, activeDraftRef };
    }
  }

  const newestActive = allCandidates.find((item) => isCustomerCancellableStatus(item.status)) || null;
  if (newestActive) {
    return { kind: 'eligible', request: newestActive, extraCustomerIds, activeDraft, activeDraftRef };
  }

  if (activeDraft && ['collecting', 'quoted', 'awaiting_service_option'].includes(String(activeDraft.status || '').toLowerCase())) {
    return { kind: 'draft-only', activeDraft, activeDraftRef, extraCustomerIds };
  }

  const newestClosed = allCandidates[0] || null;
  if (newestClosed && ['canceled', 'cancelled', 'completed'].includes(normalizeStatus(newestClosed))) {
    return { kind: 'terminal', request: newestClosed, extraCustomerIds, activeDraft, activeDraftRef };
  }

  return { kind: 'no-active-request', extraCustomerIds, activeDraft, activeDraftRef };
}

function isRequestAuthorizedForCaller({ request = {}, callerIdentity = {}, extraCustomerIds = [] } = {}) {
  const searchIdentity = { ...callerIdentity, role: 'customer' };
  const uid = String(callerIdentity.linkedFirebaseUid || '').trim();
  const customerId = String(request.customerId || '').trim();
  const guestOwnerUid = uid && customerId && Array.isArray(extraCustomerIds) && extraCustomerIds.includes(customerId)
    ? uid
    : '';
  return canAccessWhatsAppRequest({ request, identity: searchIdentity, guestOwnerUid });
}

module.exports = {
  findCustomerCancellationTarget,
  isRequestAuthorizedForCaller,
  matchesRequestedReference,
  normalizeExtraCustomerIds,
  resolveExtraCustomerIdsForIdentity,
};
