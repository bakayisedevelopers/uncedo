const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const vision = require('@google-cloud/vision');
const admin = require('firebase-admin');
const { Resend } = require('resend');
const { createHash, randomUUID } = require('crypto');
const {
  DEFAULT_PRICING_CONFIG,
  LEGACY_SAFE_PRICING_SNAPSHOT,
  computePricingQuote,
  computeFinalAmountFromSnapshot,
  loadPricingConfig,
  sanitizePricingSnapshot,
} = require('./pricingEngine');
const {
  normalizeSubjectName,
  isAllowedGrade1To12Subject,
  GRADE_1_TO_12_SUBJECT_NAMES,
} = require('./subjectExtraction');
const {
  GOOGLE_CLOUD_SKU_IDS,
  computeLinearChargeFromPrice,
  computeTieredChargeFromPrice,
  getCloudVisionDocumentTextPrice,
  getGeminiFlashImageInputPrice,
  getGeminiFlashTextInputPrice,
  getGeminiFlashTextOutputPrice,
} = require('./googleCloudPricing');
const { classifySubjectLocally } = require('./extraction/localSubjectClassifier');
const { detectTopicsLocally } = require('./extraction/localTopicClassifier');
const { estimateMinutesLocally, clampMinutes } = require('./extraction/minutesEstimator');
const { classifyWithLocalMl } = require('./extraction/localMlClassifier');
const { extractDocumentText } = require('./academicBrain/extraction');
const { runAcademicBrainMini } = require('./academicBrain/engine');
const { saveAcademicBrainFeedback } = require('./academicBrain/feedback');
const { AcademicBrain, SUBJECTS } = require('./ai/AcademicBrain');
const { TrainingPipeline } = require('./ai/TrainingPipeline');
const {
  LEGAL_ENTITY_NAME,
  TUTOR_AGREEMENT_DOCUMENT_ID,
  TUTOR_AGREEMENT_TITLE,
  TUTOR_AGREEMENT_DEFAULT_VERSION,
  TUTOR_AGREEMENT_STATUS,
  buildTutorAgreementMarkdown,
  ensureTutorAgreementSeeded,
  getTutorAgreementBundle,
  isTutorAgreementCurrent,
  acceptTutorAgreement,
  publishTutorAgreementVersion,
  makeVersionDocId,
} = require('./legalAgreements');

let aiSubjectExtractionModule = null;
let geminiExtractionModule = null;
let ocrProviderRouterModule = null;
let academicBrainPromise = null;
const ENABLE_ACADEMIC_BRAIN = String(process.env.ENABLE_ACADEMICBRAIN_MINI || 'true').toLowerCase() !== 'false';

function getAiSubjectExtractionModule() {
  if (!aiSubjectExtractionModule) {
    aiSubjectExtractionModule = require('./aiSubjectExtraction');
  }
  return aiSubjectExtractionModule;
}

function getGeminiExtractionModule() {
  if (!geminiExtractionModule) {
    geminiExtractionModule = require('./geminiExtraction');
  }
  return geminiExtractionModule;
}

function getOcrProviderRouterModule() {
  if (!ocrProviderRouterModule) {
    ocrProviderRouterModule = require('./ocr/ocrProviderRouter');
  }
  return ocrProviderRouterModule;
}

async function getAcademicBrain() {
  if (!academicBrainPromise) {
    const brain = new AcademicBrain();
    academicBrainPromise = brain.init().then(() => brain);
  }
  return academicBrainPromise;
}

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
  return `R${Number(value || 0).toFixed(2)}`;
}

