'use strict';

const {
  buildDeclinedOfferLists,
  evaluateOfferResponse,
  normalizeRevision,
  normalizeTimestamp,
} = require('./serviceRequestOfferLogic');

/**
 * The canonical offer response operation used by authenticated app requests and
 * WhatsApp actions. All assignment state changes happen in one Firestore
 * transaction so the two channels safely compete for the same offer.
 */
function createServiceRequestOfferOperations({ db, admin, isHelperUserRecord, acceptedStatus = 'accepted', matchingStatus = 'matching' }) {
  if (!db || !admin || typeof isHelperUserRecord !== 'function') {
    throw new Error('Firestore, Firebase Admin, and helper validation are required.');
  }

  async function respond({ requestId, helperId, offerToken, offerRevision, action, now = Date.now() } = {}) {
    const normalizedRequestId = String(requestId || '').trim();
    const normalizedHelperId = String(helperId || '').trim();
    const normalizedToken = String(offerToken || '').trim();
    const revision = normalizeRevision(offerRevision);
    const normalizedAction = String(action || '').trim().toLowerCase();
    if (!normalizedRequestId || !normalizedHelperId || !normalizedToken || !revision || !['accept', 'decline'].includes(normalizedAction)) {
      return { error: 'invalid-offer-reference' };
    }

    const requestRef = db.collection('serviceRequests').doc(normalizedRequestId);
    const helperRef = db.collection('users').doc(normalizedHelperId);
    return db.runTransaction(async (transaction) => {
      const [requestSnap, helperSnap] = await Promise.all([
        transaction.get(requestRef), transaction.get(helperRef),
      ]);
      if (!requestSnap.exists) return { error: 'request-not-found' };
      if (!helperSnap.exists || !isHelperUserRecord(helperSnap.data() || {})) return { error: 'helper-account-required' };

      const request = requestSnap.data() || {};
      const helper = helperSnap.data() || {};
      const decision = evaluateOfferResponse(request, {
        action: normalizedAction,
        helperId: normalizedHelperId,
        offerToken: normalizedToken,
        offerRevision: revision,
      }, now);
      if (!decision.ok) return { error: decision.code };
      if (decision.idempotent) return { idempotent: true, action: normalizedAction };

      const responseState = {
        helperId: normalizedHelperId,
        offerToken: normalizedToken,
        offerRevision: revision,
        action: normalizedAction,
        respondedAtMs: now,
      };

      if (normalizedAction === 'accept') {
        const activeRequestId = String(helper.activeServiceRequestId || '').trim();
        if (activeRequestId && activeRequestId !== normalizedRequestId) {
          return { error: 'helper-already-has-active-request' };
        }
        const acceptedAt = new Date(now).toISOString();
        const nextQueue = (Array.isArray(request.helperQueue) ? request.helperQueue : [])
          .filter((item) => String(item || '').trim() !== normalizedHelperId);
        transaction.update(requestRef, {
          status: acceptedStatus,
          statusDetail: 'Helper accepted and is preparing to travel.',
          currentOfferHelperId: null,
          offerExpiresAt: null,
          offerToken: null,
          offerCycleExcludedHelperIds: [],
          declinedHelperIds: [],
          helperQueue: nextQueue,
          helperAssignment: {
            helperId: normalizedHelperId,
            helperName: helper.fullName || helper.displayName || helper.name || 'Helper',
            helperEmail: helper.email || '',
            helperPhone: helper.phoneNumber || '',
            helperPhoto: String(helper.profilePhoto || helper.selfieUrl || helper.photoURL || '').trim(),
            acceptedAt,
            categoryId: request.categoryId || '',
            serviceIds: Array.isArray(request.serviceIds) ? request.serviceIds : [],
          },
          lastOfferResponse: responseState,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.set(helperRef, {
          activeServiceRequestId: normalizedRequestId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      } else {
        const lists = buildDeclinedOfferLists(request, normalizedHelperId);
        transaction.update(requestRef, {
          status: matchingStatus,
          statusDetail: 'Helper declined. Matching the next helper.',
          helperQueue: lists.helperQueue,
          currentOfferHelperId: null,
          offerExpiresAt: null,
          offerToken: null,
          offerCycleExcludedHelperIds: lists.offerCycleExcludedHelperIds,
          declinedHelperIds: lists.declinedHelperIds,
          lastOfferResponse: responseState,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      return {
        didApply: true,
        action: normalizedAction,
        helperId: normalizedHelperId,
        requestId: normalizedRequestId,
        offerRevision: revision,
        categoryId: request.categoryId || '',
        serviceIds: Array.isArray(request.serviceIds) ? request.serviceIds : [],
        offerStartedAtMs: normalizeTimestamp(request.lastOfferAt) || now,
      };
    });
  }

  return { respond };
}

module.exports = { createServiceRequestOfferOperations };
