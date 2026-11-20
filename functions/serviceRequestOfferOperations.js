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
function createServiceRequestOfferOperations({
  db,
  admin,
  isHelperUserRecord,
  acceptedStatus = 'accepted',
  matchingStatus = 'matching',
  busyConfirmationStatus = 'busy_helper_confirmation',
  busyConfirmationTimeoutMs = 3 * 60 * 1000,
}) {
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
        let stillActiveForHelper = false;
        if (activeRequestId && activeRequestId !== normalizedRequestId) {
          const activeReqSnap = await transaction.get(db.collection('serviceRequests').doc(activeRequestId));
          const activeReq = activeReqSnap.exists ? activeReqSnap.data() || {} : null;
          const activeStatus = String(activeReq?.status || '').trim().toLowerCase();
          const activeAssignedHelperId = String(activeReq?.helperAssignment?.helperId || '').trim();
          stillActiveForHelper = Boolean(
            activeReqSnap.exists
            && activeAssignedHelperId === normalizedHelperId
            && ['accepted', 'en_route', 'driving', 'buying_resources', 'arrived', 'work_started'].includes(activeStatus),
          );
          if (stillActiveForHelper) {
            const isBusyFallbackOffer = String(request.offerType || '').trim().toLowerCase() === 'busy_helper_fallback';
            if (!isBusyFallbackOffer) {
              return { error: 'helper-already-has-active-request' };
            }
            const existingQueuedRequestId = String(helper.queuedServiceRequestId || '').trim();
            if (existingQueuedRequestId && existingQueuedRequestId !== normalizedRequestId) {
              const queuedReqSnap = await transaction.get(db.collection('serviceRequests').doc(existingQueuedRequestId));
              const queuedReq = queuedReqSnap.exists ? queuedReqSnap.data() || {} : null;
              const queuedStatus = String(queuedReq?.status || '').trim().toLowerCase();
              const queuedHelperId = String(
                queuedReq?.pendingBusyAssignment?.helperId
                  || queuedReq?.helperAssignment?.helperId
                  || '',
              ).trim();
              if (
                queuedReqSnap.exists
                && queuedHelperId === normalizedHelperId
                && ['busy_helper_confirmation', 'helper_queued'].includes(queuedStatus)
              ) {
                return { error: 'helper-already-has-queued-request' };
              }
            }
          }
        }

        const nextQueue = (Array.isArray(request.helperQueue) ? request.helperQueue : [])
          .filter((item) => String(item || '').trim() !== normalizedHelperId);
        const nextBusyQueue = (Array.isArray(request.busyHelperQueue) ? request.busyHelperQueue : [])
          .filter((item) => String(item || '').trim() !== normalizedHelperId);

        if (stillActiveForHelper) {
          const helperProfile = {
            helperId: normalizedHelperId,
            helperName: helper.fullName || helper.displayName || helper.name || 'Helper',
            helperEmail: helper.email || '',
            helperPhone: helper.phoneNumber || '',
            helperPhoto: String(helper.profilePhoto || helper.selfieUrl || helper.photoURL || '').trim(),
            categoryId: request.categoryId || '',
            serviceIds: Array.isArray(request.serviceIds) ? request.serviceIds : [],
          };
          transaction.update(requestRef, {
            status: busyConfirmationStatus,
            statusDetail: 'A busy helper accepted this offer. Waiting for customer confirmation.',
            currentOfferHelperId: null,
            offerExpiresAt: null,
            offerToken: null,
            offerType: 'busy_helper_fallback',
            helperQueue: nextQueue,
            busyHelperQueue: nextBusyQueue,
            pendingBusyAssignment: {
              ...helperProfile,
              activeRequestId,
              acceptedOfferAtMs: now,
              confirmationExpiresAtMs: now + busyConfirmationTimeoutMs,
            },
            lastOfferResponse: responseState,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          transaction.set(helperRef, {
            queuedServiceRequestId: normalizedRequestId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          return {
            didApply: true,
            action: normalizedAction,
            busyFallbackAccepted: true,
            activeRequestId,
            helperId: normalizedHelperId,
            helperName: helperProfile.helperName,
            requestId: normalizedRequestId,
            offerRevision: revision,
            categoryId: request.categoryId || '',
            serviceIds: Array.isArray(request.serviceIds) ? request.serviceIds : [],
            offerStartedAtMs: normalizeTimestamp(request.lastOfferAt) || now,
          };
        }

        const acceptedAt = new Date(now).toISOString();
        transaction.update(requestRef, {
          status: acceptedStatus,
          statusDetail: 'Helper accepted and is preparing to travel.',
          currentOfferHelperId: null,
          offerExpiresAt: null,
          offerToken: null,
          offerType: null,
          offerBusyActiveRequestId: null,
          pendingBusyAssignment: null,
          offerCycleExcludedHelperIds: [],
          declinedHelperIds: [],
          helperQueue: nextQueue,
          busyHelperQueue: nextBusyQueue,
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
        const nextBusyQueue = (Array.isArray(request.busyHelperQueue) ? request.busyHelperQueue : [])
          .filter((item) => String(item || '').trim() !== normalizedHelperId);
        transaction.update(requestRef, {
          status: matchingStatus,
          statusDetail: 'Helper declined. Matching the next helper.',
          helperQueue: lists.helperQueue,
          busyHelperQueue: nextBusyQueue,
          currentOfferHelperId: null,
          offerExpiresAt: null,
          offerToken: null,
          offerType: null,
          offerBusyActiveRequestId: null,
          offerCycleExcludedHelperIds: lists.offerCycleExcludedHelperIds,
          declinedHelperIds: lists.declinedHelperIds,
          lastOfferResponse: responseState,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      return {
        didApply: true,
        action: normalizedAction,
        busyFallbackAccepted: false,
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
