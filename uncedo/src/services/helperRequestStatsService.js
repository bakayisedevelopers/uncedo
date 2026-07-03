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
