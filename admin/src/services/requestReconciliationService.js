import { getFirebaseClients } from '../firebase/config';

const MATCHING_TIMEOUT_MS = 3 * 60 * 1000;
const SERVICE_REQUEST_STATUS = {
  MATCHING: 'matching',
  HELPER_FOUND: 'helper_found',
  EXPIRED: 'expired',
  NO_HELPER_AVAILABLE: 'no_helper_available',
};

function normalizeMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(String(value || '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function getRequestMatchingStartedAtMs(request = {}) {
  return normalizeMillis(request.matchingStartedAtMs)
    || normalizeMillis(request.createdAt)
    || normalizeMillis(request.updatedAt)
    || 0;
}

function normalizeHelperIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
}

function matchesTouchedServices(request = {}, touchedServiceIds = []) {
  if (!Array.isArray(touchedServiceIds) || !touchedServiceIds.length) {
    return true;
  }

  const serviceIdSet = new Set(
    touchedServiceIds
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean),
  );
  if (!serviceIdSet.size) {
    return true;
  }

  const requestServiceIds = Array.isArray(request.serviceIds) ? request.serviceIds : [];
  const selectedPackageId = String(request.selectedPackageId || '').trim().toLowerCase();
  const categoryId = String(request.categoryId || '').trim().toLowerCase();
  return requestServiceIds.some((value) => serviceIdSet.has(String(value || '').trim().toLowerCase()))
    || (selectedPackageId && serviceIdSet.has(selectedPackageId))
    || (categoryId && serviceIdSet.has(categoryId));
}

function buildExpiredOfferQueue(request = {}, expiredHelperId = '') {
  const normalizedExpiredHelperId = String(expiredHelperId || '').trim();
  const currentQueue = Array.isArray(request.helperQueue) ? request.helperQueue : [];
  return normalizeHelperIdList([
    ...currentQueue.filter((helperId) => String(helperId || '').trim() !== normalizedExpiredHelperId),
    normalizedExpiredHelperId,
  ]);
}

export async function reconcileOpenServiceRequests({
  reason = 'admin_mutation',
  touchedServiceIds = [],
} = {}) {
  const clients = await getFirebaseClients();
  if (!clients) {
    return { scanned: 0, updated: 0 };
  }

  const { db, firestoreModule } = clients;
  const {
    collection,
    getDocs,
    query,
    serverTimestamp,
    where,
    writeBatch,
  } = firestoreModule;

  const requestsQuery = query(
    collection(db, 'serviceRequests'),
    where('status', 'in', [
      SERVICE_REQUEST_STATUS.MATCHING,
      SERVICE_REQUEST_STATUS.HELPER_FOUND,
      SERVICE_REQUEST_STATUS.NO_HELPER_AVAILABLE,
    ]),
  );
  const snapshot = await getDocs(requestsQuery);
  if (snapshot.empty) {
    return { scanned: 0, updated: 0 };
  }

  const now = Date.now();
  let scanned = 0;
  let updated = 0;
  let batch = writeBatch(db);
  let batchWrites = 0;

  const commitBatch = async () => {
    if (!batchWrites) return;
    await batch.commit();
    batch = writeBatch(db);
    batchWrites = 0;
  };

  for (const docSnap of snapshot.docs) {
    const request = docSnap.data() || {};
    scanned += 1;

    if (request?.helperAssignment?.helperId) {
      continue;
    }
    if (!matchesTouchedServices(request, touchedServiceIds)) {
      continue;
    }

    const status = String(request.status || '').trim().toLowerCase();
    const matchingStartedAtMs = getRequestMatchingStartedAtMs(request);
    const matchingDeadlineMs = matchingStartedAtMs > 0
      ? matchingStartedAtMs + MATCHING_TIMEOUT_MS
      : 0;

    if (matchingDeadlineMs > 0 && matchingDeadlineMs <= now) {
      batch.update(docSnap.ref, {
        status: SERVICE_REQUEST_STATUS.EXPIRED,
        statusDetail: 'Request expired because no helper accepted in time.',
        helperQueue: [],
        currentOfferHelperId: null,
        offerExpiresAt: null,
        offerToken: null,
        declinedHelperIds: [],
        matchingStartedAtMs: null,
        reconciliationSource: reason,
        updatedAt: serverTimestamp(),
      });
      updated += 1;
      batchWrites += 1;
    } else if (status === SERVICE_REQUEST_STATUS.HELPER_FOUND) {
      const offerExpiresAt = normalizeMillis(request.offerExpiresAt);
      if (offerExpiresAt > 0 && offerExpiresAt <= now) {
        const expiredHelperId = String(request.currentOfferHelperId || '').trim();
        batch.update(docSnap.ref, {
          status: SERVICE_REQUEST_STATUS.MATCHING,
          statusDetail: 'Helper offer expired. Matching the next helper.',
          helperQueue: buildExpiredOfferQueue(request, expiredHelperId),
          currentOfferHelperId: null,
          offerExpiresAt: null,
          offerToken: null,
          offerCycleExcludedHelperIds: normalizeHelperIdList([
            ...(Array.isArray(request.offerCycleExcludedHelperIds) ? request.offerCycleExcludedHelperIds : []),
            expiredHelperId,
          ]),
          declinedHelperIds: normalizeHelperIdList(request.declinedHelperIds),
          matchingStartedAtMs: matchingStartedAtMs || now,
          reconciliationSource: reason,
          updatedAt: serverTimestamp(),
        });
        updated += 1;
        batchWrites += 1;
      }
    } else if (status === SERVICE_REQUEST_STATUS.NO_HELPER_AVAILABLE) {
      batch.update(docSnap.ref, {
        status: SERVICE_REQUEST_STATUS.MATCHING,
        statusDetail: 'Service availability changed. Re-checking helper availability.',
        currentOfferHelperId: null,
        offerExpiresAt: null,
        offerToken: null,
        matchingStartedAtMs: matchingStartedAtMs || now,
        reconciliationSource: reason,
        updatedAt: serverTimestamp(),
      });
      updated += 1;
      batchWrites += 1;
    } else if (status === SERVICE_REQUEST_STATUS.MATCHING && !request.currentOfferHelperId) {
      batch.update(docSnap.ref, {
        matchingStartedAtMs: matchingStartedAtMs || now,
        reconciliationSource: reason,
        updatedAt: serverTimestamp(),
      });
      updated += 1;
      batchWrites += 1;
    }

    if (batchWrites >= 400) {
      await commitBatch();
    }
  }

  await commitBatch();
  return { scanned, updated };
}
