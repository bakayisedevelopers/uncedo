import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getFirebaseClients } from '../firebase/config';

const HELPER_STATS_MAX_EVENTS = 100;
const HELPER_STATS_ROLLING_DAYS = 30;
const HELPER_STATS_RECENT_ASSIGNMENT_DAYS = 7;
const SETTLED_HELPER_REQUEST_STATUSES = new Set(['completed', 'canceled']);
const helperOfferLifecycleCache = new Map();

function normalizeTime(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatsEventTimestamp(value) {
  const numeric = normalizeTime(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function getStatsWindowStartMs(days) {
  return Date.now() - (Math.max(1, Number(days || 1)) * 24 * 60 * 60 * 1000);
}

function buildHelperStatsSummary(existingMetrics = {}, rollups = {}, helperData = {}) {
  const ratingsAverage = Number(helperData?.ratings?.asHelper?.average || existingMetrics.overallRating || helperData?.rating || 0);
  return {
    acceptanceRate: rollups.acceptanceRate ?? existingMetrics.acceptanceRate ?? 0,
    completionRate: rollups.completionRate ?? existingMetrics.completionRate ?? 0,
    overallRating: Number.isFinite(ratingsAverage) ? Number(ratingsAverage.toFixed(2)) : 0,
    avgResponseMinutes: rollups.avgResponseMinutes ?? existingMetrics.avgResponseMinutes ?? 0,
    cancellationRate: rollups.cancellationRate ?? existingMetrics.cancellationRate ?? 0,
    recentAssignmentsCount: rollups.recentAssignmentsCount ?? existingMetrics.recentAssignmentsCount ?? 0,
    statsWindow: {
      rollingDays: HELPER_STATS_ROLLING_DAYS,
      maxEvents: HELPER_STATS_MAX_EVENTS,
      recentAssignmentsDays: HELPER_STATS_RECENT_ASSIGNMENT_DAYS,
    },
    statsUpdatedAt: new Date().toISOString(),
  };
}

function buildHelperOfferNotificationId({ helperId, requestId, offerRevision }) {
  return `helper_offer_${helperId}_${requestId}_${Number(offerRevision || 0) || 0}`;
}

async function ensureHelperOfferNotification({
  db,
  helperId,
  requestId,
  offerRevision,
  request = {},
}) {
  const notificationRef = doc(
    db,
    'notifications',
    buildHelperOfferNotificationId({ helperId, requestId, offerRevision }),
  );
  const existingSnap = await getDoc(notificationRef);
  if (existingSnap.exists()) {
    return;
  }

  await setDoc(notificationRef, {
    userId: helperId,
    title: 'New helper request',
    message: `A ${request.topic || request.subject || 'service'} request is waiting for your response.`,
    type: 'helper_offer',
    requestId,
    sessionId: null,
    targetPath: '/app/helper',
    metadata: {
      offerRevision: Number(offerRevision || 0) || 0,
      offerExpiresAt: request.offerExpiresAt || null,
    },
    read: false,
    readAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function recordHelperOfferLifecycleEvent({
  helperId,
  requestId,
  offerRevision,
  categoryId,
  serviceIds = [],
  outcome,
  offeredAtMs,
  closedAtMs,
  responseMinutes,
  sourceStatus,
}) {
  if (!helperId || !requestId) return null;

  const { db } = getFirebaseClients();
  const eventId = `${requestId}_${Number(offerRevision || 0) || 0}`;
  const eventRef = doc(db, 'users', helperId, 'helperStatsOfferEvents', eventId);

  await setDoc(eventRef, {
    helperId,
    requestId,
    offerRevision: Number(offerRevision || 0) || 0,
    categoryId: String(categoryId || '').trim(),
    serviceIds: Array.isArray(serviceIds) ? serviceIds : [],
    outcome: String(outcome || '').trim().toLowerCase(),
    occurredAtMs: normalizeStatsEventTimestamp(closedAtMs || offeredAtMs) || Date.now(),
    offeredAtMs: normalizeStatsEventTimestamp(offeredAtMs) || Date.now(),
    closedAtMs: normalizeStatsEventTimestamp(closedAtMs) || null,
    responseMinutes: Number.isFinite(Number(responseMinutes)) ? Number(responseMinutes) : null,
    sourceStatus: String(sourceStatus || '').trim().toLowerCase(),
    uid: helperId,
    updatedAtMs: Date.now(),
  }, { merge: true });

  return computeHelperDerivedStats(helperId);
}

export async function computeHelperDerivedStats(helperId) {
  if (!helperId) return null;

  const { db } = getFirebaseClients();
  const userRef = doc(db, 'users', helperId);
  const offerEventsQuery = query(
    collection(db, 'users', helperId, 'helperStatsOfferEvents'),
    orderBy('occurredAtMs', 'desc'),
    limit(HELPER_STATS_MAX_EVENTS),
  );
  const serviceRequestsQuery = query(collection(db, 'serviceRequests'));

  const [userSnap, offerSnap, requestsSnap] = await Promise.all([
    getDoc(userRef),
    getDocs(offerEventsQuery),
    getDocs(serviceRequestsQuery),
  ]);

  const helperData = userSnap.exists() ? userSnap.data() || {} : {};
  const existingMetrics = helperData.metrics || {};
  const thirtyDaysAgo = getStatsWindowStartMs(HELPER_STATS_ROLLING_DAYS);
  const sevenDaysAgo = getStatsWindowStartMs(HELPER_STATS_RECENT_ASSIGNMENT_DAYS);

  const offerEvents = offerSnap.docs
    .map((snap) => ({ id: snap.id, ...snap.data() }))
    .filter((item) => normalizeStatsEventTimestamp(item.closedAtMs || item.occurredAtMs) >= thirtyDaysAgo);
  const closedOffers = offerEvents.filter((item) => ['accepted', 'declined', 'expired'].includes(String(item.outcome || '').toLowerCase()));
  const acceptedOffers = closedOffers.filter((item) => String(item.outcome || '').toLowerCase() === 'accepted');

  const offerDenominator = closedOffers.length;
  const acceptanceRate = offerDenominator > 0
    ? Number((acceptedOffers.length / offerDenominator).toFixed(4))
    : null;

  const acceptedResponseMinutes = acceptedOffers
    .map((item) => Number(item.responseMinutes || 0))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const avgResponseMinutes = acceptedResponseMinutes.length
    ? Number((acceptedResponseMinutes.reduce((sum, value) => sum + value, 0) / acceptedResponseMinutes.length).toFixed(2))
    : null;

  const recentAssignmentsCount = acceptedOffers
    .filter((item) => normalizeStatsEventTimestamp(item.closedAtMs || item.occurredAtMs) >= sevenDaysAgo)
    .length;

  const helperRequests = requestsSnap.docs
    .map((snap) => ({ id: snap.id, ...snap.data() }))
    .filter((request) => String(request?.helperAssignment?.helperId || '').trim() === helperId)
    .filter((request) => {
      const settledAtMs = normalizeStatsEventTimestamp(
        request.endedAt
        || request.completedAt
        || request.canceledAt
        || request.updatedAt,
      );
      return settledAtMs >= thirtyDaysAgo;
    });

  const completedRequests = helperRequests.filter((request) => String(request.status || '').toLowerCase() === 'completed');
  const helperCanceledRequests = helperRequests.filter((request) => {
    const status = String(request.status || '').toLowerCase();
    const canceledBy = String(request.canceledBy || '').toLowerCase();
    return status === 'canceled' && ['helper', 'helper_user', 'helper_account'].includes(canceledBy);
  });

  const requestDenominator = completedRequests.length + helperCanceledRequests.length;
  const completionRate = requestDenominator > 0
    ? Number((completedRequests.length / requestDenominator).toFixed(4))
    : null;
  const cancellationRate = requestDenominator > 0
    ? Number((helperCanceledRequests.length / requestDenominator).toFixed(4))
    : null;

  const summary = buildHelperStatsSummary(existingMetrics, {
    acceptanceRate,
    completionRate,
    avgResponseMinutes,
    cancellationRate,
    recentAssignmentsCount,
  }, helperData);

  await setDoc(userRef, {
    metrics: {
      ...existingMetrics,
      ...summary,
      statsWindow: summary.statsWindow,
      statsUpdatedAt: summary.statsUpdatedAt,
    },
    rating: summary.overallRating,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return summary;
}

export async function syncHelperOfferSnapshot(helperId, requests = []) {
  if (!helperId) return;

  const { db } = getFirebaseClients();
  const currentCache = helperOfferLifecycleCache.get(helperId) || new Map();
  const nextActiveRequestIds = new Set();

  await Promise.all(
    requests.map(async (request) => {
      const requestId = String(request?.id || '').trim();
      if (!requestId) return;

      const status = String(request.status || '').trim().toLowerCase();
      if (status !== 'helper_found') return;

      const offerRevision = Number(request.offerRevision || 0) || 0;
      const offeredAtMs = normalizeStatsEventTimestamp(
        request.lastOfferAt || request.offerExpiresAt || Date.now(),
      ) || Date.now();
      const cacheEntry = currentCache.get(requestId);
      const didChangeOffer = !cacheEntry
        || cacheEntry.offerRevision !== offerRevision
        || cacheEntry.currentOfferHelperId !== helperId;

      nextActiveRequestIds.add(requestId);
      currentCache.set(requestId, {
        requestId,
        helperId,
        offerRevision,
        offeredAtMs,
        offerExpiresAt: normalizeStatsEventTimestamp(request.offerExpiresAt),
        categoryId: request.categoryId || '',
        serviceIds: Array.isArray(request.serviceIds) ? request.serviceIds : [],
      });

      if (!didChangeOffer) return;

      await ensureHelperOfferNotification({
        db,
        helperId,
        requestId,
        offerRevision,
        request,
      });
      await recordHelperOfferLifecycleEvent({
        helperId,
        requestId,
        offerRevision,
        categoryId: request.categoryId || '',
        serviceIds: Array.isArray(request.serviceIds) ? request.serviceIds : [],
        outcome: 'offered',
        offeredAtMs,
        sourceStatus: status,
      });
    }),
  );

  const previousEntries = [...currentCache.values()].filter((entry) => !nextActiveRequestIds.has(entry.requestId));
  await Promise.all(previousEntries.map(async (entry) => {
    const requestRef = doc(db, 'serviceRequests', entry.requestId);
    const requestSnap = await getDoc(requestRef).catch(() => null);
    const request = requestSnap?.exists() ? requestSnap.data() || {} : {};
    const afterStatus = String(request.status || '').trim().toLowerCase();
    const assignedHelperId = String(request?.helperAssignment?.helperId || '').trim();

    if (afterStatus === 'accepted' && assignedHelperId === helperId) {
      const acceptedAtMs = normalizeStatsEventTimestamp(request?.helperAssignment?.acceptedAt || request.updatedAt) || Date.now();
      const responseMinutes = Math.max(0, Number(((acceptedAtMs - entry.offeredAtMs) / 60000).toFixed(2)));
      await recordHelperOfferLifecycleEvent({
        helperId,
        requestId: entry.requestId,
        offerRevision: entry.offerRevision,
        categoryId: entry.categoryId,
        serviceIds: entry.serviceIds,
        outcome: 'accepted',
        offeredAtMs: entry.offeredAtMs,
        closedAtMs: acceptedAtMs,
        responseMinutes,
        sourceStatus: afterStatus,
      });
      currentCache.delete(entry.requestId);
      return;
    }

    const expiredByTime = entry.offerExpiresAt > 0 && entry.offerExpiresAt <= Date.now();
    const outcome = afterStatus === 'expired' || expiredByTime ? 'expired' : 'declined';
    if (outcome !== 'declined' || ['expired', 'no_helper_available', 'matching'].includes(afterStatus)) {
      await recordHelperOfferLifecycleEvent({
        helperId,
        requestId: entry.requestId,
        offerRevision: entry.offerRevision,
        categoryId: entry.categoryId,
        serviceIds: entry.serviceIds,
        outcome,
        offeredAtMs: entry.offeredAtMs,
        closedAtMs: Date.now(),
        sourceStatus: afterStatus,
      });
    }
    currentCache.delete(entry.requestId);
  }));

  helperOfferLifecycleCache.set(helperId, currentCache);
}

export async function syncHelperSettledRequest(request = {}) {
  const status = String(request.status || '').trim().toLowerCase();
  const helperId = String(request?.helperAssignment?.helperId || '').trim();
  if (!helperId || !SETTLED_HELPER_REQUEST_STATUSES.has(status)) {
    return null;
  }

  return computeHelperDerivedStats(helperId);
}
