const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { Resend } = require('resend');
const { createHash, randomUUID } = require('crypto');
const {
  normalizeServiceCatalogEntry: normalizeMarketplaceServiceCatalogEntry,
} = require('./serviceMarketplacePricing');
const {
  LEGAL_ENTITY_NAME,
} = require('./legalAgreements');
const {
  isHelperAgreementCurrent,
} = require('./helperLegalAgreements');

admin.initializeApp();

const db = admin.firestore();

async function createUserNotification({
  userId,
  title,
  message,
  type = 'update',
  requestId = null,
  sessionId = null,
  targetPath = '',
  metadata = {},
}) {
  if (!userId) return null;

  const notification = {
    userId,
    title: String(title || 'Parakleo update'),
    message: String(message || 'You have a new update.'),
    type: String(type || 'update'),
    requestId: requestId || null,
    sessionId: sessionId || null,
    targetPath: targetPath || '',
    metadata: metadata || {},
    read: false,
    readAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const ref = await db.collection('notifications').add(notification);
  return { id: ref.id, ...notification };
}

function buildEmailEventId(namespace, ...parts) {
  const seed = [namespace, ...parts].map((part) => String(part ?? '')).join('|');
  return `${namespace}_${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`;
}

async function queueEmailEventOnce({
  eventId,
  eventType,
  payload,
  source = '',
}) {
  if (!eventId || !eventType) return { created: false };

  const eventRef = db.collection('emailEvents').doc(eventId);
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(eventRef);
    if (snapshot.exists) {
      return { created: false };
    }

    transaction.set(eventRef, {
      eventType,
      payload: payload || {},
      source: source || '',
      status: 'queued',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { created: true };
  });

  return result;
}

function formatMoney(value) {
  const normalized = Math.round(Number(value || 0));
  if (!Number.isFinite(normalized)) return 'R0';
  return `R${normalized}`;
}

function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateFromMillis(value) {
  const millis = timestampToMillis(value);
  return millis ? new Date(millis) : null;
}

function getWeekRange(dateInput = new Date()) {
  const date = toDateFromMillis(dateInput) || new Date();
  const utcDay = date.getUTCDay();
  const dayOffsetFromMonday = (utcDay + 6) % 7;
  const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  weekStart.setUTCDate(weekStart.getUTCDate() - dayOffsetFromMonday);
  const weekEnd = new Date(weekStart.getTime() + (6 * 24 * 60 * 60 * 1000));
  weekEnd.setUTCHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

function getWeekKey(dateInput = new Date()) {
  const { weekStart } = getWeekRange(dateInput);
  const thursday = new Date(weekStart.getTime());
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4UtcDay = jan4.getUTCDay();
  const jan4Offset = (jan4UtcDay + 6) % 7;
  const firstWeekStart = new Date(Date.UTC(year, 0, 4 - jan4Offset));
  const weekNumber = Math.floor((weekStart.getTime() - firstWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${year}-W${String(Math.max(weekNumber, 1)).padStart(2, '0')}`;
}

function buildHelperPayoutDocId(weekKey, helperId) {
  return `${weekKey}_${helperId}`;
}

function computeStoredHelperPayoutBreakdown(request = {}) {
  if (request?.helperPayoutBreakdown && typeof request.helperPayoutBreakdown === 'object') {
    return request.helperPayoutBreakdown;
  }

  const status = String(request.status || '').trim().toLowerCase();
  if (status === 'completed') {
    return getServiceHelperPayoutBreakdown(request, {
      closureType: 'completed',
      waitingCost: Number(request.waitingCost || request?.pricingSnapshot?.waitingCost || 0),
      travelFeeAmount: getServiceTravelFee(request),
      bookingFeeAmount: Number(request?.pricingSnapshot?.bookingFee || getServiceBookingFee(request)),
    });
  }

  if (status === 'canceled') {
    return getServiceHelperPayoutBreakdown(request, {
      closureType: 'canceled',
      billingRule: request?.pricingSnapshot?.cancellationBillingRule || 'booking_fee_only',
      travelledKm: Number(request?.pricingSnapshot?.cancellationDistanceKm || 0),
      travelFeeAmount: Number(
        request?.pricingSnapshot?.cancellationTravelCharge
        || request?.pricingSnapshot?.travelFee
        || getServiceTravelFee(request),
      ),
      bookingFeeAmount: Number(request?.pricingSnapshot?.bookingFee || getServiceBookingFee(request)),
    });
  }

  return null;
}

const UNCEDO_PAYMENTS_SECRETS = defineSecret('UNCEDO_PAYMENTS_SECRETS');
const UNCEDO_EMAIL_SECRETS = defineSecret('UNCEDO_EMAIL_SECRETS');
const MATCHING_TIMEOUT_MS = 3 * 60 * 1000;
const OFFER_TIMEOUT_MS = 30 * 1000;
const HELPER_REOFFER_COOLDOWN_MS = OFFER_TIMEOUT_MS * 2;
const DISPATCH_SCORE_WEIGHTS = {
  acceptanceRate: 0.20,
  completionRate: 0.20,
  rating: 0.20,
  responseSpeed: 0.15,
  reliability: 0.15,
  fairness: 0.10,
};
const DISPATCH_NEAR_EQUAL_THRESHOLD = 2;
const HELPER_PAYOUT_COLLECTION = 'helperWeeklyPayouts';
const PAYOUT_LOOKBACK_WEEKS = 12;
const FAIRNESS_WORKLOAD_CAP = 10;
const HELPER_DISPATCH_MAX_RADIUS_KM = 70;
const HELPER_DISPATCH_DISTANCE_BANDS = [
  { key: 'within_5km', minKm: 0, maxKm: 5 },
  { key: 'within_10km', minKm: 5, maxKm: 10 },
  { key: 'within_20km', minKm: 10, maxKm: 20 },
  { key: 'within_30km', minKm: 20, maxKm: 30 },
  { key: 'within_70km', minKm: 30, maxKm: HELPER_DISPATCH_MAX_RADIUS_KM },
];
const HELPER_STATS_MAX_EVENTS = 100;
const HELPER_STATS_ROLLING_DAYS = 30;
const HELPER_STATS_RECENT_ASSIGNMENT_DAYS = 7;
const SERVICE_REQUEST_STATUS = {
  COLLECTING_DETAILS: 'collecting_details',
  SCHEDULED_PENDING: 'scheduled_pending',
  MATCHING: 'matching',
  HELPER_FOUND: 'helper_found',
  ACCEPTED: 'accepted',
  EN_ROUTE: 'en_route',
  ARRIVED: 'arrived',
  COMPLETED: 'completed',
  CANCELED: 'canceled',
  EXPIRED: 'expired',
  NO_HELPER_AVAILABLE: 'no_helper_available',
};
const ACTIVE_SERVICE_REQUEST_STATUSES = new Set([
  SERVICE_REQUEST_STATUS.MATCHING,
  SERVICE_REQUEST_STATUS.HELPER_FOUND,
  SERVICE_REQUEST_STATUS.NO_HELPER_AVAILABLE,
]);
const PRE_ASSIGNMENT_SERVICE_REQUEST_STATUSES = new Set([
  SERVICE_REQUEST_STATUS.COLLECTING_DETAILS,
  SERVICE_REQUEST_STATUS.SCHEDULED_PENDING,
  SERVICE_REQUEST_STATUS.MATCHING,
  SERVICE_REQUEST_STATUS.HELPER_FOUND,
  SERVICE_REQUEST_STATUS.NO_HELPER_AVAILABLE,
]);
const POST_ASSIGNMENT_SERVICE_REQUEST_STATUSES = new Set([
  SERVICE_REQUEST_STATUS.ACCEPTED,
  'driving',
  SERVICE_REQUEST_STATUS.EN_ROUTE,
  'buying_resources',
  SERVICE_REQUEST_STATUS.ARRIVED,
  'work_started',
]);
const HELPER_BUSY_REQUEST_STATUSES = new Set([
  SERVICE_REQUEST_STATUS.ACCEPTED,
  SERVICE_REQUEST_STATUS.EN_ROUTE,
  'driving',
  'buying_resources',
  SERVICE_REQUEST_STATUS.ARRIVED,
  'work_started',
]);
function normalizeMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getRequestMatchingStartedAtMs(request = {}) {
  return normalizeMillis(request.matchingStartedAtMs)
    || normalizeMillis(request.createdAt)
    || normalizeMillis(request.updatedAt)
    || 0;
}

function nextOfferRevision(request = {}) {
  const current = Number(request.offerRevision || 0);
  if (!Number.isFinite(current) || current < 0) return 1;
  return Math.floor(current) + 1;
}

function isRequestExpired(request) {
  const createdAtMs = normalizeMillis(request?.createdAt);
  if (!createdAtMs) return false;
  return Date.now() - createdAtMs >= MATCHING_TIMEOUT_MS;
}

function normalizeHelperIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
}

function getServiceRequestExcludedHelperIds(request = {}) {
  return normalizeHelperIdList(request.offerCycleExcludedHelperIds);
}

function getServiceRequestDeclinedHelperIds(request = {}) {
  return normalizeHelperIdList(request.declinedHelperIds);
}

function isPreAssignmentServiceRequestStatus(status) {
  return PRE_ASSIGNMENT_SERVICE_REQUEST_STATUSES.has(String(status || '').trim().toLowerCase());
}

function isPostAssignmentServiceRequestStatus(status) {
  return POST_ASSIGNMENT_SERVICE_REQUEST_STATUSES.has(String(status || '').trim().toLowerCase());
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeRate(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric > 1) return clamp01(numeric / 100);
  return clamp01(numeric);
}

function normalizeRating(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(5, numeric));
}

function normalizePositiveNumber(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return numeric;
}

function getTutorStatsWindowStartMs(days) {
  return Date.now() - (Math.max(1, Number(days || 1)) * 24 * 60 * 60 * 1000);
}

function normalizeStatsEventTimestamp(value) {
  const numeric = normalizeMillis(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function getHelperStatsCollections(uid) {
  const userRef = db.collection('users').doc(uid);
  return {
    userRef,
    offerEventsRef: userRef.collection('helperStatsOfferEvents'),
  };
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

async function storeHelperStatsEvent({ uid, collectionRef, eventId, payload }) {
  if (!uid || !collectionRef || !eventId) return;
  await collectionRef.doc(eventId).set({
    ...payload,
    uid,
    updatedAtMs: Date.now(),
  }, { merge: true });
}

async function computeHelperDerivedStats(uid) {
  if (!uid) return null;

  const { userRef, offerEventsRef } = getHelperStatsCollections(uid);
  const [userSnap, offerSnap, requestsSnap] = await Promise.all([
    userRef.get(),
    offerEventsRef.orderBy('occurredAtMs', 'desc').limit(HELPER_STATS_MAX_EVENTS).get(),
    db.collection('serviceRequests').where('helperAssignment.helperId', '==', uid).get(),
  ]);

  const helperData = userSnap.exists ? (userSnap.data() || {}) : {};
  const existingMetrics = helperData.metrics || {};
  const thirtyDaysAgo = getTutorStatsWindowStartMs(HELPER_STATS_ROLLING_DAYS);
  const sevenDaysAgo = getTutorStatsWindowStartMs(HELPER_STATS_RECENT_ASSIGNMENT_DAYS);

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

  const recentAssignmentsCount = acceptedOffers.filter((item) => normalizeStatsEventTimestamp(item.closedAtMs || item.occurredAtMs) >= sevenDaysAgo).length;

  const helperRequests = requestsSnap.docs
    .map((snap) => ({ id: snap.id, ...snap.data() }))
    .filter((request) => {
      const settledAtMs = normalizeStatsEventTimestamp(
        request.endedAt
        || request.completedAt
        || request.canceledAt
        || request.updatedAt,
      );
      return settledAtMs >= thirtyDaysAgo;
    });

  const completedRequests = helperRequests.filter((request) => String(request.status || '').toLowerCase() === SERVICE_REQUEST_STATUS.COMPLETED);
  const helperCanceledRequests = helperRequests.filter((request) => {
    const status = String(request.status || '').toLowerCase();
    const canceledBy = String(request.canceledBy || '').toLowerCase();
    return status === SERVICE_REQUEST_STATUS.CANCELED && (canceledBy === 'helper' || canceledBy === 'helper_user' || canceledBy === 'helper_account');
  });

  const requestDenominator = completedRequests.length + helperCanceledRequests.length;
  const completionRate = requestDenominator > 0
    ? Number((completedRequests.length / requestDenominator).toFixed(4))
    : null;
  const cancellationRate = requestDenominator > 0
    ? Number((helperCanceledRequests.length / requestDenominator).toFixed(4))
    : null;

  const rollups = {
    acceptanceRate,
    completionRate,
    avgResponseMinutes,
    cancellationRate,
    recentAssignmentsCount,
  };
  const summary = buildHelperStatsSummary(existingMetrics, rollups, helperData);

  await userRef.set({
    metrics: {
      ...existingMetrics,
      ...summary,
      statsWindow: summary.statsWindow,
      statsUpdatedAt: summary.statsUpdatedAt,
    },
    rating: summary.overallRating,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return summary;
}

async function recordHelperOfferLifecycleEvent({
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

  const { offerEventsRef } = getHelperStatsCollections(helperId);
  const eventId = `${requestId}_${Number(offerRevision || 0) || 0}`;
  const payload = {
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
  };

  await storeHelperStatsEvent({
    uid: helperId,
    collectionRef: offerEventsRef,
    eventId,
    payload,
  });

  return computeHelperDerivedStats(helperId);
}

function isTruthyFlag(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  return ['true', '1', 'yes', 'paused', 'blocked', 'suspended', 'disabled'].includes(normalized);
}

function randomIndex(max) {
  return Math.floor(Math.random() * Math.max(1, max));
}

function hasArrayChanged(before = [], after = []) {
  return JSON.stringify(before || []) !== JSON.stringify(after || []);
}

const HELPER_CATEGORY_SERVICE_MAP = {
  cleaning: ['cleaning', 'laundry'],
  yard_maintenance: ['yard_maintenance', 'gardening'],
  beauty: ['beauty'],
  barber: ['barber', 'beauty'],
  care: ['care'],
  car_wash: ['car_wash'],
};
const SERVICE_CATALOG_CACHE_TTL_MS = 60 * 1000;
const REQUEST_SERVICE_ALIASES = {
  house_cleaning: ['cleaning_deep_cleaning'],
  floor_cleaning: ['cleaning_dusting', 'cleaning_floor_care'],
  laundry: ['laundry_hand_wash', 'laundry_machine_wash'],
  manicure: ['beauty_nail_care'],
  hairstyles: ['beauty_hair_styling'],
  gardening: ['gardening_lawn_care', 'gardening_pruning', 'gardening_plant_watering'],
  yard_tidy_up: ['gardening_garden_tidy_up'],
};
let serviceCatalogCache = {
  loadedAtMs: 0,
  entries: [],
};
const EARTH_RADIUS_KM = 6371;
const DEFAULT_NEARBY_HELPERS_RADIUS_KM = 20;
const MAX_NEARBY_HELPERS_RADIUS_KM = 50;
const MAX_NEARBY_HELPERS_LIMIT = 50;
const HELPER_LOCATION_STALE_MS = 15 * 60 * 1000;
const CUSTOMER_LOCATION_STALE_MS = 10 * 60 * 1000;

function normalizeServiceToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeCatalogIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeServiceToken(value))
      .filter(Boolean),
  )];
}

function normalizeHelperSkill(skill = {}, serviceId = '') {
  const catalogId = normalizeServiceToken(skill?.catalogId || skill?.serviceCatalogId || skill?.name || '');
  const name = String(skill?.name || skill?.skillName || catalogId).trim();
  if (!catalogId || !name) {
    return null;
  }

  return {
    ...skill,
    id: String(skill?.id || `${serviceId}_${catalogId}`).trim() || `${serviceId}_${catalogId}`,
    catalogId,
    name,
    status: String(skill?.status || 'pending').trim().toLowerCase() || 'pending',
    active: skill?.active !== false,
    verified: skill?.verified !== false,
    approvalSource: String(skill?.approvalSource || '').trim().toLowerCase() || '',
    derivedFromBundleIds: normalizeCatalogIdList(skill?.derivedFromBundleIds),
    derivedFromServiceIds: normalizeCatalogIdList(skill?.derivedFromServiceIds),
    pictures: Array.isArray(skill?.pictures) ? skill.pictures.filter(Boolean) : [],
    createdAt: skill?.createdAt || null,
    updatedAt: skill?.updatedAt || null,
  };
}

function normalizeHelperServicesForApprovalSync(services = []) {
  return (Array.isArray(services) ? services : [])
    .map((service) => {
      const serviceId = String(service?.serviceId || '').trim();
      if (!serviceId) {
        return null;
      }

      return {
        ...service,
        serviceId,
        serviceName: String(service?.serviceName || service?.name || serviceId).trim(),
        description: String(service?.description || '').trim(),
        skills: (Array.isArray(service?.skills) ? service.skills : [])
          .map((skill) => normalizeHelperSkill(skill, serviceId))
          .filter(Boolean),
      };
    })
    .filter(Boolean)
    .filter((service) => Array.isArray(service.skills) && service.skills.length > 0);
}

function isApprovedHelperSkill(skill = {}) {
  return String(skill?.status || '').trim().toLowerCase() === 'approved';
}

function isHelperUserRecord(user = {}) {
  const roles = new Set(
    [
      user?.role,
      user?.activeRole,
      ...(Array.isArray(user?.roles) ? user.roles : []),
    ]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean),
  );

  return roles.has('helper') || roles.has('provider') || roles.has('tutor');
}

function mergeDerivedIds(existing = [], additions = []) {
  return [...new Set([
    ...normalizeCatalogIdList(existing),
    ...normalizeCatalogIdList(additions),
  ])];
}

function cloneHelperServicesForApprovalSync(services = []) {
  return normalizeHelperServicesForApprovalSync(services).map((service) => ({
    ...service,
    skills: (service.skills || []).map((skill) => ({ ...skill })),
  }));
}

function findSkillByCatalogId(services = [], catalogId = '') {
  const normalizedCatalogId = normalizeServiceToken(catalogId);
  if (!normalizedCatalogId) {
    return null;
  }

  for (const service of services) {
    for (const skill of (Array.isArray(service?.skills) ? service.skills : [])) {
      if (normalizeServiceToken(skill?.catalogId || skill?.serviceCatalogId || '') === normalizedCatalogId) {
        return { service, skill };
      }
    }
  }

  return null;
}

function skillHasBundleBackedPortfolio(skill = {}, helperServices = [], catalogIndex = buildActiveServiceCatalogIndex([])) {
  const derivedBundleIds = normalizeCatalogIdList(skill?.derivedFromBundleIds);
  if (!derivedBundleIds.length) {
    return false;
  }

  return derivedBundleIds.some((bundleId) => {
    const bundleSkillEntry = findSkillByCatalogId(helperServices, bundleId);
    const bundleSkill = bundleSkillEntry?.skill || null;
    if (!bundleSkill || bundleSkill.active === false || !isApprovedHelperSkill(bundleSkill)) {
      return false;
    }

    const bundleCatalogEntry = catalogIndex.byId?.get(bundleId) || null;
    return (
      (Array.isArray(bundleSkill?.pictures) && bundleSkill.pictures.length > 0)
      || (
        bundleCatalogEntry
        && String(bundleCatalogEntry.kind || '').toLowerCase() === 'bundle'
        && bundleCatalogEntry.inheritBundleImages !== false
      )
    );
  });
}

function skillMeetsPortfolioRequirement(skill = {}, helperServices = [], catalogEntry = null, catalogIndex = buildActiveServiceCatalogIndex([])) {
  if (Array.isArray(skill?.pictures) && skill.pictures.length > 0) {
    return true;
  }

  if (
    catalogEntry
    && String(catalogEntry.kind || '').toLowerCase() === 'bundle'
    && catalogEntry.inheritBundleImages !== false
  ) {
    return true;
  }

  return skillHasBundleBackedPortfolio(skill, helperServices, catalogIndex);
}

function reconcileHelperServiceApprovals({
  services = [],
  serviceCatalogEntries = [],
}) {
  const normalizedServices = normalizeHelperServicesForApprovalSync(services);
  const catalogIndex = buildActiveServiceCatalogIndex(serviceCatalogEntries);
  const catalogById = catalogIndex.byId || new Map();
  const autoSkillStateByCatalogId = new Map();

  normalizedServices.forEach((service) => {
    (service.skills || []).forEach((skill) => {
      if (String(skill.approvalSource || '').toLowerCase() === 'bundle_sync') {
        autoSkillStateByCatalogId.set(skill.catalogId, {
          serviceId: service.serviceId,
          serviceName: service.serviceName,
          description: service.description,
          skill: { ...skill },
        });
      }
    });
  });

  const baselineServices = normalizedServices
    .map((service) => ({
      ...service,
      skills: (service.skills || [])
        .filter((skill) => String(skill.approvalSource || '').toLowerCase() !== 'bundle_sync')
        .map((skill) => ({ ...skill })),
    }))
    .filter((service) => service.skills.length > 0);

  const requiredIndividualApprovals = new Map();
  const requiredBundleApprovals = new Map();
  const effectiveApprovedCatalogIds = new Set();

  baselineServices.forEach((service) => {
    (service.skills || []).forEach((skill) => {
      if (isApprovedHelperSkill(skill)) {
        effectiveApprovedCatalogIds.add(skill.catalogId);
      }
    });
  });

  let changed = true;
  let safetyCounter = 0;
  while (changed && safetyCounter < 20) {
    changed = false;
    safetyCounter += 1;

    for (const catalogEntry of catalogIndex.activeEntries) {
      const bundleId = normalizeServiceToken(catalogEntry.id);
      const includedServiceIds = normalizeCatalogIdList(catalogEntry.includedServiceIds);
      if (String(catalogEntry.kind || '').toLowerCase() !== 'bundle' || !bundleId || !includedServiceIds.length) {
        continue;
      }

      if (effectiveApprovedCatalogIds.has(bundleId)) {
        for (const includedId of includedServiceIds) {
          const current = requiredIndividualApprovals.get(includedId) || { bundleIds: [] };
          const nextBundleIds = mergeDerivedIds(current.bundleIds, [bundleId]);
          if (nextBundleIds.length !== current.bundleIds.length) {
            requiredIndividualApprovals.set(includedId, { bundleIds: nextBundleIds });
            changed = true;
          }
          if (!effectiveApprovedCatalogIds.has(includedId)) {
            effectiveApprovedCatalogIds.add(includedId);
            changed = true;
          }
        }
      }

      const hasEveryComponent = includedServiceIds.every((includedId) => effectiveApprovedCatalogIds.has(includedId));
      if (hasEveryComponent) {
        const current = requiredBundleApprovals.get(bundleId) || { serviceIds: [] };
        const nextServiceIds = mergeDerivedIds(current.serviceIds, includedServiceIds);
        if (nextServiceIds.length !== current.serviceIds.length) {
          requiredBundleApprovals.set(bundleId, { serviceIds: nextServiceIds });
          changed = true;
        }
        if (!effectiveApprovedCatalogIds.has(bundleId)) {
          effectiveApprovedCatalogIds.add(bundleId);
          changed = true;
        }
      }
    }
  }

  const reconciledServices = cloneHelperServicesForApprovalSync(baselineServices);
  const nowIso = new Date().toISOString();

  function ensureServiceContainer(catalogEntry = {}, fallbackState = null) {
    const targetServiceId = String(
      fallbackState?.serviceId
      || catalogEntry?.categoryId
      || catalogEntry?.categoryName
      || catalogEntry?.id
      || 'services'
    ).trim();
    const existing = reconciledServices.find((service) => service.serviceId === targetServiceId);
    if (existing) {
      if (!existing.serviceName) {
        existing.serviceName = String(
          fallbackState?.serviceName
          || catalogEntry?.categoryName
          || targetServiceId
        ).trim();
      }
      if (!existing.description && fallbackState?.description) {
        existing.description = String(fallbackState.description || '').trim();
      }
      return existing;
    }

    const created = {
      serviceId: targetServiceId,
      serviceName: String(
        fallbackState?.serviceName
        || catalogEntry?.categoryName
        || targetServiceId
      ).trim(),
      description: String(fallbackState?.description || '').trim(),
      skills: [],
    };
    reconciledServices.push(created);
    return created;
  }

  function applyDerivedApproval(catalogId, derivedState = {}, sourceType = 'bundle') {
    const normalizedCatalogId = normalizeServiceToken(catalogId);
    const catalogEntry = catalogById.get(normalizedCatalogId) || null;
    if (!normalizedCatalogId || !catalogEntry) {
      return;
    }

    const existing = findSkillByCatalogId(reconciledServices, normalizedCatalogId);
    const fallbackAutoState = autoSkillStateByCatalogId.get(normalizedCatalogId) || null;
    const targetService = ensureServiceContainer(catalogEntry, fallbackAutoState);
    const existingSkill = existing?.skill || fallbackAutoState?.skill || null;
    const existingApprovalSource = String(existingSkill?.approvalSource || '').toLowerCase();
    const isManualApproved = existingSkill && existingApprovalSource !== 'bundle_sync' && isApprovedHelperSkill(existingSkill);
    const shouldPreserveManualStatus = Boolean(isManualApproved);
    const nextSkillPayload = {
      ...(existingSkill || {}),
      id: existingSkill?.id || `${targetService.serviceId}_${normalizedCatalogId}`,
      catalogId: normalizedCatalogId,
      name: existingSkill?.name || catalogEntry.label || normalizedCatalogId,
      status: 'approved',
      verified: true,
      active: existingSkill?.active !== false,
      approvalSource: shouldPreserveManualStatus ? existingApprovalSource || 'manual' : 'bundle_sync',
      derivedFromBundleIds: sourceType === 'bundle'
        ? mergeDerivedIds(existingSkill?.derivedFromBundleIds, derivedState.bundleIds)
        : normalizeCatalogIdList(existingSkill?.derivedFromBundleIds),
      derivedFromServiceIds: sourceType === 'service'
        ? mergeDerivedIds(existingSkill?.derivedFromServiceIds, derivedState.serviceIds)
        : normalizeCatalogIdList(existingSkill?.derivedFromServiceIds),
      updatedAt: existingSkill?.updatedAt || existingSkill?.createdAt || nowIso,
      createdAt: existingSkill?.createdAt || nowIso,
      pictures: Array.isArray(existingSkill?.pictures) ? existingSkill.pictures : [],
    };
    const nextSkill = normalizeHelperSkill(nextSkillPayload, targetService.serviceId);
    const existingNormalizedSkill = existingSkill ? normalizeHelperSkill(existingSkill, targetService.serviceId) : null;
    if (existingNormalizedSkill && JSON.stringify(existingNormalizedSkill) === JSON.stringify(nextSkill)) {
      return;
    }

    nextSkill.updatedAt = nowIso;

    const skills = Array.isArray(targetService.skills) ? targetService.skills : [];
    const targetIndex = skills.findIndex((skill) => skill.catalogId === normalizedCatalogId);
    if (targetIndex >= 0) {
      skills[targetIndex] = nextSkill;
    } else {
      skills.push(nextSkill);
    }
    targetService.skills = skills;
  }

  for (const [catalogId, derivedState] of requiredIndividualApprovals.entries()) {
    applyDerivedApproval(catalogId, derivedState, 'bundle');
  }

  for (const [catalogId, derivedState] of requiredBundleApprovals.entries()) {
    applyDerivedApproval(catalogId, derivedState, 'service');
  }

  const finalServices = reconciledServices
    .map((service) => ({
      ...service,
      skills: (Array.isArray(service.skills) ? service.skills : [])
        .map((skill) => normalizeHelperSkill(skill, service.serviceId))
        .filter(Boolean),
    }))
    .filter((service) => service.skills.length > 0);

  return {
    changed: JSON.stringify(normalizedServices) !== JSON.stringify(finalServices),
    services: finalServices,
  };
}

function normalizeServiceCatalogEntry(entry = {}) {
  return normalizeMarketplaceServiceCatalogEntry(entry);
}

function buildActiveServiceCatalogIndex(entries = []) {
  const activeEntries = (Array.isArray(entries) ? entries : [])
    .map(normalizeServiceCatalogEntry)
    .filter(Boolean)
    .filter((entry) => entry.active !== false && entry.approved !== false);

  const byCategoryId = new Map();
  const byId = new Map();
  const activeCatalogIds = new Set();
  const activeTokens = new Set();

  activeEntries.forEach((entry) => {
    const entryIdToken = normalizeServiceToken(entry.id);
    activeCatalogIds.add(entryIdToken);
    if (entryIdToken) {
      byId.set(entryIdToken, entry);
    }
    [entry.id, entry.label, entry.categoryId, entry.categoryName].forEach((value) => {
      const token = normalizeServiceToken(value);
      if (token) activeTokens.add(token);
    });

    const categoryToken = normalizeServiceToken(entry.categoryId);
    if (categoryToken) {
      if (!byCategoryId.has(categoryToken)) {
        byCategoryId.set(categoryToken, []);
      }
      byCategoryId.get(categoryToken).push(entry);
    }
  });

  return {
    activeEntries,
    activeCatalogIds,
    activeTokens,
    byId,
    byCategoryId,
  };
}

function expandRequestedServiceTokens(requestServiceIds = [], serviceCatalogIndex = buildActiveServiceCatalogIndex([])) {
  const tokens = new Set();
  (Array.isArray(requestServiceIds) ? requestServiceIds : []).forEach((serviceId) => {
    const normalized = normalizeServiceToken(serviceId);
    if (!normalized) return;
    tokens.add(normalized);
    const catalogEntry = serviceCatalogIndex.byId?.get(normalized) || null;
    if (catalogEntry) {
      tokens.add(normalizeServiceToken(catalogEntry.label));
      (Array.isArray(catalogEntry.includedServiceIds) ? catalogEntry.includedServiceIds : []).forEach((includedId) => {
        const includedToken = normalizeServiceToken(includedId);
        if (includedToken) {
          tokens.add(includedToken);
        }
      });
      return;
    }

    const aliases = REQUEST_SERVICE_ALIASES[normalized] || [];
    aliases.forEach((alias) => {
      const aliasToken = normalizeServiceToken(alias);
      if (aliasToken) tokens.add(aliasToken);
    });
  });
  return [...tokens];
}

function skillBelongsToActiveCatalog(skill = {}, catalogIndex = buildActiveServiceCatalogIndex([])) {
  const catalogToken = normalizeServiceToken(skill?.catalogId || skill?.serviceCatalogId || '');
  const nameToken = normalizeServiceToken(skill?.name || '');
  return (
    (catalogToken && catalogIndex.activeCatalogIds.has(catalogToken))
    || (nameToken && catalogIndex.activeTokens.has(nameToken))
  );
}

async function getLiveServiceCatalogEntries() {
  const now = Date.now();
  if (serviceCatalogCache.entries.length && (now - serviceCatalogCache.loadedAtMs) < SERVICE_CATALOG_CACHE_TTL_MS) {
    return serviceCatalogCache.entries;
  }

  try {
    const snapshot = await db.collection('serviceCatalog').get();
    const entries = snapshot.docs
      .map((docSnap) => normalizeServiceCatalogEntry({ id: docSnap.id, ...docSnap.data() }))
      .filter(Boolean);

    serviceCatalogCache = {
      loadedAtMs: now,
      entries,
    };

    return entries;
  } catch (error) {
    logger.warn('service_catalog_lookup_failed', {
      error: error.message,
    });
    return serviceCatalogCache.entries || [];
  }
}

function helperSupportsCategory(helper = {}, categoryId = '', requestServiceIds = [], serviceCatalogIndex = null) {
  const catalogIndex = serviceCatalogIndex || buildActiveServiceCatalogIndex([]);
  const categoryToken = normalizeServiceToken(categoryId);
  const categoryEntries = catalogIndex.byCategoryId.get(categoryToken) || [];
  if (!categoryEntries.length) {
    return false;
  }

  const requestedTokens = expandRequestedServiceTokens(requestServiceIds, catalogIndex);
  const helperServices = Array.isArray(helper.services) ? helper.services : [];
  const activeCategorySkills = helperServices.flatMap((entry) => {
    const serviceIdToken = normalizeServiceToken(entry?.serviceId || '');
    return (Array.isArray(entry?.skills) ? entry.skills : [])
      .filter((skill) => {
        if (skill?.active === false || String(skill?.status || '').toLowerCase() !== 'approved') {
          return false;
        }
        if (!skillBelongsToActiveCatalog(skill, catalogIndex)) {
          return false;
        }

        const catalogToken = normalizeServiceToken(skill?.catalogId || skill?.serviceCatalogId || '');
        const catalogEntry = catalogIndex.byId?.get(catalogToken) || null;
        const skillCategoryToken = normalizeServiceToken(
          catalogEntry?.categoryId || catalogEntry?.categoryName || serviceIdToken,
        );
        if (skillCategoryToken !== categoryToken) {
          return false;
        }

        return skillMeetsPortfolioRequirement(skill, helperServices, catalogEntry, catalogIndex);
      })
      .map((skill) => ({
        ...skill,
        _catalogToken: normalizeServiceToken(skill?.catalogId || skill?.serviceCatalogId || ''),
        _nameToken: normalizeServiceToken(skill?.name || ''),
      }));
  });

  if (!activeCategorySkills.length) {
    return false;
  }
  if (!requestedTokens.length) {
    return true;
  }

  const helperSkillTokens = activeCategorySkills.flatMap((skill) => [skill._catalogToken, skill._nameToken]).filter(Boolean);
  return requestedTokens.some((token) => helperSkillTokens.includes(token));
}

const CUSTOMER_RECOMMENDATION_EVENT_WEIGHTS = {
  feed_impression: {
    serviceScore: 0.02,
    categoryScore: 0.01,
    exposureOnly: true,
  },
  search_open: {
    serviceScore: 0.04,
    categoryScore: 0.02,
    exposureOnly: true,
  },
  service_open: {
    serviceScore: 0.3,
    categoryScore: 0.15,
    exposureOnly: false,
  },
  search_select: {
    serviceScore: 0.9,
    categoryScore: 0.45,
    exposureOnly: false,
  },
  request_started: {
    serviceScore: 1.15,
    categoryScore: 0.6,
    exposureOnly: false,
  },
  request_submitted: {
    serviceScore: 1.6,
    categoryScore: 0.85,
    exposureOnly: false,
  },
  request_completed: {
    serviceScore: 2.3,
    categoryScore: 1.2,
    exposureOnly: false,
  },
  request_canceled: {
    serviceScore: -0.85,
    categoryScore: -0.45,
    exposureOnly: false,
  },
};
const CUSTOMER_RECOMMENDATION_RECENT_LIMIT = 20;
const CUSTOMER_RECOMMENDATION_TOP_LIMIT = 8;
const CUSTOMER_RECOMMENDATION_TRAINING_FEATURE_VERSION = 1;

function normalizeRecommendationToken(value = '') {
  return String(value || '').trim().toLowerCase();
}

function normalizeRecommendationTokenList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [values])
      .map((value) => normalizeRecommendationToken(value))
      .filter(Boolean),
  )];
}

function appendRecommendationRecent(list = [], value = '', limit = CUSTOMER_RECOMMENDATION_RECENT_LIMIT) {
  const nextValue = normalizeRecommendationToken(value);
  if (!nextValue) {
    return Array.isArray(list) ? list.slice(0, limit) : [];
  }

  const nextList = [nextValue, ...normalizeRecommendationTokenList(list).filter((item) => item !== nextValue)];
  return nextList.slice(0, limit);
}

function sortRecommendationScoreMap(scoreMap = {}, limit = CUSTOMER_RECOMMENDATION_TOP_LIMIT) {
  return Object.entries(scoreMap)
    .map(([key, value]) => [normalizeRecommendationToken(key), Number(value || 0)])
    .filter(([key]) => Boolean(key))
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([key]) => key);
}

function resolveCustomerRecommendationEventTargets(eventData = {}) {
  const metadata = eventData && typeof eventData.metadata === 'object' ? eventData.metadata : {};
  const serviceIds = normalizeRecommendationTokenList([
    ...(Array.isArray(eventData.serviceIds) ? eventData.serviceIds : []),
    eventData.serviceId,
    metadata.serviceId,
    metadata.topServiceId,
  ]);
  const categoryIds = normalizeRecommendationTokenList([
    eventData.categoryId,
    metadata.categoryId,
    metadata.topCategoryId,
  ]);

  return {
    serviceId: serviceIds[0] || '',
    serviceIds,
    categoryId: categoryIds[0] || '',
    categoryIds,
    metadata,
    requestId: String(eventData.requestId || metadata.requestId || '').trim(),
    sessionId: String(eventData.sessionId || metadata.sessionId || '').trim(),
  };
}

function getRecommendationEventProfileWeights(eventType = '') {
  return CUSTOMER_RECOMMENDATION_EVENT_WEIGHTS[normalizeRecommendationToken(eventType)] || {
    serviceScore: 0,
    categoryScore: 0,
    exposureOnly: true,
  };
}

function buildCustomerRecommendationTrainingSample({
  eventId = '',
  eventType = '',
  customerId = '',
  serviceId = '',
  serviceIds = [],
  categoryId = '',
  categoryIds = [],
  requestId = '',
  sessionId = '',
  source = '',
  metadata = {},
  createdAtMs = Date.now(),
  profileSnapshot = {},
}) {
  const labelWeights = {
    feed_impression: 0,
    search_open: 0,
    service_open: 0.25,
    search_select: 1,
    request_started: 2,
    request_submitted: 2.5,
    request_completed: 4,
    request_canceled: -1,
  };

  return {
    eventId,
    eventType: normalizeRecommendationToken(eventType),
    customerId,
    serviceId,
    serviceIds,
    categoryId,
    categoryIds,
    requestId,
    sessionId,
    source: normalizeRecommendationToken(source),
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    featureVersion: CUSTOMER_RECOMMENDATION_TRAINING_FEATURE_VERSION,
    label: Number(labelWeights[normalizeRecommendationToken(eventType)] ?? 0),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtMs,
    dayBucket: `${new Date(createdAtMs).getUTCFullYear()}-${String(new Date(createdAtMs).getUTCMonth() + 1).padStart(2, '0')}-${String(new Date(createdAtMs).getUTCDate()).padStart(2, '0')}`,
    profileSnapshot,
  };
}

function isHelperDispatchEligible(helper = {}, categoryId = '', requestServiceIds = [], catalogIndex = null) {
  const isDispatchPaused = isTruthyFlag(helper.dispatchPaused ?? helper.isDispatchPaused);
  const isSuspendedOrBlocked = isTruthyFlag(
    helper.suspended
      ?? helper.isSuspended
      ?? helper.blocked
      ?? helper.isBlocked,
  );
  const payoutVerificationStatus = String(helper?.payout?.verificationStatus || '').toLowerCase();
  const verificationStatus = String(helper?.verificationStatus || '').toLowerCase();

  return verificationStatus === 'verified'
    && payoutVerificationStatus === 'verified'
    && isHelperAgreementCurrent(helper)
    && helperSupportsCategory(helper, categoryId, requestServiceIds, catalogIndex)
    && !isDispatchPaused
    && !isSuspendedOrBlocked;
}

function normalizeCoordinate(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function buildLiveLocationPayload(payload = {}) {
  const latitude = normalizeCoordinate(payload.latitude);
  const longitude = normalizeCoordinate(payload.longitude);
  if (latitude === null || longitude === null) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy: normalizeCoordinate(payload.accuracy),
    altitude: normalizeCoordinate(payload.altitude),
    altitudeAccuracy: normalizeCoordinate(payload.altitudeAccuracy),
    heading: normalizeCoordinate(payload.heading),
    speed: normalizeCoordinate(payload.speed),
    source: String(payload.source || 'device').trim() || 'device',
    updatedAtMs: Date.now(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function getLiveLocationSnapshot(user = {}) {
  const location = user?.liveLocation || {};
  const latitude = normalizeCoordinate(location.latitude);
  const longitude = normalizeCoordinate(location.longitude);
  if (latitude === null || longitude === null) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy: normalizeCoordinate(location.accuracy),
    altitude: normalizeCoordinate(location.altitude),
    altitudeAccuracy: normalizeCoordinate(location.altitudeAccuracy),
    heading: normalizeCoordinate(location.heading),
    speed: normalizeCoordinate(location.speed),
    updatedAtMs: normalizeMillis(location.updatedAtMs ?? location.updatedAt),
  };
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function computeDistanceKm(origin = {}, destination = {}) {
  const originLatitude = normalizeCoordinate(origin.latitude);
  const originLongitude = normalizeCoordinate(origin.longitude);
  const destinationLatitude = normalizeCoordinate(destination.latitude);
  const destinationLongitude = normalizeCoordinate(destination.longitude);

  if (
    originLatitude === null
    || originLongitude === null
    || destinationLatitude === null
    || destinationLongitude === null
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const deltaLatitude = toRadians(destinationLatitude - originLatitude);
  const deltaLongitude = toRadians(destinationLongitude - originLongitude);
  const lat1 = toRadians(originLatitude);
  const lat2 = toRadians(destinationLatitude);

  const haversine = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * (Math.sin(deltaLongitude / 2) ** 2);
  const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return EARTH_RADIUS_KM * arc;
}

function getInitials(value = '') {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function isHelperMapVisible(helper = {}) {
  const isOnline = String(helper?.onlineStatus || '').toLowerCase() === 'online';
  const hasLocationSharing = helper?.locationSharingEnabled !== false;
  const location = getLiveLocationSnapshot(helper);
  const isFresh = location?.updatedAtMs ? (Date.now() - location.updatedAtMs) <= HELPER_LOCATION_STALE_MS : false;
  const verificationStatus = String(helper?.verificationStatus || '').toLowerCase();
  const isDispatchPaused = isTruthyFlag(helper.dispatchPaused ?? helper.isDispatchPaused);

  return isOnline
    && hasLocationSharing
    && isFresh
    && verificationStatus === 'verified'
    && isHelperAgreementCurrent(helper)
    && !isDispatchPaused
    && !isTruthyFlag(helper.suspended ?? helper.isSuspended ?? helper.blocked ?? helper.isBlocked);
}

function getLastKnownLocationSnapshot(user = {}) {
  const location = user?.lastKnownLocation || {};
  const latitude = normalizeCoordinate(location.latitude);
  const longitude = normalizeCoordinate(location.longitude);
  if (latitude === null || longitude === null) {
    return null;
  }

  return {
    latitude,
    longitude,
    updatedAtMs: normalizeMillis(location.updatedAtMs ?? location.updatedAt),
  };
}

function isCustomerMapVisible(customer = {}) {
  const role = String(customer?.activeRole || customer?.role || '').toLowerCase();
  const location = getLastKnownLocationSnapshot(customer);
  const isFresh = location?.updatedAtMs ? (Date.now() - location.updatedAtMs) <= CUSTOMER_LOCATION_STALE_MS : false;

  return role === 'customer' && isFresh;
}

function getHelperScore(helper = {}) {
  const metrics = helper.metrics || {};
  const acceptanceRate = normalizePositiveNumber(metrics.acceptanceRate, 0);
  const completionRate = normalizePositiveNumber(metrics.completionRate, 0);
  const overallRating = normalizePositiveNumber(metrics.overallRating, 0);
  const avgResponseMinutes = normalizePositiveNumber(metrics.avgResponseMinutes, 999);
  const cancellationRate = normalizePositiveNumber(metrics.cancellationRate, 0);
  const recentAssignmentsCount = normalizePositiveNumber(metrics.recentAssignmentsCount, 0);
  const responseScore = Math.max(0, 1 - Math.min(avgResponseMinutes, 60) / 60);

  return Number((
    acceptanceRate * 0.3
    + completionRate * 0.25
    + Math.min(overallRating / 5, 1) * 0.2
    + responseScore * 0.15
    - cancellationRate * 0.1
    - Math.min(recentAssignmentsCount, FAIRNESS_WORKLOAD_CAP) * 0.02
  ).toFixed(6));
}

function getHelperLastOfferAtMillis(helper = {}) {
  return normalizeMillis(helper?.lastOfferAt);
}

function getHelperRecentAssignmentsCount(helper = {}) {
  return normalizePositiveNumber(helper?.metrics?.recentAssignmentsCount, 0);
}

function getServiceRequestLocationSnapshot(request = {}) {
  const directLocation = request?.location || {};
  const payloadLocation = request?.requestPayload?.location || {};
  const latitude = normalizeCoordinate(directLocation.latitude ?? payloadLocation.latitude);
  const longitude = normalizeCoordinate(directLocation.longitude ?? payloadLocation.longitude);

  if (latitude === null || longitude === null) {
    return null;
  }

  return { latitude, longitude };
}

function getDispatchDistanceBand(distanceKm) {
  const normalizedDistance = Number(distanceKm);
  if (!Number.isFinite(normalizedDistance) || normalizedDistance < 0) {
    return null;
  }

  return HELPER_DISPATCH_DISTANCE_BANDS.find((band) => (
    normalizedDistance >= band.minKm && normalizedDistance <= band.maxKm
  )) || null;
}

function rankHelpersWithFairness(candidates = []) {
  const remaining = [...candidates]
    .map((helper) => ({
      helper,
      score: getHelperScore(helper),
      lastOfferAtMs: getHelperLastOfferAtMillis(helper),
      recentAssignmentsCount: getHelperRecentAssignmentsCount(helper),
    }))
    .sort((a, b) => b.score - a.score);

  const ordered = [];
  while (remaining.length) {
    const highestScore = remaining[0].score;
    const bucket = remaining.filter((entry) => (highestScore - entry.score) <= DISPATCH_NEAR_EQUAL_THRESHOLD);
    const oldestLastOfferAt = bucket.reduce(
      (min, entry) => Math.min(min, entry.lastOfferAtMs || 0),
      Number.POSITIVE_INFINITY,
    );
    const leastRecentlyOffered = bucket.filter((entry) => (entry.lastOfferAtMs || 0) === oldestLastOfferAt);
    const smallestRecentAssignments = leastRecentlyOffered.reduce(
      (min, entry) => Math.min(min, entry.recentAssignmentsCount),
      Number.POSITIVE_INFINITY,
    );
    const leastAssigned = leastRecentlyOffered.filter(
      (entry) => entry.recentAssignmentsCount === smallestRecentAssignments,
    );
    const picked = leastAssigned[randomIndex(leastAssigned.length)];
    ordered.push(picked.helper.uid);

    const removeIndex = remaining.findIndex((entry) => entry.helper.uid === picked.helper.uid);
    if (removeIndex >= 0) {
      remaining.splice(removeIndex, 1);
    } else {
      break;
    }
  }

  return ordered;
}

async function getHelperQueueForServiceRequest(request = {}) {
  const categoryId = String(request.categoryId || '').trim().toLowerCase();
  const requestServiceIds = Array.isArray(request.serviceIds) ? request.serviceIds : [];
  if (!categoryId) return [];

  const [helpersSnap, activeRequestsSnap, catalogEntries] = await Promise.all([
    db.collection('users')
      .where('activeRole', '==', 'helper')
      .where('onlineStatus', '==', 'online')
      .get(),
    db.collection('serviceRequests')
      .where('status', 'in', [...HELPER_BUSY_REQUEST_STATUSES])
      .get(),
    getLiveServiceCatalogEntries(),
  ]);

  const catalogIndex = buildActiveServiceCatalogIndex(catalogEntries);
  const categoryToken = normalizeServiceToken(categoryId);
  if (!catalogIndex.byCategoryId.has(categoryToken)) {
    return [];
  }

  const busyHelperIds = new Set(
    activeRequestsSnap.docs
      .map((item) => item.data()?.helperAssignment?.helperId)
      .filter(Boolean),
  );

  const eligibleHelpers = helpersSnap.docs
    .map((item) => ({ uid: item.id, ...item.data() }))
    .filter((helper) => !busyHelperIds.has(helper.uid))
    .filter((helper) => isHelperDispatchEligible(helper, categoryId, requestServiceIds, catalogIndex));
  const requestLocation = getServiceRequestLocationSnapshot(request);

  if (!requestLocation) {
    return rankHelpersWithFairness(eligibleHelpers);
  }

  const helpersByBand = new Map(HELPER_DISPATCH_DISTANCE_BANDS.map((band) => [band.key, []]));

  eligibleHelpers.forEach((helper) => {
    const helperLocation = getLiveLocationSnapshot(helper);
    if (!helperLocation) {
      return;
    }

    const distanceKm = computeDistanceKm(requestLocation, helperLocation);
    if (!Number.isFinite(distanceKm) || distanceKm > HELPER_DISPATCH_MAX_RADIUS_KM) {
      return;
    }

    const band = getDispatchDistanceBand(distanceKm);
    if (!band) {
      return;
    }

    helpersByBand.get(band.key)?.push({
      ...helper,
      dispatchDistanceKm: Number(distanceKm.toFixed(3)),
      dispatchDistanceBand: band.key,
    });
  });

  return HELPER_DISPATCH_DISTANCE_BANDS.flatMap((band) => {
    const bandHelpers = helpersByBand.get(band.key) || [];
    if (!bandHelpers.length) {
      return [];
    }

    return rankHelpersWithFairness(bandHelpers);
  });
}

function mergePreservedHelperQueue({
  preservedQueue = [],
  rebuiltQueue = [],
}) {
  const rebuiltIdSet = new Set(
    (Array.isArray(rebuiltQueue) ? rebuiltQueue : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  );
  const merged = [];
  const seen = new Set();

  const pushId = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    merged.push(normalized);
  };

  (Array.isArray(preservedQueue) ? preservedQueue : [])
    .filter((value) => rebuiltIdSet.has(String(value || '').trim()))
    .forEach(pushId);

  (Array.isArray(rebuiltQueue) ? rebuiltQueue : []).forEach(pushId);

  return merged;
}

function resolveNextServiceHelperSelection(request = {}, candidateQueue = [], now = Date.now()) {
  const excludedHelperIds = getServiceRequestExcludedHelperIds(request);
  const declinedHelperIdSet = new Set(getServiceRequestDeclinedHelperIds(request));
  const queue = mergePreservedHelperQueue({
    preservedQueue: request.helperQueue,
    rebuiltQueue: candidateQueue,
  });
  const excludedHelperIdSet = new Set(excludedHelperIds);
  const eligibleQueue = queue.filter((helperId) => !declinedHelperIdSet.has(helperId));
  const availableQueue = eligibleQueue.filter((helperId) => !excludedHelperIdSet.has(helperId));
  const deferredQueue = eligibleQueue.filter((helperId) => excludedHelperIdSet.has(helperId));

  if (availableQueue.length) {
    return {
      queue: [...availableQueue, ...deferredQueue],
      selectedHelperId: availableQueue[0],
      excludedHelperIds,
      resetExcludedHelperIds: false,
      reofferAfterCooldown: false,
    };
  }

  const lastOfferAtMs = normalizeMillis(request.lastOfferAt);
  const cooldownElapsed = deferredQueue.length > 0
    && lastOfferAtMs > 0
    && (now - lastOfferAtMs) >= HELPER_REOFFER_COOLDOWN_MS;

  if (cooldownElapsed) {
    return {
      queue: [...deferredQueue],
      selectedHelperId: deferredQueue[0] || '',
      excludedHelperIds,
      resetExcludedHelperIds: true,
      reofferAfterCooldown: true,
    };
  }

  return {
    queue: [...deferredQueue],
    selectedHelperId: '',
    excludedHelperIds,
    resetExcludedHelperIds: false,
    reofferAfterCooldown: false,
  };
}

exports.syncServiceRequestLifecycle = onDocumentWritten('serviceRequests/{requestId}', async (event) => {
  const afterData = event.data.after.exists ? event.data.after.data() : null;
  if (!afterData) return;

  logger.info('service_request_lifecycle_seen', {
    requestId: event.params.requestId,
    status: String(afterData.status || '').toLowerCase(),
    currentOfferHelperId: String(afterData.currentOfferHelperId || '').trim() || null,
    hasHelperAssignment: Boolean(afterData?.helperAssignment?.helperId),
    helperQueueSize: Array.isArray(afterData.helperQueue) ? afterData.helperQueue.length : 0,
    traceLabel: 'functions:syncServiceRequestLifecycle:seen',
  });

  if (!ACTIVE_SERVICE_REQUEST_STATUSES.has(afterData.status) || afterData?.helperAssignment?.helperId) {
    return;
  }

  const requestId = event.params.requestId;
  const requestRef = db.collection('serviceRequests').doc(requestId);
  const candidateQueue = await getHelperQueueForServiceRequest(afterData);

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(requestRef);
    if (!snap.exists) return;
    const request = snap.data() || {};
    const now = Date.now();

    if (!ACTIVE_SERVICE_REQUEST_STATUSES.has(request.status) || request?.helperAssignment?.helperId) {
      return;
    }

    if (
      request.status === SERVICE_REQUEST_STATUS.HELPER_FOUND
      && request.currentOfferHelperId
      && normalizeMillis(request.offerExpiresAt) > Date.now()
    ) {
      logger.info('service_request_lifecycle_offer_preserved', {
        requestId,
        currentOfferHelperId: String(request.currentOfferHelperId || '').trim() || null,
        offerExpiresAt: normalizeMillis(request.offerExpiresAt) || null,
        helperQueueSize: Array.isArray(request.helperQueue) ? request.helperQueue.length : 0,
        traceLabel: 'functions:syncServiceRequestLifecycle:offerPreserved',
      });
      return;
    }

    const selection = resolveNextServiceHelperSelection(request, candidateQueue, now);
    const { queue, selectedHelperId } = selection;

    logger.info('service_request_lifecycle_selection', {
      requestId,
      requestStatus: String(request.status || '').toLowerCase(),
      candidateQueueSize: Array.isArray(candidateQueue) ? candidateQueue.length : 0,
      selectedHelperId: selectedHelperId || null,
      selectedQueueSize: Array.isArray(queue) ? queue.length : 0,
      excludedHelperIds: selection.excludedHelperIds || [],
      resetExcludedHelperIds: Boolean(selection.resetExcludedHelperIds),
      reofferAfterCooldown: Boolean(selection.reofferAfterCooldown),
      traceLabel: 'functions:syncServiceRequestLifecycle:selection',
    });

    if (!selectedHelperId) {
      if (request.status !== SERVICE_REQUEST_STATUS.NO_HELPER_AVAILABLE) {
        logger.info('service_request_lifecycle_no_helper_available', {
          requestId,
          helperQueueSize: Array.isArray(queue) ? queue.length : 0,
          excludedHelperIds: selection.excludedHelperIds || [],
          traceLabel: 'functions:syncServiceRequestLifecycle:noHelperAvailable',
        });
        transaction.update(requestRef, {
          status: SERVICE_REQUEST_STATUS.NO_HELPER_AVAILABLE,
          statusDetail: 'No helpers are currently available for this request.',
          helperQueue: queue,
          currentOfferHelperId: null,
          offerExpiresAt: null,
          offerToken: null,
          offerCycleExcludedHelperIds: selection.excludedHelperIds,
          declinedHelperIds: getServiceRequestDeclinedHelperIds(request),
          matchingStartedAtMs: getRequestMatchingStartedAtMs(request) || Date.now(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      return;
    }

    const selectedHelperRef = db.collection('users').doc(selectedHelperId);
    const offerRevision = nextOfferRevision(request);
    const offerToken = randomUUID();

    logger.info('service_request_lifecycle_offer_written', {
      requestId,
      selectedHelperId,
      helperQueueSize: Array.isArray(queue) ? queue.length : 0,
      offerRevision,
      offerExpiresAt: now + OFFER_TIMEOUT_MS,
      statusDetail: selection.reofferAfterCooldown
        ? 'Retrying the available helper after cooldown.'
        : 'Helper notified. Waiting for acceptance.',
      traceLabel: 'functions:syncServiceRequestLifecycle:offerWritten',
    });

    transaction.update(requestRef, {
      status: SERVICE_REQUEST_STATUS.HELPER_FOUND,
      statusDetail: selection.reofferAfterCooldown
        ? 'Retrying the available helper after cooldown.'
        : 'Helper notified. Waiting for acceptance.',
      helperQueue: queue,
      currentOfferHelperId: selectedHelperId,
      offerExpiresAt: now + OFFER_TIMEOUT_MS,
      lastOfferAt: now,
      offerRevision,
      offerToken,
      offerCycleExcludedHelperIds: selection.resetExcludedHelperIds ? [] : selection.excludedHelperIds,
      declinedHelperIds: getServiceRequestDeclinedHelperIds(request),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.set(selectedHelperRef, {
      lastOfferAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
});

exports.syncServiceRequestAssignmentState = onDocumentWritten('serviceRequests/{requestId}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!after) return;

  const requestId = event.params.requestId;
  const beforeStatus = String(before?.status || '').toLowerCase();
  const afterStatus = String(after?.status || '').toLowerCase();
  const helperId = after?.helperAssignment?.helperId || before?.helperAssignment?.helperId || null;

  if (afterStatus === SERVICE_REQUEST_STATUS.ACCEPTED && helperId) {
    logger.info('service_request_assignment_state_write', {
      requestId,
      helperId,
      afterStatus,
      traceLabel: 'functions:syncServiceRequestAssignmentState:accepted',
    });
    await Promise.all([
      db.collection('users').doc(helperId).set({
        activeServiceRequestId: requestId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }),
      createUserNotification({
        userId: after.customerId || before?.customerId || null,
        title: 'Helper selected',
        message: `${after?.helperAssignment?.helperName || 'A helper'} accepted your request.`,
        type: 'request_accepted',
        requestId,
        targetPath: `/customer/requests/${requestId}`,
      }),
    ]);
    return;
  }

  if (
    helperId
    && [SERVICE_REQUEST_STATUS.COMPLETED, SERVICE_REQUEST_STATUS.CANCELED, SERVICE_REQUEST_STATUS.EXPIRED].includes(afterStatus)
    && beforeStatus !== afterStatus
  ) {
    logger.info('service_request_assignment_state_write', {
      requestId,
      helperId,
      afterStatus,
      traceLabel: 'functions:syncServiceRequestAssignmentState:clear',
    });
    await db.collection('users').doc(helperId).set({
      activeServiceRequestId: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  if (afterStatus === SERVICE_REQUEST_STATUS.NO_HELPER_AVAILABLE && beforeStatus !== SERVICE_REQUEST_STATUS.NO_HELPER_AVAILABLE) {
    await createUserNotification({
      userId: after.customerId || before?.customerId || null,
      title: 'No helpers available',
      message: 'No helper is currently available for this request right now.',
      type: 'matching_update',
      requestId,
      targetPath: `/customer/requests/${requestId}`,
    });
  }
});

exports.trackCustomerServiceEvents = onDocumentCreated('customerServiceEvents/{eventId}', async (event) => {
  const rawEvent = event.data?.data();
  if (!rawEvent) return;

  const eventId = String(event.params.eventId || '').trim();
  const customerId = String(rawEvent.customerId || '').trim();
  const eventType = normalizeRecommendationToken(rawEvent.eventType);
  if (!eventId || !customerId || !eventType) return;

  const eventWeights = getRecommendationEventProfileWeights(eventType);
  const targets = resolveCustomerRecommendationEventTargets(rawEvent);
  const createdAtMs = normalizeMillis(rawEvent.createdAtMs || rawEvent.createdAt || Date.now()) || Date.now();
  const profileRef = db.collection('customerRecommendationProfiles').doc(customerId);
  const sampleRef = db.collection('customerRecommendationTrainingSamples').doc(eventId);

  await db.runTransaction(async (transaction) => {
    const profileSnap = await transaction.get(profileRef);
    const currentProfile = profileSnap.exists ? (profileSnap.data() || {}) : {};

    const eventCounts = { ...(currentProfile.eventCounts || {}) };
    eventCounts[eventType] = Number(eventCounts[eventType] || 0) + 1;

    const serviceScores = { ...(currentProfile.serviceScores || {}) };
    const categoryScores = { ...(currentProfile.categoryScores || {}) };
    const serviceCounts = { ...(currentProfile.serviceCounts || {}) };
    const categoryCounts = { ...(currentProfile.categoryCounts || {}) };
    const serviceExposureCounts = { ...(currentProfile.serviceExposureCounts || {}) };
    const categoryExposureCounts = { ...(currentProfile.categoryExposureCounts || {}) };
    const serviceLastEventAt = { ...(currentProfile.serviceLastEventAt || {}) };
    const categoryLastEventAt = { ...(currentProfile.categoryLastEventAt || {}) };
    let recentServiceIds = Array.isArray(currentProfile.recentServiceIds) ? [...currentProfile.recentServiceIds] : [];
    let recentCategoryIds = Array.isArray(currentProfile.recentCategoryIds) ? [...currentProfile.recentCategoryIds] : [];

    const serviceTargets = targets.serviceIds.length ? targets.serviceIds : (targets.serviceId ? [targets.serviceId] : []);
    const categoryTargets = targets.categoryIds.length ? targets.categoryIds : (targets.categoryId ? [targets.categoryId] : []);
    const profileSnapshot = {
      serviceId: targets.serviceId || '',
      categoryId: targets.categoryId || '',
      serviceScore: Number(currentProfile.serviceScores?.[targets.serviceId] || 0),
      categoryScore: Number(currentProfile.categoryScores?.[targets.categoryId] || 0),
      serviceCount: Number(currentProfile.serviceCounts?.[targets.serviceId] || 0),
      categoryCount: Number(currentProfile.categoryCounts?.[targets.categoryId] || 0),
      serviceExposureCount: Number(currentProfile.serviceExposureCounts?.[targets.serviceId] || 0),
      categoryExposureCount: Number(currentProfile.categoryExposureCounts?.[targets.categoryId] || 0),
      topServiceIds: sortRecommendationScoreMap(currentProfile.serviceScores || {}, CUSTOMER_RECOMMENDATION_TOP_LIMIT),
      topCategoryIds: sortRecommendationScoreMap(currentProfile.categoryScores || {}, CUSTOMER_RECOMMENDATION_TOP_LIMIT),
      recentServiceIds: normalizeRecommendationTokenList(currentProfile.recentServiceIds || []).slice(0, CUSTOMER_RECOMMENDATION_RECENT_LIMIT),
      recentCategoryIds: normalizeRecommendationTokenList(currentProfile.recentCategoryIds || []).slice(0, CUSTOMER_RECOMMENDATION_RECENT_LIMIT),
    };

    serviceTargets.forEach((serviceTarget) => {
      if (!serviceTarget) return;
      serviceExposureCounts[serviceTarget] = Number(serviceExposureCounts[serviceTarget] || 0) + 1;
      if (!eventWeights.exposureOnly) {
        serviceCounts[serviceTarget] = Number(serviceCounts[serviceTarget] || 0) + 1;
      }
      if (Number(eventWeights.serviceScore || 0) !== 0) {
        serviceScores[serviceTarget] = Number((Number(serviceScores[serviceTarget] || 0) + Number(eventWeights.serviceScore || 0)).toFixed(4));
      }
      serviceLastEventAt[serviceTarget] = createdAtMs;
      recentServiceIds = appendRecommendationRecent(recentServiceIds, serviceTarget);
    });

    categoryTargets.forEach((categoryTarget) => {
      if (!categoryTarget) return;
      categoryExposureCounts[categoryTarget] = Number(categoryExposureCounts[categoryTarget] || 0) + 1;
      if (!eventWeights.exposureOnly) {
        categoryCounts[categoryTarget] = Number(categoryCounts[categoryTarget] || 0) + 1;
      }
      if (Number(eventWeights.categoryScore || 0) !== 0) {
        categoryScores[categoryTarget] = Number((Number(categoryScores[categoryTarget] || 0) + Number(eventWeights.categoryScore || 0)).toFixed(4));
      }
      categoryLastEventAt[categoryTarget] = createdAtMs;
      recentCategoryIds = appendRecommendationRecent(recentCategoryIds, categoryTarget);
    });

    const topServiceIds = sortRecommendationScoreMap(serviceScores);
    const topCategoryIds = sortRecommendationScoreMap(categoryScores);

    transaction.set(profileRef, {
      customerId,
      eventCounts,
      serviceScores,
      categoryScores,
      serviceCounts,
      categoryCounts,
      serviceExposureCounts,
      categoryExposureCounts,
      serviceLastEventAt,
      categoryLastEventAt,
      recentServiceIds: recentServiceIds.slice(0, CUSTOMER_RECOMMENDATION_RECENT_LIMIT),
      recentCategoryIds: recentCategoryIds.slice(0, CUSTOMER_RECOMMENDATION_RECENT_LIMIT),
      topServiceIds: topServiceIds.slice(0, CUSTOMER_RECOMMENDATION_TOP_LIMIT),
      topCategoryIds: topCategoryIds.slice(0, CUSTOMER_RECOMMENDATION_TOP_LIMIT),
      lastEventAt: createdAtMs,
      lastEventType: eventType,
      lastEventId: eventId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: currentProfile.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    transaction.set(sampleRef, buildCustomerRecommendationTrainingSample({
      eventId,
      eventType,
      customerId,
      serviceId: targets.serviceId || '',
      serviceIds: serviceTargets,
      categoryId: targets.categoryId || '',
      categoryIds: categoryTargets,
      requestId: targets.requestId,
      sessionId: targets.sessionId,
      source: rawEvent.source || '',
      metadata: targets.metadata,
      createdAtMs,
      profileSnapshot,
    }), { merge: true });
  });
});

exports.promoteScheduledServiceRequests = onSchedule('every 1 minutes', async () => {
  const now = Date.now();
  const snapshot = await db.collection('serviceRequests')
    .where('status', '==', SERVICE_REQUEST_STATUS.SCHEDULED_PENDING)
    .get();

  if (snapshot.empty) {
    return;
  }

  const batch = db.batch();
  let updatesCount = 0;

  snapshot.docs.forEach((docSnap) => {
    const request = docSnap.data() || {};
    const scheduledAtMs = normalizeMillis(request?.requestPayload?.scheduledForAtMs)
      || normalizeMillis(Date.parse(String(request?.requestPayload?.scheduledForText || '').trim()));

    if (!scheduledAtMs || scheduledAtMs > now) {
      return;
    }

    batch.update(docSnap.ref, {
      status: SERVICE_REQUEST_STATUS.MATCHING,
      statusDetail: 'Scheduled time reached. Matching the next helper.',
      matchingStartedAtMs: Date.now(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    updatesCount += 1;
  });

  if (updatesCount) {
    await batch.commit();
  }
});

exports.syncHelperQueueOnHelperOnline = onDocumentWritten('users/{uid}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!after || !isHelperUserRecord(after)) return;

  const wasOnline = String(before?.onlineStatus || '').toLowerCase() === 'online';
  const isOnline = String(after.onlineStatus || '').toLowerCase() === 'online';
  if (wasOnline || !isOnline) return;
  if (String(after.activeServiceRequestId || '').trim()) return;

  const requestsSnap = await db.collection('serviceRequests')
    .where('status', 'in', [
      SERVICE_REQUEST_STATUS.MATCHING,
      SERVICE_REQUEST_STATUS.HELPER_FOUND,
      SERVICE_REQUEST_STATUS.NO_HELPER_AVAILABLE,
    ])
    .get();

  if (requestsSnap.empty) return;

  const catalogEntries = await getLiveServiceCatalogEntries();
  const catalogIndex = buildActiveServiceCatalogIndex(catalogEntries);
  const candidateRequests = requestsSnap.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((request) => !request?.helperAssignment?.helperId)
    .sort((left, right) => (
      getRequestMatchingStartedAtMs(left) - getRequestMatchingStartedAtMs(right)
      || normalizeMillis(left.createdAt) - normalizeMillis(right.createdAt)
      || normalizeMillis(left.updatedAt) - normalizeMillis(right.updatedAt)
    ));

  for (const request of candidateRequests) {
    const categoryId = String(request.categoryId || '').trim();
    const requestServiceIds = Array.isArray(request.serviceIds) ? request.serviceIds : [];
    if (!isHelperDispatchEligible(after, categoryId, requestServiceIds, catalogIndex)) {
      continue;
    }

    const candidateQueue = await getHelperQueueForServiceRequest(request);
    if (!candidateQueue.includes(event.params.uid)) {
      continue;
    }

    logger.info('helper_online_queue_candidate_match', {
      helperId: event.params.uid,
      requestId: request.id,
      requestStatus: String(request.status || '').toLowerCase(),
      candidateQueueSize: Array.isArray(candidateQueue) ? candidateQueue.length : 0,
      preservedQueueSize: Array.isArray(request.helperQueue) ? request.helperQueue.length : 0,
      traceLabel: 'functions:syncHelperQueueOnHelperOnline:candidateMatch',
    });

    const requestRef = db.collection('serviceRequests').doc(request.id);
    const currentQueue = mergePreservedHelperQueue({
      preservedQueue: request.helperQueue,
      rebuiltQueue: candidateQueue,
    });
    const queueChanged = currentQueue.length !== (Array.isArray(request.helperQueue) ? request.helperQueue.length : 0)
      || currentQueue.some((helperId, index) => helperId !== (Array.isArray(request.helperQueue) ? request.helperQueue[index] : undefined));
    if (!queueChanged) {
      continue;
    }

    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(requestRef);
      if (!snap.exists) return;

      const current = snap.data() || {};
      const currentStatus = String(current.status || '').toLowerCase();
      if (![SERVICE_REQUEST_STATUS.MATCHING, SERVICE_REQUEST_STATUS.HELPER_FOUND, SERVICE_REQUEST_STATUS.NO_HELPER_AVAILABLE].includes(currentStatus)) {
        return;
      }
      if (current?.helperAssignment?.helperId) {
        return;
      }

      const nextQueue = mergePreservedHelperQueue({
        preservedQueue: current.helperQueue,
        rebuiltQueue: candidateQueue,
      });
      const nextUpdates = {
        helperQueue: nextQueue,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (currentStatus === SERVICE_REQUEST_STATUS.NO_HELPER_AVAILABLE) {
        nextUpdates.status = SERVICE_REQUEST_STATUS.MATCHING;
        nextUpdates.statusDetail = 'A helper became available. Matching the next helper.';
        nextUpdates.currentOfferHelperId = null;
        nextUpdates.offerExpiresAt = null;
        nextUpdates.offerToken = null;
        nextUpdates.matchingStartedAtMs = getRequestMatchingStartedAtMs(current) || Date.now();
      } else if (currentStatus === SERVICE_REQUEST_STATUS.MATCHING && !current.currentOfferHelperId) {
        nextUpdates.matchingStartedAtMs = getRequestMatchingStartedAtMs(current) || Date.now();
      }

      transaction.update(requestRef, nextUpdates);
    });

    logger.info('helper_online_queue_request_updated', {
      helperId: event.params.uid,
      requestId: request.id,
      nextStatus: String((request.status === SERVICE_REQUEST_STATUS.NO_HELPER_AVAILABLE ? SERVICE_REQUEST_STATUS.MATCHING : request.status) || '').toLowerCase(),
      traceLabel: 'functions:syncHelperQueueOnHelperOnline:requestUpdated',
    });

    break;
  }
});

exports.sendWelcomeEmailOnUserCreate = onDocumentCreated('users/{uid}', async (event) => {
  const after = event.data?.data() || null;
  if (!after) return;

  const email = String(after.email || '').trim();
  if (!email) return;

  const role = String(after.activeRole || after.role || 'student').trim().toLowerCase() || 'student';
  const fullName = String(after.fullName || after.displayName || after.name || '').trim() || email.split('@')[0];

  try {
    await queueEmailEventOnce({
      eventId: buildEmailEventId('welcome', event.params.uid),
      eventType: 'welcome',
      payload: {
        email,
        fullName,
        role,
      },
      source: 'users/{uid}:create',
    });
  } catch (error) {
    logger.warn('Failed to queue welcome email event.', {
      uid: event.params.uid,
      error: error.message,
    });
  }
});

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEmailTemplate({
  eyebrow = 'Parakleo',
  title,
  intro,
  details = [],
  tone = 'emerald',
  closing = 'Thanks for learning with Parakleo.',
}) {
  const accent = tone === 'rose'
    ? { solid: '#f43f5e', soft: '#ffe4e6', glow: 'rgba(244, 63, 94, 0.22)' }
    : tone === 'sky'
      ? { solid: '#38bdf8', soft: '#e0f2fe', glow: 'rgba(56, 189, 248, 0.22)' }
      : { solid: '#10b981', soft: '#d1fae5', glow: 'rgba(16, 185, 129, 0.22)' };

  const detailMarkup = details.length
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 24px; border-collapse: separate; border-spacing: 0 10px;">
        ${details.map((item) => `
          <tr>
            <td style="width: 38%; padding: 12px 14px; border-radius: 14px 0 0 14px; background: rgba(255,255,255,0.04); color: #a1a1aa; font-size: 13px; letter-spacing: 0.02em;">
              ${escapeHtml(item.label)}
            </td>
            <td style="padding: 12px 14px; border-radius: 0 14px 14px 0; background: rgba(255,255,255,0.07); color: #f4f4f5; font-size: 13px; font-weight: 600;">
              ${escapeHtml(item.value)}
            </td>
          </tr>
        `).join('')}
      </table>
    `
    : '';

  return `
    <!doctype html>
    <html>
      <body style="margin: 0; padding: 0; background: #09090b; font-family: Inter, Arial, sans-serif; color: #f4f4f5;">
        <div style="background:
          radial-gradient(circle at 12% 20%, ${accent.glow}, transparent 34%),
          radial-gradient(circle at 82% 6%, rgba(99, 102, 241, 0.18), transparent 40%),
          linear-gradient(180deg, #09090b 0%, #0f172a 100%);
          padding: 32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 640px; margin: 0 auto; border-collapse: separate;">
            <tr>
              <td style="padding-bottom: 18px; text-align: center;">
                <div style="display: inline-block; padding: 8px 14px; border-radius: 999px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: #e4e4e7; font-size: 12px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;">
                  ${escapeHtml(eyebrow)}
                </div>
              </td>
            </tr>
            <tr>
              <td style="border: 1px solid rgba(255,255,255,0.08); background: rgba(24,24,27,0.88); box-shadow: 0 20px 40px rgba(2,6,23,0.45); border-radius: 28px; padding: 32px;">
                <div style="height: 6px; width: 88px; border-radius: 999px; background: ${accent.solid}; margin-bottom: 22px;"></div>
                <h1 style="margin: 0 0 12px; color: #fafafa; font-size: 28px; line-height: 1.2; font-weight: 800;">
                  ${escapeHtml(title)}
                </h1>
                <p style="margin: 0; color: #d4d4d8; font-size: 15px; line-height: 1.7;">
                  ${escapeHtml(intro)}
                </p>
                ${detailMarkup}
                <div style="margin-top: 28px; padding: 16px 18px; border-radius: 18px; background: ${accent.soft}; color: #111827; font-size: 14px; line-height: 1.6;">
                  ${escapeHtml(closing)}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding-top: 14px; text-align: center; color: #a1a1aa; font-size: 12px; line-height: 1.6;">
                Parakleo account notifications
              </td>
            </tr>
          </table>
        </div>
      </body>
    </html>
  `;
}

function buildEmailPayload(eventType, payload) {
  switch (eventType) {
    case 'tutor_agreement_signed':
      return {
        to: payload.email,
        subject: 'Welcome to Parakleo — Your Tutor Agreement',
        html: renderEmailTemplate({
          eyebrow: 'Tutor Agreement',
          title: 'Welcome to Parakleo',
          intro: 'Thank you for completing your Tutor Agreement.',
          details: [
            { label: 'Agreement', value: 'Tutor Agreement' },
            { label: 'Version', value: payload.version || 'N/A' },
            { label: 'Accepted at', value: payload.acceptedAt || 'N/A' },
            { label: 'Legal entity', value: LEGAL_ENTITY_NAME },
          ],
          closing: 'Attached is a copy of the agreement entered into between you and Parakleo, operated by Jabu Msiza. Please keep this copy for your records.',
          tone: 'emerald',
        }),
      };
    case 'welcome':
      return {
        to: payload.email,
        subject: `Welcome to Parakleo, ${payload.fullName}!`,
        html: renderEmailTemplate({
          eyebrow: 'Welcome',
          title: `Welcome to Parakleo, ${payload.fullName || 'there'}`,
          intro: `Your ${payload.role || 'Parakleo'} account is ready. You can now manage requests, sessions, and payments from one place.`,
          details: [
            { label: 'Account type', value: payload.role || 'User' },
          ],
        }),
      };
    case 'card_added':
      return {
        to: payload.email,
        subject: 'Card added to your Parakleo profile',
        html: renderEmailTemplate({
          eyebrow: 'Card added',
          title: 'Card added to your profile',
          intro: `Your ${payload.cardBrand || 'card'} ending in ${payload.cardLast4 || '----'} was added to your profile.`,
          details: [
            { label: 'Card', value: `${payload.cardBrand || 'Card'} •••• ${payload.cardLast4 || '----'}` },
            { label: 'Authorization refund', value: payload.refundStatus || 'processing' },
            { label: 'Refund amount', value: formatMoney(payload.refundAmount || 1) },
          ],
        }),
      };
    case 'refund_processed':
      return {
        to: payload.email,
        subject: 'Paystack refund processed',
        html: renderEmailTemplate({
          eyebrow: 'Refund processed',
          title: 'Your refund has been processed',
          intro: payload.refundType === 'card_authorization'
            ? 'The authorization refund for your saved card has been processed.'
            : 'A Paystack refund associated with your account has been processed.',
          details: [
            { label: 'Amount', value: formatMoney(payload.refundAmount || 0) },
            { label: 'Status', value: payload.refundStatus || 'processed' },
            { label: 'Reference', value: payload.reference || payload.transactionId || 'N/A' },
          ],
        }),
      };
    case 'session_invoice':
      return {
        to: [payload.studentEmail, payload.tutorEmail],
        subject: `Session invoice: ${payload.subject || 'Class'}`,
        html: renderEmailTemplate({
          eyebrow: 'Session invoice',
          title: `${payload.subject || 'Class'} session invoice`,
          intro: payload.closureType === 'canceled_during'
            ? 'This session was canceled during the session and the final billing details are below.'
            : 'This session has been completed and the final billing details are below.',
          details: [
            { label: 'Closure type', value: payload.closureType === 'canceled_during' ? 'Canceled during session' : 'Completed' },
            { label: 'Student', value: payload.studentName || 'Student' },
            { label: 'Tutor', value: payload.tutorName || 'Tutor' },
            { label: 'Session ID', value: payload.sessionId || 'N/A' },
            { label: 'Billed minutes', value: String(Number(payload.billedMinutes || 0).toFixed(2)) },
            { label: 'Rate per minute', value: formatMoney(payload.ratePerMinute || payload.rate || 0) },
            { label: 'Gross amount', value: formatMoney(payload.originalPrice || payload.grossAmount || 0) },
            { label: 'Discount applied', value: formatMoney(payload.discountApplied || 0) },
            { label: 'Final amount', value: formatMoney(payload.finalAmount || payload.totalAmount || 0) },
            { label: 'Tutor share', value: formatMoney(payload.tutorAmount || 0) },
            { label: 'Platform fee', value: formatMoney(payload.platformAmount || 0) },
            { label: 'Payment status', value: payload.paymentStatus || 'processed' },
            ...(payload.canceledReason ? [{ label: 'Cancellation reason', value: payload.canceledReason }] : []),
          ],
          tone: 'sky',
        }),
      };
    case 'tutor_profile_completed':
      return {
        to: payload.email,
        subject: 'Your tutor profile is complete',
        html: renderEmailTemplate({
          eyebrow: 'Profile complete',
          title: 'Your tutor profile is complete',
          intro: 'Your tutor profile has been completed and you can now receive tutor requests.',
          details: [
            { label: 'Subjects', value: payload.subjects || 'Ready to teach' },
            { label: 'Payout', value: payload.payoutReady ? 'Verified' : 'Pending' },
          ],
          tone: 'sky',
        }),
      };
    case 'tutor_payout_details_submitted':
      return {
        to: payload.email,
        subject: 'Tutor banking details received',
        html: renderEmailTemplate({
          eyebrow: 'Banking details',
          title: 'Tutor banking details received',
          intro: 'Your tutor payout banking details were submitted and verified.',
          details: [
            { label: 'Bank', value: payload.bankName || 'N/A' },
            { label: 'Account holder', value: payload.accountHolder || 'N/A' },
            { label: 'Account number', value: payload.accountNumberMasked || 'N/A' },
            { label: 'Verification', value: payload.verificationStatus || 'verified' },
          ],
        }),
      };
    case 'tutor_payout_status':
      return {
        to: payload.email,
        subject: `Tutor payout ${payload.status || 'update'}: ${payload.weekKey || 'weekly payout'}`,
        html: renderEmailTemplate({
          eyebrow: 'Tutor payout',
          title: `Tutor payout ${payload.status || 'update'}`,
          intro: 'Your automatic tutor payout has been updated with the latest status and breakdown.',
          details: [
            { label: 'Week', value: payload.weekKey || 'Weekly payout' },
            { label: 'Status', value: payload.status || 'updated' },
            { label: 'Total sessions', value: String(Number(payload.totalSessions || 0)) },
            ...(payload.weekStart ? [{ label: 'Week start', value: payload.weekStart }] : []),
            ...(payload.weekEnd ? [{ label: 'Week end', value: payload.weekEnd }] : []),
            { label: 'Gross amount', value: formatMoney(payload.grossAmount || 0) },
            { label: 'Tutor rate', value: `${Math.round(Number(payload.tutorRate || 0) * 100)}%` },
            { label: 'Tutor amount', value: formatMoney(payload.tutorAmount || 0) },
            { label: 'Platform rate', value: `${Math.round(Number(payload.platformFeeRate || 0) * 100)}%` },
            { label: 'Platform amount', value: formatMoney(payload.platformAmount || 0) },
            ...(payload.transferReference ? [{ label: 'Transfer reference', value: payload.transferReference }] : []),
            ...(payload.transferStatus ? [{ label: 'Transfer status', value: payload.transferStatus }] : []),
            ...(payload.failureReason ? [{ label: 'Failure reason', value: payload.failureReason }] : []),
          ],
          tone: payload.status === 'paid' ? 'emerald' : payload.status === 'unsuccessful' ? 'rose' : 'sky',
          closing: 'Review the payout record in Parakleo if you need the full session breakdown.',
        }),
      };
    default:
      return null;
  }
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.substring('Bearer '.length).trim();
}

function isAllowlistedAdminEmail(email = '') {
  const normalized = String(email || '').trim().toLowerCase();
  return ['jabuobed1@gmail.com'].includes(normalized);
}

function isAdminToken(decoded = {}) {
  return Boolean(
    decoded?.admin === true
      || decoded?.isAdmin === true
      || isAllowlistedAdminEmail(decoded?.email),
  );
}

function isAdminUserRecord(user = {}) {
  const roles = new Set(
    [
      user?.role,
      user?.activeRole,
      ...(Array.isArray(user?.roles) ? user.roles : []),
    ]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean),
  );

  return roles.has('admin');
}

function normalizeExtractedText(rawText) {
  return String(rawText || '').replace(/\s+/g, ' ').trim();
}

function capitalizeTopic(value = '') {
  const normalized = normalizeExtractedText(value);
  if (!normalized) return '';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function toMoney(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Number(numeric.toFixed(6));
}

function toRand(value) {
  return Number(toMoney(value).toFixed(2));
}

const SERVICE_BOOKING_FEE_RATE = 0.01;
const SERVICE_BOOKING_FEE_CAP = 5;
const SERVICE_TRAVEL_RATE_PER_KM = 4;
const SERVICE_DEFAULT_TRAVEL_FEE = 35;
const HELPER_LABOR_PAYOUT_RATE = 0.7;
const PLATFORM_LABOR_SHARE_RATE = 0.3;

function computeServiceBookingFee(baseAmount = 0) {
  return toRand(Math.min(SERVICE_BOOKING_FEE_CAP, Math.max(0, Number(baseAmount || 0)) * SERVICE_BOOKING_FEE_RATE));
}

function getServiceTravelFee(request = {}) {
  return toRand(
    request?.pricingSnapshot?.travelFee
    || request?.requestPayload?.pricingSnapshot?.travelFee
    || SERVICE_DEFAULT_TRAVEL_FEE,
  );
}

function getServiceQuoteSubtotal(request = {}) {
  const explicitSubtotal = Number(
    request?.pricingSnapshot?.subtotal
    || request?.requestPayload?.pricingSnapshot?.subtotal
    || 0,
  );
  if (explicitSubtotal > 0) {
    return toRand(explicitSubtotal);
  }

  const total = Number(
    request?.pricingSnapshot?.total
    || request?.requestPayload?.pricingSnapshot?.total
    || 0,
  );
  const travelFee = getServiceTravelFee(request);
  return toRand(Math.max(0, total - travelFee));
}

function getServiceBookingFee(request = {}) {
  const baseAmount = getServiceQuoteSubtotal(request) + getServiceTravelFee(request);
  return computeServiceBookingFee(baseAmount);
}

function getServiceHelperPayoutBreakdown(request = {}, options = {}) {
  const closureType = String(options.closureType || 'completed').trim().toLowerCase();
  const waitingCost = toRand(options.waitingCost || 0);
  const travelledKm = Math.max(0, Number(options.travelledKm || 0));
  const bookingFee = toRand(
    options.bookingFeeAmount
    ?? options.bookingFee
    ?? getServiceBookingFee(request),
  );
  const baseTravelFee = toRand(
    options.travelFeeAmount
    ?? options.travelFee
    ?? getServiceTravelFee(request),
  );
  const laborAmount = toRand(getServiceQuoteSubtotal(request) + waitingCost);

  if (closureType === 'completed') {
    const helperLaborAmount = toRand(laborAmount * HELPER_LABOR_PAYOUT_RATE);
    const platformLaborAmount = toRand(laborAmount * PLATFORM_LABOR_SHARE_RATE);
    const helperTravelAmount = baseTravelFee;
    const helperAmount = toRand(helperLaborAmount + helperTravelAmount);
    const platformBookingAmount = bookingFee;
    const platformAmount = toRand(platformLaborAmount + platformBookingAmount);
    const customerChargeAmount = toRand(laborAmount + helperTravelAmount + platformBookingAmount);

    return {
      version: 'service_request_v1',
      closureType: 'completed',
      payoutRule: 'labor_split_plus_travel_and_booking_fee',
      helperAmount,
      helperLaborAmount,
      helperTravelAmount,
      platformAmount,
      platformLaborAmount,
      platformBookingAmount,
      laborAmount,
      travelAmount: helperTravelAmount,
      bookingFeeAmount: platformBookingAmount,
      waitingCost,
      travelledKm: Number(travelledKm.toFixed(2)),
      customerChargeAmount,
    };
  }

  const billingRule = String(options.billingRule || 'booking_fee_only').trim().toLowerCase();
  let helperTravelAmount = 0;
  let platformBookingAmount = 0;
  let payoutRule = billingRule;

  switch (billingRule) {
    case 'travelled_distance_plus_booking_fee':
      helperTravelAmount = toRand(travelledKm * SERVICE_TRAVEL_RATE_PER_KM);
      platformBookingAmount = bookingFee;
      payoutRule = 'travelled_distance_plus_booking_fee';
      break;
    case 'travel_fee_plus_booking_fee':
      helperTravelAmount = baseTravelFee;
      platformBookingAmount = bookingFee;
      payoutRule = 'travel_fee_plus_booking_fee';
      break;
    case 'booking_fee_only':
    default:
      helperTravelAmount = 0;
      platformBookingAmount = bookingFee;
      payoutRule = 'booking_fee_only';
      break;
  }

  const helperAmount = toRand(helperTravelAmount);
  const platformAmount = toRand(platformBookingAmount);

  return {
    version: 'service_request_v1',
    closureType: 'canceled',
    payoutRule,
    helperAmount,
    helperLaborAmount: 0,
    helperTravelAmount,
    platformAmount,
    platformLaborAmount: 0,
    platformBookingAmount,
    laborAmount: 0,
    travelAmount: helperTravelAmount,
    bookingFeeAmount: platformBookingAmount,
    waitingCost: 0,
    travelledKm: Number(travelledKm.toFixed(2)),
    customerChargeAmount: toRand(helperAmount + platformAmount),
  };
}

function parseGroupedSecretJson(name, rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Grouped secret JSON must be an object.');
    }
    return parsed;
  } catch (error) {
    logger.warn('Grouped secret JSON is missing or invalid; falling back to legacy secrets.', {
      secretName: name,
      error: error.message,
    });
    return {};
  }
}

function assertRequiredSecrets(groupName, secrets, requiredKeys) {
  const missingKeys = requiredKeys.filter((key) => !secrets[key]);
  if (missingKeys.length) {
    throw new Error(`${groupName} is missing required field(s): ${missingKeys.join(', ')}`);
  }
}

function getPaymentsSecrets() {
  const groupedSecrets = parseGroupedSecretJson(
    'UNCEDO_PAYMENTS_SECRETS',
    UNCEDO_PAYMENTS_SECRETS.value(),
  );
  const secrets = {
    PAYSTACK_SECRET_KEY: String(groupedSecrets.PAYSTACK_SECRET_KEY || '').trim(),
  };

  assertRequiredSecrets('UNCEDO_PAYMENTS_SECRETS', secrets, ['PAYSTACK_SECRET_KEY']);
  return secrets;
}

function getEmailSecrets() {
  const groupedSecrets = parseGroupedSecretJson('UNCEDO_EMAIL_SECRETS', UNCEDO_EMAIL_SECRETS.value());
  const secrets = {
    RESEND_API_KEY: String(groupedSecrets.RESEND_API_KEY || '').trim(),
    EMAIL_FROM: String(groupedSecrets.EMAIL_FROM || '').trim(),
  };

  assertRequiredSecrets('UNCEDO_EMAIL_SECRETS', secrets, ['RESEND_API_KEY', 'EMAIL_FROM']);
  return secrets;
}

function isValidEmailAddress(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

async function sendTutorAgreementEmailWithAttachment({
  acceptance,
  destinationEmail,
}) {
  const emailSecrets = getEmailSecrets();
  const resend = new Resend(emailSecrets.RESEND_API_KEY);
  const subject = 'Welcome to Parakleo — Your Tutor Agreement';
  const destination = String(destinationEmail || '').trim();
  if (!isValidEmailAddress(destination)) {
    throw new Error('Please provide a valid email address.');
  }

  const storagePath = String(acceptance?.pdfStoragePath || '').trim();
  let pdfBuffer = null;
  if (storagePath) {
    const [fileBytes] = await admin.storage().bucket().file(storagePath).download();
    pdfBuffer = fileBytes;
  } else if (acceptance?.pdfUrl) {
    const response = await fetch(String(acceptance.pdfUrl));
    if (!response.ok) {
      throw new Error('Unable to read the signed agreement PDF.');
    }
    const arrayBuffer = await response.arrayBuffer();
    pdfBuffer = Buffer.from(arrayBuffer);
  }

  if (!isPdfAttachmentBuffer(pdfBuffer)) {
    throw new Error('The signed agreement PDF is unavailable or invalid.');
  }

  const emailPayload = buildEmailPayload('tutor_agreement_signed', {
    email: destination,
    version: acceptance.version,
    acceptedAt: acceptance.acceptedAt,
  });

  const response = await resend.emails.send({
    from: emailSecrets.EMAIL_FROM,
    to: destination,
    subject,
    html: emailPayload.html,
    attachments: [
      {
        filename: `parakleo-tutor-agreement-${acceptance.version || 'signed'}.pdf`,
        content: pdfBuffer.toString('base64'),
      },
    ],
  });

  if (response?.error) {
    throw new Error(response.error.message || 'Resend returned an error response.');
  }

  return {
    provider: 'resend',
    providerMessageId: response.data?.id || response.id || null,
    to: destination,
    subject,
  };
}

exports.verifyPaystack = onRequest({ cors: true, secrets: [UNCEDO_PAYMENTS_SECRETS] }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  logger.info('verifyPaystack request received.', {
    hasReference: Boolean(body.reference),
    hasUserId: Boolean(body.userId),
    hasNickname: Boolean(body.nickname),
  });

  let paymentsSecrets;
  try {
    paymentsSecrets = getPaymentsSecrets();
  } catch (error) {
    logger.error('Payment configuration is unavailable.', {
      error: error.message,
    });
    res.status(500).json({ success: false, message: 'Payment configuration is unavailable.' });
    return;
  }

  const paystackSecretKey = paymentsSecrets.PAYSTACK_SECRET_KEY;
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: 'Unauthorized request.' });
    return;
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(token);
  } catch (error) {
    logger.warn('Failed to verify Firebase auth token.', {
      error: error.message,
    });
    res.status(401).json({ success: false, message: 'Unauthorized request.' });
    return;
  }

  const uid = decodedToken.uid;
  const providedUserId = body.userId?.toString().trim();
  const nickname = body.nickname?.toString().trim();
  const reference = body.reference?.toString().trim();

  logger.info('verifyPaystack reference received.', {
    uid,
    providedUserId,
    reference,
    nickname: nickname || null,
  });

  if (!reference) {
    res.status(400).json({ success: false, message: 'Missing transaction reference.' });
    return;
  }

  if (providedUserId && providedUserId !== uid) {
    res.status(400).json({ success: false, message: 'Invalid userId supplied.' });
    return;
  }

  try {
    const verificationResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const verificationPayload = await verificationResponse.json().catch(() => null);

    logger.info('Paystack verify response status.', {
      status: verificationResponse.status,
      ok: verificationResponse.ok,
      reference,
      responseStatus: verificationPayload?.status,
      message: verificationPayload?.message,
      errorCode: verificationPayload?.code || null,
      errorType: verificationPayload?.type || null,
    });

    if (!verificationResponse.ok) {
      const verifyError = new Error(`Paystack verify failed (${verificationResponse.status})`);
      verifyError.response = {
        data: verificationPayload || `HTTP ${verificationResponse.status}`,
      };
      throw verifyError;
    }

    const transactionData = verificationPayload?.data;
    const authorization = transactionData?.authorization;

    logger.info('Paystack verified transaction payload summary.', {
      reference,
      transactionStatus: transactionData?.status || null,
      hasAuthorization: !!authorization,
      authorizationReusable: authorization?.reusable === true,
      authorizationBrand: authorization?.brand || null,
      authorizationLast4: authorization?.last4 || null,
      amount: transactionData?.amount || null,
      currency: transactionData?.currency || null,
    });

    if (!transactionData || transactionData.status !== 'success') {
      res.status(400).json({
        success: false,
        message: 'Transaction verification failed or transaction is not successful.',
      });
      return;
    }

    if (!authorization?.authorization_code) {
      res.status(400).json({
        success: false,
        message: 'Authorization details not available for this transaction.',
      });
      return;
    }

    if (authorization.reusable !== true) {
      res.status(400).json({
        success: false,
        message: 'Card is not reusable. Please use a reusable card.',
      });
      return;
    }

    const usersRef = db.collection('users').doc(uid);
    const userSnap = await usersRef.get();
    const studentData = userSnap.data() || {};
    const existingMethods = Array.isArray(userSnap.data()?.paymentMethods)
      ? userSnap.data().paymentMethods
      : [];

    const duplicateMethod = existingMethods.find(
      (method) => method.paystackAuthorizationCode === authorization.authorization_code,
    );

    const safeCardRecord = duplicateMethod || {
      id: randomUUID(),
      nickname: nickname || `${(authorization.brand || 'Card').charAt(0).toUpperCase() + (authorization.brand || 'Card').slice(1)} •••• ${authorization.last4 || '----'}`,
      brand: authorization.brand || 'Card',
      last4: authorization.last4 || '----',
      paystackAuthorizationCode: authorization.authorization_code,
      signature: authorization.signature || null,
      reusable: true,
      isDefault: existingMethods.length === 0,
      createdAt: new Date().toISOString(),
    };

    if (!duplicateMethod) {
      await usersRef.set(
        {
          paymentMethods: [...existingMethods, safeCardRecord],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    logger.info('Card saved to Firestore.', {
      uid,
      reference,
      duplicateMethod: !!duplicateMethod,
      cardId: safeCardRecord.id,
      brand: safeCardRecord.brand,
      last4: safeCardRecord.last4,
      reusable: safeCardRecord.reusable,
      isDefault: safeCardRecord.isDefault,
    });

    let refundSucceeded = false;
    let refundMessage = null;

    try {
      const refundResponse = await fetch('https://api.paystack.co/refund', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transaction: reference }),
      });

      const refundPayload = await refundResponse.json().catch(() => null);

      logger.info('Paystack refund response status.', {
        status: refundResponse.status,
        ok: refundResponse.ok,
        reference,
        responseStatus: refundPayload?.status,
        message: refundPayload?.message,
        errorCode: refundPayload?.code || null,
        errorType: refundPayload?.type || null,
      });

      if (!refundResponse.ok) {
        const refundError = new Error(`Paystack refund failed (${refundResponse.status})`);
        refundError.response = {
          data: refundPayload || `HTTP ${refundResponse.status}`,
        };
        throw refundError;
      }

      refundSucceeded = true;
    } catch (refundError) {
      refundMessage = 'Card saved, but refund is still processing. Please contact support if not reversed shortly.';
      logger.error('Paystack refund failed after successful authorization.', {
        reference,
        uid,
        error: refundError.response?.data || refundError.message,
      });
    }

    const studentEmail = String(studentData.email || decodedToken.email || '').trim();
    const cardAddedEventId = buildEmailEventId('card-added', reference);
    const refundEventId = buildEmailEventId('refund-processed', reference);

    try {
      await queueEmailEventOnce({
        eventId: cardAddedEventId,
        eventType: 'card_added',
        payload: {
          email: studentEmail,
          cardBrand: safeCardRecord.brand,
          cardLast4: safeCardRecord.last4,
          refundStatus: refundSucceeded ? 'refunded' : 'processing',
          refundAmount: 1,
        },
        source: 'verifyPaystack',
      });

      if (refundSucceeded) {
        await queueEmailEventOnce({
          eventId: refundEventId,
          eventType: 'refund_processed',
          payload: {
            email: studentEmail,
            refundType: 'card_authorization',
            refundStatus: 'succeeded',
            refundAmount: 1,
            reference,
            transactionId: transactionData?.id || null,
          },
          source: 'verifyPaystack',
        });
      }
    } catch (error) {
      logger.warn('Failed to queue card/refund email event.', {
        uid,
        reference,
        error: error.message,
      });
    }

    res.status(200).json({
      success: true,
      card: {
        id: safeCardRecord.id,
        nickname: safeCardRecord.nickname,
        brand: safeCardRecord.brand,
        last4: safeCardRecord.last4,
        reusable: safeCardRecord.reusable,
        isDefault: safeCardRecord.isDefault,
        signature: safeCardRecord.signature,
        createdAt: safeCardRecord.createdAt,
      },
      refunded: refundSucceeded,
      refundMessage,
    });
  } catch (error) {
    logger.error('verifyPaystack flow failed.', {
      reference,
      uid,
      error: error.response?.data || error.message,
    });

    res.status(500).json({
      success: false,
      message: 'Unable to verify card right now. Please try again.',
    });
  }
});