async function writeAiLog({
  userId,
  source,
  status,
  prompt = '',
  rawOutput = '',
  error = '',
  details = {},
}) {
  if (!userId) return null;

  const logId = randomUUID();
  await db.collection('users').doc(userId).collection('aiLogs').doc(logId).set({
    source: source || '',
    status: status || 'unknown',
    prompt: prompt || '',
    rawOutput: rawOutput || '',
    error: error || '',
    details: details || {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtMs: Date.now(),
  }, { merge: true });

  return logId;
}

async function recordUnsupportedSubjectRequestOnServer({
  subject,
  inputText = '',
  uid = '',
}) {
  const normalizedSubject = String(subject || '').replace(/\s+/g, ' ').trim();
  if (!normalizedSubject) return null;

  const demandId = normalizedSubject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unknown-subject';

  const demandRef = db.collection('unsupportedSubjectRequests').doc(demandId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(demandRef);
    const existing = snapshot.exists ? (snapshot.data() || {}) : {};
    transaction.set(demandRef, {
      subject: existing.subject || normalizedSubject,
      normalizedSubject: normalizedSubject.toLowerCase(),
      count: Number(existing.count || 0) + 1,
      lastInputPreview: String(inputText || '').replace(/\s+/g, ' ').trim().slice(0, 500),
      lastRequestedBy: uid || null,
      lastRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: existing.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return { subject: normalizedSubject };
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

function buildPayoutDocId(weekKey, tutorId) {
  return `${weekKey}_${tutorId}`;
}

function computeFullSessionAmounts(session = {}) {
  const totalAmount = Number(
    session.originalPrice
    ?? session.pricingSnapshot?.originalPrice
    ?? session.pricingSnapshot?.totalAmount
    ?? session.totalAmount
    ?? 0,
  );
  const tutorAmount = Number(
    Number.isFinite(Number(session.payoutBreakdown?.tutorAmount))
      ? Number(session.payoutBreakdown.tutorAmount)
      : (totalAmount * BILLING_RULES.TUTOR_PAYOUT_RATE),
  );
  const platformAmount = Number(
    Number.isFinite(Number(session.payoutBreakdown?.platformAmount))
      ? Number(session.payoutBreakdown.platformAmount)
      : (totalAmount * BILLING_RULES.PLATFORM_FEE_RATE),
  );

  return {
    totalAmount: Number(totalAmount.toFixed(2)),
    tutorAmount: Number(tutorAmount.toFixed(2)),
    platformAmount: Number(platformAmount.toFixed(2)),
  };
}

function isDeletableClassUploadPath(value) {
  const path = String(value || '').trim();
  return DELETABLE_CLASS_UPLOAD_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function collectClassUploadPaths(value, paths = new Set()) {
  if (!value) return paths;

  if (Array.isArray(value)) {
    value.forEach((item) => collectClassUploadPaths(item, paths));
    return paths;
  }

  if (typeof value === 'object') {
    ['path', 'objectPath', 'filePath'].forEach((key) => {
      if (isDeletableClassUploadPath(value[key])) {
        paths.add(String(value[key]).trim());
      }
    });
    Object.values(value).forEach((item) => collectClassUploadPaths(item, paths));
  }

  return paths;
}

async function deleteStorageObjectIfPresent(bucket, objectPath) {
  try {
    await bucket.file(objectPath).delete();
    return true;
  } catch (error) {
    if (error?.code === 404) return false;
    throw error;
  }
}

const PARAKLEO_PAYMENTS_SECRETS = defineSecret('PARAKLEO_PAYMENTS_SECRETS');
const PARAKLEO_EMAIL_SECRETS = defineSecret('PARAKLEO_EMAIL_SECRETS');
const PARAKLEO_REALTIME_SECRETS = defineSecret('PARAKLEO_REALTIME_SECRETS');
const PARAKLEO_AI_KEYS = defineSecret('PARAKLEO_AI_KEYS');

const DEFAULT_STUN_URLS = ['stun:stun.l.google.com:19302'];
const DEFAULT_TURN_TTL_SECONDS = 600;
const MATCHING_TIMEOUT_MS = 3 * 60 * 1000;
const OFFER_TIMEOUT_MS = 30 * 1000;
const DISPATCH_SCORE_WEIGHTS = {
  acceptanceRate: 0.20,
  completionRate: 0.20,
  rating: 0.20,
  responseSpeed: 0.15,
  reliability: 0.15,
  fairness: 0.10,
};
const DISPATCH_NEAR_EQUAL_THRESHOLD = 2;
const DEFAULT_ACCEPTANCE_RATE = 0.75;
const DEFAULT_COMPLETION_RATE = 0.9;
const DEFAULT_RATING = 4.5;
const DEFAULT_AVG_RESPONSE_SECONDS = 30;
const CLASS_UPLOAD_RETENTION_MS = 72 * 60 * 60 * 1000;
const DELETABLE_CLASS_UPLOAD_PREFIXES = [
  'request-attachments/',
  'request-attachment-crops/',
];
const PAYOUT_COLLECTION = 'tutorWeeklyPayouts';
const PAYOUT_LOOKBACK_WEEKS = 12;
const DEFAULT_CANCELLATION_RATE = 0.08;
const FAIRNESS_WORKLOAD_CAP = 10;
const TUTOR_STATS_MAX_EVENTS = 100;
const TUTOR_STATS_ROLLING_DAYS = 30;
const TUTOR_STATS_RECENT_ASSIGNMENT_DAYS = 7;
const DEFAULT_STUDENT_FREE_MINUTES = 30;
const REFERRAL_REWARD_MINUTES = 15;
const REQUEST_STATUS = {
  PENDING: 'pending',
  MATCHING: 'matching',
  OFFERED: 'offered',
  ACCEPTED: 'accepted',
  IN_SESSION: 'in_session',
  COMPLETED: 'completed',
  CANCELED: 'canceled',
  CANCELED_DURING: 'canceled_during',
  EXPIRED: 'expired',
  NO_TUTOR_AVAILABLE: 'no_tutor_available',
};
const SESSION_STATUS = {
  WAITING_STUDENT: 'waiting_student',
  IN_PROGRESS: 'in_progress',
  IN_SESSION: 'in_session',
  COMPLETED: 'completed',
  CANCELED: 'canceled',
  CANCELED_DURING: 'canceled_during',
};
const ACTIVE_REQUEST_STATUSES = new Set([
  REQUEST_STATUS.PENDING,
  REQUEST_STATUS.MATCHING,
  REQUEST_STATUS.OFFERED,
  REQUEST_STATUS.NO_TUTOR_AVAILABLE,
]);
let visionClient = null;
const GEMINI_FLASH_EXTRACTION_SOURCE = 'gemini_2_5_flash_after_tutor_accept';
const BOOKING_FEE_BUFFER_RATE = 0.10;

function getVisionClient() {
  if (!visionClient) {
    visionClient = new vision.ImageAnnotatorClient();
  }
  return visionClient;
}

function normalizeMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
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

function getTutorScore(tutor = {}) {
  const acceptanceRate = normalizeRate(
    tutor?.tutorProfile?.acceptanceRate
      ?? tutor?.acceptanceRate
      ?? tutor?.stats?.acceptanceRate,
    DEFAULT_ACCEPTANCE_RATE,
  );
  const completionRate = normalizeRate(
    tutor?.tutorProfile?.completionRate
      ?? tutor?.completionRate
      ?? tutor?.stats?.completionRate,
    DEFAULT_COMPLETION_RATE,
  );
  const rating = normalizeRating(
    tutor?.tutorProfile?.overallRating
      ?? tutor?.overallRating
      ?? tutor?.rating
      ?? tutor?.stats?.overallRating,
    DEFAULT_RATING,
  );
  const avgResponseSeconds = normalizePositiveNumber(
    tutor?.tutorProfile?.avgResponseSeconds
      ?? tutor?.avgResponseSeconds
      ?? tutor?.stats?.avgResponseSeconds,
    DEFAULT_AVG_RESPONSE_SECONDS,
  );
  const cancellationRate = normalizeRate(
    tutor?.tutorProfile?.cancellationRate
      ?? tutor?.cancellationRate
      ?? tutor?.stats?.cancellationRate,
    DEFAULT_CANCELLATION_RATE,
  );
  const recentAssignmentsCount = normalizePositiveNumber(
    tutor?.tutorProfile?.recentAssignmentsCount
      ?? tutor?.recentAssignmentsCount
      ?? tutor?.tutorProfile?.completedSessionsLast24Hours
      ?? tutor?.stats?.recentAssignmentsCount,
    0,
  );

  const responseSpeedScore = 1 - clamp01(avgResponseSeconds / 120);
  const reliabilityScore = 1 - clamp01(cancellationRate);
  const fairnessScore = 1 - clamp01(recentAssignmentsCount / FAIRNESS_WORKLOAD_CAP);

  return (
    (acceptanceRate * DISPATCH_SCORE_WEIGHTS.acceptanceRate)
    + (completionRate * DISPATCH_SCORE_WEIGHTS.completionRate)
    + ((rating / 5) * DISPATCH_SCORE_WEIGHTS.rating)
    + (responseSpeedScore * DISPATCH_SCORE_WEIGHTS.responseSpeed)
    + (reliabilityScore * DISPATCH_SCORE_WEIGHTS.reliability)
    + (fairnessScore * DISPATCH_SCORE_WEIGHTS.fairness)
  ) * 100;
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

function getTutorStatsCollections(uid) {
  const userRef = db.collection('users').doc(uid);
  return {
    userRef,
    offerEventsRef: userRef.collection('tutorStatsOfferEvents'),
    sessionEventsRef: userRef.collection('tutorStatsSessionEvents'),
  };
}

function buildTutorStatsSummary(existingProfile = {}, existingStats = {}, rollups = {}) {
  return {
    acceptanceRate: rollups.acceptanceRate ?? existingProfile.acceptanceRate ?? existingStats.acceptanceRate ?? DEFAULT_ACCEPTANCE_RATE,
    completionRate: rollups.completionRate ?? existingProfile.completionRate ?? existingStats.completionRate ?? DEFAULT_COMPLETION_RATE,
    cancellationRate: rollups.cancellationRate ?? existingProfile.cancellationRate ?? existingStats.cancellationRate ?? DEFAULT_CANCELLATION_RATE,
    avgResponseSeconds: rollups.avgResponseSeconds ?? existingProfile.avgResponseSeconds ?? existingStats.avgResponseSeconds ?? DEFAULT_AVG_RESPONSE_SECONDS,
    recentAssignmentsCount: rollups.recentAssignmentsCount ?? existingProfile.recentAssignmentsCount ?? existingStats.recentAssignmentsCount ?? 0,
    statsWindow: {
      rollingDays: TUTOR_STATS_ROLLING_DAYS,
      maxEvents: TUTOR_STATS_MAX_EVENTS,
      recentAssignmentsDays: TUTOR_STATS_RECENT_ASSIGNMENT_DAYS,
    },
    statsUpdatedAt: new Date().toISOString(),
  };
}

async function storeTutorStatsEvent({ uid, collectionRef, eventId, payload }) {
  if (!uid || !collectionRef || !eventId) return;
  await collectionRef.doc(eventId).set({
    ...payload,
    uid,
    updatedAtMs: Date.now(),
  }, { merge: true });
}

async function computeTutorDerivedStats(uid) {
  if (!uid) return null;

  const { userRef, offerEventsRef, sessionEventsRef } = getTutorStatsCollections(uid);
  const [userSnap, offerSnap, sessionSnap] = await Promise.all([
    userRef.get(),
    offerEventsRef.orderBy('occurredAtMs', 'desc').limit(TUTOR_STATS_MAX_EVENTS).get(),
    sessionEventsRef.orderBy('occurredAtMs', 'desc').limit(TUTOR_STATS_MAX_EVENTS).get(),
  ]);

  const userData = userSnap.exists ? (userSnap.data() || {}) : {};
  const existingProfile = userData.tutorProfile || {};
  const existingStats = userData.stats || {};

  const now = Date.now();
  const thirtyDaysAgo = getTutorStatsWindowStartMs(TUTOR_STATS_ROLLING_DAYS);
  const sevenDaysAgo = getTutorStatsWindowStartMs(TUTOR_STATS_RECENT_ASSIGNMENT_DAYS);

  const offerEvents = offerSnap.docs
    .map((snap) => ({ id: snap.id, ...snap.data() }))
    .filter((event) => normalizeStatsEventTimestamp(event.closedAtMs || event.occurredAtMs) >= thirtyDaysAgo);
  const closedOffers = offerEvents.filter((event) => ['accepted', 'declined', 'expired'].includes(String(event.outcome || '').toLowerCase()));
  const acceptedOffers = closedOffers.filter((event) => String(event.outcome || '').toLowerCase() === 'accepted');

  const offerDenominator = closedOffers.length;
  const acceptanceRate = offerDenominator > 0
    ? Number((acceptedOffers.length / offerDenominator).toFixed(4))
    : null;

  const acceptedResponseTimes = acceptedOffers
    .map((event) => Number(event.responseSeconds || 0))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const avgResponseSeconds = acceptedResponseTimes.length
    ? Number((acceptedResponseTimes.reduce((sum, value) => sum + value, 0) / acceptedResponseTimes.length).toFixed(2))
    : null;

  const recentAssignmentsCount = acceptedOffers.filter((event) => normalizeStatsEventTimestamp(event.closedAtMs || event.occurredAtMs) >= sevenDaysAgo).length;

  const sessionEvents = sessionSnap.docs
    .map((snap) => ({ id: snap.id, ...snap.data() }))
    .filter((event) => normalizeStatsEventTimestamp(event.occurredAtMs) >= thirtyDaysAgo);
  const completedSessions = sessionEvents.filter((event) => String(event.outcome || '').toLowerCase() === 'completed');
  const tutorCanceledSessions = sessionEvents.filter((event) => {
    const outcome = String(event.outcome || '').toLowerCase();
    const canceledBy = String(event.canceledBy || '').toLowerCase();
    return ['canceled', 'canceled_during'].includes(outcome) && (canceledBy === 'tutor' || canceledBy === 'tutor_user' || canceledBy === 'tutor_account');
  });
  const sessionDenominator = completedSessions.length + tutorCanceledSessions.length;
  const completionRate = sessionDenominator > 0
    ? Number((completedSessions.length / sessionDenominator).toFixed(4))
    : null;
  const cancellationRate = sessionDenominator > 0
    ? Number((tutorCanceledSessions.length / sessionDenominator).toFixed(4))
    : null;

  const rollups = {
    acceptanceRate,
    completionRate,
    cancellationRate,
    avgResponseSeconds,
    recentAssignmentsCount,
  };
  const summary = buildTutorStatsSummary(existingProfile, existingStats, rollups);

  const updatePayload = {
    tutorProfile: {
      ...existingProfile,
      ...summary,
      statsWindow: summary.statsWindow,
      statsUpdatedAt: summary.statsUpdatedAt,
    },
    stats: {
      ...existingStats,
      ...summary,
      statsWindow: summary.statsWindow,
      statsUpdatedAt: summary.statsUpdatedAt,
      computedAtMs: now,
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await userRef.set(updatePayload, { merge: true });
  return summary;
}

async function recordTutorOfferLifecycleEvent({
  tutorId,
  requestId,
  offerRevision,
  subject,
  outcome,
  offeredAtMs,
  closedAtMs,
  responseSeconds,
  sourceStatus,
}) {
  if (!tutorId || !requestId) return null;

  const { offerEventsRef } = getTutorStatsCollections(tutorId);
  const eventId = `${requestId}_${Number(offerRevision || 0) || 0}`;
  const payload = {
    tutorId,
    requestId,
    offerRevision: Number(offerRevision || 0) || 0,
    subject: subject || '',
    outcome,
    occurredAtMs: normalizeStatsEventTimestamp(offeredAtMs) || Date.now(),
    offeredAtMs: normalizeStatsEventTimestamp(offeredAtMs) || Date.now(),
    closedAtMs: normalizeStatsEventTimestamp(closedAtMs) || null,
    responseSeconds: Number.isFinite(Number(responseSeconds)) ? Number(responseSeconds) : null,
    sourceStatus: sourceStatus || '',
  };

  await storeTutorStatsEvent({
    uid: tutorId,
    collectionRef: offerEventsRef,
    eventId,
    payload,
  });

  return computeTutorDerivedStats(tutorId);
}

async function recordTutorSessionLifecycleEvent({
  tutorId,
  sessionId,
  requestId,
  outcome,
  canceledBy,
  startedAtMs,
  occurredAtMs,
}) {
  if (!tutorId || !sessionId) return null;

  const { sessionEventsRef } = getTutorStatsCollections(tutorId);
  const payload = {
    tutorId,
    sessionId,
    requestId: requestId || '',
    outcome,
    canceledBy: canceledBy || null,
    startedAtMs: normalizeStatsEventTimestamp(startedAtMs) || null,
    occurredAtMs: normalizeStatsEventTimestamp(occurredAtMs) || Date.now(),
  };

  await storeTutorStatsEvent({
    uid: tutorId,
    collectionRef: sessionEventsRef,
    eventId: sessionId,
    payload,
  });

  return computeTutorDerivedStats(tutorId);
}

function hasCompletedStudentProfile(user = {}) {
  const requirements = getStudentCompletionRequirements(user);
  return requirements.complete;
}

function getStudentCompletionRequirements(user = {}) {
  const studentProfile = user?.studentProfile || {};
  const paymentMethods = Array.isArray(user?.paymentMethods) ? user.paymentMethods : [];
  const hasGrade = Boolean(studentProfile.grade);
  const hasCurriculum = Boolean(String(studentProfile.curriculum || '').trim());
  const hasDiscoverySource = Boolean(String(studentProfile.discoverySource || '').trim());
  const hasPaymentMethod = paymentMethods.length > 0;

  return {
    hasGrade,
    hasCurriculum,
    hasDiscoverySource,
    hasPaymentMethod,
    paymentMethodsCount: paymentMethods.length,
    complete: Boolean(
      hasGrade
        && hasCurriculum
        && hasDiscoverySource
        && hasPaymentMethod,
    ),
  };
}

function hasCompletedTutorProfile(user = {}) {
  const tutorProfile = user?.tutorProfile || {};
  const qualifiedSubjects = Array.isArray(user?.qualifiedSubjects) ? user.qualifiedSubjects : [];
  const activeSubjects = Array.isArray(user?.activeSubjects) ? user.activeSubjects : [];

  return Boolean(
    isTutorAgreementCurrent(user)
      && qualifiedSubjects.length > 0
      && user?.selfieVerified
      && String(user?.selfieUrl || '').trim()
      && Array.isArray(tutorProfile.gradesToTutor)
      && tutorProfile.gradesToTutor.length > 0
      && activeSubjects.length > 0
      && tutorProfile.payout?.bankName
      && tutorProfile.payout?.accountNumber
      && tutorProfile.payout?.accountHolder
      && tutorProfile.payout?.bankCode
      && tutorProfile.payout?.paystackRecipientCode
      && tutorProfile.payout?.verified,
  );
}

function hasCompletedTutorProfileWithoutAgreement(user = {}) {
  const tutorProfile = user?.tutorProfile || {};
  const qualifiedSubjects = Array.isArray(user?.qualifiedSubjects) ? user.qualifiedSubjects : [];
  const activeSubjects = Array.isArray(user?.activeSubjects) ? user.activeSubjects : [];

  return Boolean(
    qualifiedSubjects.length > 0
      && user?.selfieVerified
      && String(user?.selfieUrl || '').trim()
      && Array.isArray(tutorProfile.gradesToTutor)
      && tutorProfile.gradesToTutor.length > 0
      && activeSubjects.length > 0
      && tutorProfile.payout?.bankName
      && tutorProfile.payout?.accountNumber
      && tutorProfile.payout?.accountHolder
      && tutorProfile.payout?.bankCode
      && tutorProfile.payout?.paystackRecipientCode
      && tutorProfile.payout?.verified,
  );
}

async function applyStudentReferralReward(transaction, {
  userRef,
  userData = {},
  uid = '',
  pendingReferralSlug = '',
  source = 'unknown',
  baseUpdates = null,
} = {}) {
  if (!userRef || !uid) return { rewarded: false, reason: 'missing_context' };

  const isStudent = (userData.activeRole || userData.role || '').toLowerCase() === 'student';
  if (!isStudent) return { rewarded: false, reason: 'not_student' };

  const alreadyProcessed = Boolean((userData.growth || {}).accountCompletionRewardProcessed);
  const completionRequirements = getStudentCompletionRequirements(userData);
  const studentProfileComplete = completionRequirements.complete;
  const referralSlug = String(pendingReferralSlug || userData.pendingReferralSlug || userData.pendingReferralCode || '').trim();

  logger.info('student_referral_reward_evaluated', {
    uid,
    source,
    isStudent,
    alreadyProcessed,
    studentProfileComplete,
    pendingReferralSlugPresent: Boolean(referralSlug),
    completionRequirements,
    referredBy: userData.referredBy || null,
    referralRewardCount: Number(userData.referralRewardCount || 0),
    growthRewardProcessed: Boolean((userData.growth || {}).accountCompletionRewardProcessed),
  });

  const nextBaseUpdates = baseUpdates || {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    referralSlug: userData.referralSlug || `clx-${randomUUID().replace(/-/g, '').slice(0, 20)}`,
    growth: {
      ...(userData.growth || {}),
      completionRequirements: {
        ...((userData.growth || {}).completionRequirements || {}),
        ...completionRequirements,
        studentProfileComplete,
      },
      lastGrowthSyncedAt: new Date().toISOString(),
    },
  };

  const existingFreeMinutes = Number(userData.freeMinutesRemaining ?? DEFAULT_STUDENT_FREE_MINUTES);
  const existingEarned = Number(userData.totalFreeMinutesEarned ?? DEFAULT_STUDENT_FREE_MINUTES);
  const userRewardBaseline = {
    ...nextBaseUpdates,
    freeMinutesRemaining: Number.isFinite(existingFreeMinutes) ? existingFreeMinutes : DEFAULT_STUDENT_FREE_MINUTES,
    totalFreeMinutesEarned: Number.isFinite(existingEarned) ? existingEarned : DEFAULT_STUDENT_FREE_MINUTES,
    totalFreeMinutesUsed: Number(userData.totalFreeMinutesUsed || 0),
    referralRewardCount: Number(userData.referralRewardCount || 0),
  };

  if (!studentProfileComplete || alreadyProcessed) {
    transaction.set(userRef, userRewardBaseline, { merge: true });
    logger.warn('student_referral_reward_skipped', {
      uid,
      source,
      reason: !studentProfileComplete ? 'incomplete_profile' : 'already_processed',
      alreadyProcessed,
      completionRequirements,
      pendingReferralSlugPresent: Boolean(referralSlug),
      growthRewardProcessed: Boolean((userData.growth || {}).accountCompletionRewardProcessed),
    });
    return {
      rewarded: false,
      reason: !studentProfileComplete ? 'incomplete_profile' : 'already_processed',
    };
  }

  if (!referralSlug) {
    transaction.set(userRef, {
      ...userRewardBaseline,
      pendingReferralSlug: null,
      pendingReferralCode: null,
      growth: {
        ...(userData.growth || {}),
        accountCompletionRewardProcessed: true,
        accountCompletionQualifiedAt: new Date().toISOString(),
      },
    }, { merge: true });
    logger.info('student_referral_reward_completed_without_slug', {
      uid,
      source,
      completionRequirements,
      reason: 'no_referral_slug',
    });
    return { rewarded: false, reason: 'no_referral_slug', source };
  }

  let referrerDoc = null;
  const referrerSlugQuery = db.collection('users').where('referralSlug', '==', referralSlug).limit(1);
  const referrerSlugSnap = await transaction.get(referrerSlugQuery);
  referrerDoc = referrerSlugSnap.docs[0] || null;

  if (!referrerDoc) {
    const legacyReferrerQuery = db.collection('users').where('referralCode', '==', referralSlug.toUpperCase()).limit(1);
    const legacyReferrerSnap = await transaction.get(legacyReferrerQuery);
    referrerDoc = legacyReferrerSnap.docs[0] || null;
  }

  const referrerId = referrerDoc?.id || null;
  const referrerData = referrerDoc?.data() || {};
  const referrerIsStudent = (referrerData.activeRole || referrerData.role || '').toLowerCase() === 'student';

  if (!referrerId || referrerId === uid || !referrerIsStudent) {
    transaction.set(userRef, {
      ...userRewardBaseline,
      pendingReferralSlug: null,
      pendingReferralCode: null,
      growth: {
        ...(userData.growth || {}),
        accountCompletionRewardProcessed: true,
        accountCompletionQualifiedAt: new Date().toISOString(),
      },
    }, { merge: true });
    logger.warn('student_referral_reward_invalid_referrer', {
      uid,
      source,
      referralSlug,
      referrerId,
      referrerIsStudent,
      completionRequirements,
      reason: !referrerId ? 'referrer_not_found' : (referrerId === uid ? 'self_referral' : 'referrer_not_student'),
    });
    return {
      rewarded: false,
      reason: !referrerId ? 'referrer_not_found' : (referrerId === uid ? 'self_referral' : 'referrer_not_student'),
      source,
    };
  }

  const referralRef = db.collection('referrals').doc(`${referrerId}_${uid}`);
  const referralSnap = await transaction.get(referralRef);
  const rewardAlreadyGranted = Boolean(referralSnap.exists && referralSnap.data()?.rewardGranted);

  transaction.set(referralRef, {
    referrerId,
    referredUserId: uid,
    referralSlug,
    status: 'completed',
    rewardGranted: true,
    rewardMinutesGranted: REFERRAL_REWARD_MINUTES,
    createdAt: referralSnap.exists ? (referralSnap.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp()) : admin.firestore.FieldValue.serverTimestamp(),
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  if (!rewardAlreadyGranted) {
    const referrerRef = db.collection('users').doc(referrerId);
    transaction.set(referrerRef, {
      freeMinutesRemaining: admin.firestore.FieldValue.increment(REFERRAL_REWARD_MINUTES),
      totalFreeMinutesEarned: admin.firestore.FieldValue.increment(REFERRAL_REWARD_MINUTES),
      referralRewardCount: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  transaction.set(userRef, {
    ...userRewardBaseline,
    referredBy: referrerId,
    pendingReferralSlug: null,
    pendingReferralCode: null,
    growth: {
      ...(userData.growth || {}),
      accountCompletionRewardProcessed: true,
      accountCompletionQualifiedAt: new Date().toISOString(),
    },
  }, { merge: true });

  logger.info('student_referral_reward_result', {
    uid,
    source,
    referralSlug,
    referrerId,
    rewardAlreadyGranted,
    rewarded: !rewardAlreadyGranted,
    completionRequirements,
  });

  return {
    rewarded: !rewardAlreadyGranted,
    reason: rewardAlreadyGranted ? 'duplicate_reward' : 'reward_granted',
    source,
    referrerId,
  };
}

function isTruthyFlag(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  return ['true', '1', 'yes', 'paused', 'blocked', 'suspended', 'disabled'].includes(normalized);
}

function isTutorDispatchEligible(tutor = {}, subjectKey) {
  const normalizedSubjects = (Array.isArray(tutor.activeSubjects) ? tutor.activeSubjects : [])
    .map((entry) => String(entry || '').trim().toLowerCase());
  const isDispatchPaused = isTruthyFlag(
    tutor.dispatchPaused
      ?? tutor.isDispatchPaused
      ?? tutor?.tutorProfile?.dispatchPaused
      ?? tutor?.tutorProfile?.isDispatchPaused
      ?? tutor?.tutorProfile?.pausedFromDispatch,
  );
  const isSuspendedOrBlocked = isTruthyFlag(
    tutor.suspended
      ?? tutor.isSuspended
      ?? tutor.blocked
      ?? tutor.isBlocked
      ?? tutor?.tutorProfile?.suspended
      ?? tutor?.tutorProfile?.blocked,
  );

  return tutor?.tutorProfile?.verificationStatus === 'verified'
    && isTutorAgreementCurrent(tutor)
    && !tutor.activeSessionId
    && normalizedSubjects.includes(subjectKey)
    && !isDispatchPaused
    && !isSuspendedOrBlocked;
}

function getLastOfferAtMillis(tutor = {}) {
  return normalizeMillis(tutor?.tutorProfile?.lastOfferAt ?? tutor?.lastOfferAt);
}

function getRecentAssignmentsCount(tutor = {}) {
  return normalizePositiveNumber(
    tutor?.tutorProfile?.recentAssignmentsCount
      ?? tutor?.recentAssignmentsCount
      ?? tutor?.tutorProfile?.completedSessionsLast24Hours
      ?? 0,
    0,
  );
}

function randomIndex(max) {
  return Math.floor(Math.random() * Math.max(1, max));
}

function hasArrayChanged(before = [], after = []) {
  return JSON.stringify(before || []) !== JSON.stringify(after || []);
}

function normalizeActiveSubjects(values = []) {
  const seen = new Set();
  return values
    .map((value) => normalizeSubjectName(value) || String(value || '').trim())
    .filter(Boolean)
    .filter((subject) => {
      const key = subject.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildQualifiedSubjects(extractedSubjects = []) {
  return extractedSubjects.filter((item) => Number(item.mark) >= 60);
}

function validateTutorSchoolSubjects(extractedSubjects = []) {
  const normalizedSubjects = extractedSubjects
    .map((item) => ({
      rawSubject: String(item?.subject || '').trim(),
      subject: normalizeSubjectName(item?.subject) || String(item?.subject || '').trim(),
      mark: Number(item?.mark || 0),
    }))
    .filter((item) => item.subject && Number.isFinite(item.mark));

  const allowedSubjects = normalizedSubjects.filter((item) => isAllowedGrade1To12Subject(item.rawSubject));
  const unsupportedSubjects = [...new Set(normalizedSubjects
    .filter((item) => !isAllowedGrade1To12Subject(item.rawSubject))
    .map((item) => item.subject))];

  return {
    normalizedSubjects,
    allowedSubjects,
    unsupportedSubjects,
  };
}

async function mergeTutorQualifiedSubjects({ uid, docId, qualifiedSubjects }) {
  const userRef = db.collection('users').doc(uid);
  await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    const user = userSnap.exists ? userSnap.data() : {};
    const existingQualified = Array.isArray(user.qualifiedSubjects) ? user.qualifiedSubjects : [];
    const bySubject = new Map();
    const now = new Date().toISOString();

    existingQualified.forEach((item) => {
      if (!item?.subject) return;
      bySubject.set(item.subject, item);
    });

    qualifiedSubjects.forEach((item) => {
      const subject = normalizeSubjectName(item.subject) || item.subject;
      const mark = Number(item.mark || 0);
      const existing = bySubject.get(subject);
      if (!existing || mark > Number(existing.mark || 0)) {
        bySubject.set(subject, {
          subject,
          mark,
          sourceDocumentId: docId,
          updatedAt: now,
        });
      }
    });

    const nextQualifiedSubjects = [...bySubject.values()].sort((a, b) => a.subject.localeCompare(b.subject));
    const qualifiedNames = nextQualifiedSubjects.map((item) => item.subject);
    const existingActive = normalizeActiveSubjects(user.activeSubjects || user.subjects || []);
    const nextActiveSubjects = normalizeActiveSubjects([...existingActive, ...qualifiedSubjects.map((item) => item.subject)])
      .filter((subject) => qualifiedNames.includes(subject));

    transaction.set(userRef, {
      qualifiedSubjects: nextQualifiedSubjects,
      activeSubjects: nextActiveSubjects,
      subjects: nextActiveSubjects,
      tutorProfile: {
        ...(user.tutorProfile || {}),
        verificationStatus: nextQualifiedSubjects.length ? 'verified' : 'pending',
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function refreshGlobalSubjects() {
  const tutorsSnap = await db.collection('users').where('activeRole', '==', 'tutor').get();
  const counts = new Map();

  tutorsSnap.docs.forEach((docSnap) => {
    const tutor = docSnap.data() || {};
    if (String(tutor?.tutorProfile?.verificationStatus || '').toLowerCase() !== 'verified') {
      return;
    }
    const activeSubjects = Array.isArray(tutor.activeSubjects) ? tutor.activeSubjects : [];
    const uniqueSubjects = [...new Set(normalizeActiveSubjects(activeSubjects))]
      .filter((subject) => isAllowedGrade1To12Subject(subject));
    uniqueSubjects.forEach((subject) => {
      counts.set(subject, (counts.get(subject) || 0) + 1);
    });
  });

  const subjects = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, tutorCount]) => ({
      name,
      tutorCount,
      updatedAt: new Date().toISOString(),
    }));

  await db.collection('system').doc('subjects').set({
    subjects,
    subjectNames: subjects.map((subject) => subject.name),
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return subjects;
}

function rankTutorsWithFairness(candidates = []) {
  const remaining = [...candidates]
    .map((tutor) => ({
      tutor,
      score: getTutorScore(tutor),
      lastOfferAtMs: getLastOfferAtMillis(tutor),
      recentAssignmentsCount: getRecentAssignmentsCount(tutor),
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
    ordered.push(picked.tutor.uid);

    const removeIndex = remaining.findIndex((entry) => entry.tutor.uid === picked.tutor.uid);
    if (removeIndex >= 0) {
      remaining.splice(removeIndex, 1);
    } else {
      break;
    }
  }

  return ordered;
}

async function getTutorQueueForSubject(subject) {
  const subjectKey = String(subject || 'Mathematics').trim().toLowerCase();
  const snapshot = await db
    .collection('users')
    .where('activeRole', '==', 'tutor')
    .where('onlineStatus', '==', 'online')
    .get();

  const eligibleTutors = snapshot.docs
    .map((item) => ({ uid: item.id, ...item.data() }))
    .filter((tutor) => isTutorDispatchEligible(tutor, subjectKey));

  return rankTutorsWithFairness(eligibleTutors);
}

exports.syncClassRequestLifecycle = onDocumentWritten('classRequests/{requestId}', async (event) => {
  const afterData = event.data.after.exists ? event.data.after.data() : null;
  if (!afterData) return;

  if (!ACTIVE_REQUEST_STATUSES.has(afterData.status) || afterData.tutorId) {
    return;
  }

  const requestId = event.params.requestId;
  const requestRef = db.collection('classRequests').doc(requestId);
  const candidateQueue = await getTutorQueueForSubject(afterData.subject);

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(requestRef);
    if (!snap.exists) return;
    const request = snap.data();

    if (!ACTIVE_REQUEST_STATUSES.has(request.status) || request.tutorId) {
      return;
    }

    if (isRequestExpired(request)) {
      transaction.update(requestRef, {
        status: REQUEST_STATUS.EXPIRED,
        statusDetail: 'Request expired because no tutor accepted in time.',
        tutorQueue: [],
        currentOfferTutorId: null,
        offerExpiresAt: null,
        offerToken: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    if (
      request.status === REQUEST_STATUS.OFFERED
      && request.currentOfferTutorId
      && normalizeMillis(request.offerExpiresAt) > Date.now()
    ) {
      return;
    }

    let queue = Array.isArray(candidateQueue) ? [...candidateQueue] : [];

    if (request.status === REQUEST_STATUS.OFFERED && request.currentOfferTutorId) {
      queue = queue.filter((id) => id !== request.currentOfferTutorId);
    }

    if (!queue.length) {
      transaction.update(requestRef, {
        status: REQUEST_STATUS.NO_TUTOR_AVAILABLE,
        statusDetail: 'No tutor accepted. Looking for another tutor.',
        tutorQueue: [],
        currentOfferTutorId: null,
        offerExpiresAt: null,
        offerToken: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    const offerRevision = nextOfferRevision(request);
    const selectedTutorId = queue[0];
    const selectedTutorRef = db.collection('users').doc(selectedTutorId);
    transaction.update(requestRef, {
      status: REQUEST_STATUS.OFFERED,
      statusDetail: 'Tutor notified. Waiting for acceptance.',
      tutorQueue: queue,
      currentOfferTutorId: selectedTutorId,
      offerExpiresAt: Date.now() + OFFER_TIMEOUT_MS,
      lastOfferAt: Date.now(),
      offerRevision,
      offerToken: randomUUID(),
      retryOfferGranted: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.set(selectedTutorRef, {
      lastOfferAt: admin.firestore.FieldValue.serverTimestamp(),
      tutorProfile: {
        lastOfferAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
});

exports.trackTutorRequestStats = onDocumentWritten('classRequests/{requestId}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!after) return;

  const requestId = event.params.requestId;
  const now = Date.now();
  const beforeStatus = String(before?.status || '').toLowerCase();
  const afterStatus = String(after.status || '').toLowerCase();
  const beforeTutorId = before?.currentOfferTutorId || null;
  const afterTutorId = after.currentOfferTutorId || null;
  const tutorId = after.tutorId || before?.tutorId || afterTutorId || beforeTutorId || null;
  const offerRevision = Number(after.offerRevision || before?.offerRevision || 0) || 0;
  const subject = after.subject || before?.subject || '';
  const offeredAtMs = normalizeStatsEventTimestamp(
    after.lastOfferAt
      || before?.lastOfferAt
      || after.offerExpiresAt
      || before?.offerExpiresAt,
  ) || now;

  if (afterStatus === REQUEST_STATUS.OFFERED && afterTutorId) {
    const didChangeOffer =
      beforeStatus !== REQUEST_STATUS.OFFERED
      || beforeTutorId !== afterTutorId
      || Number(before?.offerRevision || 0) !== offerRevision;

    if (didChangeOffer) {
      await createUserNotification({
        userId: afterTutorId,
        title: 'New tutor request',
        message: `A ${subject || 'class'} request is waiting for your response.`,
        type: 'tutor_offer',
        requestId,
        targetPath: '/app/tutor',
        metadata: {
          offerRevision,
          offerExpiresAt: after.offerExpiresAt || null,
        },
      });

      await recordTutorOfferLifecycleEvent({
        tutorId: afterTutorId,
        requestId,
        offerRevision,
        subject,
        outcome: 'offered',
        offeredAtMs,
        sourceStatus: afterStatus,
      });
    }
  }

  if (afterStatus === REQUEST_STATUS.ACCEPTED && tutorId) {
    const responseSeconds = Math.max(0, Math.round((now - offeredAtMs) / 1000));
    if (beforeStatus !== REQUEST_STATUS.ACCEPTED) {
      await createUserNotification({
        userId: after.studentId || before?.studentId || null,
        title: 'Tutor selected',
        message: `${after.tutorName || 'A tutor'} accepted your ${subject || 'class'} request.`,
        type: 'request_accepted',
        requestId,
        sessionId: after.sessionId || before?.sessionId || requestId,
        targetPath: after.sessionId || before?.sessionId || requestId
          ? `/app/session/${after.sessionId || before?.sessionId || requestId}`
          : `/app/student/requests/${requestId}`,
        metadata: {
          tutorId,
          tutorName: after.tutorName || '',
        },
      });
    }

    await recordTutorOfferLifecycleEvent({
      tutorId,
      requestId,
      offerRevision,
      subject,
      outcome: 'accepted',
      offeredAtMs,
      closedAtMs: now,
      responseSeconds,
      sourceStatus: afterStatus,
    });
    return;
  }

  const movedOffOffer = beforeStatus === REQUEST_STATUS.OFFERED
    && beforeTutorId
    && (afterTutorId !== beforeTutorId || afterStatus !== REQUEST_STATUS.OFFERED);

  if (movedOffOffer && tutorId && beforeTutorId === tutorId) {
    const expiredByTime = normalizeStatsEventTimestamp(before?.offerExpiresAt) > 0
      && normalizeStatsEventTimestamp(before.offerExpiresAt) <= now;
    const outcome = afterStatus === REQUEST_STATUS.EXPIRED || expiredByTime
      ? 'expired'
      : 'declined';

    if (outcome !== 'declined' || afterStatus === REQUEST_STATUS.EXPIRED || afterStatus === REQUEST_STATUS.NO_TUTOR_AVAILABLE || afterStatus === REQUEST_STATUS.MATCHING) {
      await recordTutorOfferLifecycleEvent({
        tutorId: beforeTutorId,
        requestId,
        offerRevision,
        subject,
        outcome,
        offeredAtMs,
        closedAtMs: now,
        sourceStatus: afterStatus,
      });
    }
  }

  if (afterStatus === REQUEST_STATUS.NO_TUTOR_AVAILABLE && beforeStatus !== REQUEST_STATUS.NO_TUTOR_AVAILABLE) {
    await createUserNotification({
      userId: after.studentId || before?.studentId || null,
      title: 'No tutor available',
      message: 'No tutor accepted in time. You can retry from your class status page.',
      type: 'matching_update',
      requestId,
      targetPath: `/app/student/requests/${requestId}`,
    });
  }
});

exports.contentExtractionForWhiteboard = onDocumentWritten({
  document: 'classRequests/{requestId}',
  secrets: [PARAKLEO_AI_KEYS],
}, async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!after) return;

  const beforeStatus = String(before?.status || '').toLowerCase();
  const afterStatus = String(after?.status || '').toLowerCase();
  if (afterStatus !== REQUEST_STATUS.ACCEPTED || beforeStatus === REQUEST_STATUS.ACCEPTED) {
    return;
  }

  const requestId = event.params.requestId;
  const requestRef = db.collection('classRequests').doc(requestId);
  const sessionId = String(after?.sessionId || '').trim();
  const sessionRef = sessionId ? db.collection('sessions').doc(sessionId) : null;

  const attachments = normalizeUploadedAttachmentList(after);
  const startedAt = Date.now();

  if (!attachments.length) {
    await requestRef.set({
      documentAiExtractionStatus: 'skipped_no_attachments',
      documentAiExtractionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    if (sessionRef) {
      await sessionRef.set({
        documentAiExtractionStatus: 'skipped_no_attachments',
        documentAiExtractionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return;
  }

  await requestRef.set({
    documentAiExtractionStatus: 'processing',
    documentAiExtractionStartedAt: admin.firestore.FieldValue.serverTimestamp(),
    documentAiExtractionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    documentAiExtractionError: '',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  if (sessionRef) {
    await sessionRef.set({
      documentAiExtractionStatus: 'processing',
      documentAiExtractionStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      documentAiExtractionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      documentAiExtractionError: '',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  try {
    const aiSecrets = getAiSecrets();
    let payloadImages = [];
    for (const attachment of attachments.slice(0, 8)) {
      // eslint-disable-next-line no-await-in-loop
      const nextImages = await convertAttachmentToGeminiPayloadImages(attachment);
      payloadImages = payloadImages.concat(nextImages);
    }
    payloadImages = payloadImages.slice(0, 8);
    if (!payloadImages.length) {
      throw new Error('No usable attachment images were generated for Gemini extraction.');
    }

    const events = [];
    const streamMeta = await getAiSubjectExtractionModule().streamBoardExtractionWithAI({
      images: payloadImages,
      requestContext: {
        topic: String(after?.topic || ''),
        description: String(after?.description || ''),
      },
      firebaseConfig: aiSecrets,
      logger,
      onEvent: async (evt) => {
        events.push(evt);
      },
    });

    const questionEvents = events.filter((evt) => String(evt?.type || '').toLowerCase() === 'question');
    const classificationEvent = events.find((evt) => String(evt?.type || '').toLowerCase() === 'classification') || {};
    const byPage = new Map();
    let visualRegionCount = 0;
    questionEvents.forEach((question, index) => {
      const pageNumber = Number(question?.pageNumber || 1) > 0 ? Number(question.pageNumber) : 1;
      if (!byPage.has(pageNumber)) byPage.set(pageNumber, []);
      const visualRegions = Array.isArray(question?.visualRegions) ? question.visualRegions : [];
      visualRegionCount += visualRegions.length;
      byPage.get(pageNumber).push({
        questionId: String(question?.questionId || `q_${String(index + 1).padStart(3, '0')}`),
        questionNumber: question?.questionNumber || null,
        questionType: String(question?.questionType || 'other'),
        text: String(question?.text || ''),
        marks: Number.isFinite(Number(question?.marks)) ? Number(question.marks) : null,
        options: Array.isArray(question?.options) ? question.options : [],
        sourceImageIndex: Number.isFinite(Number(question?.sourceImageIndex)) ? Number(question.sourceImageIndex) : null,
        visualRegions,
        hasVisuals: visualRegions.length > 0,
        images: [],
        type: 'question',
      });
    });
    const mergedPages = Array.from(byPage.keys()).sort((a, b) => a - b).map((pageNumber, idx) => ({
      pageNumber,
      sourceImageIndex: idx,
      questions: byPage.get(pageNumber) || [],
    }));
    const mergedText = questionEvents.map((question) => String(question?.text || '').trim()).filter(Boolean).join('\n\n').trim();

    const geminiFlashPricing = await buildLiveGeminiFlashPricing({
      usageMetadata: streamMeta?.usageMetadata || {},
      promptText: streamMeta?.prompt || '',
      imageCount: payloadImages.length,
    });
    const existingExtractions = Array.isArray(after?.boardPreparationSource?.attachmentExtractions)
      ? after.boardPreparationSource.attachmentExtractions
      : [];
    const cloudVisionZar = toRand(existingExtractions.reduce((sum, item = {}) => {
      const direct = Number(item?.cloudVisionPriceZar || 0);
      const fromPricing = Number(item?.pricing?.cloudVision?.zarTotal || 0);
      const picked = direct || fromPricing;
      return sum + (Number.isFinite(picked) ? picked : 0);
    }, 0));
    const cloudVisionPricing = {
      provider: 'google-vision',
      operation: 'document_text_detection',
      currency: 'ZAR',
      livePrice: true,
      estimated: false,
      pageCount: existingExtractions.reduce((sum, item = {}) => sum + Math.max(1, Number(item?.pageCount || item?.selectedPages?.length || 1)), 0),
      zarTotal: cloudVisionZar,
    };
    const bookingFeePricing = buildBookingFeePricing({
      cloudVisionZar: cloudVisionPricing.zarTotal,
      geminiZar: geminiFlashPricing.zarTotal,
    });
    const combinedPricing = {
      currency: 'ZAR',
      cloudVision: cloudVisionPricing,
      geminiFlash: geminiFlashPricing,
      bookingFee: bookingFeePricing,
      totalZar: toRand(cloudVisionPricing.zarTotal + geminiFlashPricing.zarTotal),
      estimated: false,
      livePrice: true,
    };

    const documentAiExtraction = {
      provider: 'google-gemini',
      model: 'gemini-2.5-flash',
      extractionMethod: 'gemini_flash_stream',
      extractionStatus: mergedText ? 'SUCCESS' : 'FAILED',
      extractedText: mergedText,
      text: mergedText,
      textLength: mergedText.length,
      pageCount: mergedPages.length,
      pages: mergedPages,
      summary: {
        pageCount: mergedPages.length,
        questionsCount: questionEvents.length,
        visualRegionCount,
      },
      classification: classificationEvent,
      pricing: geminiFlashPricing,
      source: GEMINI_FLASH_EXTRACTION_SOURCE,
      processedAt: Date.now(),
      durationMs: Math.max(0, Date.now() - startedAt),
      streamStats: streamMeta?.streamStats || {},
      attachments: attachments.map((entry) => ({
        fileName: entry.fileName || '',
        objectPath: entry.objectPath || '',
      })),
    };

    const boardPreparationSource = {
      ...(after?.boardPreparationSource || {}),
      extractedText: mergedText || after?.boardPreparationSource?.extractedText || '',
      documentAiExtraction,
      extractionPricing: combinedPricing,
      cloudVisionPriceZar: cloudVisionPricing.zarTotal,
      documentAiPriceZar: geminiFlashPricing.zarTotal,
      totalExtractionPriceZar: combinedPricing.totalZar,
      bookingFeePriceZar: bookingFeePricing.totalZar,
      bookingFeePricing,
    };

    const requestPatch = {
      boardPreparationSource,
      documentAiExtractionStatus: 'ready',
      documentAiExtractionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      documentAiExtractionCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
      documentAiExtractionError: '',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await requestRef.set(requestPatch, { merge: true });
    if (sessionRef) {
      await sessionRef.set({
        ...requestPatch,
      }, { merge: true });
    }
  } catch (error) {
    const message = getSafeErrorMessage(error, 'Gemini extraction failed.');
    logger.error('gemini_accept_extraction_failed', {
      requestId,
      sessionId: sessionId || null,
      message,
    });
    await requestRef.set({
      documentAiExtractionStatus: 'failed',
      documentAiExtractionError: message,
      documentAiExtractionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    if (sessionRef) {
      await sessionRef.set({
        documentAiExtractionStatus: 'failed',
        documentAiExtractionError: message,
        documentAiExtractionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }
});

exports.trackTutorSessionStats = onDocumentWritten('sessions/{sessionId}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!after) return;

  const beforeStatus = String(before?.status || '').toLowerCase();
  const afterStatus = String(after.status || '').toLowerCase();
  if (beforeStatus === afterStatus) return;
  if (![SESSION_STATUS.COMPLETED, SESSION_STATUS.CANCELED, SESSION_STATUS.CANCELED_DURING].includes(after.status)) {
    return;
  }

  const tutorId = after.tutorId || before?.tutorId || null;
  if (!tutorId) return;

  const requestId = after.requestId || before?.requestId || '';
  const outcome = after.status === SESSION_STATUS.COMPLETED ? 'completed' : after.status;
  const occurredAtMs = normalizeStatsEventTimestamp(after.endedAt || after.updatedAt || after.completedAt || Date.now());
  const startedAtMs = normalizeStatsEventTimestamp(after.billingStartedAt || after.studentJoinedAt || after.callStartedAt || before?.billingStartedAt || before?.studentJoinedAt || before?.callStartedAt);

  await recordTutorSessionLifecycleEvent({
    tutorId,
    sessionId: event.params.sessionId,
    requestId,
    outcome,
    canceledBy: after.canceledBy || before?.canceledBy || null,
    startedAtMs,
    occurredAtMs,
  });
});

async function processTutorDocumentRecord({ docId, data = {} }) {
  const docRef = db.collection('tutorDocuments').doc(docId);
  console.debug('[tutorResultsAI] processing document record', {
    docId,
    uid: data.uid || '',
    filePath: data.filePath || '',
    status: data.status || '',
    contentType: data.contentType || '',
  });

  if (!data.uid || !data.filePath) {
    console.debug('[tutorResultsAI] missing uid or filePath', {
      docId,
      uid: data.uid || '',
      filePath: data.filePath || '',
    });
    if (!(await docRef.get()).exists) return;
    await docRef.set({
      status: 'FAILED',
      error: 'Document record is missing uid or filePath.',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return;
  }

  if (!(await docRef.get()).exists) return;
  await docRef.set({
    status: 'PROCESSING',
    error: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  console.debug('[tutorResultsAI] document marked processing', { docId, uid: data.uid });
  await writeAiLog({
    userId: data.uid,
    source: 'tutor_results_extraction',
    step: 'processing_started',
    status: 'info',
    message: 'Tutor document processing started.',
    details: {
      docId,
      filePath: data.filePath,
      fileName: data.fileName || '',
      contentType: data.contentType || '',
    },
  });

  try {
    const bucket = admin.storage().bucket();
    const file = bucket.file(data.filePath);
    logger.info('tutor_document_ai_processing_started', {
      docId,
      uid: data.uid,
      filePath: data.filePath,
      contentType: data.contentType || '',
    });
    const [documentBuffer] = await file.download();
    console.debug('[tutorResultsAI] document downloaded from storage', {
      docId,
      uid: data.uid,
      filePath: data.filePath,
      byteLength: documentBuffer.length,
    });
    await writeAiLog({
      userId: data.uid,
      source: 'tutor_results_extraction',
      step: 'document_downloaded',
      status: 'info',
      message: 'Tutor document downloaded from storage.',
      details: {
        docId,
        filePath: data.filePath,
        byteLength: documentBuffer.length,
      },
    });
    logger.info('tutor_document_downloaded', {
      docId,
      uid: data.uid,
      byteLength: documentBuffer.length,
    });
    const aiConfig = getAiSecrets();
    const images = await getAiSubjectExtractionModule().convertPdfToImages(documentBuffer, {
      firebaseConfig: aiConfig,
    });
    console.debug('[tutorResultsAI] document converted to images', {
      docId,
      uid: data.uid,
      imageCount: images.length,
      imageBytes: images.map((image) => image.length),
    });
    await writeAiLog({
      userId: data.uid,
      source: 'tutor_results_extraction',
      step: 'document_converted_to_images',
      status: 'info',
      message: 'Tutor document converted to images.',
      details: {
        docId,
        filePath: data.filePath,
        imageCount: images.length,
        imageBytes: images.map((image) => image.length),
      },
    });
    logger.info('tutor_document_images_ready', {
      docId,
      uid: data.uid,
      imageCount: images.length,
      imageBytes: images.map((image) => image.length),
    });
    const aiResult = await getAiSubjectExtractionModule().extractTutorResultsWithGemini25Flash(images, {
      logger,
      logContext: {
        docId,
        uid: data.uid,
      },
      firebaseConfig: aiConfig,
    });
    const extractedSubjects = aiResult.validated;
    const aiPrompt = aiResult.prompt;
    const aiRawOutput = aiResult.rawOutput;
    const aiReasoning = aiResult.reasoning || '';

    await writeAiLog({
      userId: data.uid,
      source: 'tutor_results_extraction',
      step: 'ai_response_received',
      status: extractedSubjects.length ? 'success' : 'fallback',
      message: 'Tutor extraction AI response received.',
      prompt: aiPrompt,
      rawOutput: aiRawOutput,
      error: aiResult.error || '',
      details: {
        docId,
        filePath: data.filePath,
        reasoning: aiReasoning,
        extractedSubjectCount: extractedSubjects.length,
      },
    });

    console.debug('[tutorResultsAI] extracted subjects result', {
      docId,
      uid: data.uid,
      extractedSubjects,
    });

    const tutorSubjectValidation = validateTutorSchoolSubjects(extractedSubjects);
    const { allowedSubjects, unsupportedSubjects } = tutorSubjectValidation;

    if (unsupportedSubjects.length) {
      console.debug('[tutorResultsAI] unsupported grade 1-12 tutor subjects detected', {
        docId,
        uid: data.uid,
        unsupportedSubjects,
      });
      await writeAiLog({
        userId: data.uid,
        source: 'tutor_results_extraction',
        step: 'unsupported_subjects_ignored',
        status: 'info',
        message: 'Unsupported tutor subjects were ignored; continuing with supported subjects.',
        details: {
          docId,
          filePath: data.filePath,
          unsupportedSubjects,
          allowedSubjects,
        },
      });
    }

    if (!allowedSubjects.length) {
      console.debug('[tutorResultsAI] no subjects detected in document', {
        docId,
        uid: data.uid,
      });
      await writeAiLog({
        userId: data.uid,
        source: 'tutor_results_extraction',
        status: 'no_subjects_found',
        prompt: aiPrompt,
        rawOutput: aiRawOutput,
        error: '',
        details: {
          docId,
          filePath: data.filePath,
          extractedSubjectCount: 0,
          unsupportedSubjectCount: unsupportedSubjects.length,
          reasoning: aiReasoning,
        },
      });
      if (!(await docRef.get()).exists) return;
      await docRef.set({
        extractedSubjects: [],
        qualifiedSubjects: [],
        status: 'FAILED',
        error: 'No supported Grade 1-12 subjects detected',
        aiPrompt,
        aiRawOutput,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return;
    }

    const qualifiedSubjects = buildQualifiedSubjects(allowedSubjects);
    console.debug('[tutorResultsAI] qualified subjects built', {
      docId,
      uid: data.uid,
      qualifiedSubjects,
    });
    await writeAiLog({
      userId: data.uid,
      source: 'tutor_results_extraction',
      step: 'subjects_validated',
      status: 'success',
      message: 'Tutor subjects validated.',
      details: {
        docId,
        filePath: data.filePath,
        extractedSubjects,
        qualifiedSubjects,
      },
    });

    if (!(await docRef.get()).exists) return;
    await docRef.set({
      extractedSubjects: allowedSubjects,
      qualifiedSubjects,
      status: 'VERIFIED',
      error: null,
      aiPrompt,
      aiRawOutput,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await writeAiLog({
      userId: data.uid,
      source: 'tutor_results_extraction',
      status: 'success',
      prompt: aiPrompt,
      rawOutput: aiRawOutput,
      error: '',
      details: {
        docId,
        filePath: data.filePath,
        extractedSubjectCount: extractedSubjects.length,
        qualifiedSubjectCount: qualifiedSubjects.length,
        reasoning: aiReasoning,
      },
    });

    await mergeTutorQualifiedSubjects({
      uid: data.uid,
      docId,
      qualifiedSubjects,
    });
    await refreshGlobalSubjects();
    await writeAiLog({
      userId: data.uid,
      source: 'tutor_results_extraction',
      step: 'processing_completed',
      status: 'success',
      message: 'Tutor document processing completed.',
      details: {
        docId,
        filePath: data.filePath,
        extractedSubjectCount: extractedSubjects.length,
        qualifiedSubjectCount: qualifiedSubjects.length,
      },
    });

    logger.info('Tutor document processed.', {
      docId,
      uid: data.uid,
      extractedSubjectCount: extractedSubjects.length,
      qualifiedSubjectCount: qualifiedSubjects.length,
    });
  } catch (error) {
    console.debug('[tutorResultsAI] processing failed', {
      docId,
      uid: data.uid,
      error: error.message,
    });
    await writeAiLog({
      userId: data.uid,
      source: 'tutor_results_extraction',
      step: 'processing_failed',
      status: 'failed',
      message: 'Tutor document processing failed.',
      error: error.message || 'Document processing failed.',
      details: {
        docId,
        filePath: data.filePath,
      },
    });
    logger.error('Tutor document processing failed.', {
      docId,
      uid: data.uid,
      error: error.message,
    });
    await writeAiLog({
      userId: data.uid,
      source: 'tutor_results_extraction',
      status: 'failed',
      prompt: '',
      rawOutput: '',
      error: error.message || 'Document processing failed.',
      details: {
        docId,
        filePath: data.filePath,
      },
    });
    if (!(await docRef.get()).exists) return;
    await docRef.set({
      status: 'FAILED',
      error: error.message || 'Document processing failed.',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
}

exports.processTutorDocument = onDocumentCreated({
  document: 'tutorDocuments/{docId}',
  secrets: [PARAKLEO_AI_KEYS],
  memory: '1GiB',
  timeoutSeconds: 300,
}, async (event) => {
  const docId = event.params.docId;
  const data = event.data?.data() || {};
  await processTutorDocumentRecord({ docId, data });
});

exports.retryTutorDocumentProcessing = onDocumentWritten({
  document: 'tutorDocuments/{docId}',
  secrets: [PARAKLEO_AI_KEYS],
  memory: '1GiB',
  timeoutSeconds: 300,
}, async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!before || !after) return;
  if (String(after.status || '').toUpperCase() !== 'UPLOADED') return;
  if (String(before.status || '').toUpperCase() === 'UPLOADED') return;

  await processTutorDocumentRecord({
    docId: event.params.docId,
    data: after,
  });
});

exports.updateGlobalSubjects = onDocumentWritten('users/{uid}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : {};
  const after = event.data.after.exists ? event.data.after.data() : {};
  const wasTutor = before.activeRole === 'tutor' || (before.roles || []).includes('tutor');
  const isTutor = after.activeRole === 'tutor' || (after.roles || []).includes('tutor');

  if (!wasTutor && !isTutor) return;

  const changed = hasArrayChanged(before.activeSubjects, after.activeSubjects)
    || hasArrayChanged(before.qualifiedSubjects, after.qualifiedSubjects);
  if (!changed) return;

  await refreshGlobalSubjects();
});

exports.refreshGlobalSubjectsOnTutorChange = exports.updateGlobalSubjects;

exports.syncStudentReferralRewardsOnUserWrite = onDocumentWritten('users/{uid}', async (event) => {
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!after) return;

  const isStudent = (after.activeRole || after.role || '').toLowerCase() === 'student';
  if (!isStudent) return;

  const completionRequirements = getStudentCompletionRequirements(after);
  const studentProfileComplete = completionRequirements.complete;
  const alreadyProcessed = Boolean((after.growth || {}).accountCompletionRewardProcessed);
  logger.info('student_referral_user_write_seen', {
    uid: event.params.uid,
    studentProfileComplete,
    alreadyProcessed,
    completionRequirements,
    pendingReferralSlugPresent: Boolean(String(after.pendingReferralSlug || after.pendingReferralCode || '').trim()),
  });
  if (!studentProfileComplete || alreadyProcessed) return;

  const userRef = db.collection('users').doc(event.params.uid);
  await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) return;
    const userData = userSnap.data() || {};
    if ((userData.activeRole || userData.role || '').toLowerCase() !== 'student') return;
    if (!hasCompletedStudentProfile(userData)) return;
    if (Boolean((userData.growth || {}).accountCompletionRewardProcessed)) return;

    await applyStudentReferralReward(transaction, {
      userRef,
      userData,
      uid: event.params.uid,
      pendingReferralSlug: String(userData.pendingReferralSlug || userData.pendingReferralCode || '').trim(),
      source: 'userWriteTrigger',
      baseUpdates: {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        referralSlug: userData.referralSlug || `clx-${randomUUID().replace(/-/g, '').slice(0, 20)}`,
        growth: {
          ...(userData.growth || {}),
          completionRequirements: {
            ...((userData.growth || {}).completionRequirements || {}),
            ...completionRequirements,
            studentProfileComplete: true,
          },
          lastGrowthSyncedAt: new Date().toISOString(),
        },
      },
    });
  });
});

exports.notifyTutorProfileCompletion = onDocumentWritten('users/{uid}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : {};
  const after = event.data.after.exists ? event.data.after.data() : {};
  const isTutor = (after.activeRole || after.role || '').toLowerCase() === 'tutor';
  if (!isTutor) return;

  const beforeComplete = hasCompletedTutorProfile(before);
  const afterComplete = hasCompletedTutorProfile(after);
  if (!afterComplete || beforeComplete) return;

  try {
    await queueEmailEventOnce({
      eventId: buildEmailEventId('tutor-profile-complete', event.params.uid),
      eventType: 'tutor_profile_completed',
      payload: {
        email: String(after.email || '').trim(),
        subjects: Array.isArray(after.activeSubjects) && after.activeSubjects.length
          ? after.activeSubjects.join(', ')
          : 'Ready to teach',
        payoutReady: Boolean(after.tutorProfile?.payout?.verified),
      },
      source: 'users/{uid}:write',
    });
  } catch (error) {
    logger.warn('Failed to queue tutor profile completion email.', {
      uid: event.params.uid,
      error: error.message,
    });
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

function sanitizeCloudflareIceServers(iceServers) {
  if (!Array.isArray(iceServers)) return [];

  return iceServers
    .map((server) => {
      const urls = Array.isArray(server?.urls)
        ? server.urls.filter(Boolean)
        : [server?.urls].filter(Boolean);

      const filteredUrls = urls.filter((url) => !String(url).includes(':53'));

      if (!filteredUrls.length) return null;

      return {
        urls: filteredUrls,
        ...(server?.username ? { username: server.username } : {}),
        ...(server?.credential ? { credential: server.credential } : {}),
        ...(server?.credentialType ? { credentialType: server.credentialType } : {}),
      };
    })
    .filter(Boolean);
}

function parseTurnTtlSeconds(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return DEFAULT_TURN_TTL_SECONDS;
  return Math.max(60, Math.min(172800, Math.floor(parsed)));
}

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

function getSafeErrorMessage(error, fallback = 'Unexpected error.') {
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error && typeof error.message === 'string' && error.message.trim()) return error.message.trim();
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== '{}') return serialized;
  } catch (_) {
    // no-op
  }
  return fallback;
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

function getRequestMetadata(req = {}) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ipAddress = forwardedFor || String(req.headers['x-real-ip'] || req.ip || '').trim();
  const userAgent = String(req.headers['user-agent'] || '').trim();
  return { ipAddress, userAgent };
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeExtractedText(rawText) {
  return String(rawText || '').replace(/\s+/g, ' ').trim();
}

function capitalizeTopic(value = '') {
  const normalized = normalizeExtractedText(value);
  if (!normalized) return '';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function isPdfAttachmentBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.slice(0, 5).toString('utf8') === '%PDF-';
}

function toMoney(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Number(numeric.toFixed(6));
}

function toRand(value) {
  return Number(toMoney(value).toFixed(2));
}

function getUsageMonthKey(value = Date.now()) {
  const date = new Date(value);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function estimateTokenCountFromText(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) return 0;
  return Math.max(1, Math.round(normalized.length / 4));
}

function normalizeUsageTokenCount(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric);
}

function normalizeGeminiPromptTokenBreakdown(usageMetadata = {}, { promptText = '', imageCount = 0 } = {}) {
  const promptTokenCount = normalizeUsageTokenCount(
    usageMetadata?.promptTokenCount
      ?? usageMetadata?.inputTokenCount
      ?? usageMetadata?.prompt_tokens,
  );
  const outputTokenCount = normalizeUsageTokenCount(
    usageMetadata?.candidatesTokenCount
      ?? usageMetadata?.outputTokenCount
      ?? usageMetadata?.candidates_tokens,
  );
  const promptDetails = Array.isArray(
    usageMetadata?.promptTokensDetails
      ?? usageMetadata?.promptTokenDetails
      ?? usageMetadata?.inputTokensDetails,
  )
    ? (usageMetadata.promptTokensDetails || usageMetadata.promptTokenDetails || usageMetadata.inputTokensDetails)
    : [];

  let textInputTokens = 0;
  let imageInputTokens = 0;
  promptDetails.forEach((detail = {}) => {
    const tokenCount = normalizeUsageTokenCount(
      detail?.tokenCount
        ?? detail?.tokens
        ?? detail?.count
        ?? detail?.token_count,
    );
    const modality = String(
      detail?.modality
        || detail?.type
        || detail?.mediaType
        || detail?.tokenType
        || detail?.channel
        || '',
    ).toLowerCase();
    if (!tokenCount) return;
    if (modality.includes('image')) {
      imageInputTokens += tokenCount;
      return;
    }
    if (modality.includes('text')) {
      textInputTokens += tokenCount;
    }
  });

  let splitStrategy = promptDetails.length ? 'usage_metadata_details' : 'prompt_estimate_fallback';
  if (!textInputTokens && !imageInputTokens) {
    const estimatedPromptTextTokens = estimateTokenCountFromText(promptText);
    if (imageCount > 0) {
      textInputTokens = Math.min(promptTokenCount, estimatedPromptTextTokens);
      imageInputTokens = Math.max(0, promptTokenCount - textInputTokens);
    } else {
      textInputTokens = promptTokenCount;
      imageInputTokens = 0;
    }
  }

  const totalSplitTokens = textInputTokens + imageInputTokens;
  if (totalSplitTokens !== promptTokenCount) {
    const delta = promptTokenCount - totalSplitTokens;
    if (delta > 0) {
      if (imageCount > 0) {
        imageInputTokens += delta;
      } else {
        textInputTokens += delta;
      }
    } else if (delta < 0) {
      const correction = Math.abs(delta);
      if (imageInputTokens >= correction) {
        imageInputTokens -= correction;
      } else {
        textInputTokens = Math.max(0, textInputTokens - (correction - imageInputTokens));
        imageInputTokens = 0;
      }
    }
    splitStrategy = `${splitStrategy}_normalized`;
  }

  return {
    promptTokenCount,
    outputTokenCount,
    textInputTokens,
    imageInputTokens,
    splitStrategy,
  };
}

async function buildLiveCloudVisionPricing({
  pageCount = 1,
  usageMonthKey = getUsageMonthKey(),
} = {}) {
  const safePageCount = Math.max(1, Math.round(Number(pageCount || 1)));
  const price = await getCloudVisionDocumentTextPrice('ZAR');
  const usageRef = db.collection('systemUsage').doc(`cloudVisionDocumentTextDetection_${usageMonthKey}`);
  const pricing = await db.runTransaction(async (transaction) => {
    const usageSnap = await transaction.get(usageRef);
    const priorUsageAmount = Math.max(0, Number(usageSnap.data()?.usageAmount || 0));
    const chargeZar = computeTieredChargeFromPrice({
      price,
      priorUsageAmount,
      usageAmount: safePageCount,
    });
    const nextUsageAmount = priorUsageAmount + safePageCount;
    transaction.set(usageRef, {
      service: 'cloud_vision_document_text_detection',
      skuId: GOOGLE_CLOUD_SKU_IDS.cloudVisionDocumentTextDetection,
      monthKey: usageMonthKey,
      currency: 'ZAR',
      usageAmount: nextUsageAmount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: usageSnap.exists ? (usageSnap.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp()) : admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return {
      priorUsageAmount,
      nextUsageAmount,
      chargeZar,
    };
  });

  return {
    provider: 'google-vision',
    operation: 'document_text_detection',
    currency: 'ZAR',
    livePrice: true,
    estimated: false,
    pageCount: safePageCount,
    monthKey: usageMonthKey,
    skuId: GOOGLE_CLOUD_SKU_IDS.cloudVisionDocumentTextDetection,
    unitQuantity: Number(price?.rate?.unitInfo?.unitQuantity?.value || 1),
    priorMonthlyUsageCount: pricing.priorUsageAmount,
    nextMonthlyUsageCount: pricing.nextUsageAmount,
    zarTotal: toRand(pricing.chargeZar),
    billingPrice: price,
  };
}

async function buildLiveGeminiFlashPricing({
  usageMetadata = {},
  promptText = '',
  imageCount = 0,
} = {}) {
  const [textInputPrice, imageInputPrice, textOutputPrice] = await Promise.all([
    getGeminiFlashTextInputPrice('ZAR'),
    getGeminiFlashImageInputPrice('ZAR'),
    getGeminiFlashTextOutputPrice('ZAR'),
  ]);
  const tokenBreakdown = normalizeGeminiPromptTokenBreakdown(usageMetadata, { promptText, imageCount });
  const textInputChargeZar = computeLinearChargeFromPrice({
    price: textInputPrice,
    usageAmount: tokenBreakdown.textInputTokens,
  });
  const imageInputChargeZar = computeLinearChargeFromPrice({
    price: imageInputPrice,
    usageAmount: tokenBreakdown.imageInputTokens,
  });
  const outputChargeZar = computeLinearChargeFromPrice({
    price: textOutputPrice,
    usageAmount: tokenBreakdown.outputTokenCount,
  });
  const totalZar = toRand(textInputChargeZar + imageInputChargeZar + outputChargeZar);
  return {
    provider: 'google-gemini',
    model: 'gemini-2.5-flash',
    operation: 'structured_question_extraction',
    currency: 'ZAR',
    livePrice: true,
    estimated: false,
    usageMetadata,
    promptTokenCount: tokenBreakdown.promptTokenCount,
    outputTokens: tokenBreakdown.outputTokenCount,
    textInputTokens: tokenBreakdown.textInputTokens,
    imageInputTokens: tokenBreakdown.imageInputTokens,
    tokenSplitStrategy: tokenBreakdown.splitStrategy,
    textInputSkuId: GOOGLE_CLOUD_SKU_IDS.geminiFlashTextInput,
    imageInputSkuId: GOOGLE_CLOUD_SKU_IDS.geminiFlashImageInput,
    textOutputSkuId: GOOGLE_CLOUD_SKU_IDS.geminiFlashTextOutput,
    textInputZarTotal: toRand(textInputChargeZar),
    imageInputZarTotal: toRand(imageInputChargeZar),
    outputZarTotal: toRand(outputChargeZar),
    zarTotal: totalZar,
    pricingBreakdown: {
      textInputPrice,
      imageInputPrice,
      textOutputPrice,
    },
  };
}

function buildBookingFeePricing({ cloudVisionZar = 0, geminiZar = 0, bufferRate = BOOKING_FEE_BUFFER_RATE } = {}) {
  const cloudVisionAmount = toRand(cloudVisionZar);
  const geminiAmount = toRand(geminiZar);
  const subtotalZar = toRand(cloudVisionAmount + geminiAmount);
  const bufferAmountZar = toRand(subtotalZar * Number(bufferRate || 0));
  return {
    currency: 'ZAR',
    bookingFeeLabel: 'booking_fee',
    cloudVisionZar: cloudVisionAmount,
    geminiZar: geminiAmount,
    subtotalZar,
    bufferRate: Number(bufferRate || 0),
    bufferAmountZar,
    totalZar: toRand(subtotalZar + bufferAmountZar),
  };
}

function normalizeVertices(vertices = []) {
  const xs = [];
  const ys = [];
  vertices.forEach((vertex = {}) => {
    const x = Number(vertex.x);
    const y = Number(vertex.y);
    if (Number.isFinite(x)) xs.push(x);
    if (Number.isFinite(y)) ys.push(y);
  });
  if (!xs.length || !ys.length) return null;

  const minX = Math.max(0, Math.min(...xs));
  const minY = Math.max(0, Math.min(...ys));
  const maxX = Math.min(1, Math.max(...xs));
  const maxY = Math.min(1, Math.max(...ys));
  const width = Math.max(0, maxX - minX);
  const height = Math.max(0, maxY - minY);
  if (width <= 0 || height <= 0) return null;

  return {
    x: Number(minX.toFixed(6)),
    y: Number(minY.toFixed(6)),
    width: Number(width.toFixed(6)),
    height: Number(height.toFixed(6)),
  };
}

function getLayoutBoundingRegion(layout = {}, page = {}) {
  const normalizedFromPoly = normalizeVertices(layout?.boundingPoly?.normalizedVertices || []);
  if (normalizedFromPoly) return normalizedFromPoly;

  const pageWidth = Number(page?.dimension?.width || 0);
  const pageHeight = Number(page?.dimension?.height || 0);
  if (!pageWidth || !pageHeight) return null;

  const absoluteVertices = layout?.boundingPoly?.vertices || [];
  const normalizedVertices = absoluteVertices.map((vertex = {}) => ({
    x: Number(vertex.x || 0) / pageWidth,
    y: Number(vertex.y || 0) / pageHeight,
  }));
  return normalizeVertices(normalizedVertices);
}

function getLayoutText(document = {}, layout = {}) {
  const fullText = String(document?.text || '');
  const segments = Array.isArray(layout?.textAnchor?.textSegments) ? layout.textAnchor.textSegments : [];
  if (!segments.length || !fullText) return '';
  return segments
    .map((segment = {}) => {
      const startIndex = Number(segment.startIndex || 0);
      const endIndex = Number(segment.endIndex || 0);
      if (!Number.isFinite(endIndex) || endIndex <= startIndex) return '';
      return fullText.slice(Math.max(0, startIndex), Math.max(0, endIndex));
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitDocumentPageIntoQuestionLines(pageText = '') {
  const normalized = String(pageText || '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  const questionRegex = /^((?:question\s*)?\d+(?:\.\d+)*[.)]?)/i;
  const questions = [];
  let current = null;

  lines.forEach((line) => {
    const match = line.match(questionRegex);
    if (match) {
      if (current) questions.push(current);
      current = {
        questionNumber: String(match[1] || '').replace(/^question\s*/i, '').trim(),
        text: line,
      };
      return;
    }

    if (!current) {
      current = {
        questionNumber: '',
        text: line,
      };
      return;
    }
    current.text = `${current.text}\n${line}`.trim();
  });

  if (current) questions.push(current);
  return questions;
}

function normalizeUploadedAttachmentList(requestData = {}) {
  const directAttachments = Array.isArray(requestData?.attachments) ? requestData.attachments : [];
  const singleAttachment = requestData?.attachment ? [requestData.attachment] : [];
  const sourceEntries = Array.isArray(requestData?.boardPreparationSource?.attachmentExtractions)
    ? requestData.boardPreparationSource.attachmentExtractions
    : [];
  const extractionAttachments = sourceEntries
    .map((entry) => entry?.uploadedAttachment)
    .filter(Boolean);

  const combined = [...directAttachments, ...singleAttachment, ...extractionAttachments];
  const deduped = [];
  const seen = new Set();
  combined.forEach((item = {}) => {
    const objectPath = String(item?.objectPath || item?.path || '').trim();
    const downloadUrl = String(item?.downloadUrl || '').trim();
    const fileName = String(item?.fileName || '').trim();
    const contentType = String(item?.contentType || item?.fileType || '').trim();
    const key = `${objectPath}::${downloadUrl}::${fileName}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push({ objectPath, downloadUrl, fileName, contentType });
  });
  return deduped.filter((item) => item.objectPath || item.downloadUrl);
}

async function downloadAttachmentBuffer(attachment = {}) {
  const objectPath = String(attachment?.objectPath || '').trim();
  if (objectPath) {
    const bucket = admin.storage().bucket();
    const [bytes] = await bucket.file(objectPath).download();
    return { buffer: bytes, source: objectPath };
  }

  const downloadUrl = String(attachment?.downloadUrl || '').trim();
  if (!downloadUrl) {
    throw new Error('Attachment is missing both objectPath and downloadUrl.');
  }
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Unable to download attachment: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), source: downloadUrl };
}

async function convertAttachmentToGeminiPayloadImages(attachment = {}) {
  const { buffer } = await downloadAttachmentBuffer(attachment);
  const safeMimeType = String(attachment?.contentType || '').trim() || (isPdfAttachmentBuffer(buffer) ? 'application/pdf' : 'image/png');
  if (safeMimeType === 'application/pdf' || isPdfAttachmentBuffer(buffer)) {
    const pageBuffers = await getAiSubjectExtractionModule().convertPdfToImages(buffer, {});
    return pageBuffers.map((pageBuffer) => ({
      mimeType: 'image/png',
      base64: pageBuffer.toString('base64'),
    }));
  }
  return [{
    mimeType: safeMimeType,
    base64: buffer.toString('base64'),
  }];
}

async function runVisionOcrOnBuffer(imageBuffer) {
  const [ocrResponse] = await getVisionClient().documentTextDetection({
    image: { content: imageBuffer },
  });

  const rawText = ocrResponse?.fullTextAnnotation?.text || ocrResponse?.textAnnotations?.[0]?.description || '';
  const extractedText = normalizeExtractedText(rawText);

  return {
    extractedText,
    textLength: extractedText.length,
  };
}

async function runPdfVisionOcr(pdfBuffer) {
  return extractDocumentText({
    mimeType: 'application/pdf',
    imageBuffer: pdfBuffer,
    runVisionOcrOnBuffer,
    convertPdfToImages: (...args) => getAiSubjectExtractionModule().convertPdfToImages(...args),
  });
}

async function getGlobalSubjectOptions() {
  const allowedNames = new Set(
    (GRADE_1_TO_12_SUBJECT_NAMES || [])
      .map((subject) => normalizeSubjectName(subject) || normalizeExtractedText(subject))
      .filter(Boolean),
  );

  const snapshot = await db.collection('system').doc('subjects').get().catch(() => null);
  const subjectNames = snapshot?.exists
    ? normalizeActiveSubjects(snapshot.data()?.subjectNames || [])
    : [];

  return subjectNames
    .filter((subject) => allowedNames.has(subject))
    .map((subject) => ({ value: subject, label: subject }));
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
    'PARAKLEO_PAYMENTS_SECRETS',
    PARAKLEO_PAYMENTS_SECRETS.value(),
  );
  const secrets = {
    PAYSTACK_SECRET_KEY: String(groupedSecrets.PAYSTACK_SECRET_KEY || '').trim(),
  };

  assertRequiredSecrets('PARAKLEO_PAYMENTS_SECRETS', secrets, ['PAYSTACK_SECRET_KEY']);
  return secrets;
}

function getEmailSecrets() {
  const groupedSecrets = parseGroupedSecretJson('PARAKLEO_EMAIL_SECRETS', PARAKLEO_EMAIL_SECRETS.value());
  const secrets = {
    RESEND_API_KEY: String(groupedSecrets.RESEND_API_KEY || '').trim(),
    EMAIL_FROM: String(groupedSecrets.EMAIL_FROM || '').trim(),
  };

  assertRequiredSecrets('PARAKLEO_EMAIL_SECRETS', secrets, ['RESEND_API_KEY', 'EMAIL_FROM']);
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

function getRealtimeSecrets() {
  const groupedSecrets = parseGroupedSecretJson(
    'PARAKLEO_REALTIME_SECRETS',
    PARAKLEO_REALTIME_SECRETS.value(),
  );
  const secrets = {
    CLOUDFLARE_TURN_KEY_ID: String(groupedSecrets.CLOUDFLARE_TURN_KEY_ID || '').trim(),
    CLOUDFLARE_TURN_API_TOKEN: String(groupedSecrets.CLOUDFLARE_TURN_API_TOKEN || '').trim(),
    CLOUDFLARE_TURN_TTL_SECONDS: String(groupedSecrets.CLOUDFLARE_TURN_TTL_SECONDS || '').trim(),
  };

  assertRequiredSecrets('PARAKLEO_REALTIME_SECRETS', secrets, [
    'CLOUDFLARE_TURN_KEY_ID',
    'CLOUDFLARE_TURN_API_TOKEN',
  ]);
  return secrets;
}

function getAiSecrets() {
  const groupedSecrets = parseGroupedSecretJson('PARAKLEO_AI_KEYS', PARAKLEO_AI_KEYS.value());
  const secrets = {
    apiKey: groupedSecrets.FIREBASE_API_KEY || groupedSecrets.VITE_FIREBASE_API_KEY || '',
    authDomain: groupedSecrets.FIREBASE_AUTH_DOMAIN || groupedSecrets.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: groupedSecrets.FIREBASE_PROJECT_ID || groupedSecrets.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: groupedSecrets.FIREBASE_STORAGE_BUCKET || groupedSecrets.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: groupedSecrets.FIREBASE_MESSAGING_SENDER_ID || groupedSecrets.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: groupedSecrets.FIREBASE_APP_ID || groupedSecrets.VITE_FIREBASE_APP_ID || '',
    GEMINI_MODEL: groupedSecrets.GEMINI_MODEL || groupedSecrets.FIREBASE_AI_MODEL || '',
    GEMINI_VISION_MODEL: groupedSecrets.GEMINI_VISION_MODEL || '',
    GEMINI_VISION_FALLBACK_MODEL: groupedSecrets.GEMINI_VISION_FALLBACK_MODEL || '',
    GEMINI_CLASSIFICATION_MODEL: groupedSecrets.GEMINI_CLASSIFICATION_MODEL || '',
    GEMINI_CLASSIFICATION_TIMEOUT_MS: groupedSecrets.GEMINI_CLASSIFICATION_TIMEOUT_MS || '',
    MAX_PDF_PAGES: groupedSecrets.MAX_PDF_PAGES || '',
    PADDLE_OCR_SERVICE_URL: groupedSecrets.PADDLE_OCR_SERVICE_URL || '',
    PADDLE_OCR_SERVICE_API_KEY: groupedSecrets.PADDLE_OCR_SERVICE_API_KEY || '',
    PADDLE_OCR_TIMEOUT_MS: groupedSecrets.PADDLE_OCR_TIMEOUT_MS || '',
    PADDLE_OCR_MIN_CONFIDENCE: groupedSecrets.PADDLE_OCR_MIN_CONFIDENCE || '',
    OCR_PROVIDER_MODE: groupedSecrets.OCR_PROVIDER_MODE || '',
    DOCUMENT_AI_PROCESSOR_ID: groupedSecrets.DOCUMENT_AI_PROCESSOR_ID || '',
    DOCUMENT_AI_LOCATION: groupedSecrets.DOCUMENT_AI_LOCATION || '',
  };

  assertRequiredSecrets('PARAKLEO_AI_KEYS', secrets, ['apiKey', 'projectId', 'appId']);
  return secrets;
}

function applyFreeMinuteDiscount({ originalPrice, durationMinutes, freeMinutesRemaining }) {
  const safeOriginalPrice = Math.max(0, Number(originalPrice || 0));
  const safeDurationMinutes = Math.max(1, Number(durationMinutes || 1));
  const availableFreeMinutes = Math.max(0, Number(freeMinutesRemaining || 0));
  const freeMinutesApplied = Math.min(availableFreeMinutes, safeDurationMinutes);
  const discountRatio = freeMinutesApplied > 0 ? (freeMinutesApplied / safeDurationMinutes) : 0;
  const discountApplied = Number((safeOriginalPrice * discountRatio).toFixed(2));
  const finalPrice = Number(Math.max(0, safeOriginalPrice - discountApplied).toFixed(2));

  return {
    originalPrice: Number(safeOriginalPrice.toFixed(2)),
    requestedDurationMinutes: safeDurationMinutes,
    freeMinutesApplied: Number(freeMinutesApplied.toFixed(2)),
    discountApplied,
    finalPrice,
    discountSource: freeMinutesApplied > 0 ? 'free_minutes' : null,
  };
}

async function getPricingSignalContext(subject) {
  const [activeRequestsSnap, onlineTutorsSnap, verifiedTutorsSnap] = await Promise.all([
    db.collection('classRequests').where('status', 'in', ['pending', 'matching', 'offered', 'no_tutor_available']).get(),
    db.collection('users').where('activeRole', '==', 'tutor').where('onlineStatus', '==', 'online').get(),
    db.collection('users').where('activeRole', '==', 'tutor').where('tutorProfile.verificationStatus', '==', 'verified').get(),
  ]);

  const onlineTutors = onlineTutorsSnap.docs
    .map((item) => ({ uid: item.id, ...item.data() }))
    .filter((tutor) => isTutorAgreementCurrent(tutor));
  const verifiedTutors = verifiedTutorsSnap.docs
    .map((item) => ({ uid: item.id, ...item.data() }))
    .filter((tutor) => isTutorAgreementCurrent(tutor));

  return {
    now: new Date(),
    subject,
    activeRequests: activeRequestsSnap.size,
    onlineTutors: onlineTutors.length,
    verifiedTutors: verifiedTutors.length,
  };
}

exports.getTutorAgreement = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  const token = getBearerToken(req);
  const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;

  await ensureTutorAgreementSeeded({ db, admin }).catch((error) => {
    logger.warn('Unable to seed tutor agreement before reading.', { error: error.message });
  });

  const userSnap = decoded?.uid ? await db.collection('users').doc(decoded.uid).get() : { exists: () => false, data: () => ({}) };
  const userData = userSnap.data() || {};
  const bundle = await getTutorAgreementBundle({ db, admin, userId: decoded?.uid || '' });

  res.json({
    success: true,
    legalEntityName: LEGAL_ENTITY_NAME,
    documentId: TUTOR_AGREEMENT_DOCUMENT_ID,
    title: TUTOR_AGREEMENT_TITLE,
    activeVersion: bundle.activeVersion,
    document: bundle.document,
    versions: bundle.versions,
    acceptances: bundle.acceptances,
    user: {
      uid: decoded?.uid || null,
      email: String(decoded?.email || userData.email || '').trim(),
      fullName: String(userData.fullName || userData.displayName || decoded?.name || '').trim(),
      tutorAgreement: userData.tutorAgreement || {},
      tutorProfile: userData.tutorProfile || {},
      activeRole: userData.activeRole || userData.role || null,
    },
  });
});

exports.acceptTutorAgreement = onRequest({ cors: true, memory: '1GiB' }, async (req, res) => {
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

  const userSnap = await db.collection('users').doc(decoded.uid).get();
  const userData = userSnap.data() || {};
  const isTutor = String(userData.activeRole || userData.role || '').toLowerCase() === 'tutor';
  if (!isTutor) {
    res.status(403).json({ success: false, message: 'Only tutors can accept the Tutor Agreement.' });
    return;
  }

  const { ipAddress, userAgent } = getRequestMetadata(req);
  try {
    const acceptanceResult = await acceptTutorAgreement({
      db,
      admin,
      user: { uid: decoded.uid, ...userData },
      typedSignatureName: req.body?.typedSignatureName,
      checkboxAccepted: req.body?.checkboxAccepted === true || String(req.body?.checkboxAccepted).toLowerCase() === 'true',
      ipAddress,
      userAgent,
    });

    const refreshedSnap = await db.collection('users').doc(decoded.uid).get();
    const refreshedUser = refreshedSnap.data() || {};
    const shouldBeVerified = hasCompletedTutorProfile(refreshedUser);

    await db.collection('users').doc(decoded.uid).set({
      tutorProfile: {
        ...(refreshedUser.tutorProfile || {}),
        verificationStatus: shouldBeVerified ? 'verified' : 'pending',
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    let emailDelivery = null;
    let emailWarning = '';
    try {
      const emailOutcome = await sendTutorAgreementEmailWithAttachment({
        acceptance: acceptanceResult.acceptance,
        destinationEmail: acceptanceResult.acceptance?.acceptedByEmail || decoded.email || userData.email || '',
      });
      emailDelivery = {
        status: 'sent',
        ...emailOutcome,
        sentAt: new Date().toISOString(),
      };
    } catch (emailError) {
      emailDelivery = {
        status: 'failed',
        errorMessage: emailError.message || 'Email send failed.',
        failedAt: new Date().toISOString(),
      };
      emailWarning = 'Agreement signed successfully. We could not email the PDF, but you can download your signed copy.';
      logger.warn('Tutor agreement acceptance email failed.', {
        uid: decoded.uid,
        acceptanceId: acceptanceResult.acceptanceId,
        message: emailError.message,
      });
    }

    if (acceptanceResult?.acceptanceId && emailDelivery) {
      await db.collection('userAgreementAcceptances').doc(acceptanceResult.acceptanceId).set({
        latestEmailDelivery: emailDelivery,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    res.json({
      success: true,
      message: emailWarning || 'Tutor Agreement accepted successfully.',
      ...acceptanceResult,
      emailDelivery,
      tutorProfile: {
        ...(refreshedUser.tutorProfile || {}),
        verificationStatus: shouldBeVerified ? 'verified' : 'pending',
      },
    });
  } catch (error) {
    const safeMessage = getSafeErrorMessage(error, 'Unable to accept Tutor Agreement.');
    logger.warn('Tutor agreement acceptance failed.', {
      uid: decoded.uid,
      message: safeMessage,
      errorType: typeof error,
    });
    res.status(400).json({ success: false, message: safeMessage });
  }
});

exports.emailSignedTutorAgreement = onRequest({ cors: true, memory: '1GiB', secrets: [PARAKLEO_EMAIL_SECRETS] }, async (req, res) => {
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

  const acceptanceId = String(req.body?.acceptanceId || req.body?.agreementRecordId || '').trim();
  if (!acceptanceId) {
    res.status(400).json({ success: false, message: 'acceptanceId is required.' });
    return;
  }

  const acceptanceRef = db.collection('userAgreementAcceptances').doc(acceptanceId);
  const acceptanceSnap = await acceptanceRef.get();
  if (!acceptanceSnap.exists) {
    res.status(404).json({ success: false, message: 'Signed agreement record not found.' });
    return;
  }

  const acceptance = acceptanceSnap.data() || {};
  const requesterIsAdmin = isAdminToken(decoded);
  const requesterOwnsAgreement = String(acceptance.userId || '').trim() === decoded.uid;
  if (!requesterIsAdmin && !requesterOwnsAgreement) {
    res.status(403).json({ success: false, message: 'You are not allowed to email this signed agreement.' });
    return;
  }

  const requestedEmail = String(req.body?.destinationEmail || '').trim();
  let destinationEmail = requestedEmail;
  if (!destinationEmail) {
    const ownerUserSnap = await db.collection('users').doc(String(acceptance.userId || '')).get();
    const ownerUser = ownerUserSnap.data() || {};
    destinationEmail = String(
      acceptance.acceptedByEmail
      || ownerUser.email
      || (requesterOwnsAgreement ? decoded.email : ''),
    ).trim();
  }

  if (!isValidEmailAddress(destinationEmail)) {
    res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    return;
  }

  try {
    const emailOutcome = await sendTutorAgreementEmailWithAttachment({
      acceptance,
      destinationEmail,
    });
    const emailDelivery = {
      status: 'sent',
      ...emailOutcome,
      sentAt: new Date().toISOString(),
      initiatedBy: decoded.uid,
      acceptanceId,
    };
    await acceptanceRef.set({
      latestEmailDelivery: emailDelivery,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    res.json({
      success: true,
      message: 'Signed agreement emailed successfully.',
      emailDelivery,
    });
  } catch (error) {
    const safeMessage = getSafeErrorMessage(error, 'Email send failed.');
    const emailDelivery = {
      status: 'failed',
      errorMessage: safeMessage,
      failedAt: new Date().toISOString(),
      initiatedBy: decoded.uid,
      acceptanceId,
    };
    await acceptanceRef.set({
      latestEmailDelivery: emailDelivery,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    res.status(400).json({
      success: false,
      message: 'We could not email the signed agreement. Please try again or download it manually.',
      emailDelivery,
      errorMessage: safeMessage,
    });
  }
});

exports.publishTutorAgreementVersion = onRequest({ cors: true }, async (req, res) => {
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
  if (!decoded?.uid || !isAdminToken(decoded)) {
    res.status(403).json({ success: false, message: 'Admin access required.' });
    return;
  }

  const version = String(req.body?.version || '').trim();
  if (!version) {
    res.status(400).json({ success: false, message: 'version is required.' });
    return;
  }

  try {
    const result = await publishTutorAgreementVersion({
      db,
      admin,
      version,
      title: String(req.body?.title || TUTOR_AGREEMENT_TITLE).trim() || TUTOR_AGREEMENT_TITLE,
      effectiveDate: String(req.body?.effectiveDate || '').trim(),
      contentMarkdown: String(req.body?.contentMarkdown || '').trim() || buildTutorAgreementMarkdown(),
      changeSummary: String(req.body?.changeSummary || '').trim(),
      reviewedBy: String(req.body?.reviewedBy || 'Parakleo').trim() || 'Parakleo',
      reviewedAt: String(req.body?.reviewedAt || '').trim(),
      nextReviewAt: String(req.body?.nextReviewAt || '').trim(),
      stampLabel: String(req.body?.stampLabel || '').trim(),
      updatedBy: decoded.email || decoded.uid,
      status: String(req.body?.status || TUTOR_AGREEMENT_STATUS.ACTIVE).trim().toLowerCase() === TUTOR_AGREEMENT_STATUS.DRAFT
        ? TUTOR_AGREEMENT_STATUS.DRAFT
        : TUTOR_AGREEMENT_STATUS.ACTIVE,
    });

    res.json({
      success: true,
      message: 'Tutor Agreement version published.',
      ...result,
    });
  } catch (error) {
    logger.warn('Failed to publish tutor agreement version.', {
      uid: decoded.uid,
      message: error.message,
    });
    res.status(400).json({ success: false, message: error.message || 'Unable to publish version.' });
  }
});

exports.getPricingQuote = onRequest({ cors: true }, async (req, res) => {
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

  const durationMinutes = Math.max(1, Math.floor(Number(req.body?.durationMinutes || 0)));
  const subject = String(req.body?.subject || 'general').trim();
  if (!durationMinutes) {
    res.status(400).json({ success: false, message: 'durationMinutes is required.' });
    return;
  }

  const config = await loadPricingConfig(db, DEFAULT_PRICING_CONFIG);
  const signalContext = await getPricingSignalContext(subject).catch(() => ({ now: new Date(), subject }));
  const quote = computePricingQuote({
    minutes: durationMinutes,
    subject,
    signalContext,
    config,
  });
  const studentSnap = await db.collection('users').doc(decoded.uid).get();
  const studentData = studentSnap.data() || {};
  const freeMinutePreview = applyFreeMinuteDiscount({
    originalPrice: quote.totalAmount,
    durationMinutes,
    freeMinutesRemaining: studentData.freeMinutesRemaining || 0,
  });

  const quotedAt = new Date();
  const lockExpiresAt = new Date(quotedAt.getTime() + (Number(config.quoteTtlSeconds || 300) * 1000));
  const quoteRef = db.collection('pricingQuotes').doc();
  const quotePayload = {
    ...quote,
    ...freeMinutePreview,
    quoteId: quoteRef.id,
    quotedAt: quotedAt.toISOString(),
    lockedAt: quotedAt.toISOString(),
    lockExpiresAt: lockExpiresAt.toISOString(),
    signalContext: {
      activeRequests: signalContext.activeRequests ?? null,
      onlineTutors: signalContext.onlineTutors ?? null,
      verifiedTutors: signalContext.verifiedTutors ?? null,
    },
    requestContext: {
      studentId: decoded.uid,
      durationMinutes,
      subject,
      freeMinutesRemaining: Number(studentData.freeMinutesRemaining || 0),
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromDate(lockExpiresAt),
  };

  await quoteRef.set(quotePayload);
  logger.info('pricing_quote_generated', {
    quoteId: quoteRef.id,
    userId: decoded.uid,
    band: quote.pricingBand,
    totalAmount: quote.totalAmount,
    durationMinutes,
    subject: quote.subject,
    configVersion: quote.configVersion,
  });

  res.status(200).json({ success: true, quote: sanitizePricingSnapshot(quotePayload) });
});


async function extractAttachmentGemini(req, res) {
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

  const images = req.body?.images;
  if (!Array.isArray(images) || images.length === 0) {
    res.status(400).json({ error: true, message: 'No images provided for extraction.' });
    return;
  }

  if (images.length > 5) {
    res.status(400).json({ error: true, message: 'Please upload a maximum of 5 pages or images.' });
    return;
  }

  try {
    const aiConfig = getAiSecrets();
    let result = null;
    let lastError = null;

    // Retry once
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        result = await getGeminiExtractionModule().extractStudentAttachmentWithGemini25Flash({
          images,
          firebaseConfig: aiConfig,
          model: 'gemini-2.5-flash',
        });
        break;
      } catch (e) {
        lastError = e;
      }
    }

    if (!result) {
      logger.error('extract_attachment_ai_failed', {
        uid: decoded.uid,
        error: lastError?.message,
      });
      res.status(500).json({ error: true, message: 'Extraction failed. Please try again or upload a clearer image.' });
      return;
    }

    logger.info('extract_attachment_ai_completed', {
      uid: decoded.uid,
      model: 'gemini-2.5-flash',
      imagesSent: images.length,
      inputTokens: result.usage?.promptTokenCount,
      outputTokens: result.usage?.candidatesTokenCount,
      totalTokens: result.usage?.totalTokenCount,
    });

    res.status(200).json({ success: true, extraction: result.parsedContent });
  } catch (error) {
    logger.error('extract_attachment_ai_error', {
      uid: decoded.uid,
      error: error?.message,
    });
    res.status(500).json({ error: true, message: 'Extraction failed. Please try again or upload a clearer image.' });
  }
}

exports.extractAttachmentAi = onRequest({ cors: true }, async (_req, res) => {
  res.status(410).json({
    success: false,
    message: 'extractAttachmentAi is deprecated. Use /image-ocr and Academic Brain classification.',
  });
});

const BOARD_EXTRACTION_MODE = 'gemini_2_5_flash_stream';

function normalizeTopicList(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeExtractedText(entry))
      .filter(Boolean)
      .slice(0, 8);
  }
  const topic = normalizeExtractedText(value);
  return topic ? [topic] : [];
}

function normalizeConfidenceBand(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'unknown';
  if (numeric >= 0.75) return 'high';
  if (numeric >= 0.45) return 'low';
  return 'unknown';
}

function sanitizeQuestionId(value, fallbackIndex) {
  const normalized = normalizeExtractedText(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  if (normalized) return normalized.slice(0, 80);
  return `q_${String(fallbackIndex).padStart(3, '0')}`;
}

function buildQuestionDisplayText(event = {}) {
  const mainText = normalizeExtractedText(event?.text || '');
  if (!mainText) return '';
  const questionNumber = normalizeExtractedText(event?.questionNumber || '');
  if (questionNumber) return `Question ${questionNumber}\n${mainText}`.trim();
  return mainText;
}

function normalizeVisualRegion(region = {}) {
  const x = Number(region?.x);
  const y = Number(region?.y);
  const width = Number(region?.width);
  const height = Number(region?.height);

  return {
    type: normalizeExtractedText(region?.type || 'other').toLowerCase() || 'other',
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0,
    description: normalizeExtractedText(region?.description || ''),
  };
}

exports.streamAttachmentAi = onRequest({ cors: true }, async (req, res) => {
  res.status(410).json({
    success: false,
    message: 'streamAttachmentAi is deprecated. Use the Academic Brain extraction flow.',
  });
  return;
});

/* Deprecated Gemini stream implementation retained below for reference.
exports.streamAttachmentAi = onRequest({ cors: true, secrets: [PARAKLEO_AI_KEYS] }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  logger.info('stream_attachment_ai_started', {
    method: req.method,
    contentType: req.headers['content-type'] || '',
    userAgent: req.headers['user-agent'] || '',
  });

  const token = getBearerToken(req);
  if (!token) {
    logger.warn('stream_attachment_ai_auth_missing', {
      method: req.method,
    });
    res.status(401).json({ success: false, message: 'Unauthorized request.' });
    return;
  }

  const decoded = await admin.auth().verifyIdToken(token).catch(() => null);
  if (!decoded?.uid) {
    logger.warn('stream_attachment_ai_auth_failed', {
      hasToken: Boolean(token),
    });
    res.status(401).json({ success: false, message: 'Unauthorized request.' });
    return;
  }

  logger.info('stream_attachment_ai_auth_verified', {
    uid: decoded.uid,
  });

  const images = Array.isArray(req.body?.images) ? req.body.images : [];
  if (!images.length) {
    logger.warn('stream_attachment_ai_empty_payload', {
      uid: decoded.uid,
      imageCount: 0,
    });
    res.status(400).json({ success: false, message: 'No images provided for extraction.' });
    return;
  }
  if (images.length > 5) {
    logger.warn('stream_attachment_ai_payload_too_large', {
      uid: decoded.uid,
      imageCount: images.length,
    });
    res.status(400).json({ success: false, message: 'Please upload a maximum of 5 pages or images.' });
    return;
  }

  const requestId = normalizeExtractedText(req.body?.requestId || '');
  const requestRef = requestId ? db.collection('classRequests').doc(requestId) : null;
  let requestData = {};
  const startedAtMs = Date.now();
  const aiConfig = getAiSecrets();
  const selectedModel = String(aiConfig.GEMINI_MODEL || aiConfig.FIREBASE_AI_MODEL || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash';
  let classificationLatencyMs = null;
  let firstQuestionLatencyMs = null;
  let totalQuestions = 0;
  let sortOrder = 0;
  let streamMeta = {};

  logger.info('stream_attachment_ai_payload_received', {
    uid: decoded.uid,
    requestId: requestId || null,
    imageCount: images.length,
    selectedModel,
    hasRequestRef: Boolean(requestRef),
  });

  if (requestRef) {
    const requestSnap = await requestRef.get().catch(() => null);
    if (!requestSnap?.exists) {
      logger.warn('stream_attachment_ai_request_missing', {
        uid: decoded.uid,
        requestId,
      });
      res.status(404).json({ success: false, message: 'Class request not found.' });
      return;
    }
    requestData = requestSnap.data() || {};
    const canAccess = requestData.studentId === decoded.uid
      || requestData.tutorId === decoded.uid
      || requestData.currentOfferTutorId === decoded.uid;
    if (!canAccess) {
      logger.warn('stream_attachment_ai_request_forbidden', {
        uid: decoded.uid,
        requestId,
      });
      res.status(403).json({ success: false, message: 'Not allowed to stream extraction for this request.' });
      return;
    }
  }

  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const writeEvent = (event) => {
    try {
      res.write(`${JSON.stringify(event)}\n`);
    } catch (error) {
      logger.warn('stream_attachment_ai_write_failed', {
        uid: decoded.uid,
        message: error?.message,
      });
    }
  };

  try {
    if (requestRef) {
      await requestRef.set({
        extractionStatus: 'streaming',
        extractionMode: BOARD_EXTRACTION_MODE,
        extractionStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        extractionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        extractionCompletedAt: null,
        extractionError: '',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await writeAiLog({
      userId: requestData.studentId || decoded.uid,
      source: 'board_stream_extraction',
      status: 'started',
      details: {
        requestId: requestId || null,
        extractionMode: BOARD_EXTRACTION_MODE,
        imageCount: images.length,
      },
    });

    const questionCollection = requestRef ? requestRef.collection('questions') : null;
    if (questionCollection) {
      const existingQuestions = await questionCollection.where('source', '==', BOARD_EXTRACTION_MODE).get().catch(() => null);
      if (existingQuestions?.docs?.length) {
        const batch = db.batch();
        existingQuestions.docs.forEach((docSnap) => batch.delete(docSnap.ref));
        await batch.commit();
      }
    }

    logger.info('stream_attachment_ai_gemini_stream_start', {
      uid: decoded.uid,
      requestId: requestId || null,
      imageCount: images.length,
      selectedModel,
      requestRefExists: Boolean(requestRef),
    });

    streamMeta = await getAiSubjectExtractionModule().streamBoardExtractionWithAI({
      images,
      requestContext: {
        topic: requestData.topic || '',
        description: requestData.description || '',
      },
      firebaseConfig: aiConfig,
      logger,
      onEvent: async (event) => {
        const type = normalizeExtractedText(event?.type).toLowerCase();
        if (!type) return;

        writeEvent(event);

        logger.info('stream_attachment_ai_event_received', {
          uid: decoded.uid,
          requestId: requestId || null,
          eventType: type,
        });

        if (!requestRef) return;

        if (type === 'classification') {
          if (classificationLatencyMs === null) classificationLatencyMs = Date.now() - startedAtMs;
          const topics = normalizeTopicList(event?.topics);
          const topic = normalizeExtractedText(event?.topic || topics[0] || '');
          const subject = normalizeExtractedText(event?.subject || requestData.subject || '');
          const estimatedMinutes = Math.min(90, Math.max(10, Math.round(Number(event?.estimatedMinutes || requestData.estimatedMinutes || 10))));
          await requestRef.set({
            extractionStatus: 'partial_ready',
            extractionMode: BOARD_EXTRACTION_MODE,
            subject: subject || requestData.subject || '',
            topic: topic || requestData.topic || '',
            topics: topics.length ? topics : (topic ? [topic] : []),
            estimatedMinutes,
            subjectConfidence: normalizeConfidenceBand(event?.confidence),
            extractionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            extractionError: '',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          logger.info('stream_attachment_ai_classification_saved', {
            uid: decoded.uid,
            requestId: requestId || null,
            subject: subject || '',
            topic: topic || '',
          });
          return;
        }

        if (type === 'question' && questionCollection) {
          totalQuestions += 1;
          if (firstQuestionLatencyMs === null) firstQuestionLatencyMs = Date.now() - startedAtMs;
          sortOrder += 1;
          const questionId = sanitizeQuestionId(event?.questionId, sortOrder);
          const questionText = buildQuestionDisplayText(event);
          const visualRegions = Array.isArray(event?.visualRegions)
            ? event.visualRegions.map((region) => normalizeVisualRegion(region)).filter((region) => region.width > 0 && region.height > 0)
            : [];
          if (!questionText) return;
          await questionCollection.doc(questionId).set({
            type: 'question',
            requestId,
            questionId,
            pageNumber: Number.isFinite(Number(event?.pageNumber)) ? Number(event.pageNumber) : null,
            sourceImageIndex: Number.isFinite(Number(event?.sourceImageIndex)) && Number(event.sourceImageIndex) >= 0
              ? Math.floor(Number(event.sourceImageIndex))
              : null,
            questionNumber: normalizeExtractedText(event?.questionNumber) || null,
            text: questionText,
            marks: Number.isFinite(Number(event?.marks)) ? Number(event.marks) : null,
            diagramImageUrl: normalizeExtractedText(event?.diagramImageRef || '') || null,
            visualRegions,
            hasVisuals: Boolean(visualRegions.length || normalizeExtractedText(event?.diagramImageRef || '')),
            status: 'ready',
            source: BOARD_EXTRACTION_MODE,
            sortOrder,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          await requestRef.set({
            extractionStatus: 'partial_ready',
            extractionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          logger.info('stream_attachment_ai_question_saved', {
            uid: decoded.uid,
            requestId: requestId || null,
            questionId,
            pageNumber: Number.isFinite(Number(event?.pageNumber)) ? Number(event.pageNumber) : null,
            questionNumber: normalizeExtractedText(event?.questionNumber) || null,
          });
          return;
        }

        if (type === 'complete') {
          await requestRef.set({
            extractionStatus: 'ready',
            extractionMode: BOARD_EXTRACTION_MODE,
            extractionCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
            extractionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            extractionError: '',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          logger.info('stream_attachment_ai_complete_saved', {
            uid: decoded.uid,
            requestId: requestId || null,
          });
        }
      },
    });

    await writeAiLog({
      userId: requestData.studentId || decoded.uid,
      source: 'board_stream_extraction',
      status: 'success',
      prompt: streamMeta?.prompt || '',
      rawOutput: '',
      details: {
        requestId: requestId || null,
        model: streamMeta?.model || '',
        provider: streamMeta?.provider || '',
        backend: streamMeta?.backend || '',
        extractionMode: BOARD_EXTRACTION_MODE,
        classificationLatencyMs,
        firstQuestionLatencyMs,
        totalQuestions,
        durationMs: Date.now() - startedAtMs,
      },
    });

    logger.info('stream_attachment_ai_completed', {
      uid: decoded.uid,
      requestId: requestId || null,
      selectedModel,
      durationMs: Date.now() - startedAtMs,
      streamStats: streamMeta?.streamStats || {},
      sawClassification: Boolean(streamMeta?.sawClassification),
      sawComplete: Boolean(streamMeta?.sawComplete),
    });

    res.end();
  } catch (error) {
    if (requestRef) {
      await requestRef.set({
        extractionStatus: 'failed',
        extractionMode: BOARD_EXTRACTION_MODE,
        extractionError: error.message || 'Board extraction failed.',
        extractionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        extractionCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }).catch(() => null);
    }

    logger.error('stream_attachment_ai_failed', {
      uid: decoded.uid,
      requestId: requestId || null,
      selectedModel,
      durationMs: Date.now() - startedAtMs,
      message: error.message || 'Board extraction failed.',
      stack: error.stack || '',
      streamStats: streamMeta?.streamStats || {},
    });

    await writeAiLog({
      userId: requestData.studentId || decoded.uid,
      source: 'board_stream_extraction',
      status: 'failed',
      prompt: streamMeta?.prompt || '',
      rawOutput: '',
      error: error.message || 'Board extraction failed.',
      details: {
        requestId: requestId || null,
        model: streamMeta?.model || '',
        extractionMode: BOARD_EXTRACTION_MODE,
        classificationLatencyMs,
        firstQuestionLatencyMs,
        totalQuestions,
        durationMs: Date.now() - startedAtMs,
      },
    }).catch(() => null);

    writeEvent({
      type: 'error',
      message: error.message || 'Board extraction failed.',
    });
    res.end();
  }
});
*/

exports.extractImageOcr = onRequest({ cors: true, secrets: [PARAKLEO_AI_KEYS], memory: '512MiB', timeoutSeconds: 120 }, async (req, res) => {
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

  const objectPath = String(req.body?.objectPath || '').trim();
  const fileName = String(req.body?.fileName || '').trim() || null;
  const mimeType = String(req.body?.mimeType || '').trim() || null;
  const imageBase64 = String(req.body?.imageBase64 || '').trim();
  const sourceLabel = objectPath || fileName || 'inline-image';

  logger.info('image_ocr_invoked', {
    uid: decoded.uid,
    source: sourceLabel,
    hasObjectPath: Boolean(objectPath),
    hasInlineImage: Boolean(imageBase64),
    mimeType,
  });

  if (!objectPath && !imageBase64) {
    res.status(400).json({ success: false, message: 'Missing image source for OCR.' });
    return;
  }

  if (objectPath) {
    const [, ownerUid] = objectPath.split('/');
    if (!ownerUid || ownerUid !== decoded.uid) {
      logger.warn('image_ocr_forbidden_path', {
        uid: decoded.uid,
        objectPath,
      });
      res.status(403).json({ success: false, message: 'You are not allowed to OCR this image.' });
      return;
    }
  }

  try {
    const processingTrace = [];
    const trace = (phase, label, details = {}) => {
      processingTrace.push({
        phase,
        label,
        details,
        ts: Date.now(),
      });
    };
    trace('request_received', 'Request received', {
      source: sourceLabel,
      hasObjectPath: Boolean(objectPath),
      hasInlineImage: Boolean(imageBase64),
      mimeType,
    });

    let imageBuffer;
    if (objectPath) {
      trace('firebase_storage_download_start', 'Picture going to Firebase storage read');
      const bucket = admin.storage().bucket();
      const [bytes] = await bucket.file(objectPath).download();
      imageBuffer = bytes;
      trace('firebase_storage_download_done', 'Firebase storage read complete', {
        bytes: Number(bytes?.length || 0),
      });
    } else {
      imageBuffer = Buffer.from(imageBase64, 'base64');
      trace('inline_payload_ready', 'Inline image payload ready', {
        bytes: Number(imageBuffer?.length || 0),
      });
    }

    const isPdfInput = mimeType === 'application/pdf' || isPdfAttachmentBuffer(imageBuffer);
    trace('simple_ocr_start', 'Simple OCR started', {
      route: 'google_vision_only',
      fileType: isPdfInput ? 'pdf' : 'image',
    });

    const extractionResult = isPdfInput
      ? await runPdfVisionOcr(imageBuffer)
      : await runVisionOcrOnBuffer(imageBuffer);
    const providerRoute = 'simple_ocr';
    const providerReason = 'vision_only';

    const extractedText = String(extractionResult?.extractedText || '').trim();
    const textLength = Number(extractionResult?.textLength || extractedText.length || 0);
    let visionPricing = null;
    let pricingStatus = 'skipped';
    let pricingError = '';
    try {
      visionPricing = await buildLiveCloudVisionPricing({
        pageCount: Number(extractionResult?.pageCount || (isPdfInput ? extractionResult?.selectedPages?.length : 1) || 1),
      });
      pricingStatus = 'complete';
      logger.info('image_ocr_pricing_completed', {
        uid: decoded.uid,
        source: sourceLabel,
        provider: extractionResult?.provider || 'google-vision',
        fileType: extractionResult?.fileType || (isPdfInput ? 'pdf' : 'image'),
        cloudVisionPriceZar: Number(visionPricing?.zarTotal || 0),
      });
    } catch (pricingFailure) {
      pricingStatus = 'failed';
      pricingError = String(pricingFailure?.message || 'pricing_failed');
      logger.error('image_ocr_pricing_failed', {
        uid: decoded.uid,
        source: sourceLabel,
        provider: extractionResult?.provider || 'google-vision',
        fileType: extractionResult?.fileType || (isPdfInput ? 'pdf' : 'image'),
        error: pricingError,
      });
    }
    trace('ocr_route_completed', 'OCR route completed', {
      providerRoute,
      providerReason,
      provider: extractionResult?.provider || '',
      textLength,
      pricingStatus,
    });
    trace('simple_ocr_done', 'Simple OCR done', { providerReason });

    logger.info('image_ocr_completed', {
      uid: decoded.uid,
      source: sourceLabel,
      success: textLength > 0,
      textLength,
      provider: extractionResult?.provider || 'google-vision',
      providerRoute,
      providerReason,
      fileType: extractionResult?.fileType || (isPdfInput ? 'pdf' : 'image'),
      pricingStatus,
    });

    res.status(200).json({
      success: Boolean(extractionResult?.success && textLength > 0),
      extractedText,
      textLength,
      text: extractionResult?.text || extractedText,
      extractionMethod: extractionResult?.extractionMethod || (isPdfInput ? 'pdf_ocr' : 'ocr'),
      provider: extractionResult?.provider || 'google-vision',
      fileType: extractionResult?.fileType || (isPdfInput ? 'pdf' : 'image'),
      extractionQuality: extractionResult?.extractionQuality || (textLength > 0 ? 'good' : 'failed'),
      scannedPdfDetected: Boolean(extractionResult?.scannedPdfDetected),
      ocrStatus: extractionResult?.ocrStatus || (isPdfInput ? 'complete' : 'not_needed'),
      pageCount: extractionResult?.pageCount || null,
      selectedPages: extractionResult?.selectedPages || [],
      pages: extractionResult?.pages || [],
      failedPageCount: Number(extractionResult?.failedPageCount || 0),
      partialSuccess: Boolean(extractionResult?.partialSuccess),
      extractedImages: extractionResult?.extractedImages || [],
      structuredData: extractionResult?.structuredData || null,
      source: extractionResult?.source || (isPdfInput ? 'pdf' : 'image'),
      providerRoute: providerRoute || '',
      providerReason: providerReason || '',
      ppStructureVersion: extractionResult?.structuredData?.ppStructureVersion || extractionResult?.structuredData?.paddleOcrVlPipelineVersion || '',
      processingTrace,
      pricingStatus,
      pricingError,
      pricing: visionPricing ? {
        cloudVision: visionPricing,
      } : null,
      cloudVisionPriceZar: Number(visionPricing?.zarTotal || 0),
      bookingFeePriceZar: buildBookingFeePricing({
        cloudVisionZar: Number(visionPricing?.zarTotal || 0),
        geminiZar: 0,
      }).totalZar,
    });
  } catch (error) {
    const normalizedMessage = String(error?.message || 'unknown_error');
    const isVisionApiDisabled = normalizedMessage.includes('vision.googleapis.com')
      && normalizedMessage.toLowerCase().includes('disabled');

      logger.error('image_ocr_failed', {
        uid: decoded.uid,
        source: sourceLabel,
      error: normalizedMessage,
    });
    res.status(500).json({
      success: false,
      extractedText: '',
      textLength: 0,
      extractionMethod: 'ocr',
      provider: 'google-vision',
      message: isVisionApiDisabled
        ? 'Image OCR failed: Cloud Vision API is disabled for this project.'
        : 'Image OCR failed.',
      error: normalizedMessage,
    });
  }
});

exports.classifySubject = onRequest({ cors: true, secrets: [PARAKLEO_AI_KEYS] }, async (req, res) => {
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

  const inputPayload = req.body?.inputPayload && typeof req.body.inputPayload === 'object' && !Array.isArray(req.body.inputPayload)
    ? req.body.inputPayload
    : null;
  const inputText = normalizeExtractedText(req.body?.inputText || inputPayload?.combinedTextPreview || inputPayload?.typedTextPreview || '');
  if (!inputText) {
    res.status(400).json({ success: false, message: 'Missing text to classify.' });
    return;
  }

  let supportedSubjects = [];
  try {
    const startedAt = Date.now();
    supportedSubjects = await getGlobalSubjectOptions();
    const attachmentSummaries = Array.isArray(inputPayload?.attachmentSummaries)
      ? inputPayload.attachmentSummaries
      : [];
    const extractedMarksCount = attachmentSummaries.reduce((total, entry) => (
      total + Number(entry?.extractedMarksCount || 0)
    ), 0);
    const tableCount = attachmentSummaries.reduce((total, entry) => (
      total + Number(entry?.tableCount || 0)
    ), 0);
    const figureCount = attachmentSummaries.reduce((total, entry) => (
      total + Number(entry?.figureCount || 0)
    ), 0);
    const formulaCount = attachmentSummaries.reduce((total, entry) => (
      total + Number(entry?.formulaCount || 0)
    ), 0);
    console.debug('[studentRequestAI] classification request received', {
      uid: decoded.uid,
      inputLength: inputText.length,
      inputPayload,
      supportedSubjects,
    });
    logger.info('subject_classification_started', {
      uid: decoded.uid,
      provider: 'firebase-ai-logic',
      inputLength: inputText.length,
      supportedSubjectCount: supportedSubjects.length,
      inputPreview: inputText.slice(0, 500),
      inputPayload,
    });

    const allowedSubjects = (GRADE_1_TO_12_SUBJECT_NAMES || [])
      .map((subject) => normalizeSubjectName(subject) || normalizeExtractedText(subject))
      .filter(Boolean)
      .map((subject) => ({ value: subject, label: subject }));
    const localSubject = classifySubjectLocally({ text: inputText, supportedSubjects, enforceSupportedList: true });
    const allowedSubjectMatch = classifySubjectLocally({ text: inputText, supportedSubjects: allowedSubjects, enforceSupportedList: true });
    const localTopic = detectTopicsLocally({ text: inputText, subject: localSubject.subject || '' });
    const localMinutes = estimateMinutesLocally({ text: inputText });
    const localMl = classifyWithLocalMl({ text: inputText, supportedSubjects });

    const normalizedSupported = new Set((supportedSubjects || []).map((item) => String(item?.value || item || '').trim()).filter(Boolean));
    const academicBrain = ENABLE_ACADEMIC_BRAIN
      ? runAcademicBrainMini({
        extractedText: inputText,
        ocrBlocks: Array.isArray(inputPayload?.ocrBlocks) ? inputPayload.ocrBlocks : [],
        country: String(inputPayload?.country || 'ZA'),
        grade: String(inputPayload?.grade || ''),
      })
      : null;
    const modelSubject = normalizeSubjectName(String(academicBrain?.subject?.displayName || '').trim()) || '';
    const supportedSubject = normalizedSupported.has(modelSubject) ? modelSubject : '';
    const fallbackSubject = localSubject.subject || '';
    const subject = supportedSubject || fallbackSubject;
    const unsupportedSubject = !subject && modelSubject && !normalizedSupported.has(modelSubject)
      ? modelSubject
      : (!subject && allowedSubjectMatch.subject && !normalizedSupported.has(allowedSubjectMatch.subject)
        ? allowedSubjectMatch.subject
        : '');
    const topics = (Array.isArray(academicBrain?.topics) && academicBrain.topics.length
      ? academicBrain.topics.map((entry) => entry.label)
      : (localTopic.topics || []))
      .map((topic) => capitalizeTopic(topic))
      .filter(Boolean);
    const classification = {
      subject,
      unsupportedSubject,
      topic: topics[0] || capitalizeTopic(localTopic.topic || ''),
      topics,
      estimatedMinutes: clampMinutes(academicBrain?.estimatedMinutes || 10),
      subjectConfidence: subject
        ? ((academicBrain?.subject?.confidence || 0) >= 0.7 ? 'high' : 'low')
        : 'unknown',
      needsManualSubjectSelection: !subject || Boolean(academicBrain?.needsReview),
      unsupportedSubjectRequested: Boolean(unsupportedSubject),
      unsupportedSubjectRecorded: false,
      topicConfidence: topics.length ? 'high' : (localTopic.topicConfidence || 'unknown'),
      topicMethod: 'academic_brain_rules',
      minutesMethod: 'academic_brain_rules',
      minutesConfidence: academicBrain?.estimatedMinutes ? 'high' : 'unknown',
      minutesSignalsUsed: Array.isArray(academicBrain?.signalsUsed) ? academicBrain.signalsUsed : [],
      subjectMethod: subject === supportedSubject ? 'academic_brain_rules' : 'local_rules_fallback',
      classificationPipeline: 'academic_brain_rules->local_fallback',
      academicBrainOutput: academicBrain,
    };
    const unsupportedSubjectRecorded = Boolean(classification?.unsupportedSubjectRequested && classification?.unsupportedSubject);
    if (unsupportedSubjectRecorded) {
      try {
        await recordUnsupportedSubjectRequestOnServer({
          subject: classification.unsupportedSubject,
          inputText,
          uid: decoded.uid,
        });
      } catch (recordError) {
        logger.warn('unsupported_subject_request_record_failed', {
          uid: decoded.uid,
          subject: classification.unsupportedSubject,
          error: recordError.message,
        });
      }
    }

    await writeAiLog({
      userId: decoded.uid,
      source: 'student_subject_classification',
      status: classification?.subject ? 'success' : 'fallback',
      prompt: '',
      rawOutput: '',
      error: '',
      details: {
        model: 'academic_brain',
        backend: 'local',
        durationMs: Date.now() - startedAt,
        localMlAvailable: Boolean(localMl.available),
        localMlReason: localMl.reason || localMl.error || '',
        subject: classification.subject || '',
        subjectConfidence: classification.subjectConfidence || 'unknown',
        needsManualSubjectSelection: Boolean(classification.needsManualSubjectSelection),
        unsupportedSubjectRecorded,
      },
    });

    await db.collection('classificationTrainingEvents').add({
      uid: decoded.uid,
      inputPreview: String(inputText || '').slice(0, 2000),
      extractedMarksCount,
      tableCount,
      figureCount,
      formulaCount,
      classification,
      academicBrain,
      localMl,
      localSubject,
      localTopic,
      localMinutes,
      provider: 'local',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
    }).catch(() => null);

    logger.info('subject_classification_completed', {
      uid: decoded.uid,
      provider: 'local',
      model: 'academic_brain',
      backend: 'local',
      durationMs: Date.now() - startedAt,
      prompt: '',
      rawOutput: '',
      subject: classification.subject || '',
      subjectConfidence: classification.subjectConfidence,
      needsManualSubjectSelection: classification.needsManualSubjectSelection,
      unsupportedSubjectRecorded,
    });
    console.debug('[studentRequestAI] classification response sent', {
      uid: decoded.uid,
      classification,
      academicBrain,
    });

    if (academicBrain) {
      await saveAcademicBrainFeedback(db, {
        userId: decoded.uid,
        role: 'student',
        country: String(inputPayload?.country || 'ZA'),
        grade: String(inputPayload?.grade || ''),
        selectedSubjectId: String(classification.subject || ''),
        originalOcrText: inputText,
        originalOcrBlocks: Array.isArray(inputPayload?.ocrBlocks) ? inputPayload.ocrBlocks : [],
        predictedOutput: academicBrain,
        correctedOutput: null,
        correctionType: 'prediction',
        engineVersion: String(academicBrain?.engine?.version || '1.0.0'),
        subjectPackVersions: Array.isArray(academicBrain?.engine?.subjectPackVersions) ? academicBrain.engine.subjectPackVersions : [],
        uploadId: String(inputPayload?.uploadId || ''),
        sessionId: String(inputPayload?.sessionId || ''),
      }).catch(() => null);
    }

      res.status(200).json({
        success: true,
        classification,
        provider: 'local',
        aiPrompt: '',
        aiRawOutput: '',
        aiError: '',
        unsupportedSubjectRecorded,
      });
  } catch (error) {
    console.debug('[studentRequestAI] classification failed', {
      uid: decoded.uid,
      error: error.message,
    });
    logger.error('subject_classification_failed', {
      uid: decoded.uid,
      error: error.message,
    });

    const localFallbackSubject = classifySubjectLocally({ text: inputText, supportedSubjects });
    const localFallbackTopic = detectTopicsLocally({
      text: inputText,
      subject: localFallbackSubject.subject || '',
    });
    const fallbackClassification = {
      subject: localFallbackSubject.subject || '',
      unsupportedSubject: '',
      topic: capitalizeTopic(localFallbackTopic.topic || ''),
      topics: (localFallbackTopic.topics || []).map((topic) => capitalizeTopic(topic)).filter(Boolean),
      estimatedMinutes: clampMinutes(10),
      subjectConfidence: 'unknown',
      needsManualSubjectSelection: true,
      unsupportedSubjectRequested: false,
      unsupportedSubjectRecorded: false,
      topicConfidence: localFallbackTopic.topicConfidence || 'unknown',
      topicMethod: 'local_rules_fallback',
      minutesMethod: 'academic_brain_rules',
      minutesConfidence: 'unknown',
      minutesSignalsUsed: [],
      subjectMethod: 'local_rules_fallback',
      classificationPipeline: 'academic_brain_rules->local_fallback',
      academicBrainOutput: null,
    };
    await writeAiLog({
      userId: decoded.uid,
      source: 'student_subject_classification',
      status: 'failed',
      prompt: '',
      rawOutput: '',
      error: error.message || 'Subject classification failed.',
      details: {
        subject: fallbackClassification.subject || '',
        subjectConfidence: fallbackClassification.subjectConfidence || 'unknown',
      },
    });

    res.status(200).json({
      success: true,
      classification: fallbackClassification,
      provider: 'local',
      aiPrompt: '',
      aiRawOutput: '',
      aiError: error.message || 'Subject classification failed.',
      unsupportedSubjectRecorded: false,
    });
  }
});

exports.saveAcademicBrainFeedback = onRequest({ cors: true }, async (req, res) => {
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

  try {
    const feedback = req.body && typeof req.body === 'object' ? req.body : {};
    const result = await saveAcademicBrainFeedback(db, {
      ...feedback,
      userId: decoded.uid,
    });
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.message || 'Failed to save feedback.' });
  }
});

// TrainingPipeline is intentionally not exported as a Firebase endpoint yet.
// Trigger it from controlled scripts/ops until lockfile and runtime rollout is finalized.

exports.syncStudentGrowth = onRequest({ cors: true }, async (req, res) => {
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

  const authUser = await admin.auth().getUser(decoded.uid).catch(() => null);
  const emailVerified = Boolean(authUser?.emailVerified || decoded.email_verified);
  const userRef = db.collection('users').doc(decoded.uid);

  await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) return;
    const userData = userSnap.data() || {};
    const isStudent = (userData.activeRole || userData.role || '').toLowerCase() === 'student';
    const completionRequirements = isStudent ? getStudentCompletionRequirements(userData) : null;

    const baseUpdates = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      referralSlug: userData.referralSlug || `clx-${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      growth: {
        ...(userData.growth || {}),
        completionRequirements: {
          ...((userData.growth || {}).completionRequirements || {}),
          emailVerified,
          ...(completionRequirements || {}),
          studentProfileComplete: isStudent ? completionRequirements.complete : false,
          phoneVerified: Boolean(((userData.growth || {}).completionRequirements || {}).phoneVerified || false),
        },
        lastGrowthSyncedAt: new Date().toISOString(),
      },
      emailVerified,
      emailVerifiedAt: emailVerified
        ? (userData.emailVerifiedAt || admin.firestore.FieldValue.serverTimestamp())
        : null,
    };

    if (!isStudent) {
      transaction.set(userRef, baseUpdates, { merge: true });
      return;
    }

    logger.info('student_growth_sync_evaluated', {
      uid: decoded.uid,
      emailVerified,
      completionRequirements,
      pendingReferralSlugPresent: Boolean(String(userData.pendingReferralSlug || userData.pendingReferralCode || '').trim()),
      alreadyProcessed: Boolean((userData.growth || {}).accountCompletionRewardProcessed),
    });

    await applyStudentReferralReward(transaction, {
      userRef,
      userData,
      uid: decoded.uid,
      pendingReferralSlug: String(userData.pendingReferralSlug || userData.pendingReferralCode || '').trim(),
      source: 'syncStudentGrowth',
      baseUpdates,
    });
  });

  const profileSnap = await userRef.get();
  const profile = { uid: decoded.uid, ...(profileSnap.data() || {}) };
  res.status(200).json({
    success: true,
    profile,
    diagnostics: {
      completionRequirements: getStudentCompletionRequirements(profile),
      pendingReferralSlugPresent: Boolean(String(profile.pendingReferralSlug || profile.pendingReferralCode || '').trim()),
      alreadyProcessed: Boolean((profile.growth || {}).accountCompletionRewardProcessed),
      referredBy: profile.referredBy || null,
      referralRewardCount: Number(profile.referralRewardCount || 0),
    },
  });
});

exports.mobileWebviewAuth = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).send('Unauthorized request.');
    return;
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(token);
  } catch (error) {
    logger.warn('Failed to verify Firebase auth token for mobile webview auth.', {
      error: error.message,
    });
    res.status(401).send('Unauthorized request.');
    return;
  }

  const sessionId = String(req.query.sessionId || '').trim();
  if (!sessionId) {
    res.status(400).send('Missing sessionId.');
    return;
  }

  const apiKey = String(req.query.apiKey || '').trim();
  const authDomain = String(req.query.authDomain || '').trim();
  const projectId = String(req.query.projectId || '').trim();
  const appId = String(req.query.appId || '').trim();
  if (!apiKey || !authDomain || !projectId || !appId) {
    res.status(400).send('Missing Firebase configuration.');
    return;
  }

  const targetPathRaw = String(req.query.target || '').trim();
  const fallbackTarget = `/app/session/${sessionId}`;
  let targetPath = fallbackTarget;
  if (targetPathRaw.startsWith('/')) {
    targetPath = targetPathRaw;
  } else if (targetPathRaw.startsWith('https://')) {
    try {
      const parsed = new URL(targetPathRaw);
      const expectedHost = String(authDomain || '').replace(/^https?:\/\//, '').trim().toLowerCase();
      const requestHost = String(req.get('host') || '').trim().toLowerCase();
      const allowedHosts = new Set(
        [expectedHost, requestHost].map((host) => host.replace(/:\d+$/, '')).filter(Boolean),
      );
      if (allowedHosts.has(parsed.host.toLowerCase())) {
        targetPath = targetPathRaw;
      }
    } catch {
      targetPath = fallbackTarget;
    }
  }

  const sessionSnap = await db.collection('sessions').doc(sessionId).get();
  if (!sessionSnap.exists) {
    res.status(404).send('Session not found.');
    return;
  }

  const sessionData = sessionSnap.data() || {};
  const isParticipant = String(sessionData.studentId || '') === decodedToken.uid
    || String(sessionData.tutorId || '') === decodedToken.uid;
  if (!isParticipant) {
    res.status(403).send('You are not allowed to access this session.');
    return;
  }

  let customToken;
  try {
    customToken = await admin.auth().createCustomToken(decodedToken.uid);
  } catch (error) {
    logger.error('Failed to create Firebase custom token for mobile webview auth.', {
      uid: decodedToken.uid,
      sessionId,
      error: error.message,
    });
    res.status(500).send('Unable to create auth bridge token.');
    return;
  }

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Connecting to session...</title>
  <style>
    html, body { height: 100%; margin: 0; background: #0a0a0a; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .wrap { height: 100%; display: grid; place-items: center; text-align: center; padding: 24px; }
    .muted { color: #a1a1aa; font-size: 14px; margin-top: 8px; }
  </style>
  <script src="https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/11.10.0/firebase-auth-compat.js"></script>
</head>
<body>
  <div class="wrap">
    <div>
      <div>Connecting to your class...</div>
      <div class="muted">Authenticating securely</div>
    </div>
  </div>
  <script>
    (async function () {
      try {
        firebase.initializeApp({
          apiKey: "${escapeHtml(apiKey)}",
          authDomain: "${escapeHtml(authDomain)}",
          projectId: "${escapeHtml(projectId)}",
          appId: "${escapeHtml(appId)}"
        });
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        await firebase.auth().signInWithCustomToken("${escapeHtml(customToken)}");
        window.location.replace("${escapeHtml(targetPath)}");
      } catch (error) {
        document.querySelector('.muted').textContent = 'Authentication failed. Please return to the app and try again.';
      }
    })();
  </script>
</body>
</html>`;

  res.set('Cache-Control', 'no-store, max-age=0');
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
});

exports.getIceConfig = onRequest(
  {
    cors: true,
    secrets: [PARAKLEO_REALTIME_SECRETS],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, message: 'Method not allowed' });
      return;
    }

    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ success: false, message: 'Unauthorized request.' });
      return;
    }

    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (error) {
      logger.warn('Failed to verify Firebase auth token for ICE config.', {
        error: error.message,
      });
      res.status(401).json({ success: false, message: 'Unauthorized request.' });
      return;
    }

    let realtimeSecrets;
    try {
      realtimeSecrets = getRealtimeSecrets();
    } catch (error) {
      logger.error('Cloudflare TURN configuration is unavailable.', {
        error: error.message,
      });
      res.status(500).json({
        success: false,
        message: 'Realtime network configuration unavailable.',
      });
      return;
    }

    const turnKeyId = realtimeSecrets.CLOUDFLARE_TURN_KEY_ID;
    const turnApiToken = realtimeSecrets.CLOUDFLARE_TURN_API_TOKEN;
    const ttl = parseTurnTtlSeconds(realtimeSecrets.CLOUDFLARE_TURN_TTL_SECONDS);

    try {
      const cfResponse = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(
          turnKeyId,
        )}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${turnApiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl }),
        },
      );

      const cfPayload = await cfResponse.json().catch(() => null);

      if (!cfResponse.ok) {
        logger.error('Cloudflare TURN credential generation failed.', {
          uid: decodedToken.uid,
          status: cfResponse.status,
        });

        res.status(500).json({
          success: false,
          message: 'Unable to generate realtime network credentials.',
        });
        return;
      }

      const generatedIceServers = sanitizeCloudflareIceServers(cfPayload?.iceServers || []);
      const combinedIceServers = generatedIceServers.length
        ? generatedIceServers
        : [{ urls: DEFAULT_STUN_URLS }];

      const turnServers = combinedIceServers.filter((server) => {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        return urls.some((url) => String(url).startsWith('turn:') || String(url).startsWith('turns:'));
      });

      const stunServers = combinedIceServers.filter((server) => {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        return urls.some((url) => String(url).startsWith('stun:'));
      });

      logger.info('Generated Cloudflare ICE config for authenticated user.', {
        uid: decodedToken.uid,
        ttlSeconds: ttl,
        serverCount: combinedIceServers.length,
        stunCount: stunServers.reduce(
          (sum, server) => sum + (Array.isArray(server.urls) ? server.urls.length : 1),
          0,
        ),
        turnCount: turnServers.reduce(
          (sum, server) => sum + (Array.isArray(server.urls) ? server.urls.length : 1),
          0,
        ),
      });

      res.status(200).json({
        success: true,
        iceServers: combinedIceServers,
        ttlSeconds: ttl,
      });
    } catch (error) {
      logger.error('Failed to fetch Cloudflare ICE config.', {
        uid: decodedToken.uid,
        error: error.message,
      });

      res.status(500).json({
        success: false,
        message: 'Unable to generate realtime network credentials.',
      });
    }
  },
);

exports.verifyPaystack = onRequest({ cors: true, secrets: [PARAKLEO_PAYMENTS_SECRETS] }, async (req, res) => {
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

exports.verifyTutorPayoutAccount = onRequest({ cors: true, secrets: [PARAKLEO_PAYMENTS_SECRETS] }, async (req, res) => {
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

  const payout = normalizePayoutInput(req.body || {});
  try {
    assertValidPayoutInput(payout);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
    return;
  }

  let paymentsSecrets;
  try {
    paymentsSecrets = getPaymentsSecrets();
  } catch (error) {
    logger.error('Payment configuration is unavailable while verifying tutor payout account.', {
      uid: decoded.uid,
      error: error.message,
    });
    res.status(500).json({ success: false, message: 'Payment configuration is unavailable.' });
    return;
  }

  try {
    const verifiedPayout = await verifyAndCreateTutorTransferRecipient({
      paystackSecretKey: paymentsSecrets.PAYSTACK_SECRET_KEY,
      payout,
      email: decoded.email || '',
      uid: decoded.uid,
    });

    logger.info('tutor_payout_account_verified', {
      uid: decoded.uid,
      bankCode: verifiedPayout.bankCode,
      recipientCreated: Boolean(verifiedPayout.paystackRecipientCode),
    });

    const userRef = db.collection('users').doc(decoded.uid);
    const userSnap = await userRef.get();
    const existing = userSnap.exists ? (userSnap.data() || {}) : {};
    await userRef.set({
      tutorProfile: {
        ...(existing.tutorProfile || {}),
        payout: verifiedPayout,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    try {
      await queueEmailEventOnce({
        eventId: buildEmailEventId(
          'tutor-payout-details',
          decoded.uid,
          verifiedPayout.bankCode,
          verifiedPayout.accountNumber,
          verifiedPayout.documentNumber,
        ),
        eventType: 'tutor_payout_details_submitted',
        payload: {
          email: decoded.email || '',
          bankName: verifiedPayout.bankName || '',
          accountHolder: verifiedPayout.accountHolder || '',
          accountNumberMasked: verifiedPayout.accountNumber
            ? `•••• ${String(verifiedPayout.accountNumber).slice(-4)}`
            : 'N/A',
          verificationStatus: verifiedPayout.verified ? 'verified' : 'pending',
        },
        source: 'verifyTutorPayoutAccount',
      });
    } catch (error) {
      logger.warn('Failed to queue tutor payout details email event.', {
        uid: decoded.uid,
        error: error.message,
      });
    }

    res.status(200).json({
      success: true,
      payout: verifiedPayout,
    });
  } catch (error) {
    try {
      const userRef = db.collection('users').doc(decoded.uid);
      const userSnap = await userRef.get();
      const existing = userSnap.exists ? (userSnap.data() || {}) : {};
      await userRef.set({
        tutorProfile: {
          ...(existing.tutorProfile || {}),
          payout: {
            ...(existing.tutorProfile?.payout || {}),
            ...payout,
            verified: false,
            verificationStatus: 'unverified',
            verificationMessage: error.message || 'Unable to verify payout account.',
            verificationCheckedAt: new Date().toISOString(),
          },
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (persistError) {
      logger.warn('Failed to persist payout verification failure status.', {
        uid: decoded.uid,
        error: persistError.message,
      });
    }

    logger.warn('tutor_payout_account_verification_failed', {
      uid: decoded.uid,
      error: error.message,
      status: error.status || null,
    });
    res.status(400).json({
      success: false,
      message: error.message || 'Unable to verify payout account.',
    });
  }
});

exports.listTutorPayoutBanks = onRequest({ cors: true, secrets: [PARAKLEO_PAYMENTS_SECRETS] }, async (req, res) => {
  if (req.method !== 'GET') {
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

  let paymentsSecrets;
  try {
    paymentsSecrets = getPaymentsSecrets();
  } catch (error) {
    logger.error('Payment configuration is unavailable while listing tutor payout banks.', {
      uid: decoded.uid,
      error: error.message,
    });
    res.status(500).json({ success: false, message: 'Payment configuration is unavailable.' });
    return;
  }

  try {
    const payload = await callPaystackApi({
      paystackSecretKey: paymentsSecrets.PAYSTACK_SECRET_KEY,
      path: '/bank?country=south%20africa&currency=ZAR&enabled_for_verification=true&perPage=100',
    });

    const banks = Array.isArray(payload?.data)
      ? payload.data.map((bank) => ({
        id: bank.id ? String(bank.id) : String(bank.code || bank.slug || bank.name || ''),
        name: bank.name || '',
        code: String(bank.code || ''),
        slug: bank.slug || '',
      })).filter((bank) => bank.name && bank.code)
      : [];

    res.status(200).json({ success: true, banks });
  } catch (error) {
    logger.warn('tutor_payout_banks_list_failed', {
      uid: decoded.uid,
      error: error.message,
      status: error.status || null,
    });
    res.status(500).json({ success: false, message: 'Unable to load payout banks right now.' });
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

exports.finalizeSessionBilling = onRequest({ cors: true, secrets: [PARAKLEO_PAYMENTS_SECRETS] }, async (req, res) => {
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

  const sessionId = req.body?.sessionId?.toString().trim();
  const closureType = req.body?.closureType === 'canceled_during' ? 'canceled_during' : 'completed';
  const canceledBy = req.body?.canceledBy ? String(req.body.canceledBy) : null;
  const canceledReason = req.body?.canceledReason ? String(req.body.canceledReason).trim() : '';
  if (!sessionId) {
    res.status(400).json({ success: false, message: 'Missing sessionId.' });
    return;
  }

  const sessionRef = db.collection('sessions').doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    res.status(404).json({ success: false, message: 'Session not found.' });
    return;
  }

  const session = sessionSnap.data() || {};
  const isParticipant = [session.studentId, session.tutorId].includes(decoded.uid);
  if (!isParticipant) {
    res.status(403).json({ success: false, message: 'Not allowed to close this session.' });
    return;
  }

  if (['completed', 'canceled_during', 'canceled'].includes(session.status)) {
    res.status(200).json({ success: true, session: { id: sessionId, ...session } });
    return;
  }

  const endedAt = Date.now();
  const accumulatedSeconds = Math.max(0, Number(session.billedSeconds || 0));
  const activeStartedAt = Number(session.billingStartedAt || 0);
  const activeSeconds = activeStartedAt
    ? Math.max(0, Math.floor((endedAt - activeStartedAt) / 1000))
    : 0;
  const billedSeconds = accumulatedSeconds + activeSeconds;
  const billedMinutes = Number((billedSeconds / 60).toFixed(2));
  const requestRef = session.requestId ? db.collection('classRequests').doc(session.requestId) : null;
  const requestSnap = requestRef ? await requestRef.get().catch(() => null) : null;
  const requestData = requestSnap?.exists ? (requestSnap.data() || {}) : {};

  const selectedDurationMinutes = Number(
    session.durationMinutes
    || requestData.durationMinutes
    || session.pricingSnapshot?.requestedDurationMinutes
    || requestData.pricingSnapshot?.requestedDurationMinutes
    || session.pricingSnapshot?.durationMinutes
    || requestData.pricingSnapshot?.durationMinutes
    || LEGACY_SAFE_PRICING_SNAPSHOT.durationMinutes,
  );
  const pricingQuoteId = session.pricingQuoteId
    || session.pricingSnapshot?.quoteId
    || requestData.pricingQuoteId
    || requestData.pricingSnapshot?.quoteId
    || null;

  let trustedSnapshot = sanitizePricingSnapshot(session.pricingSnapshot || requestData.pricingSnapshot || null);
  if (pricingQuoteId) {
    const quoteSnap = await db.collection('pricingQuotes').doc(pricingQuoteId).get();
    if (quoteSnap.exists) {
      trustedSnapshot = sanitizePricingSnapshot(quoteSnap.data());
    }
  }

  const snapshot = sanitizePricingSnapshot({
    ...(trustedSnapshot || LEGACY_SAFE_PRICING_SNAPSHOT),
    durationMinutes: Math.max(
      1,
      Math.floor(Number(selectedDurationMinutes || LEGACY_SAFE_PRICING_SNAPSHOT.durationMinutes)),
    ),
  });
  const isLegacySession = !pricingQuoteId && !session.pricingSnapshot && !requestData.pricingSnapshot;
  const bookingFee = toRand(
    session?.boardPreparationSource?.bookingFeePricing?.totalZar
      || requestData?.boardPreparationSource?.bookingFeePricing?.totalZar
      || session?.boardPreparationSource?.bookingFeePriceZar
      || requestData?.boardPreparationSource?.bookingFeePriceZar
      || session?.pricingSnapshot?.bookingFeeAmount
      || requestData?.pricingSnapshot?.bookingFeeAmount
      || 0,
  );

  const settlement = computeFinalAmountFromSnapshot({
    snapshot,
    billedMinutes,
    closureType,
    selectedDurationMinutes,
    bookingFee,
  });
  const originalPrice = Number(settlement.totalAmount || 0);

  const studentRef = db.collection('users').doc(session.studentId);
  const studentSnap = await studentRef.get();
  const studentData = studentSnap.data() || {};
  const bookingFeeCharged = toRand(
    settlement.bookingFeeApplied
      ? settlement.bookingFeeAmount
      : (closureType === 'completed' ? bookingFee : 0),
  );
  const serviceAmountBeforeDiscount = toRand(Math.max(0, originalPrice - bookingFeeCharged));
  const freeMinuteDiscount = closureType === 'completed'
    ? applyFreeMinuteDiscount({
      originalPrice: serviceAmountBeforeDiscount,
      durationMinutes: Math.max(0, billedMinutes),
      freeMinutesRemaining: Number(studentData.freeMinutesRemaining || 0),
    })
    : {
      originalPrice: serviceAmountBeforeDiscount,
      requestedDurationMinutes: Math.max(0, billedMinutes),
      freeMinutesApplied: 0,
      discountApplied: 0,
      finalPrice: serviceAmountBeforeDiscount,
      discountSource: null,
    };
  const totalAmount = toRand(freeMinuteDiscount.finalPrice + bookingFeeCharged);
  const tutorPayoutBase = settlement.bookingFeeApplied ? 0 : serviceAmountBeforeDiscount;
  const tutorAmount = Number((tutorPayoutBase * BILLING_RULES.TUTOR_PAYOUT_RATE).toFixed(2));
  const platformAmount = Number((bookingFeeCharged + (tutorPayoutBase * BILLING_RULES.PLATFORM_FEE_RATE)).toFixed(2));
  const paymentMethods = studentData.paymentMethods || [];
  const selectedCardId = session.selectedCardId || requestData.selectedCardId || null;
  const selectedCard = paymentMethods.find((card) => card.id === selectedCardId)
    || paymentMethods.find((card) => card.isDefault)
    || paymentMethods[0]
    || null;

  let charge = { ok: true, reason: null, transactionId: 'free-minutes-covered' };
  if (totalAmount > 0) {
    let paymentsSecrets;
    try {
      paymentsSecrets = getPaymentsSecrets();
    } catch (error) {
      logger.error('Payment configuration is unavailable during session billing.', {
        sessionId,
        error: error.message,
      });
      res.status(500).json({ success: false, message: 'Payment configuration is unavailable.' });
      return;
    }

    charge = await chargeAuthorizationWithPaystack({
      paystackSecretKey: paymentsSecrets.PAYSTACK_SECRET_KEY,
      email: studentData.email || session.studentEmail || '',
      amount: totalAmount,
      authorizationCode: selectedCard?.paystackAuthorizationCode || '',
    });
  }

  const paymentStatus = charge.ok ? 'paid' : 'wallet_debt_recorded';
  const wallet = studentData.wallet || { balance: 0, currency: 'ZAR' };
  const nextWalletBalance = charge.ok
    ? Number(wallet.balance || 0)
    : Number((Number(wallet.balance || 0) - totalAmount).toFixed(2));

  const batch = db.batch();
  batch.set(sessionRef, {
    status: closureType,
    endedAt,
    billedSeconds,
    billedMinutes,
    totalAmount,
    originalPrice,
    discountApplied: freeMinuteDiscount.discountApplied,
    finalPrice: totalAmount,
    discountSource: freeMinuteDiscount.discountSource,
    freeMinutesApplied: freeMinuteDiscount.freeMinutesApplied,
    bookingFeeAmount: bookingFeeCharged,
    bookingFeeCharged,
    requestedDurationMinutes: Number(selectedDurationMinutes || snapshot.durationMinutes || 0),
    selectedCardId,
    canceledBy: closureType === 'canceled_during' ? canceledBy : null,
    canceledReason: closureType === 'canceled_during' ? canceledReason : null,
    pricingSnapshot: {
      ...snapshot,
      billedMinutes,
      originalPrice,
      serviceAmountBeforeDiscount,
      bookingFeeAmount: bookingFeeCharged,
      bookingFeeApplied: settlement.bookingFeeApplied || closureType === 'completed',
      bookingFeeOnly: settlement.billingRule === 'booking_fee_only',
      billingRule: settlement.billingRule,
      baseOnlyThresholdMinutes: settlement.baseOnlyThresholdMinutes,
      discountApplied: freeMinuteDiscount.discountApplied,
      finalAmount: totalAmount,
      finalPayablePrice: totalAmount,
      discountSource: freeMinuteDiscount.discountSource,
      freeMinutesApplied: freeMinuteDiscount.freeMinutesApplied,
      finalizedAt: new Date(endedAt).toISOString(),
      legacyFallbackUsed: isLegacySession,
      closureType,
      earlyCancellation: settlement.isEarlyCancellation,
      earlyCancelThresholdMinutes: settlement.earlyCancelThresholdMinutes,
    },
    payoutBreakdown: {
      platformFeeRate: BILLING_RULES.PLATFORM_FEE_RATE,
      tutorRate: BILLING_RULES.TUTOR_PAYOUT_RATE,
      tutorAmount,
      platformAmount,
    },
    paymentStatus,
    paymentTransactionId: charge.transactionId || null,
    chargedCardLast4: selectedCard?.last4 || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  if (requestRef) {
    batch.set(requestRef, {
      status: closureType === 'canceled_during' ? 'canceled_during' : 'completed',
      statusDetail: closureType === 'canceled_during'
        ? 'Session canceled. Billing completed.'
        : 'Session ended. Billing completed.',
      endedAt,
      canceledBy: closureType === 'canceled_during' ? canceledBy : null,
      canceledReason: closureType === 'canceled_during' ? canceledReason : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  if (freeMinuteDiscount.freeMinutesApplied > 0) {
    batch.set(studentRef, {
      freeMinutesRemaining: Number(Math.max(0, Number(studentData.freeMinutesRemaining || 0) - freeMinuteDiscount.freeMinutesApplied).toFixed(2)),
      totalFreeMinutesUsed: Number((Number(studentData.totalFreeMinutesUsed || 0) + freeMinuteDiscount.freeMinutesApplied).toFixed(2)),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  if (!charge.ok) {
    batch.set(studentRef, {
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

  const updatedSnap = await sessionRef.get();
  const updatedSession = { id: updatedSnap.id, ...updatedSnap.data() };
  const paymentTitle = charge.ok ? 'Payment completed' : 'Payment needs attention';
  const paymentMessage = charge.ok
    ? `Your ${updatedSession.topic || updatedSession.subject || 'class'} payment was completed.`
    : `Your ${updatedSession.topic || updatedSession.subject || 'class'} payment was not completed. The balance was recorded in your wallet.`;

  await Promise.all([
    createUserNotification({
      userId: updatedSession.studentId,
      title: closureType === 'canceled_during' ? 'Session canceled' : 'Lesson completed',
      message: `${updatedSession.topic || updatedSession.subject || 'Your lesson'} is ${closureType === 'canceled_during' ? 'canceled' : 'completed'}.`,
      type: closureType === 'canceled_during' ? 'session_canceled' : 'lesson_completed',
      requestId: updatedSession.requestId || null,
      sessionId,
      targetPath: '/app/student/requests',
      metadata: {
        paymentStatus,
        totalAmount,
      },
    }),
    createUserNotification({
      userId: updatedSession.studentId,
      title: paymentTitle,
      message: paymentMessage,
      type: charge.ok ? 'payment_completed' : 'payment_failed',
      requestId: updatedSession.requestId || null,
      sessionId,
      targetPath: '/app/student/payment',
      metadata: {
        paymentStatus,
        amount: totalAmount,
        transactionId: charge.transactionId || null,
        reason: charge.reason || null,
      },
    }),
    createUserNotification({
      userId: updatedSession.tutorId,
      title: closureType === 'canceled_during' ? 'Session canceled' : 'Lesson completed',
      message: `${updatedSession.topic || updatedSession.subject || 'Your lesson'} is ${closureType === 'canceled_during' ? 'canceled' : 'completed'}. Tutor earnings: R${tutorAmount.toFixed(2)}.`,
      type: closureType === 'canceled_during' ? 'session_canceled' : 'lesson_completed',
      requestId: updatedSession.requestId || null,
      sessionId,
      targetPath: '/app/tutor/payments',
      metadata: {
        paymentStatus,
        tutorAmount,
        platformAmount,
        grossAmount: originalPrice,
      },
    }),
  ]);

  try {
    await queueEmailEventOnce({
      eventId: buildEmailEventId('session-invoice', session.id, closureType, endedAt, charge.transactionId || ''),
      eventType: 'session_invoice',
      payload: {
        studentEmail: updatedSession.studentEmail || session.studentEmail || '',
        tutorEmail: updatedSession.tutorEmail || session.tutorEmail || '',
        studentName: updatedSession.studentName || session.studentName || 'Student',
        tutorName: updatedSession.tutorName || session.tutorName || 'Tutor',
        sessionId: session.id,
        subject: updatedSession.topic || updatedSession.subject || session.topic || session.subject || 'Class',
        closureType,
        canceledBy,
        canceledReason: canceledReason || updatedSession.canceledReason || session.canceledReason || '',
        billedMinutes,
        ratePerMinute: Number(session.pricingSnapshot?.adjustedRatePerMinute || session.pricingSnapshot?.ratePerMinute || 0),
        originalPrice,
        discountApplied: Number(freeMinuteDiscount.discountApplied || 0),
        finalAmount: totalAmount,
        tutorAmount,
        platformAmount,
        paymentStatus,
      },
      source: 'finalizeSessionBilling',
    });
  } catch (error) {
    logger.warn('Failed to queue session invoice email.', {
      sessionId,
      error: error.message,
    });
  }

  logger.info('pricing_billing_finalized', {
    sessionId,
    requestId: session.requestId || null,
    quoteId: updatedSession?.pricingSnapshot?.quoteId || null,
    configVersion: updatedSession?.pricingSnapshot?.configVersion || null,
    pricingBand: updatedSession?.pricingSnapshot?.pricingBand || null,
    billedMinutes,
    originalPrice,
    totalAmount,
    discountApplied: freeMinuteDiscount.discountApplied,
    freeMinutesApplied: freeMinuteDiscount.freeMinutesApplied,
    paymentStatus,
    legacyFallbackUsed: Boolean(updatedSession?.pricingSnapshot?.legacyFallbackUsed),
    closureType,
    earlyCancellation: settlement.isEarlyCancellation,
  });

  res.status(200).json({
    success: true,
    session: updatedSession,
    charge: { ok: charge.ok, reason: charge.reason || null },
  });
});

exports.payOutstandingBalance = onRequest({ cors: true, secrets: [PARAKLEO_PAYMENTS_SECRETS] }, async (req, res) => {
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

  const cardId = req.body?.cardId ? String(req.body.cardId).trim() : '';
  if (!cardId) {
    res.status(400).json({ success: false, message: 'Select a payment card.' });
    return;
  }

  const studentRef = db.collection('users').doc(decoded.uid);
  const studentSnap = await studentRef.get();
  if (!studentSnap.exists) {
    res.status(404).json({ success: false, message: 'Student profile not found.' });
    return;
  }

  const studentData = studentSnap.data() || {};
  const wallet = studentData.wallet || { balance: 0, currency: 'ZAR' };
  const walletBalance = Number(wallet.balance || 0);
  const outstandingAmount = walletBalance < 0 ? Number(Math.abs(walletBalance).toFixed(2)) : 0;
  if (!outstandingAmount) {
    res.status(200).json({
      success: true,
      message: 'No outstanding balance to pay.',
      profile: { uid: decoded.uid, ...studentData },
      charge: { ok: true, reason: null, transactionId: null },
    });
    return;
  }

  const paymentMethods = Array.isArray(studentData.paymentMethods) ? studentData.paymentMethods : [];
  const selectedCard = paymentMethods.find((card) => card.id === cardId) || null;
  if (!selectedCard) {
    res.status(400).json({ success: false, message: 'Selected payment card was not found.' });
    return;
  }

  let paymentsSecrets;
  try {
    paymentsSecrets = getPaymentsSecrets();
  } catch (error) {
    logger.error('Payment configuration is unavailable while paying outstanding balance.', {
      uid: decoded.uid,
      error: error.message,
    });
    res.status(500).json({ success: false, message: 'Payment configuration is unavailable.' });
    return;
  }

  const charge = await chargeAuthorizationWithPaystack({
    paystackSecretKey: paymentsSecrets.PAYSTACK_SECRET_KEY,
    email: studentData.email || decoded.email || '',
    amount: outstandingAmount,
    authorizationCode: selectedCard.paystackAuthorizationCode || '',
  });

  if (!charge.ok) {
    logger.warn('Outstanding balance payment declined.', {
      uid: decoded.uid,
      amount: outstandingAmount,
      reason: charge.reason || 'gateway_declined',
    });
    await createUserNotification({
      userId: decoded.uid,
      title: 'Payment unsuccessful',
      message: 'Your outstanding balance payment was not successful. Please try another card.',
      type: 'payment_failed',
      targetPath: '/app/student/payment',
      metadata: {
        amount: outstandingAmount,
        reason: charge.reason || 'gateway_declined',
      },
    });
    res.status(402).json({
      success: false,
      message: 'Card payment was not successful. Please try another card or contact your bank.',
      charge: { ok: false, reason: charge.reason || 'gateway_declined' },
    });
    return;
  }

  await studentRef.set({
    wallet: {
      ...wallet,
      balance: 0,
      currency: wallet.currency || 'ZAR',
      updatedAt: new Date().toISOString(),
      lastOutstandingPayment: {
        amount: outstandingAmount,
        cardLast4: selectedCard.last4 || null,
        transactionId: charge.transactionId || null,
        paidAt: new Date().toISOString(),
      },
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const updatedSnap = await studentRef.get();
  await createUserNotification({
    userId: decoded.uid,
    title: 'Payment completed',
    message: `Your outstanding balance payment of R${outstandingAmount.toFixed(2)} was completed.`,
    type: 'payment_completed',
    targetPath: '/app/student/payment',
    metadata: {
      amount: outstandingAmount,
      transactionId: charge.transactionId || null,
    },
  });
  res.status(200).json({
    success: true,
    message: 'Outstanding balance paid successfully.',
    profile: { uid: updatedSnap.id, ...updatedSnap.data() },
    charge: { ok: true, reason: null, transactionId: charge.transactionId || null },
    amount: outstandingAmount,
  });
});

exports.deletePaymentMethod = onRequest({ cors: true }, async (req, res) => {
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

  const methodId = req.body?.methodId ? String(req.body.methodId).trim() : '';
  if (!methodId) {
    res.status(400).json({ success: false, message: 'Missing payment method.' });
    return;
  }

  const userRef = db.collection('users').doc(decoded.uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    res.status(404).json({ success: false, message: 'User profile not found.' });
    return;
  }

  const userData = userSnap.data() || {};
  const paymentMethods = Array.isArray(userData.paymentMethods) ? userData.paymentMethods : [];
  const remainingMethods = paymentMethods
    .filter((method) => method?.id !== methodId)
    .map((method) => ({ ...method }));

  if (remainingMethods.length === paymentMethods.length) {
    res.status(404).json({ success: false, message: 'Payment method not found.' });
    return;
  }

  if (remainingMethods.length && !remainingMethods.some((method) => method.isDefault)) {
    remainingMethods[0].isDefault = true;
  }

  await userRef.set({
    paymentMethods: remainingMethods,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const updatedSnap = await userRef.get();
  res.status(200).json({
    success: true,
    message: 'Card removed.',
    profile: { uid: updatedSnap.id, ...updatedSnap.data() },
  });
});

exports.deleteCompletedClassUploads = onSchedule('every 60 minutes', async () => {
  const cutoffMs = Date.now() - CLASS_UPLOAD_RETENTION_MS;
  const sessionsSnap = await db
    .collection('sessions')
    .where('status', '==', 'completed')
    .limit(100)
    .get();

  const bucket = admin.storage().bucket();
  let checkedCount = 0;
  let cleanedCount = 0;
  let deletedObjectCount = 0;

  for (const sessionDoc of sessionsSnap.docs) {
    const session = sessionDoc.data() || {};
    if (session.uploadedFilesCleanupStatus === 'deleted') continue;

    const completedAtMs = timestampToMillis(session.endedAt || session.completedAt || session.updatedAt);
    if (!completedAtMs || completedAtMs > cutoffMs) continue;
    checkedCount += 1;

    let requestData = {};
    if (session.requestId) {
      const requestSnap = await db.collection('classRequests').doc(session.requestId).get().catch(() => null);
      requestData = requestSnap?.exists ? (requestSnap.data() || {}) : {};
    }

    const paths = collectClassUploadPaths([
      session.requestAttachment,
      session.attachments,
      session.boardPreparationSource,
      requestData.attachment,
      requestData.attachments,
      requestData.boardPreparationSource,
    ]);

    const uniquePaths = [...paths];
    let deletedForSession = 0;
    for (const objectPath of uniquePaths) {
      const deleted = await deleteStorageObjectIfPresent(bucket, objectPath);
      if (deleted) {
        deletedForSession += 1;
        deletedObjectCount += 1;
      }
    }

    await sessionDoc.ref.set({
      uploadedFilesCleanupStatus: 'deleted',
      uploadedFilesDeletedAt: admin.firestore.FieldValue.serverTimestamp(),
      uploadedFilesDeletedCount: deletedForSession,
      uploadedFilesCleanupCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    if (session.requestId) {
      await db.collection('classRequests').doc(session.requestId).set({
        uploadedFilesCleanupStatus: 'deleted',
        uploadedFilesDeletedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    cleanedCount += 1;
  }

  logger.info('completed_class_upload_cleanup_finished', {
    checkedCount,
    cleanedCount,
    deletedObjectCount,
  });
});

async function syncBackendWeeklyPayoutRecords() {
  const startWindow = Date.now() - (PAYOUT_LOOKBACK_WEEKS * 7 * 24 * 60 * 60 * 1000);
  const currentWeekStart = getWeekRange(new Date()).weekStart.getTime();
  const sessionsSnap = await db
    .collection('sessions')
    .where('status', '==', 'completed')
    .limit(1000)
    .get();

  const grouped = new Map();
  sessionsSnap.docs.forEach((sessionDoc) => {
    const session = { id: sessionDoc.id, ...(sessionDoc.data() || {}) };
    if (!session.tutorId) return;

    const completedAtMs = timestampToMillis(session.endedAt || session.completedAt || session.updatedAt);
    if (!completedAtMs || completedAtMs < startWindow || completedAtMs >= currentWeekStart) return;

    const completedDate = new Date(completedAtMs);
    const weekKey = getWeekKey(completedDate);
    const { weekStart, weekEnd } = getWeekRange(completedDate);
    const groupId = buildPayoutDocId(weekKey, session.tutorId);
    const amounts = computeFullSessionAmounts(session);
    const existing = grouped.get(groupId) || {
      tutorId: session.tutorId,
      tutorName: session.tutorName || '',
      tutorEmail: session.tutorEmail || '',
      weekKey,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      totalSessions: 0,
      grossAmount: 0,
      tutorAmount: 0,
      platformAmount: 0,
      sessionIds: [],
    };

    existing.totalSessions += 1;
    existing.grossAmount = Number((existing.grossAmount + amounts.totalAmount).toFixed(2));
    existing.tutorAmount = Number((existing.tutorAmount + amounts.tutorAmount).toFixed(2));
    existing.platformAmount = Number((existing.platformAmount + amounts.platformAmount).toFixed(2));
    existing.sessionIds.push(session.id);
    if (!existing.tutorName && session.tutorName) existing.tutorName = session.tutorName;
    if (!existing.tutorEmail && session.tutorEmail) existing.tutorEmail = session.tutorEmail;

    grouped.set(groupId, existing);
  });

  const upserted = [];
  for (const [docId, record] of grouped.entries()) {
    const payoutRef = db.collection(PAYOUT_COLLECTION).doc(docId);
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
      transferAttempts: existing.transferAttempts || 0,
      createdAt: existing.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const saved = await payoutRef.get();
    upserted.push({ id: saved.id, ...saved.data() });
  }

  return upserted;
}

exports.processWeeklyTutorPayouts = onSchedule({
  schedule: '0 0 * * 1',
  timeZone: 'Africa/Johannesburg',
  secrets: [PARAKLEO_PAYMENTS_SECRETS],
}, async () => {
  let paymentsSecrets;
  try {
    paymentsSecrets = getPaymentsSecrets();
  } catch (error) {
    logger.error('weekly_tutor_payouts_missing_payment_config', { error: error.message });
    return;
  }

  const syncedRecords = await syncBackendWeeklyPayoutRecords();
  let paidCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const payout of syncedRecords) {
    const status = String(payout.status || 'unpaid').toLowerCase();
    if (!['unpaid', 'unsuccessful', 'failed'].includes(status)) {
      skippedCount += 1;
      continue;
    }

    const amount = Number(payout.tutorAmount || 0);
    if (!amount || amount <= 0) {
      await db.collection(PAYOUT_COLLECTION).doc(payout.id).set({
        status: 'paid',
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        paidBy: { system: 'automatic', reason: 'zero_amount' },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      await createUserNotification({
        userId: payout.tutorId,
        title: 'Tutor payout completed',
        message: `Your ${payout.weekKey || 'weekly'} payout was marked paid. Amount: R0.00.`,
        type: 'tutor_payout_paid',
        targetPath: '/app/tutor/payments',
        metadata: {
          payoutId: payout.id,
          payoutStatus: 'paid',
          amount: 0,
        },
      });
      try {
        await queueEmailEventOnce({
          eventId: buildEmailEventId('tutor-payout', payout.id, 'paid', 'zero_amount'),
          eventType: 'tutor_payout_status',
          payload: {
            email: payout.tutorEmail || '',
            weekKey: payout.weekKey || '',
            weekStart: payout.weekStart || '',
            weekEnd: payout.weekEnd || '',
            status: 'paid',
            totalSessions: Number(payout.totalSessions || 0),
            grossAmount: Number(payout.grossAmount || 0),
            tutorRate: Number(BILLING_RULES.TUTOR_PAYOUT_RATE),
            tutorAmount: 0,
            platformFeeRate: Number(BILLING_RULES.PLATFORM_FEE_RATE),
            platformAmount: 0,
          },
          source: 'processWeeklyTutorPayouts',
        });
      } catch (error) {
        logger.warn('Failed to queue zero-amount payout email.', {
          payoutId: payout.id,
          error: error.message,
        });
      }
      paidCount += 1;
      continue;
    }

    const tutorSnap = await db.collection('users').doc(payout.tutorId).get();
    const tutorData = tutorSnap.exists ? (tutorSnap.data() || {}) : {};
    const payoutDetails = tutorData?.tutorProfile?.payout || {};
    const recipientCode = payoutDetails.paystackRecipientCode || '';
    const payoutVerificationStatus = String(payoutDetails.verificationStatus || '').toLowerCase();
    const isPayoutVerified = payoutVerificationStatus
      ? payoutVerificationStatus === 'verified'
      : payoutDetails.verified === true;
    const nextTransferAttempt = Number(payout.transferAttempts || 0) + 1;
    if (!recipientCode || !isPayoutVerified) {
      await db.collection(PAYOUT_COLLECTION).doc(payout.id).set({
        status: 'unsuccessful',
        failureReason: 'Tutor payout account is not verified.',
        transferAttempts: nextTransferAttempt,
        lastTransferAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      await createUserNotification({
        userId: payout.tutorId,
        title: 'Tutor payout unsuccessful',
        message: 'Your tutor payout could not be processed because your payout account is not verified.',
        type: 'tutor_payout_failed',
        targetPath: '/app/tutor/payments',
        metadata: {
          payoutId: payout.id,
          payoutStatus: 'unsuccessful',
          amount,
          failureReason: 'Tutor payout account is not verified.',
        },
      });
      try {
        await queueEmailEventOnce({
          eventId: buildEmailEventId('tutor-payout', payout.id, 'unsuccessful', 'unverified_account', `attempt_${nextTransferAttempt}`),
          eventType: 'tutor_payout_status',
          payload: {
            email: payout.tutorEmail || tutorData.email || '',
            weekKey: payout.weekKey || '',
            weekStart: payout.weekStart || '',
            weekEnd: payout.weekEnd || '',
            status: 'unsuccessful',
            totalSessions: Number(payout.totalSessions || 0),
            grossAmount: Number(payout.grossAmount || 0),
            tutorRate: Number(BILLING_RULES.TUTOR_PAYOUT_RATE),
            tutorAmount: Number(payout.tutorAmount || 0),
            platformFeeRate: Number(BILLING_RULES.PLATFORM_FEE_RATE),
            platformAmount: Number(payout.platformAmount || 0),
            failureReason: 'Tutor payout account is not verified.',
            payoutVerificationStatus: payoutVerificationStatus || (payoutDetails.verified === true ? 'verified' : 'unverified'),
          },
          source: 'processWeeklyTutorPayouts',
        });
      } catch (error) {
        logger.warn('Failed to queue unverified payout email.', {
          payoutId: payout.id,
          error: error.message,
        });
      }
      failedCount += 1;
      continue;
    }

    const reference = `claxi-${payout.weekKey}-${payout.tutorId}-${Date.now()}`.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 100);
    const payoutRef = db.collection(PAYOUT_COLLECTION).doc(payout.id);
    await payoutRef.set({
      status: 'processing',
      transferReference: reference,
      transferAttempts: Number(payout.transferAttempts || 0) + 1,
      lastTransferAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await createUserNotification({
      userId: payout.tutorId,
      title: 'Tutor payout processing',
      message: `Your ${payout.weekKey || 'weekly'} payout is being processed. Amount: R${amount.toFixed(2)}.`,
      type: 'tutor_payout_processing',
      targetPath: '/app/tutor/payments',
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
        reason: `Parakleo tutor payout ${payout.weekKey}`,
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
        userId: payout.tutorId,
        title: 'Tutor payout paid',
        message: `Your ${payout.weekKey || 'weekly'} payout was paid successfully. Amount: R${amount.toFixed(2)}.`,
        type: 'tutor_payout_paid',
        targetPath: '/app/tutor/payments',
        metadata: {
          payoutId: payout.id,
          payoutStatus: 'paid',
          amount,
          transferReference: reference,
          transferStatus: transfer.status || null,
        },
      });
      try {
        await queueEmailEventOnce({
          eventId: buildEmailEventId('tutor-payout', payout.id, 'paid', reference),
          eventType: 'tutor_payout_status',
          payload: {
            email: payout.tutorEmail || tutorData.email || '',
            weekKey: payout.weekKey || '',
            weekStart: payout.weekStart || '',
            weekEnd: payout.weekEnd || '',
            status: 'paid',
            totalSessions: Number(payout.totalSessions || 0),
            grossAmount: Number(payout.grossAmount || 0),
            tutorRate: Number(BILLING_RULES.TUTOR_PAYOUT_RATE),
            tutorAmount: amount,
            platformFeeRate: Number(BILLING_RULES.PLATFORM_FEE_RATE),
            platformAmount: Number(payout.platformAmount || 0),
            transferReference: reference,
            transferStatus: transfer.status || null,
          },
          source: 'processWeeklyTutorPayouts',
        });
      } catch (error) {
        logger.warn('Failed to queue paid payout email.', {
          payoutId: payout.id,
          error: error.message,
        });
      }
      paidCount += 1;
    } catch (error) {
      await payoutRef.set({
        status: 'unsuccessful',
        failureReason: error.message || 'Paystack transfer failed.',
        transferReference: reference,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      await createUserNotification({
        userId: payout.tutorId,
        title: 'Tutor payout unsuccessful',
        message: `Your ${payout.weekKey || 'weekly'} payout could not be completed. ${error.message || 'Paystack transfer failed.'}`,
        type: 'tutor_payout_failed',
        targetPath: '/app/tutor/payments',
        metadata: {
          payoutId: payout.id,
          payoutStatus: 'unsuccessful',
          amount,
          transferReference: reference,
          failureReason: error.message || 'Paystack transfer failed.',
        },
      });
      try {
        await queueEmailEventOnce({
          eventId: buildEmailEventId('tutor-payout', payout.id, 'unsuccessful', reference),
          eventType: 'tutor_payout_status',
          payload: {
            email: payout.tutorEmail || tutorData.email || '',
            weekKey: payout.weekKey || '',
            weekStart: payout.weekStart || '',
            weekEnd: payout.weekEnd || '',
            status: 'unsuccessful',
            totalSessions: Number(payout.totalSessions || 0),
            grossAmount: Number(payout.grossAmount || 0),
            tutorRate: Number(BILLING_RULES.TUTOR_PAYOUT_RATE),
            tutorAmount: amount,
            platformFeeRate: Number(BILLING_RULES.PLATFORM_FEE_RATE),
            platformAmount: Number(payout.platformAmount || 0),
            transferReference: reference,
            failureReason: error.message || 'Paystack transfer failed.',
          },
          source: 'processWeeklyTutorPayouts',
        });
      } catch (queueError) {
        logger.warn('Failed to queue failed payout email.', {
          payoutId: payout.id,
          error: queueError.message,
        });
      }
      failedCount += 1;
    }
  }

  logger.info('weekly_tutor_payouts_processed', {
    syncedCount: syncedRecords.length,
    paidCount,
    failedCount,
    skippedCount,
  });
});

exports.sendEmailFromQueue = onDocumentCreated(
  {
    document: 'emailEvents/{eventId}',
    secrets: [PARAKLEO_EMAIL_SECRETS],
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