const BILLING_RULES = {
  PLATFORM_FEE_RATE: 0.27,
  TUTOR_PAYOUT_RATE: 0.73,
};

async function chargeAuthorizationWithPaystack({ paystackSecretKey, email, amount, authorizationCode }) {
  if (!authorizationCode) {
    return { ok: false, reason: 'missing_authorization' };
  }

  const chargeResponse = await fetch('https://api.paystack.co/transaction/charge_authorization', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${paystackSecretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: Math.round(Number(amount || 0) * 100),
      authorization_code: authorizationCode,
      currency: 'ZAR',
    }),
  });

  const chargePayload = await chargeResponse.json().catch(() => ({}));
  const chargeData = chargePayload?.data || {};
  const succeeded = chargeResponse.ok && chargePayload?.status === true && chargeData?.status === 'success';

  return {
    ok: succeeded,
    reason: succeeded ? null : (chargePayload?.message || 'gateway_declined'),
    transactionId: chargeData?.id ? String(chargeData.id) : null,
  };
}

async function callPaystackApi({ paystackSecretKey, path, method = 'GET', body = null }) {
  const response = await fetch(`https://api.paystack.co${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${paystackSecretKey}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.status !== true) {
    const error = new Error(payload?.message || `Paystack request failed (${response.status})`);
    error.payload = payload;
    error.status = response.status;
    throw error;
  }

  return payload;
}

function normalizePayoutInput(input = {}) {
  return {
    bankName: String(input.bankName || '').trim(),
    bankCode: String(input.bankCode || '').trim(),
    accountNumber: String(input.accountNumber || '').replace(/\s+/g, '').trim(),
    accountHolder: String(input.accountHolder || '').trim(),
    accountType: String(input.accountType || 'personal').trim().toLowerCase(),
    documentType: String(input.documentType || 'identityNumber').trim(),
    documentNumber: String(input.documentNumber || '').replace(/\s+/g, '').trim(),
  };
}

function assertValidPayoutInput(input = {}) {
  const missing = [];
  ['bankName', 'bankCode', 'accountNumber', 'accountHolder', 'accountType', 'documentType', 'documentNumber']
    .forEach((field) => {
      if (!input[field]) missing.push(field);
    });
  if (missing.length) {
    throw new Error(`Missing payout field(s): ${missing.join(', ')}`);
  }
  if (!['identityNumber', 'passportNumber'].includes(input.documentType)) {
    throw new Error('Choose South African ID or Passport for payout verification.');
  }
}

async function verifyAndCreateTutorTransferRecipient({ paystackSecretKey, payout, email, uid }) {
  const validationPayload = {
    account_name: payout.accountHolder,
    account_number: payout.accountNumber,
    account_type: payout.accountType,
    bank_code: payout.bankCode,
    country_code: 'ZA',
    document_type: payout.documentType,
    document_number: payout.documentNumber,
  };

  const validation = await callPaystackApi({
    paystackSecretKey,
    path: '/bank/validate',
    method: 'POST',
    body: validationPayload,
  });
  const validationData = validation?.data || {};
  const validationPassed = validationData.verified === true
    && validationData.accountHolderMatch === true
    && validationData.accountOpen === true
    && validationData.accountAcceptsCredits === true;

  if (!validationPassed) {
    const validationError = new Error(
      validationData.verificationMessage
      || 'We could not verify this bank account. Please check the bank, account number, account holder, and ID/passport number.',
    );
    validationError.payload = validation;
    throw validationError;
  }

  const recipient = await callPaystackApi({
    paystackSecretKey,
    path: '/transferrecipient',
    method: 'POST',
    body: {
      type: 'basa',
      name: payout.accountHolder,
      account_number: payout.accountNumber,
      bank_code: payout.bankCode,
      currency: 'ZAR',
      description: `Parakleo tutor payout recipient ${uid}`,
      metadata: {
        uid,
        email: email || '',
        bankName: payout.bankName,
      },
    },
  });

  return {
    ...payout,
    countryCode: 'ZA',
    currency: 'ZAR',
    paystackRecipientCode: recipient?.data?.recipient_code || '',
    paystackRecipientId: recipient?.data?.id ? String(recipient.data.id) : '',
    verified: true,
    verificationStatus: 'verified',
    verifiedAt: new Date().toISOString(),
    verificationCheckedAt: new Date().toISOString(),
    verificationMessage: validationData.verificationMessage || validation?.message || 'Account validated.',
    validationMessage: validationData.verificationMessage || validation?.message || 'Account validated.',
    validationChecks: {
      accountAcceptsCredits: validationData.accountAcceptsCredits === true,
      accountHolderMatch: validationData.accountHolderMatch === true,
      accountOpen: validationData.accountOpen === true,
      verified: validationData.verified === true,
    },
  };
}

async function initiatePaystackTransfer({ paystackSecretKey, amount, recipientCode, reason, reference }) {
  const payload = await callPaystackApi({
    paystackSecretKey,
    path: '/transfer',
    method: 'POST',
    body: {
      source: 'balance',
      amount: Math.round(Number(amount || 0) * 100),
      recipient: recipientCode,
      reason,
      reference,
      currency: 'ZAR',
    },
  });

  return payload?.data || {};
}

exports.finalizeServiceRequestBilling = onRequest({ cors: true, secrets: [UNCEDO_PAYMENTS_SECRETS] }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: 'Unauthorized request.' });
    return;
  }

  const decoded = await admin.auth().verifyIdToken(token).catch(() => null);
  if (!decoded?.uid) {
    res.status(401).json({ success: false, message: 'Unauthorized request.' });
    return;
  }

  const requestId = req.body?.requestId?.toString().trim();
  if (!requestId) {
    res.status(400).json({ success: false, message: 'Missing requestId.' });
    return;
  }

  const requestRef = db.collection('serviceRequests').doc(requestId);
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists) {
    res.status(404).json({ success: false, message: 'Service request not found.' });
    return;
  }

  const request = requestSnap.data() || {};
  const isParticipant = [request.customerId, request.helperAssignment?.helperId].includes(decoded.uid);
  if (!isParticipant) {
    res.status(403).json({ success: false, message: 'Not allowed to finalize billing for this request.' });
    return;
  }

  if (['completed', 'canceled'].includes(request.status)) {
    res.status(200).json({ success: true, request: { id: requestId, ...request } });
    return;
  }

  const endedAt = Date.now();
  const arrivedAtMs = timestampToMillis(request.arrivedAt || request.helperAssignment?.arrivedAt);
  const workStartedAtMs = timestampToMillis(request.workStartedAt || request.helperAssignment?.workStartedAt);

  let waitingMinutes = 0;
  let waitingCost = 0;
  if (arrivedAtMs && workStartedAtMs && workStartedAtMs > arrivedAtMs) {
    waitingMinutes = Number(((workStartedAtMs - arrivedAtMs) / 60000).toFixed(2));
    if (waitingMinutes > 2) {
      waitingCost = Math.round(waitingMinutes - 2) * 1.00;
    }
  }

  const quoteTotal = toRand(
    request.pricingSnapshot?.total
    ?? request.pricingSnapshot?.totalAmount
    ?? request.pricingSnapshot?.finalAmount
    ?? request.pricingSnapshot?.finalPrice
    ?? 0,
  );
  const subtotal = getServiceQuoteSubtotal(request);
  const travelFee = getServiceTravelFee(request);
  const bookingFee = getServiceBookingFee(request);
  const helperPayoutBreakdown = getServiceHelperPayoutBreakdown(request, {
    closureType: 'completed',
    waitingCost,
    travelFeeAmount: travelFee,
    bookingFeeAmount: bookingFee,
  });
  const totalAmount = helperPayoutBreakdown.customerChargeAmount || toRand(quoteTotal + waitingCost + bookingFee);

  const customerRef = db.collection('users').doc(request.customerId);
  const customerSnap = await customerRef.get();
  const customerData = customerSnap.data() || {};

  const paymentMethods = customerData.paymentMethods || [];
  const selectedCardId = request.selectedCardId || request.requestPayload?.selectedCardId || null;
  const selectedCard = paymentMethods.find((card) => card.id === selectedCardId)
    || paymentMethods.find((card) => card.isDefault)
    || paymentMethods[0]
    || null;

  let charge = { ok: true, reason: null, transactionId: 'free-request-covered' };
  if (totalAmount > 0) {
    let paymentsSecrets;
    try {
      paymentsSecrets = getPaymentsSecrets();
    } catch (error) {
      logger.error('Payment configuration is unavailable during service request billing.', {
        requestId,
        error: error.message,
      });
      res.status(500).json({ success: false, message: 'Payment configuration is unavailable.' });
      return;
    }

    charge = await chargeAuthorizationWithPaystack({
      paystackSecretKey: paymentsSecrets.PAYSTACK_SECRET_KEY,
      email: customerData.email || request.customerEmail || '',
      amount: totalAmount,
      authorizationCode: selectedCard?.paystackAuthorizationCode || '',
    });
  }

  const paymentStatus = charge.ok ? 'paid' : 'wallet_debt_recorded';
  const wallet = customerData.wallet || { balance: 0, currency: 'ZAR' };
  const nextWalletBalance = charge.ok
    ? Number(wallet.balance || 0)
    : Number((Number(wallet.balance || 0) - totalAmount).toFixed(2));

  const batch = db.batch();
  batch.set(requestRef, {
    status: 'completed',
    statusDetail: 'Service completed and billing finalized.',
    endedAt,
    waitingMinutes,
    waitingCost,
    totalAmount,
    pricingSnapshot: {
      ...(request.pricingSnapshot || {}),
      subtotal,
      travelFee,
      bookingFee,
      bookingFeeRate: SERVICE_BOOKING_FEE_RATE,
      bookingFeeCap: SERVICE_BOOKING_FEE_CAP,
      waitingMinutes,
      waitingCost,
      finalAmount: totalAmount,
      finalizedAt: new Date(endedAt).toISOString(),
    },
    helperPayoutBreakdown: {
      ...helperPayoutBreakdown,
      finalizedAt: new Date(endedAt).toISOString(),
    },
    paymentStatus,
    paymentTransactionId: charge.transactionId || null,
    chargedCardLast4: selectedCard?.last4 || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const helperId = request.helperAssignment?.helperId;
  if (helperId) {
    const helperRef = db.collection('users').doc(helperId);
    batch.set(helperRef, {
      activeServiceRequestId: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  if (!charge.ok) {
    batch.set(customerRef, {
      wallet: {
        ...wallet,
        balance: nextWalletBalance,
        currency: wallet.currency || 'ZAR',
        updatedAt: new Date().toISOString(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();

  await admin.database().ref(`liveTracking/serviceRequests/${requestId}`).update({
    status: 'completed',
    closedReason: 'completed',
    closedAtMs: endedAt,
    updatedAtMs: endedAt,
  }).catch((error) => logger.warn('Unable to close live tracking after service completion.', {
    requestId,
    error: error.message,
  }));

  const updatedSnap = await requestRef.get();
  const updatedRequest = { id: updatedSnap.id, ...updatedSnap.data() };
  const completionEventId = `request_completed_${requestId}`;
  await db.collection('customerServiceEvents').doc(completionEventId).set({
    customerId: request.customerId,
    eventType: 'request_completed',
    serviceId: request.serviceIds?.[0] || request.selectedPackageId || request.categoryId || '',
    categoryId: request.categoryId || '',
    serviceIds: Array.isArray(request.serviceIds) ? request.serviceIds : [],
    requestId,
    source: 'finalizeServiceRequestBilling',
    metadata: {
      helperId: helperId || '',
      paymentStatus,
      totalAmount,
      waitingCost,
      helperPayoutAmount: helperPayoutBreakdown.helperAmount,
      platformAmount: helperPayoutBreakdown.platformAmount,
      requestStatus: 'completed',
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtMs: endedAt,
    dayBucket: new Date(endedAt).toISOString().slice(0, 10),
  }, { merge: true });

  await Promise.all([
    createUserNotification({
      userId: request.customerId,
      title: 'Service completed',
      message: `Your service request for ${request.subject || 'help'} was marked as completed. Total: ${formatMoney(totalAmount)}.`,
      type: 'service_completed',
      requestId,
      targetPath: `/customer/requests/${requestId}`,
      metadata: {
        paymentStatus,
        totalAmount,
      },
    }),
    ...(helperId ? [
      createUserNotification({
        userId: helperId,
        title: 'Job completed',
        message: `Your job for ${request.customerName || 'Customer'} was marked as completed. Helper earnings recorded: ${formatMoney(helperPayoutBreakdown.helperAmount)}.`,
        type: 'job_completed',
        requestId,
        targetPath: `/provider/jobs/${requestId}`,
      })
    ] : [])
  ]);

  res.status(200).json({
    success: true,
    request: updatedRequest,
    charge: { ok: charge.ok, reason: charge.reason || null },
  });
});

function buildServiceRequestIdCandidates(rawRequestId = '') {
  const directValue = String(rawRequestId || '').trim();
  if (!directValue) {
    return [];
  }

  const decodedValue = (() => {
    try {
      return decodeURIComponent(directValue);
    } catch (error) {
      return directValue;
    }
  })();
  const pathSegment = decodedValue
    .split('/')
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .pop() || '';

  return [...new Set([directValue, decodedValue, pathSegment].filter(Boolean))];
}

async function resolveServiceRequestSnapshot(rawRequestId = '') {
  const requestIdCandidates = buildServiceRequestIdCandidates(rawRequestId);

  for (const requestId of requestIdCandidates) {
    const requestRef = db.collection('serviceRequests').doc(requestId);
    const requestSnap = await requestRef.get();
    if (requestSnap.exists) {
      return { requestId, requestRef, requestSnap };
    }
  }

  for (const candidateId of requestIdCandidates) {
    const callSnap = await db.collection('serviceCalls').doc(candidateId).get().catch(() => null);
    const linkedRequestId = callSnap?.exists
      ? String(callSnap.data()?.requestId || '').trim()
      : '';
    if (!linkedRequestId || requestIdCandidates.includes(linkedRequestId)) {
      continue;
    }

    const requestRef = db.collection('serviceRequests').doc(linkedRequestId);
    const requestSnap = await requestRef.get();
    if (requestSnap.exists) {
      return { requestId: linkedRequestId, requestRef, requestSnap };
    }
  }

  for (const candidateId of requestIdCandidates) {
    const querySnap = await db.collection('serviceRequests')
      .where('requestId', '==', candidateId)
      .limit(1)
      .get()
      .catch(() => null);
    const foundDoc = querySnap?.docs?.[0] || null;
    if (foundDoc?.exists) {
      return {
        requestId: foundDoc.id,
        requestRef: foundDoc.ref,
        requestSnap: foundDoc,
      };
    }
  }

  return {
    requestId: String(rawRequestId || '').trim(),
    requestRef: null,
    requestSnap: null,
  };
}

exports.billCustomerServiceCancellation = onRequest({ cors: true, secrets: [UNCEDO_PAYMENTS_SECRETS] }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: 'Unauthorized request.' });
    return;
  }

  const decoded = await admin.auth().verifyIdToken(token).catch(() => null);
  if (!decoded?.uid) {
    res.status(401).json({ success: false, message: 'Unauthorized request.' });
    return;
  }

  const rawRequestId = String(req.body?.requestId || '').trim();
  const canceledReason = String(req.body?.reason || '').trim();
  if (!rawRequestId) {
    res.status(400).json({ success: false, message: 'Missing requestId.' });
    return;
  }

  const resolvedRequest = await resolveServiceRequestSnapshot(rawRequestId);
  const { requestId, requestRef, requestSnap } = resolvedRequest;
  if (!requestRef || !requestSnap?.exists) {
    res.status(404).json({ success: false, message: 'Service request not found.' });
    return;
  }

  const request = requestSnap.data() || {};
  if (decoded.uid !== request.customerId) {
    res.status(403).json({ success: false, message: 'Only the customer can cancel this request.' });
    return;
  }

  if (['completed', 'canceled'].includes(String(request.status || '').toLowerCase())) {
    res.status(200).json({ success: true, request: { id: requestId, ...request } });
    return;
  }

  const helperId = String(request.helperAssignment?.helperId || '').trim();
  const status = String(request.status || '').toLowerCase();
  const endedAt = Date.now();

  if (isPreAssignmentServiceRequestStatus(status)) {
    res.status(200).json({
      success: true,
      request: { id: requestId, ...request },
      charge: { ok: true, reason: null },
      cancellation: {
        requestId,
        helperId: '',
        endedAt,
        paymentStatus: 'not_applicable',
        cancellationAmount: 0,
        cancellationBillingRule: 'pre_assignment',
        cancellationDistanceKm: 0,
        helperPayoutBreakdown: {
          helperAmount: 0,
          platformAmount: 0,
          customerChargeAmount: 0,
        },
        chargedCardLast4: null,
        paymentTransactionId: null,
        walletBalance: null,
        walletCurrency: null,
        liveTrackingClosedReason: 'customer_canceled_pre_assignment',
      },
    });
    return;
  }

  if (!isPostAssignmentServiceRequestStatus(status)) {
    res.status(409).json({ success: false, message: 'This request cannot be canceled from its current state.' });
    return;
  }

  const bookingFee = getServiceBookingFee(request);
  const travelFee = getServiceTravelFee(request);
  const trackingSnap = await requestRef.collection('tracking').doc('live').get().catch(() => null);
  const trackingData = trackingSnap?.exists ? (trackingSnap.data() || {}) : {};
  const liveTrackingSnap = await admin.database().ref(`liveTracking/serviceRequests/${requestId}`).get().catch(() => null);
  const liveTrackingData = liveTrackingSnap?.exists() ? (liveTrackingSnap.val() || {}) : {};
  const distanceTravelledMeters = Number(
    request?.travelTracking?.distanceTravelledMeters
    || trackingData?.distanceTravelledMeters
    || liveTrackingData?.distanceTravelledMeters
    || 0,
  );
  const travelledKm = Math.max(0, distanceTravelledMeters / 1000);

  let billingRule = 'booking_fee_only';
  let bookingCharge = bookingFee;
  let travelCharge = 0;
  if (['driving', 'en_route', 'buying_resources'].includes(status)) {
    billingRule = 'travelled_distance_plus_booking_fee';
    travelCharge = toRand(travelledKm * SERVICE_TRAVEL_RATE_PER_KM);
  } else if (['arrived', 'work_started'].includes(status)) {
    billingRule = 'travel_fee_plus_booking_fee';
    travelCharge = toRand(travelFee);
  }

  const helperPayoutBreakdown = getServiceHelperPayoutBreakdown(request, {
    closureType: 'canceled',
    billingRule,
    travelledKm,
    travelFeeAmount: billingRule === 'travelled_distance_plus_booking_fee' ? travelCharge : travelFee,
    bookingFeeAmount: bookingCharge,
  });
  const cancellationAmount = helperPayoutBreakdown.customerChargeAmount;
  const customerRef = db.collection('users').doc(request.customerId);
  const customerSnap = await customerRef.get();
  const customerData = customerSnap.data() || {};
  const paymentMethods = customerData.paymentMethods || [];
  const selectedCardId = request.selectedCardId || request.requestPayload?.selectedCardId || null;
  const selectedCard = paymentMethods.find((card) => card.id === selectedCardId)
    || paymentMethods.find((card) => card.isDefault)
    || paymentMethods[0]
    || null;

  let charge = { ok: true, reason: null, transactionId: 'service-cancel-zero-charge' };
  if (cancellationAmount > 0) {
    let paymentsSecrets;
    try {
      paymentsSecrets = getPaymentsSecrets();
    } catch (error) {
      logger.error('Payment configuration is unavailable during service request cancellation.', {
        requestId,
        error: error.message,
      });
      res.status(500).json({ success: false, message: 'Payment configuration is unavailable.' });
      return;
    }

    charge = await chargeAuthorizationWithPaystack({
      paystackSecretKey: paymentsSecrets.PAYSTACK_SECRET_KEY,
      email: customerData.email || request.customerEmail || '',
      amount: cancellationAmount,
      authorizationCode: selectedCard?.paystackAuthorizationCode || '',
    });
  }

  const paymentStatus = charge.ok ? 'paid' : 'wallet_debt_recorded';
  const wallet = customerData.wallet || { balance: 0, currency: 'ZAR' };
  const nextWalletBalance = charge.ok
    ? Number(wallet.balance || 0)
    : Number((Number(wallet.balance || 0) - cancellationAmount).toFixed(2));

  res.status(200).json({
    success: true,
    request: { id: requestId, ...request },
    charge: { ok: charge.ok, reason: charge.reason || null },
    cancellation: {
      requestId,
      helperId,
      endedAt,
      paymentStatus,
      cancellationAmount,
      cancellationBillingRule: billingRule,
      cancellationDistanceKm: Number(travelledKm.toFixed(2)),
      helperPayoutBreakdown,
      chargedCardLast4: selectedCard?.last4 || null,
      paymentTransactionId: charge.transactionId || null,
      walletBalance: nextWalletBalance,
      walletCurrency: wallet.currency || 'ZAR',
      pricingSnapshot: {
        ...(request.pricingSnapshot || {}),
        subtotal: getServiceQuoteSubtotal(request),
        travelFee,
        bookingFee: bookingCharge,
        bookingFeeRate: SERVICE_BOOKING_FEE_RATE,
        bookingFeeCap: SERVICE_BOOKING_FEE_CAP,
        cancellationAmount,
        cancellationTravelCharge: travelCharge,
        cancellationDistanceKm: Number(travelledKm.toFixed(2)),
        cancellationBillingRule: billingRule,
        finalizedAt: new Date(endedAt).toISOString(),
      },
      liveTrackingClosedReason: 'customer_canceled',
    },
  });
});

async function syncBackendHelperWeeklyPayoutRecords() {
  const startWindow = Date.now() - (PAYOUT_LOOKBACK_WEEKS * 7 * 24 * 60 * 60 * 1000);
  const currentWeekStart = getWeekRange(new Date()).weekStart.getTime();
  const [completedSnap, canceledSnap] = await Promise.all([
    db.collection('serviceRequests').where('status', '==', 'completed').limit(1000).get(),
    db.collection('serviceRequests').where('status', '==', 'canceled').limit(1000).get(),
  ]);

  const grouped = new Map();
  [...completedSnap.docs, ...canceledSnap.docs].forEach((requestDoc) => {
    const request = { id: requestDoc.id, ...(requestDoc.data() || {}) };
    const helperId = String(request?.helperAssignment?.helperId || '').trim();
    if (!helperId) return;

    const settledAtMs = timestampToMillis(
      request.endedAt
      || request.completedAt
      || request.canceledAt
      || request.updatedAt,
    );
    if (!settledAtMs || settledAtMs < startWindow || settledAtMs >= currentWeekStart) return;

    const payoutBreakdown = computeStoredHelperPayoutBreakdown(request);
    if (!payoutBreakdown) return;

    const settledDate = new Date(settledAtMs);
    const weekKey = getWeekKey(settledDate);
    const { weekStart, weekEnd } = getWeekRange(settledDate);
    const groupId = buildHelperPayoutDocId(weekKey, helperId);
    const existing = grouped.get(groupId) || {
      helperId,
      helperName: request?.helperAssignment?.helperName || '',
      helperEmail: request?.helperAssignment?.helperEmail || '',
      weekKey,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      totalJobs: 0,
      completedJobs: 0,
      canceledJobs: 0,
      grossAmount: 0,
      helperAmount: 0,
      platformAmount: 0,
      requestIds: [],
    };

    const normalizedStatus = String(request.status || '').trim().toLowerCase();
    existing.totalJobs += 1;
    if (normalizedStatus === 'completed') existing.completedJobs += 1;
    if (normalizedStatus === 'canceled') existing.canceledJobs += 1;
    existing.grossAmount = Number((existing.grossAmount + Number(payoutBreakdown.customerChargeAmount || 0)).toFixed(2));
    existing.helperAmount = Number((existing.helperAmount + Number(payoutBreakdown.helperAmount || 0)).toFixed(2));
    existing.platformAmount = Number((existing.platformAmount + Number(payoutBreakdown.platformAmount || 0)).toFixed(2));
    existing.requestIds.push(request.id);
    if (!existing.helperName && request?.helperAssignment?.helperName) existing.helperName = request.helperAssignment.helperName;
    if (!existing.helperEmail && request?.helperAssignment?.helperEmail) existing.helperEmail = request.helperAssignment.helperEmail;

    grouped.set(groupId, existing);
  });

  const upserted = [];
  for (const [docId, record] of grouped.entries()) {
    const payoutRef = db.collection(HELPER_PAYOUT_COLLECTION).doc(docId);
    const existingSnap = await payoutRef.get();
    const existing = existingSnap.exists ? (existingSnap.data() || {}) : {};
    if (existing.status === 'paid') {
      upserted.push({ id: docId, ...existing });
      continue;
    }

    await payoutRef.set({
      ...record,
      status: existing.status || 'unpaid',
      paidAt: existing.paidAt || null,
      paidBy: existing.paidBy || null,
      notes: existing.notes || '',
      failureReason: existing.failureReason || null,
      transferAttempts: existing.transferAttempts || 0,
      createdAt: existing.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const saved = await payoutRef.get();
    upserted.push({ id: saved.id, ...saved.data() });
  }

  return upserted;
}

exports.processWeeklyHelperPayouts = onSchedule({
  schedule: '0 0 * * 1',
  timeZone: 'Africa/Johannesburg',
  secrets: [UNCEDO_PAYMENTS_SECRETS],
}, async () => {
  let paymentsSecrets;
  try {
    paymentsSecrets = getPaymentsSecrets();
  } catch (error) {
    logger.error('weekly_helper_payouts_missing_payment_config', { error: error.message });
    return;
  }

  const syncedRecords = await syncBackendHelperWeeklyPayoutRecords();
  let paidCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const payout of syncedRecords) {
    const status = String(payout.status || 'unpaid').toLowerCase();
    if (!['unpaid', 'unsuccessful', 'failed'].includes(status)) {
      skippedCount += 1;
      continue;
    }

    const amount = Number(payout.helperAmount || 0);
    const payoutRef = db.collection(HELPER_PAYOUT_COLLECTION).doc(payout.id);
    if (!amount || amount <= 0) {
      await payoutRef.set({
        status: 'paid',
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        paidBy: { system: 'automatic', reason: 'zero_amount' },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      await createUserNotification({
        userId: payout.helperId,
        title: 'Helper payout completed',
        message: `Your ${payout.weekKey || 'weekly'} payout was marked paid. Amount: R0.00.`,
        type: 'helper_payout_paid',
        targetPath: '/provider/earnings',
        metadata: {
          payoutId: payout.id,
          payoutStatus: 'paid',
          amount: 0,
        },
      });
      paidCount += 1;
      continue;
    }

    const helperSnap = await db.collection('users').doc(payout.helperId).get();
    const helperData = helperSnap.exists ? (helperSnap.data() || {}) : {};
    const payoutDetails = helperData?.payout || {};
    const recipientCode = String(payoutDetails.recipientCode || '').trim();
    const payoutVerificationStatus = String(payoutDetails.verificationStatus || '').toLowerCase();
    const isPayoutVerified = payoutVerificationStatus === 'verified';
    const nextTransferAttempt = Number(payout.transferAttempts || 0) + 1;
    if (!recipientCode || !isPayoutVerified) {
      await payoutRef.set({
        status: 'unsuccessful',
        failureReason: 'Helper payout account is not verified.',
        transferAttempts: nextTransferAttempt,
        lastTransferAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      await createUserNotification({
        userId: payout.helperId,
        title: 'Helper payout unsuccessful',
        message: 'Your helper payout could not be processed because your payout account is not verified.',
        type: 'helper_payout_failed',
        targetPath: '/provider/earnings',
        metadata: {
          payoutId: payout.id,
          payoutStatus: 'unsuccessful',
          amount,
          failureReason: 'Helper payout account is not verified.',
        },
      });
      failedCount += 1;
      continue;
    }

    const reference = `uncedo-helper-${payout.weekKey}-${payout.helperId}-${Date.now()}`.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 100);
    await payoutRef.set({
      status: 'processing',
      transferReference: reference,
      transferAttempts: nextTransferAttempt,
      lastTransferAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await createUserNotification({
      userId: payout.helperId,
      title: 'Helper payout processing',
      message: `Your ${payout.weekKey || 'weekly'} payout is being processed. Amount: ${formatMoney(amount)}.`,
      type: 'helper_payout_processing',
      targetPath: '/provider/earnings',
      metadata: {
        payoutId: payout.id,
        payoutStatus: 'processing',
        amount,
        transferReference: reference,
      },
    });

    try {
      const transfer = await initiatePaystackTransfer({
        paystackSecretKey: paymentsSecrets.PAYSTACK_SECRET_KEY,
        amount,
        recipientCode,
        reason: `Uncedo helper payout ${payout.weekKey}`,
        reference,
      });

      await payoutRef.set({
        status: 'paid',
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        paidBy: { system: 'automatic', provider: 'paystack' },
        transferReference: reference,
        transferCode: transfer.transfer_code || null,
        transferId: transfer.id ? String(transfer.id) : null,
        transferStatus: transfer.status || null,
        failureReason: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      await createUserNotification({
        userId: payout.helperId,
        title: 'Helper payout paid',
        message: `Your ${payout.weekKey || 'weekly'} payout was paid successfully. Amount: ${formatMoney(amount)}.`,
        type: 'helper_payout_paid',
        targetPath: '/provider/earnings',
        metadata: {
          payoutId: payout.id,
          payoutStatus: 'paid',
          amount,
          transferReference: reference,
          transferStatus: transfer.status || null,
        },
      });
      paidCount += 1;
    } catch (error) {
      await payoutRef.set({
        status: 'unsuccessful',
        failureReason: error.message || 'Paystack transfer failed.',
        transferReference: reference,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      await createUserNotification({
        userId: payout.helperId,
        title: 'Helper payout unsuccessful',
        message: `Your ${payout.weekKey || 'weekly'} payout could not be completed. ${error.message || 'Paystack transfer failed.'}`,
        type: 'helper_payout_failed',
        targetPath: '/provider/earnings',
        metadata: {
          payoutId: payout.id,
          payoutStatus: 'unsuccessful',
          amount,
          transferReference: reference,
          failureReason: error.message || 'Paystack transfer failed.',
        },
      });
      failedCount += 1;
    }
  }

  logger.info('weekly_helper_payouts_processed', {
    syncedCount: syncedRecords.length,
    paidCount,
    failedCount,
    skippedCount,
  });
});

exports.sendEmailFromQueue = onDocumentCreated(
  {
    document: 'emailEvents/{eventId}',
    secrets: [UNCEDO_EMAIL_SECRETS],
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) {
      logger.warn('sendEmailFromQueue received empty event data.', {
        eventId: event.params.eventId,
      });
      return;
    }

    const eventRef = db.collection('emailEvents').doc(event.params.eventId);
    let emailSecrets;
    try {
      emailSecrets = getEmailSecrets();
    } catch (error) {
      logger.warn('Email configuration is unavailable. Skipping email send.', {
        eventId: event.params.eventId,
        eventType: data.eventType || null,
        error: error.message,
      });
      await eventRef.set(
        {
          status: 'skipped',
          reason: 'missing_email_configuration',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return;
    }

    const resendApiKey = emailSecrets.RESEND_API_KEY;
    const emailFrom = emailSecrets.EMAIL_FROM;

    const resend = new Resend(resendApiKey);
    const emailPayload = buildEmailPayload(data.eventType, data.payload);

    if (!emailPayload) {
      logger.warn('Unsupported email event type.', {
        eventId: event.params.eventId,
        eventType: data.eventType || null,
      });

      await eventRef.set(
        {
          status: 'ignored',
          reason: 'unsupported_event_type',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return;
    }

    const recipient = Array.isArray(emailPayload.to)
      ? emailPayload.to.map((value) => String(value || '').trim()).filter(Boolean)
      : String(emailPayload.to || '').trim();
    const subject = String(emailPayload.subject || '').trim();

    if (!recipient || (Array.isArray(recipient) && recipient.length === 0) || !subject) {
      logger.warn('Email payload is missing required send fields.', {
        eventId: event.params.eventId,
        eventType: data.eventType || null,
        hasRecipient: Boolean(recipient),
        hasSubject: Boolean(subject),
      });

      await eventRef.set(
        {
          status: 'skipped',
          reason: 'invalid_email_payload',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return;
    }

    logger.info('Prepared email payload summary.', {
      eventId: event.params.eventId,
      eventType: data.eventType,
      to: recipient,
      subject,
    });

    try {
      const response = await resend.emails.send({
        from: emailFrom,
        ...emailPayload,
        to: recipient,
        subject,
      });

      if (response?.error) {
        throw new Error(response.error.message || 'Resend returned an error response.');
      }

      logger.info('Email sent successfully.', {
        eventId: event.params.eventId,
        provider: 'resend',
        providerMessageId: response.data?.id || response.id || null,
      });

      await eventRef.set(
        {
          status: 'sent',
          provider: 'resend',
          providerMessageId: response.data?.id || response.id || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } catch (error) {
      logger.error('Failed to send email.', {
        eventId: event.params.eventId,
        error: error.message,
        response: error.response?.data || null,
      });

      await eventRef.set(
        {
          status: 'failed',
          errorMessage: error.message,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  },
);


