const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onTaskDispatched } = require('firebase-functions/v2/tasks');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { Resend } = require('resend');
const { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } = require('crypto');
const h3 = require('h3-js');
const {
  normalizeServiceCatalogEntry: normalizeMarketplaceServiceCatalogEntry,
} = require('./serviceMarketplacePricing');
const {
  LEGAL_ENTITY_NAME,
} = require('./legalAgreements');
const {
  isHelperAgreementCurrent,
  getHelperAgreementBundle: getCanonicalHelperAgreementBundle,
  acceptHelperAgreement: acceptCanonicalHelperAgreement,
} = require('./helperLegalAgreements');

const { ACCOUNT_TYPES, REWARD_REASON_CODES, REWARD_TRANSACTION_DIRECTIONS } = require('./shared/rewards');
const { seedDefaultRewardConfig, getRewardConfig } = require('./rewards/config');
const { applyRewardTransaction, processExpiredCustomerPoints } = require('./rewards/rewardService');
const { reserveServiceCredit, finalizeServiceCredit, adminRewardAdjustment, requestHelperBenefit } = require('./rewards/phase3Service');
const {
  ensureReferralCode,
  attachReferral,
  awardReferralStage,
  evaluateCustomerProfileCompletionReward,
} = require('./rewards/referralService');
const { submitServiceRequestRating, serviceIdsFor } = require('./rewards/ratingService');
const { incrementCompletedPaid, recalculateMastery, recalculateMembership } = require('./rewards/progressionService');
const { getFunctions } = require('firebase-admin/functions');
const { applyTrustedAdminRole, isTrustedAdminToken } = require('./security/adminAuthorization');
// A single-concurrency fractional-CPU profile for Functions that previously
// failed deployment under the project's regional CPU quota.
const HALF_CPU_OPTIONS = Object.freeze({ cpu: 0.5, concurrency: 1 });
const {
  FINANCIAL_OPERATIONS_COLLECTION,
  PAYSTACK_TRANSFER_REFERENCES_COLLECTION,
  claimPayoutTransfer,
  claimPaystackRefund,
  claimServiceFinancialOperation,
  classifyPaystackTransaction,
  classifyPaystackTransfer,
  executePayoutTransferAttempt,
  executeServiceChargeAttempt,
  helperPayoutOperationId,
  recordPayoutObservation,
  recordPaystackRefundObservation,
  recordServiceGatewayObservation,
  serviceFinancialOperationId,
  shouldDeferCompletionPayment,
  settleServiceFinancialOperation,
} = require('./financialOperationService');
const {
  PAYMENT_OPERATIONS,
  PAYMENT_SESSIONS,
  beginServicePaymentAttempt,
  cancelCashPaymentSelection,
  cancelSavedCardPaymentConfirmation,
  claimSavedCardPayment,
  createServicePaymentSession,
  getFinalPayableAmount,
  normalizeMinorAmount,
  paymentStateForRequest,
  rejectCashPayment,
  recordCheckoutInitialization,
  reportCashPayment,
  resolveServicePaymentSession,
  revokeServicePaymentSession,
  safePaymentReceipt,
  settleRequestPayment,
} = require('./requestPaymentService');
const {
  HELPER_WALLETS,
  creditHelperWalletEarning,
  emptyHelperWallet,
  helperWalletReference,
  isWalletEarningEligible,
  minorAmount: normalizeWalletMinor,
  normalizeWalletForClient,
} = require('./helperWalletService');
const { createCategoryPricingEngine } = require('./shared/categoryPricingEngineFactory.cjs');
const {
  getQuestionnaireForSelection,
  normalizeAndValidateAnswers,
  quoteFromCatalogEntries,
  quoteFromFirestore,
} = require('./serviceRequestPricing');
const { createMarketplaceRequestOperations } = require('./marketplaceRequestOperations');
const { createServiceRequestOfferOperations } = require('./serviceRequestOfferOperations');
const { getHelperPayoutVerificationStatus, hasVerifiedHelperPayout } = require('./helperDispatchEligibility');
const { calculateCustomerCancellationTerms, cancellationQuoteMatches } = require('./serviceRequestCancellation');
const {
  getServerPaymentMethod,
  getServerPaymentMethods,
  migrateLegacyPaymentMethods,
  storeReusablePaymentMethod,
  updateSavedPaymentMethod,
} = require('./paymentMethodStore');
const { createOrAppendWhatsAppSupportMessage } = require('./whatsapp/supportTicketService');
const { extractQuestionnaireAnswers, getFirstMissingRequiredQuestion, questionnaireNeedsExtractionPass } = require('./whatsapp/serviceBookingIntake');
const { formatWhatsAppBookingConfirmation, renderWhatsAppQuestion } = require('./whatsapp/serviceBookingPresentation');
const { createWhatsAppSupportMediaUrl } = require('./whatsapp/supportMedia');
const {
  WHATSAPP_POLICY_ACCEPTANCE_VERSION,
  buildWhatsAppPolicyConsent,
  hasCurrentWhatsAppPolicyAcceptance,
} = require('./whatsapp/policyConsent');
const { formatWhatsAppText, getWhatsAppDisplayName } = require('./whatsapp/messageFormatting');
const {
  formatWhatsAppPriceGuidance,
  formatWhatsAppServiceList,
  getConfiguredServicePriceRange,
  isPriceQuestion,
} = require('./whatsapp/servicePresentation');
const { attemptAiUnavailableReply } = require('./whatsapp/assistantFailure');
const { appendBoundedConversationTurn } = require('./whatsapp/conversationMemory');
const { getWhatsAppConversationHistory: queryWhatsAppConversationHistory } = require('./whatsapp/conversationHistory');
const { createWhatsAppIntentRouter } = require('./whatsapp/aiIntentRouter');
const { createWhatsAppResponseGenerator, supportsNaturalResponse } = require('./whatsapp/aiResponseGenerator');
const { isManuallyRetryableAssistantJob, sanitizeAssistantFailure } = require('./whatsapp/assistantJobRecovery');
const { buildNearbyHelperMapResults, validOrigin: validMapOrigin } = require('./nearbyHelperMapService');
const { buildPublicTutorSummary } = require('./publicProfileSummary');
const { createWhatsAppToolRegistry } = require('./whatsapp/toolRegistry');
const { retentionDays, retentionExpiryMs, shouldDeleteConversationMessage } = require('./whatsapp/retentionPolicy');
const {
  isWithinCustomerServiceWindow,
  normalizeWebhookPayload,
  stableEventId,
  verifyWebhookChallenge,
  verifyWebhookSignature,
} = require('./whatsapp/metaWebhook');
const { createWhatsAppWebhookHandler } = require('./whatsapp/webhookHandler');
const {
  WHATSAPP_HELPER_ONLINE_LOCATION_TTL_MS,
  buildHelperLocationMapUrl,
  isIncomingWhatsAppLocationNewer,
  isHelperLocationFresh,
  isHelperProfileBlocked,
  normalizeWhatsAppHelperLocation,
  parseWhatsAppHelperAvailabilityCommand,
  resolveWhatsAppHelperLocationMode,
} = require('./whatsapp/helperLocation');
const {
  getWhatsAppSignupUrl,
  getWhatsAppAccountLinkUrl,
  getWhatsAppHelperAgreementUrl,
} = require('./whatsapp/signupLinks');
const {
  selectUniqueVerifiedWhatsAppAccount,
  selectUniqueWhatsAppAccountCandidate,
} = require('./whatsapp/accountResolution');
const {
  WHATSAPP_ACCOUNT_LINK_TTL_MS,
  buildWhatsAppAccountLinkUrl,
  createWhatsAppAccountLinkChallenge,
  isWhatsAppAccountLinkChallengeLive,
} = require('./whatsapp/accountLinkChallenge');
const { buildHelperAgreementLink, buildWhatsAppReturnUrl, normalizeAgreementLinkToken, validateAgreementLinkChallenge } = require('./whatsapp/agreementLink');
const {
  WHATSAPP_ONBOARDING_BUTTONS,
  addressChoicePrompt,
  helperAccountChoicePrompt,
  helperProviderTypePrompt,
  getWhatsAppAccountSetupMode,
  roleSelectionPrompt,
  transitionWhatsAppOnboarding,
} = require('./whatsapp/onboardingFlow');
const { isWhatsAppHelperProfileCaptureStage, resolveWhatsAppHelperReadinessState } = require('./whatsapp/helperReadinessGate');
const { isWhatsAppRecipientAllowed } = require('./whatsapp/testCohort');
const { createMetaWhatsAppClient } = require('./whatsapp/metaClient');
const {
  buildWhatsAppSendFailureDiagnostics,
  withWhatsAppFailureStage,
} = require('./whatsapp/sendFailureDiagnostics');
const { safeProviderFailures } = require('./whatsapp/aiProviderDiagnostics');
const {
  buildCashConfirmationTemplateComponents,
  buildHelperOfferTemplateComponents,
  buildOtpTemplateComponents,
  buildServiceUpdateTemplateComponents,
  buildSupportReplyTemplateComponents,
} = require('./whatsapp/templatePayloads');
const {
  isWhatsAppCancellationEnabled,
  isWhatsAppImageInterpretationEnabled,
  isWhatsAppMediaEnabled,
  isWhatsAppMessagingEnabled,
  isWhatsAppTranscriptionEnabled,
} = require('./whatsapp/featureFlags');
const { canAccessWhatsAppRequest } = require('./whatsapp/participantAccess');
const { getWhatsAppRequestForIdentity, listWhatsAppRequests } = require('./whatsapp/requestAccessService');
const { parseWhatsAppCommand } = require('./whatsapp/commandParser');
const { isExpectedWhatsAppRelayRecipient, isWhatsAppRelayRequestOpen } = require('./whatsapp/relayAuthorization');
const { buildWhatsAppPaymentSummary, formatWhatsAppPaymentSummary } = require('./whatsapp/paymentSummary');
const { buildWhatsAppRequestSummary, formatWhatsAppRequestHistory, formatWhatsAppRequestSummary } = require('./whatsapp/requestSummary');
const { downloadMetaMedia, storeWhatsAppMedia } = require('./whatsapp/mediaProcessor');
const {
  clearanceReviewDeadlineMs,
  isClearanceReviewExpired,
  isHelperPoliceClearanceApproved,
  isPoliceClearanceUploadConfigured,
  meetsHelperPoliceClearanceRequirement,
  normalizePoliceClearanceInbound,
  normalizePoliceClearanceStatus,
  policeClearanceReviewValidityDays,
  policeClearanceStoragePath,
  policeClearanceSubmissionId,
  storePoliceClearanceObject,
} = require('./whatsapp/policeClearance');
const { transcribeWhatsAppAudio } = require('./whatsapp/transcription');
const { extractWhatsAppDocumentText } = require('./whatsapp/documentExtractor');
const { classifyMetaDeliveryError, shouldApplyDeliveryStatus } = require('./whatsapp/deliveryStatus');
const {
  constantTimeHashMatch,
  generateWhatsAppOtp,
  hashWhatsAppOtp,
  normalizeWhatsAppAuthInput,
  profileAllowsRole,
} = require('./whatsapp/authChallenge');
const {
  buildWhatsAppGuestPrincipalId,
  buildWhatsAppIdentityId,
  normalizeWhatsAppIdentityPhone,
} = require('./whatsapp/identityLink');
const {
  evaluateOfferExpiry,
  evaluateHelperRequestTransition,
  normalizeRevision,
  normalizeTimestamp,
} = require('./serviceRequestOfferLogic');

admin.initializeApp();

const db = admin.firestore();
const marketplaceRequestOperations = createMarketplaceRequestOperations({ db, admin });

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

async function createUserNotificationOnce({
  notificationId,
  ...notificationInput
}) {
  const userId = String(notificationInput.userId || '').trim();
  const normalizedId = String(notificationId || '').trim();
  if (!userId || !normalizedId) return null;
  const notificationRef = db.collection('notifications').doc(normalizedId);
  const result = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(notificationRef);
    if (existing.exists) return false;
    transaction.create(notificationRef, {
      userId,
      title: String(notificationInput.title || 'Uncedo update'),
      message: String(notificationInput.message || 'You have a new update.'),
      type: String(notificationInput.type || 'update'),
      requestId: notificationInput.requestId || null,
      sessionId: notificationInput.sessionId || null,
      targetPath: notificationInput.targetPath || '',
      metadata: notificationInput.metadata || {},
      read: false,
      readAt: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  });
  return result ? { id: notificationRef.id } : { id: notificationRef.id, duplicate: true };
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
const HELPER_DISPATCH_H3_RESOLUTION = 4;
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
const serviceRequestOfferOperations = createServiceRequestOfferOperations({
  db,
  admin,
  isHelperUserRecord,
  acceptedStatus: SERVICE_REQUEST_STATUS.ACCEPTED,
  matchingStatus: SERVICE_REQUEST_STATUS.MATCHING,
});
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

function helperSupportsCategory(helper = {}, categoryId = '', requestServiceIds = [], serviceCatalogIndex = null, helperOfferings = []) {
  const catalogIndex = serviceCatalogIndex || buildActiveServiceCatalogIndex([]);
  const categoryToken = normalizeServiceToken(categoryId);
  if (!catalogIndex.byCategoryId.has(categoryToken)) {
    return false;
  }

  return getApprovedActiveHelperServiceOfferings(helperOfferings)
    .some((offering) => helperServiceOfferingMatchesRequest(offering, categoryId, requestServiceIds, catalogIndex));
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


function uniqueTokens(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(normalizeServiceToken).filter(Boolean))];
}

function encodeGeohash(latitude, longitude, precision = 7) {
  const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let latRange = [-90, 90];
  let lonRange = [-180, 180];
  let hash = '';
  let bit = 0;
  let ch = 0;
  let even = true;

  while (hash.length < precision) {
    const range = even ? lonRange : latRange;
    const mid = (range[0] + range[1]) / 2;
    const value = even ? longitude : latitude;
    if (value >= mid) {
      ch = (ch << 1) + 1;
      range[0] = mid;
    } else {
      ch = (ch << 1);
      range[1] = mid;
    }
    even = !even;
    if (bit < 4) {
      bit += 1;
    } else {
      hash += base32[ch];
      bit = 0;
      ch = 0;
    }
  }

  return hash;
}

function getH3CellForLocation(location = null, resolution = HELPER_DISPATCH_H3_RESOLUTION) {
  const latitude = normalizeCoordinate(location?.latitude);
  const longitude = normalizeCoordinate(location?.longitude);
  if (latitude === null || longitude === null) {
    return null;
  }

  return h3.latLngToCell(latitude, longitude, resolution);
}

function getH3QueryCellsForLocation(location = null, resolution = HELPER_DISPATCH_H3_RESOLUTION) {
  const centerCell = getH3CellForLocation(location, resolution);
  if (!centerCell) return [];

  // Resolution 4 keeps dispatch fan-out low while still narrowing the city/region search.
  // Exact distance filtering below remains the source of truth for the 70 km radius.
  return [...new Set(h3.gridDisk(centerCell, 3))];
}

function chunkList(values = [], size = 10) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function buildHelperDispatchServiceIds(helperOfferings = [], catalogIndex = buildActiveServiceCatalogIndex([])) {
  const categoryIds = new Set();
  const serviceIds = new Set();
  const expandedServiceIds = new Set();

  getApprovedActiveHelperServiceOfferings(helperOfferings).forEach((offering) => {
    const serviceToken = normalizeServiceToken(offering.serviceId);
    const categoryToken = normalizeServiceToken(offering.categoryId);
    const nameToken = normalizeServiceToken(offering.serviceName || offering.name || '');
    const catalogEntry = catalogIndex.byId?.get(serviceToken) || null;
    const catalogCategoryToken = normalizeServiceToken(catalogEntry?.categoryId || categoryToken);
    if (catalogCategoryToken) categoryIds.add(catalogCategoryToken);
    if (serviceToken) serviceIds.add(serviceToken);
    if (nameToken) serviceIds.add(nameToken);
    [serviceToken, nameToken].filter(Boolean).forEach((token) => expandedServiceIds.add(token));
    if (catalogEntry?.label) {
      const labelToken = normalizeServiceToken(catalogEntry.label);
      if (labelToken) expandedServiceIds.add(labelToken);
    }
    (Array.isArray(catalogEntry?.includedServiceIds) ? catalogEntry.includedServiceIds : []).forEach((includedId) => {
      const includedToken = normalizeServiceToken(includedId);
      if (includedToken) expandedServiceIds.add(includedToken);
    });
  });

  return {
    categoryIds: [...categoryIds],
    serviceIds: [...serviceIds],
    expandedServiceIds: [...expandedServiceIds],
  };
}

function helperPoliceClearanceRequired() {
  return isPoliceClearanceUploadConfigured(process.env);
}

function buildHelperDispatchIndexDocument(helperId = '', helper = {}, catalogIndex = buildActiveServiceCatalogIndex([]), helperOfferings = []) {
  const liveLocation = getLiveLocationSnapshot(helper);
  const dispatchServices = buildHelperDispatchServiceIds(helperOfferings, catalogIndex);
  const metrics = helper.metrics || {};
  const activeRole = String(helper.activeRole || helper.role || '').trim().toLowerCase();
  const onlineStatus = String(helper.onlineStatus || '').trim().toLowerCase();
  const dispatchPaused = isTruthyFlag(helper.dispatchPaused ?? helper.isDispatchPaused);
  const suspended = isTruthyFlag(helper.suspended ?? helper.isSuspended);
  const blocked = isTruthyFlag(helper.blocked ?? helper.isBlocked);
  const verificationStatus = String(helper.verificationStatus || '').trim().toLowerCase();
  const policeClearanceStatus = normalizePoliceClearanceStatus(helper.policeClearanceStatus);
  const policeClearanceRequired = helperPoliceClearanceRequired();
  const payoutVerificationStatus = getHelperPayoutVerificationStatus(helper);
  const agreementCurrent = isHelperAgreementCurrent(helper);
  const online = activeRole === 'helper' && onlineStatus === 'online';
  const activeServiceRequestId = String(helper.activeServiceRequestId || '').trim() || null;
  const hasApprovedServices = dispatchServices.expandedServiceIds.length > 0 || dispatchServices.categoryIds.length > 0;
  const available = online
    && !activeServiceRequestId
    && !dispatchPaused
    && !suspended
    && !blocked
    && verificationStatus === 'verified'
    && meetsHelperPoliceClearanceRequirement(policeClearanceRequired, policeClearanceStatus)
    && payoutVerificationStatus === 'verified'
    && agreementCurrent
    && hasApprovedServices
    && Boolean(liveLocation)
    && isHelperLocationFresh(liveLocation);

  const location = liveLocation || null;
  const geohash = location ? encodeGeohash(location.latitude, location.longitude) : null;
  const h3Cell = location ? getH3CellForLocation(location) : null;

  return {
    helperId,
    activeRole,
    online,
    available,
    onlineStatus,
    categoryIds: dispatchServices.categoryIds,
    serviceIds: dispatchServices.serviceIds,
    expandedServiceIds: dispatchServices.expandedServiceIds,
    location,
    liveLocation: location,
    geohash,
    h3Cell,
    h3Resolution: h3Cell ? HELPER_DISPATCH_H3_RESOLUTION : null,
    city: String(helper.city || helper.address?.city || helper.location?.city || '').trim(),
    province: String(helper.province || helper.address?.province || helper.location?.province || '').trim(),
    verificationStatus,
    policeClearanceStatus,
    policeClearanceRequired,
    payoutVerificationStatus,
    agreementCurrent,
    dispatchPaused,
    suspended,
    blocked,
    activeServiceRequestId,
    rating: normalizePositiveNumber(metrics.overallRating ?? helper.rating, 0),
    acceptanceRate: normalizePositiveNumber(metrics.acceptanceRate, 0),
    completionRate: normalizePositiveNumber(metrics.completionRate, 0),
    cancellationRate: normalizePositiveNumber(metrics.cancellationRate, 0),
    avgResponseMinutes: normalizePositiveNumber(metrics.avgResponseMinutes, 0),
    recentAssignmentCount: normalizePositiveNumber(metrics.recentAssignmentsCount ?? metrics.recentAssignmentCount, 0),
    lastOfferAt: helper.lastOfferAt || null,
    lastLocationUpdatedAt: liveLocation?.updatedAtMs || null,
    publicName: String(helper.fullName || helper.displayName || helper.firstName || 'Helper').trim().slice(0, 120),
    publicProfilePhoto: String(helper.profilePhoto || helper.selfieUrl || helper.photoURL || '').trim().slice(0, 1000),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    sourceUpdatedAt: helper.updatedAt || null,
  };
}

async function writeHelperDispatchIndexFromUser(helperId = '', helper = {}, catalogIndex = null) {
  if (!helperId || !isHelperUserRecord(helper)) {
    return { skipped: true };
  }
  const policeClearanceRequired = helperPoliceClearanceRequired();
  if (Boolean(helper.policeClearanceRequired) !== policeClearanceRequired) {
    await db.collection('users').doc(helperId).set({
      policeClearanceRequired,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    helper = { ...helper, policeClearanceRequired };
  }
  const index = catalogIndex || buildActiveServiceCatalogIndex(await getLiveServiceCatalogEntries());
  const helperOfferings = await getHelperServiceOfferings(helperId);
  const dispatchDoc = buildHelperDispatchIndexDocument(helperId, helper, index, helperOfferings);
  await db.collection('helperDispatchIndex').doc(helperId).set(dispatchDoc, { merge: true });
  return { skipped: false, available: dispatchDoc.available };
}

async function syncHelperDispatchIndexById(helperId = '') {
  if (!helperId) return { skipped: true };
  const snap = await db.collection('users').doc(helperId).get();
  if (!snap.exists) return { skipped: true };
  return writeHelperDispatchIndexFromUser(helperId, snap.data() || {});
}

async function queryHelperDispatchCandidates(categoryId = '', requestServiceIds = [], catalogIndex = buildActiveServiceCatalogIndex([]), requestLocation = null) {
  const requestedTokens = uniqueTokens(expandRequestedServiceTokens(requestServiceIds, catalogIndex));
  const byId = new Map();
  const base = db.collection('helperDispatchIndex')
    .where('activeRole', '==', 'helper')
    .where('online', '==', true)
    .where('available', '==', true);
  const h3Cells = getH3QueryCellsForLocation(requestLocation);
  const h3CellChunks = h3Cells.length ? chunkList(h3Cells, 10) : [null];

  if (requestedTokens.length) {
    const snapshots = await Promise.all(requestedTokens.slice(0, 10).flatMap((token) => (
      h3CellChunks.map((cellChunk) => {
        let query = base.where('expandedServiceIds', 'array-contains', token);
        if (cellChunk) {
          query = query.where('h3Cell', 'in', cellChunk);
        }
        return query.get();
      })
    )));
    snapshots.forEach((snap) => snap.docs.forEach((docSnap) => byId.set(docSnap.id, { uid: docSnap.id, ...docSnap.data() })));
    return helperPoliceClearanceRequired()
      ? [...byId.values()].filter((helper) => isHelperPoliceClearanceApproved(helper.policeClearanceStatus))
      : [...byId.values()];
  }

  const categoryToken = normalizeServiceToken(categoryId);
  if (!categoryToken) return [];
  const snapshots = await Promise.all(h3CellChunks.map((cellChunk) => {
    let query = base.where('categoryIds', 'array-contains', categoryToken);
    if (cellChunk) {
      query = query.where('h3Cell', 'in', cellChunk);
    }
    return query.get();
  }));
  snapshots.forEach((snap) => snap.docs.forEach((docSnap) => byId.set(docSnap.id, { uid: docSnap.id, ...docSnap.data() })));
  return helperPoliceClearanceRequired()
    ? [...byId.values()].filter((helper) => isHelperPoliceClearanceApproved(helper.policeClearanceStatus))
    : [...byId.values()];
}


function normalizeHelperServiceOfferingDocument(offeringId = '', offering = {}) {
  const helperId = String(offering.helperId || '').trim();
  const serviceId = normalizeServiceToken(offering.serviceId || '');
  const categoryId = normalizeServiceToken(offering.categoryId || '');
  if (!helperId || !serviceId || !categoryId) return null;

  return {
    offeringId: String(offering.offeringId || offeringId || `${helperId}_${serviceId}`).trim(),
    helperId,
    serviceId,
    categoryId,
    serviceName: String(offering.serviceName || offering.name || offering.label || serviceId).trim(),
    status: String(offering.status || 'pending').trim().toLowerCase(),
    active: offering.active !== false,
    approved: offering.approved === true || String(offering.status || '').toLowerCase() === 'approved',
    verified: offering.verified === true,
    photos: (Array.isArray(offering.photos) ? offering.photos : []).filter(Boolean),
    approvalSource: String(offering.approvalSource || '').trim().toLowerCase(),
    derivedFromBundleIds: normalizeCatalogIdList(offering.derivedFromBundleIds),
    createdAt: offering.createdAt || null,
    updatedAt: offering.updatedAt || null,
  };
}

async function getHelperServiceOfferings(helperId = '') {
  const normalizedHelperId = String(helperId || '').trim();
  if (!normalizedHelperId) return [];

  const snapshot = await db.collection('helperServices')
    .where('helperId', '==', normalizedHelperId)
    .get();

  return snapshot.docs
    .map((docSnap) => normalizeHelperServiceOfferingDocument(docSnap.id, docSnap.data() || {}))
    .filter(Boolean);
}

function getApprovedActiveHelperServiceOfferings(offerings = []) {
  return (Array.isArray(offerings) ? offerings : []).filter((offering) => (
    offering.active !== false
    && offering.approved === true
    && offering.verified === true
    && String(offering.status || '').toLowerCase() === 'approved'
  ));
}

function helperServiceOfferingMatchesRequest(offering = {}, categoryId = '', requestServiceIds = [], catalogIndex = buildActiveServiceCatalogIndex([])) {
  const categoryToken = normalizeServiceToken(categoryId);
  if (!categoryToken || normalizeServiceToken(offering.categoryId) !== categoryToken) return false;

  const requestedTokens = expandRequestedServiceTokens(requestServiceIds, catalogIndex);
  if (!requestedTokens.length) return true;

  const serviceToken = normalizeServiceToken(offering.serviceId);
  const offeringTokens = new Set([serviceToken, normalizeServiceToken(offering.serviceName)]);
  const catalogEntry = catalogIndex.byId?.get(serviceToken) || null;
  if (catalogEntry?.label) offeringTokens.add(normalizeServiceToken(catalogEntry.label));
  (Array.isArray(catalogEntry?.includedServiceIds) ? catalogEntry.includedServiceIds : []).forEach((includedId) => {
    const token = normalizeServiceToken(includedId);
    if (token) offeringTokens.add(token);
  });
  return requestedTokens.some((token) => offeringTokens.has(token));
}

function isHelperDispatchEligible(helper = {}, categoryId = '', requestServiceIds = [], catalogIndex = null, helperOfferings = []) {
  const isDispatchPaused = isTruthyFlag(helper.dispatchPaused ?? helper.isDispatchPaused);
  const isSuspendedOrBlocked = isTruthyFlag(
    helper.suspended
      ?? helper.isSuspended
      ?? helper.blocked
      ?? helper.isBlocked,
  );
  const verificationStatus = String(helper?.verificationStatus || '').toLowerCase();

  return verificationStatus === 'verified'
    && isHelperLocationFresh(getLiveLocationSnapshot(helper))
    && meetsHelperPoliceClearanceRequirement(helperPoliceClearanceRequired(), helper?.policeClearanceStatus)
    && hasVerifiedHelperPayout(helper)
    && isHelperAgreementCurrent(helper)
    && helperSupportsCategory(helper, categoryId, requestServiceIds, catalogIndex, helperOfferings)
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
    source: String(location.source || 'device').trim().toLowerCase() || 'device',
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
  const verificationStatus = String(helper?.verificationStatus || '').toLowerCase();
  const isDispatchPaused = isTruthyFlag(helper.dispatchPaused ?? helper.isDispatchPaused);

  return isOnline
    && hasLocationSharing
    && isHelperLocationFresh(location)
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

  const [activeRequestsSnap, catalogEntries] = await Promise.all([
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

  const requestLocation = getServiceRequestLocationSnapshot(request);
  const dispatchCandidates = await queryHelperDispatchCandidates(categoryId, requestServiceIds, catalogIndex, requestLocation);

  const busyHelperIds = new Set(
    activeRequestsSnap.docs
      .map((item) => item.data()?.helperAssignment?.helperId)
      .filter(Boolean),
  );

  const candidateIds = dispatchCandidates
    .map((helper) => String(helper.helperId || helper.uid || '').trim())
    .filter((helperId) => helperId && !busyHelperIds.has(helperId));

  const helperDocsWithOfferings = await Promise.all(candidateIds.map(async (helperId) => {
    const [userSnap, helperOfferings] = await Promise.all([
      db.collection('users').doc(helperId).get(),
      getHelperServiceOfferings(helperId),
    ]);
    return { userSnap, helperOfferings };
  }));
  const eligibleHelpers = helperDocsWithOfferings
    .filter(({ userSnap }) => userSnap.exists)
    .map(({ userSnap, helperOfferings }) => ({ helper: { uid: userSnap.id, ...userSnap.data() }, helperOfferings }))
    .filter(({ helper, helperOfferings }) => isHelperDispatchEligible(helper, categoryId, requestServiceIds, catalogIndex, helperOfferings))
    .map(({ helper }) => helper);
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

exports.getCustomerServicePricingQuote = onRequest({ cors: true, maxInstances: 5, concurrency: 20, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed.' });
    return;
  }
  const token = getBearerToken(req);
  const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) {
    res.status(401).json({ success: false, message: 'Unauthorized request.' });
    return;
  }
  try {
    const quote = await quoteFromFirestore({
      db,
      categoryId: req.body?.categoryId,
      serviceIds: req.body?.serviceIds,
      selectedPackageId: req.body?.selectedPackageId,
      structuredAnswers: req.body?.structuredAnswers || {},
      strictUnknownAnswers: true,
    });
    res.status(200).json({ success: true, quote });
  } catch (error) {
    const status = error.code === 'missing-required-answers' ? 400 : 422;
    res.status(status).json({
      success: false,
      message: error.message || 'Unable to quote this service.',
      missingQuestionIds: error.missingQuestionIds || [],
    });
  }
});

async function hasCustomerServiceRole(uid) {
  const snapshot = await db.collection('users').doc(uid).get();
  return snapshot.exists && profileAllowsRole(snapshot.data() || {}, 'customer');
}

exports.quoteCustomerServiceRequest = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  const token = getBearerToken(req);
  const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) return res.status(401).json({ success: false, message: 'Unauthorized request.' });
  if (!(await hasCustomerServiceRole(decoded.uid))) return res.status(403).json({ success: false, message: 'A customer account is required.' });
  const requestId = String(req.body?.requestId || '').trim();
  if (!requestId) return res.status(400).json({ success: false, message: 'A request ID is required.' });
  try {
    const update = await marketplaceRequestOperations.updateDraft({
      requestId,
      principalId: decoded.uid,
      categoryId: req.body?.categoryId,
      serviceIds: req.body?.serviceIds,
      selectedPackageId: req.body?.selectedPackageId,
      structuredAnswers: req.body?.structuredAnswers || {},
      location: req.body?.location,
      serviceAddress: req.body?.serviceAddress,
      timingPreference: req.body?.timingPreference,
      scheduledForText: req.body?.scheduledForText,
    });
    if (update.code !== 'updated') return res.status(update.code === 'not-owner' ? 403 : 409).json({ success: false, code: update.code, message: update.message || 'This request cannot be quoted in its current state.', missingQuestionIds: update.missingQuestionIds || [] });
    const result = await marketplaceRequestOperations.quoteDraft({ requestId, principalId: decoded.uid });
    if (result.code !== 'quoted') return res.status(result.code === 'not-owner' ? 403 : 422).json({ success: false, code: result.code, message: result.message || 'The request is missing valid information for a quote.', missingQuestionIds: result.missingQuestionIds || [] });
    return res.status(200).json({ success: true, quote: result.quote, quoteExpiresAtMs: result.quoteExpiresAtMs });
  } catch (error) {
    logger.warn('customer_service_request_quote_failed', { requestId, uid: decoded.uid, errorCode: String(error?.code || 'quote_failed').slice(0, 100) });
    return res.status(500).json({ success: false, message: 'Unable to calculate this service quote right now.' });
  }
});

exports.updateCustomerServiceRequestDraft = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  const token = getBearerToken(req);
  const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) return res.status(401).json({ success: false, message: 'Unauthorized request.' });
  if (!(await hasCustomerServiceRole(decoded.uid))) return res.status(403).json({ success: false, message: 'A customer account is required.' });
  const requestId = String(req.body?.requestId || '').trim();
  if (!requestId) return res.status(400).json({ success: false, message: 'A request ID is required.' });
  try {
    const result = await marketplaceRequestOperations.updateDraft({
      requestId,
      principalId: decoded.uid,
      categoryId: req.body?.categoryId,
      serviceIds: req.body?.serviceIds,
      selectedPackageId: req.body?.selectedPackageId,
      structuredAnswers: req.body?.structuredAnswers,
      location: req.body?.location,
      serviceAddress: req.body?.serviceAddress,
      timingPreference: req.body?.timingPreference,
      scheduledForText: req.body?.scheduledForText,
    });
    const status = result.code === 'updated' ? 200 : result.code === 'not-owner' ? 403 : result.code === 'request-not-found' ? 404 : 409;
    return res.status(status).json({ success: result.code === 'updated', ...result });
  } catch (error) {
    logger.warn('customer_service_request_draft_update_failed', { requestId, uid: decoded.uid, errorCode: String(error?.code || 'draft_update_failed').slice(0, 100) });
    return res.status(500).json({ success: false, message: 'Unable to update this request right now.' });
  }
});

exports.createCustomerServiceRequest = onRequest({ cors: true, maxInstances: 5, concurrency: 20, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed.' });
    return;
  }
  const token = getBearerToken(req);
  const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) {
    res.status(401).json({ success: false, message: 'Unauthorized request.' });
    return;
  }
  if (!(await hasCustomerServiceRole(decoded.uid))) {
    res.status(403).json({ success: false, message: 'A customer account is required.' });
    return;
  }

  const requestId = String(req.body?.requestId || '').trim();
  const categoryId = String(req.body?.categoryId || '').trim().toLowerCase();
  const serviceIds = [...new Set((Array.isArray(req.body?.serviceIds) ? req.body.serviceIds : [])
    .map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))];
  const selectedPackageId = String(req.body?.selectedPackageId || '').trim().toLowerCase();
  const structuredAnswers = req.body?.structuredAnswers && typeof req.body.structuredAnswers === 'object' && !Array.isArray(req.body.structuredAnswers)
    ? req.body.structuredAnswers
    : {};
  if (!/^[A-Za-z0-9_-]{8,180}$/.test(requestId) || !categoryId || !serviceIds.length || serviceIds.length > 30) {
    res.status(400).json({ success: false, message: 'A valid service selection is required.' });
    return;
  }

  try {
    const result = await marketplaceRequestOperations.createDraft({
      requestId,
      principalId: decoded.uid,
      profile: { fullName: decoded.name || '', email: decoded.email || '', phoneNumber: decoded.phone_number || '' },
      categoryId,
      serviceIds,
      selectedPackageId,
      structuredAnswers,
      location: req.body?.location || null,
      serviceAddress: String(req.body?.serviceAddress || '').trim(),
      timingPreference: String(req.body?.timingPreference || '').trim(),
      scheduledForText: String(req.body?.scheduledForText || '').trim(),
      intakeMode: 'guided_chat',
      source: 'customer_request_backend',
    });

    if (result.code === 'active-request') {
      res.status(409).json({ success: false, code: result.code, activeRequestId: result.activeRequestId, message: 'You already have an active service request.' });
      return;
    }
    if (result.code === 'request-id-conflict') {
      res.status(409).json({ success: false, code: result.code, message: 'This request could not be created. Please start again.' });
      return;
    }
    if (!['created', 'already-created'].includes(result.code)) {
      res.status(422).json({ success: false, code: result.code, message: result.message || 'The selected service is not available.' });
      return;
    }
    res.status(200).json({ success: true, idempotent: result.code === 'already-created', requestId: result.requestId || result.request?.id });
  } catch (error) {
    logger.error('customer_service_request_creation_failed', {
      requestId,
      uid: decoded.uid,
      errorCode: String(error?.code || 'request_creation_failed').slice(0, 120),
    });
    res.status(500).json({ success: false, message: 'Unable to start this service request right now.' });
  }
});

exports.confirmCustomerServiceRequest = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed.' });
    return;
  }
  const token = getBearerToken(req);
  const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) {
    res.status(401).json({ success: false, message: 'Unauthorized request.' });
    return;
  }
  if (!(await hasCustomerServiceRole(decoded.uid))) {
    res.status(403).json({ success: false, message: 'A customer account is required.' });
    return;
  }

  const requestId = String(req.body?.requestId || '').trim();
  const callId = String(req.body?.callId || '').trim();
  const approvedQuote = req.body?.approvedQuote;
  if (!requestId || !approvedQuote || !Number.isFinite(Number(approvedQuote.total))) {
    res.status(400).json({ success: false, message: 'A request ID and approved quote are required.' });
    return;
  }

  try {
    const requestRef = db.collection('serviceRequests').doc(requestId);
    const outcome = await marketplaceRequestOperations.confirmDraft({
      requestId,
      principalId: decoded.uid,
      approvedQuote,
      callId,
      source: 'customer_request_backend',
      paymentFlowVersion: explicitPaymentSelectionEnabled() ? 'explicit_v1' : null,
      walletAccountingVersion: helperWalletEnabled() ? 1 : null,
    });

    if (outcome.code === 'not-owner') {
      res.status(403).json({ success: false, code: outcome.code, message: 'Only the request owner can submit this request.' });
      return;
    }
    if (outcome.code === 'request-not-found') {
      res.status(404).json({ success: false, code: outcome.code, message: 'Service request not found.' });
      return;
    }
    if (outcome.code === 'already-submitted') {
      res.status(200).json({ success: true, idempotent: true, request: outcome.request, pricingSnapshot: outcome.request.pricingSnapshot });
      return;
    }
    if (outcome.code === 'quote-changed') {
      res.status(409).json({ success: false, code: outcome.code, message: 'The service price changed. Review and approve the updated quote.', quote: outcome.quote });
      return;
    }
    if (outcome.code === 'active-request') {
      res.status(409).json({ success: false, code: outcome.code, message: 'You already have another active service request.', activeRequestId: outcome.activeRequestId });
      return;
    }
    if (outcome.code !== 'submitted') {
      res.status(422).json({ success: false, code: outcome.code, message: outcome.message || 'The service request is not ready to submit.', missingQuestionIds: outcome.missingQuestionIds || [] });
      return;
    }
    const submittedSnap = await db.collection('serviceRequests').doc(requestId).get();
    res.status(200).json({
      success: true,
      request: submittedSnap.exists ? { id: submittedSnap.id, ...submittedSnap.data() } : null,
      pricingSnapshot: outcome.quote,
    });
  } catch (error) {
    logger.error('customer_service_request_confirmation_failed', {
      requestId,
      uid: decoded.uid,
      errorCode: String(error?.code || 'request_confirmation_failed').slice(0, 120),
    });
    res.status(500).json({ success: false, message: 'Unable to submit this service request right now.' });
  }
});

exports.whatsappWebhook = onRequest({
  invoker: 'public',
  maxInstances: 3,
  memory: '256MiB',
  timeoutSeconds: 30,
  ...HALF_CPU_OPTIONS,
}, createWhatsAppWebhookHandler({
  getSecrets: getWhatsAppSecrets,
  isMessagingEnabled: whatsappMessagingEnabled,
  isRecipientAllowed: (phone) => isWhatsAppRecipientAllowed(phone, process.env),
  verifyWebhookChallenge,
  verifyWebhookSignature,
  normalizeWebhookPayload,
  db,
  admin,
  logger,
}));

exports.persistWhatsAppConversationEvent = onDocumentCreated({
  document: 'whatsappWebhookEvents/{eventId}',
  maxInstances: 4,
  concurrency: 20,
  retry: false,
}, async (event) => {
  const normalized = event.data?.data();
  if (!normalized) return;
  const eventRef = event.data.ref;
  if (!whatsappMessagingEnabled()) {
    await eventRef.set({ status: 'ignored_disabled', processedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return;
  }

  if (normalized.eventType === 'message_status') {
    const statusRef = db.collection('whatsappMessageStatuses').doc(normalized.eventId);
    await statusRef.create({
      ...normalized,
      retentionExpiresAtMs: retentionExpiryMs(process.env, 'WHATSAPP_STATUS_RETENTION_DAYS'),
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch((error) => {
      if (error?.code !== 6 && error?.code !== 'already-exists') throw error;
    });
    const matchingMessages = await db.collection('whatsappMessages')
      .where('metaMessageId', '==', normalized.messageId).limit(5).get();
    for (const messageDoc of matchingMessages.docs) {
      if (String(messageDoc.data()?.to || '') !== String(normalized.recipientId || '')) continue;
      await applyWhatsAppDeliveryStatusToMessage(messageDoc.ref, normalized);
    }
    await eventRef.update({ status: 'persisted', processedAt: admin.firestore.FieldValue.serverTimestamp() });
    return;
  }
  if (normalized.eventType !== 'message') {
    await eventRef.update({ status: 'ignored', processedAt: admin.firestore.FieldValue.serverTimestamp() });
    return;
  }

  const identityId = buildWhatsAppIdentityId({
    phoneNumberId: normalized.phoneNumberId,
    phoneNumber: `+${normalized.from}`,
    stableEventId,
  });
  const guestPrincipalId = buildWhatsAppGuestPrincipalId(identityId);
  const identityRef = db.collection('whatsappIdentities').doc(identityId);
  const conversationRef = db.collection('whatsappConversations').doc(identityId);
  const messageRef = db.collection('whatsappMessages').doc(normalized.eventId);
  const assistantJobRef = db.collection('whatsappAssistantJobs').doc(normalized.eventId);

  await db.runTransaction(async (transaction) => {
    const [identitySnap, conversationSnap, messageSnap, eventSnap] = await Promise.all([
      transaction.get(identityRef),
      transaction.get(conversationRef),
      transaction.get(messageRef),
      transaction.get(eventRef),
    ]);
    if (!eventSnap.exists || eventSnap.data()?.status === 'persisted') return;

    const existingIdentity = identitySnap.data() || {};
    const activeGuestPrincipalId = String(existingIdentity.guestPrincipalId || guestPrincipalId);
    const conversation = conversationSnap.data() || {};
    const timestampMs = normalizeTimestamp(normalized.timestampMs) || Date.now();
    const receivedAtMs = normalizeTimestamp(normalized.receivedAtMs) || Date.now();
    const latestInboundAtMs = Math.max(Number(conversation.lastInboundMessageAtMs || 0), timestampMs);
    const previousInboundAtMs = Number(conversation.lastInboundMessageAtMs || 0);
    const previousReceivedAtMs = Number(conversation.lastInboundReceivedAtMs || 0);
    const isLatestInbound = timestampMs > previousInboundAtMs
      || (timestampMs === previousInboundAtMs && receivedAtMs > previousReceivedAtMs)
      || (timestampMs === previousInboundAtMs && receivedAtMs === previousReceivedAtMs
        && normalized.eventId > String(conversation.lastInboundEventId || ''));
    const now = admin.firestore.FieldValue.serverTimestamp();
    const memory = appendBoundedConversationTurn({
      recentHistory: conversation.recentHistory,
      conversationSummary: {
        ...(conversation.conversationSummary || {}),
        currentMode: conversation.currentMode || 'assistant',
        currentIntent: conversation.currentIntent || '',
        selectedServiceId: conversation.selectedServiceId || '',
        presentedServiceIds: conversation.presentedServiceIds || [],
        activeServiceRequestId: conversation.activeServiceRequestId || '',
        activeSupportTicketId: conversation.activeSupportTicketId || '',
      },
      turn: messageSnap.exists ? null : {
        role: 'user',
        text: normalized.text || normalized.media?.caption || '',
        type: normalized.type,
        timestampMs,
        receivedAtMs,
        eventId: normalized.eventId,
      },
    });
    transaction.set(identityRef, {
      channel: 'whatsapp',
      phoneNumberId: normalized.phoneNumberId,
      waId: normalized.from,
      guestPrincipalId: activeGuestPrincipalId,
      linkedFirebaseUid: existingIdentity.linkedFirebaseUid || null,
      role: existingIdentity.role || null,
      verifiedAt: existingIdentity.verifiedAt || null,
      profileName: normalized.profileName || existingIdentity.profileName || '',
      lastSeenAtMs: timestampMs,
      updatedAt: now,
      createdAt: existingIdentity.createdAt || now,
    }, { merge: true });
    transaction.set(conversationRef, {
      channel: 'whatsapp',
      identityId,
      linkedFirebaseUid: conversation.linkedFirebaseUid || existingIdentity.linkedFirebaseUid || null,
      currentMode: conversation.currentMode || 'assistant',
      currentIntent: conversation.currentIntent || null,
      activeDraftId: conversation.activeDraftId || null,
      activeServiceRequestId: conversation.activeServiceRequestId || null,
      activeSupportTicketId: conversation.activeSupportTicketId || null,
      lastInboundEventId: isLatestInbound
        ? normalized.eventId
        : conversation.lastInboundEventId || null,
      lastInboundReceivedAtMs: isLatestInbound ? receivedAtMs : previousReceivedAtMs,
      lastInboundMessageAtMs: latestInboundAtMs,
      customerServiceWindowExpiresAtMs: latestInboundAtMs + (24 * 60 * 60 * 1000),
      humanHandoff: Boolean(conversation.humanHandoff),
      whatsappPolicyAcceptedAtMs: Number(conversation.whatsappPolicyAcceptedAtMs || 0),
      whatsappPolicyAcceptedVersion: String(conversation.whatsappPolicyAcceptedVersion || ''),
      lastMessageAtMs: Math.max(Number(conversation.lastMessageAtMs || 0), timestampMs),
      recentHistory: memory.recentHistory,
      conversationSummary: memory.conversationSummary,
      updatedAt: now,
      createdAt: conversation.createdAt || now,
    }, { merge: true });

    if (!messageSnap.exists) {
      transaction.create(messageRef, {
        ...normalized,
        identityId,
        guestPrincipalId: activeGuestPrincipalId,
        participantUid: existingIdentity.linkedFirebaseUid || null,
        participantRole: existingIdentity.role || 'guest',
        direction: 'inbound',
        status: 'received',
        createdAtMs: timestampMs,
        retentionExpiresAtMs: timestampMs + whatsappRetentionDays('WHATSAPP_MESSAGE_RETENTION_DAYS', 180) * 24 * 60 * 60 * 1000,
        createdAt: now,
      });
      transaction.create(assistantJobRef, {
        eventId: normalized.eventId,
        identityId,
        conversationId: identityId,
        status: 'pending',
        attempts: 0,
        retentionExpiresAtMs: timestampMs + whatsappRetentionDays('WHATSAPP_JOB_RETENTION_DAYS', 30) * 24 * 60 * 60 * 1000,
        createdAt: now,
        updatedAt: now,
      });
    }
    transaction.update(eventRef, {
      status: 'persisted',
      identityId,
      processedAt: now,
      updatedAt: now,
    });
  });
});

function whatsappRetentionDays(variableName, defaultDays) {
  return retentionDays({ [variableName]: process.env[variableName] || '' }, variableName) || defaultDays;
}

function whatsappAiEnabled() {
  return String(process.env.WHATSAPP_AI_ENABLED || '').trim().toLowerCase() === 'true';
}

function whatsappNaturalResponsesEnabled() {
  return String(process.env.WHATSAPP_NATURAL_RESPONSES_ENABLED || '').trim().toLowerCase() === 'true';
}

function whatsappOnboardingEnabled() {
  return String(process.env.WHATSAPP_ONBOARDING_ENABLED || '').trim().toLowerCase() === 'true';
}

function getWhatsAppSignupBaseUrl(role, mode = 'signup') {
  try {
    return getWhatsAppSignupUrl({ role, mode, env: process.env });
  } catch (_) {
    throw new HttpsError('failed-precondition', 'The WhatsApp account setup page is not configured with a valid HTTPS URL.');
  }
}

function getWhatsAppAccountLinkBaseUrl(role) {
  try {
    return getWhatsAppAccountLinkUrl({ role, env: process.env }).toString();
  } catch (_) {
    throw new HttpsError('failed-precondition', 'The WhatsApp account-link page is not configured with a valid HTTPS URL.');
  }
}

async function createWhatsAppExistingAccountLink({ identityId, sourceEventId, candidate }) {
  const identityRef = db.collection('whatsappIdentities').doc(String(identityId || ''));
  const uid = String(candidate?.uid || '').trim();
  const role = String(candidate?.role || '').trim().toLowerCase();
  if (!uid || !['customer', 'helper'].includes(role)) return { code: 'invalid-candidate' };
  const identitySnapshot = await identityRef.get();
  if (!identitySnapshot.exists) return { code: 'identity-not-found' };
  const identity = identitySnapshot.data() || {};
  const phone = normalizeWhatsAppIdentityPhone(`+${String(identity.waId || '')}`);
  if (!phone.phoneNumber || identity.phoneNumberId !== getWhatsAppSecrets().phoneNumberId) return { code: 'identity-invalid' };
  const phoneHash = createHash('sha256').update(phone.phoneNumber).digest('hex');
  const challenge = createWhatsAppAccountLinkChallenge({ uid, role, identityId, phoneNumber: phone.phoneNumber, sourceEventId });
  const challengeRef = db.collection('whatsappAccountLinkChallenges').doc(challenge.tokenHash);
  const profileRef = db.collection('users').doc(uid);
  const userLinkRef = db.collection('whatsappUserLinks').doc(uid);
  const phoneOwnerRef = db.collection('whatsappPhoneOwnership').doc(phoneHash);
  const previousChallengeHash = String(identity.accountLinkChallengeHash || '').trim();
  const previousChallengeRef = /^[a-f0-9]{64}$/.test(previousChallengeHash)
    ? db.collection('whatsappAccountLinkChallenges').doc(previousChallengeHash)
    : null;
  const nowMs = Date.now();
  const outcome = await db.runTransaction(async (transaction) => {
    const [currentIdentity, profileSnapshot, userLinkSnapshot, phoneOwnerSnapshot, previousChallenge] = await Promise.all([
      transaction.get(identityRef), transaction.get(profileRef), transaction.get(userLinkRef), transaction.get(phoneOwnerRef),
      previousChallengeRef ? transaction.get(previousChallengeRef) : Promise.resolve(null),
    ]);
    const current = currentIdentity.data() || {};
    const profile = profileSnapshot.data() || {};
    const linkedPhone = String(profile.whatsappPhoneNumber || '').trim();
    let linkedPhoneMatches = false;
    try { linkedPhoneMatches = !linkedPhone || normalizeWhatsAppIdentityPhone(linkedPhone).phoneNumber === phone.phoneNumber; } catch (_) { linkedPhoneMatches = false; }
    let accountPhoneMatches = false;
    try {
      accountPhoneMatches = [profile.phoneNumber, profile.whatsappPhoneNumber]
        .some((value) => value && normalizeWhatsAppIdentityPhone(String(value)).phoneNumber === phone.phoneNumber);
    } catch (_) { accountPhoneMatches = false; }
    if (!currentIdentity.exists || String(current.waId || '') !== phone.waId
      || String(current.phoneNumberId || '') !== String(getWhatsAppSecrets().phoneNumberId)
      || current.linkedFirebaseUid || !profileSnapshot.exists || !profileAllowsRole(profile, role)
      || !linkedPhoneMatches || !accountPhoneMatches) return { code: 'identity-or-account-changed' };
    if (String(userLinkSnapshot.data()?.identityId || '')) return { code: 'account-already-linked' };
    const owner = phoneOwnerSnapshot.data() || {};
    if (phoneOwnerSnapshot.exists && (String(owner.uid || '') !== uid || String(owner.identityId || '') !== identityId)) {
      return { code: 'phone-already-linked' };
    }
    const lastSentAtMs = Number(current.accountLinkChallengeSentAtMs || 0);
    const previous = previousChallenge?.data() || {};
    if (previousChallenge?.exists && isWhatsAppAccountLinkChallengeLive(previous, nowMs)
      && nowMs - lastSentAtMs < 5 * 60 * 1000) return { code: 'recent-link-sent' };
    if (previousChallenge?.exists && previous.status === 'pending') {
      transaction.set(previousChallengeRef, { status: 'superseded', supersededAtMs: nowMs, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.create(challengeRef, { ...challenge.challenge, createdAt: now });
    transaction.set(identityRef, {
      accountResolutionStatus: 'account_link_required',
      accountLinkChallengeHash: challenge.tokenHash,
      accountLinkChallengeSentAtMs: nowMs,
      updatedAt: now,
    }, { merge: true });
    transaction.create(db.collection('auditEvents').doc(stableEventId(`whatsapp-account-link-issued:${challenge.tokenHash}`)), {
      eventType: 'whatsapp_account_link_challenge_issued', uid, role, identityId,
      phoneHash, expiresAtMs: challenge.challenge.expiresAtMs, createdAt: now,
    });
    return { code: 'created' };
  });
  if (outcome.code !== 'created') return outcome;
  const url = buildWhatsAppAccountLinkUrl(getWhatsAppAccountLinkBaseUrl(role), challenge.token);
  return { code: 'created', url, expiresAtMs: challenge.challenge.expiresAtMs, role };
}

async function createWhatsAppSignupLink({ identityId, role, sourceEventId, mode = 'signup' }) {
  if (!whatsappOnboardingEnabled()) throw new HttpsError('failed-precondition', 'WhatsApp account onboarding is not enabled.');
  if (!['customer', 'helper'].includes(String(role || '').trim().toLowerCase())) {
    throw new HttpsError('invalid-argument', 'A customer or helper account type is required.');
  }
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAtMs = Date.now() + (30 * 60 * 1000);
  const identitySnapshot = await db.collection('whatsappIdentities').doc(String(identityId || '')).get();
  if (!identitySnapshot.exists) throw new HttpsError('not-found', 'The WhatsApp conversation could not be found. Start again from that chat.');
  const identity = identitySnapshot.data() || {};
  const phone = normalizeWhatsAppIdentityPhone(`+${String(identity.waId || '')}`);
  if (!phone.phoneNumber || identity.phoneNumberId !== getWhatsAppSecrets().phoneNumberId) {
    throw new HttpsError('failed-precondition', 'The WhatsApp conversation could not be verified. Start again from that chat.');
  }
  await db.collection('whatsappSignupChallenges').doc(tokenHash).create({
    identityId: String(identityId || ''),
    role: String(role).toLowerCase(),
    entryMode: String(mode).toLowerCase() === 'signin' ? 'signin' : 'signup',
    phoneHash: createHash('sha256').update(phone.phoneNumber).digest('hex'),
    sourceEventId: String(sourceEventId || ''),
    status: 'pending',
    claimedUid: null,
    expiresAtMs,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    retentionExpiresAtMs: expiresAtMs + (24 * 60 * 60 * 1000),
  });
  const normalizedMode = String(mode).toLowerCase() === 'signin' ? 'signin' : 'signup';
  const url = getWhatsAppSignupBaseUrl(String(role).toLowerCase(), normalizedMode);
  // Fragment values stay in the browser and are removed by the signup page;
  // the server still trusts only the opaque, short-lived challenge token.
  url.hash = new URLSearchParams({
    wa_signup_token: token,
    wa_role: String(role).toLowerCase(),
    wa_phone: phone.phoneNumber,
    wa_mode: normalizedMode,
  }).toString();
  return { url: url.toString(), tokenHash, expiresAtMs };
}

function getWhatsAppHelperAgreementBaseUrl() {
  try {
    return getWhatsAppHelperAgreementUrl({ env: process.env });
  } catch (_) {
    throw new HttpsError('failed-precondition', 'The helper agreement page is not configured with a valid HTTPS URL.');
  }
}

function getWhatsAppBusinessReturnUrl() {
  return buildWhatsAppReturnUrl('27605239926');
}

async function createWhatsAppHelperAgreementLink({ identityId, sourceEventId }) {
  if (!whatsappOnboardingEnabled()) throw new HttpsError('failed-precondition', 'WhatsApp helper onboarding is not enabled.');
  const identitySnapshot = await db.collection('whatsappIdentities').doc(String(identityId || '')).get();
  if (!identitySnapshot.exists) throw new HttpsError('not-found', 'The WhatsApp helper identity could not be found.');
  const identity = identitySnapshot.data() || {};
  const uid = String(identity.linkedFirebaseUid || '').trim();
  if (!uid || String(identity.role || '').toLowerCase() !== 'helper' || !normalizeTimestamp(identity.verifiedAt)) {
    throw new HttpsError('permission-denied', 'A verified linked helper account is required to sign the Helper Agreement.');
  }
  const profileSnapshot = await db.collection('users').doc(uid).get();
  if (!profileSnapshot.exists || !isHelperUserRecord(profileSnapshot.data() || {})) {
    throw new HttpsError('permission-denied', 'The linked Uncedo account is not a helper account.');
  }
  const phone = normalizeWhatsAppIdentityPhone(`+${String(identity.waId || '')}`);
  const phoneHash = createHash('sha256').update(phone.phoneNumber).digest('hex');
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAtMs = Date.now() + 30 * 60 * 1000;
  const bundle = await getCanonicalHelperAgreementBundle({ db, admin, userId: uid });
  const activeVersion = bundle.activeVersion;
  const currentVersion = String(activeVersion?.version || '').trim();
  if (!currentVersion) throw new HttpsError('failed-precondition', 'The current Helper Agreement is unavailable.');
  if (String(profileSnapshot.data()?.agreement?.acceptedVersion || '') === currentVersion) return { code: 'already-current', version: currentVersion };
  await db.collection('whatsappAgreementChallenges').doc(tokenHash).create({
    uid,
    role: 'helper',
    identityId: String(identityId),
    phoneHash,
    sourceEventId: String(sourceEventId || ''),
    agreementVersionAtCreation: currentVersion,
    status: 'pending',
    expiresAtMs,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    retentionExpiresAtMs: expiresAtMs + 24 * 60 * 60 * 1000,
  });
  const url = buildHelperAgreementLink(getWhatsAppHelperAgreementBaseUrl(), token);
  return { code: 'created', url, version: currentVersion, tokenHash, expiresAtMs };
}

async function sendWhatsAppHelperAgreementSignedConfirmation({ uid, identityId, tokenHash }) {
  if (!whatsappMessagingEnabled()) return false;
  const [identitySnapshot, conversationSnapshot] = await Promise.all([
    db.collection('whatsappIdentities').doc(String(identityId || '')).get(),
    db.collection('whatsappConversations').doc(String(identityId || '')).get(),
  ]);
  if (!identitySnapshot.exists || !conversationSnapshot.exists) return false;
  const identity = identitySnapshot.data() || {};
  const conversationRef = db.collection('whatsappConversations').doc(String(identityId || ''));
  if (String(identity.linkedFirebaseUid || '') !== String(uid || '')
    || String(identity.role || '').toLowerCase() !== 'helper'
    || !normalizeTimestamp(identity.verifiedAt)) return false;

  const result = await persistWhatsAppAssistantReply({
    sourceEventId: `helper-agreement-accepted:${String(tokenHash || '')}`,
    identityId: String(identityId || ''),
    identity,
    conversationRef,
    text: 'Your current Uncedo Helper Agreement has been signed and saved to the helper account linked to this WhatsApp number. Return to your helper setup here to continue.',
    purpose: 'helper_agreement_confirmation',
    requireCurrentInbound: false,
  });
  return result.sent === true;
}

function whatsappGeminiVertexConfig() {
  const projectId = String(
    process.env.GCLOUD_PROJECT
      || process.env.GOOGLE_CLOUD_PROJECT
      || admin.app().options.projectId
      || '',
  ).trim();
  return {
    geminiProjectId: projectId,
    geminiLocation: String(process.env.GEMINI_LOCATION || 'global').trim(),
  };
}

function whatsappMessagingEnabled() {
  return isWhatsAppMessagingEnabled(process.env);
}

function whatsappMediaEnabled() {
  return isWhatsAppMediaEnabled(process.env);
}

function whatsappImageInterpretationEnabled() {
  return isWhatsAppImageInterpretationEnabled(process.env);
}

function whatsappCancellationEnabled() {
  return isWhatsAppCancellationEnabled(process.env);
}

function whatsappTranscriptionEnabled() {
  return isWhatsAppTranscriptionEnabled(process.env);
}

function requestPaymentsEnabled() {
  return String(process.env.REQUEST_PAYMENTS_ENABLED || '').trim().toLowerCase() === 'true';
}

function helperWalletEnabled() {
  return String(process.env.HELPER_WALLET_ENABLED || '').trim().toLowerCase() === 'true';
}

function explicitPaymentSelectionEnabled() {
  return String(process.env.EXPLICIT_PAYMENT_SELECTION_ENABLED || '').trim().toLowerCase() === 'true';
}

function whatsappPaymentsEnabled() {
  return requestPaymentsEnabled()
    && whatsappMessagingEnabled()
    && String(process.env.WHATSAPP_PAYMENTS_ENABLED || '').trim().toLowerCase() === 'true';
}

async function consumeWhatsAppAiRateLimit(identityId, now = Date.now()) {
  const minuteBucket = Math.floor(now / 60000);
  const dayBucket = new Date(now).toISOString().slice(0, 10);
  const rateRef = db.collection('whatsappRateLimits').doc(identityId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(rateRef);
    const previous = snapshot.data() || {};
    const minuteCount = Number(previous.minuteBucket) === minuteBucket ? Number(previous.minuteCount || 0) : 0;
    const dayCount = String(previous.dayBucket || '') === dayBucket ? Number(previous.dayCount || 0) : 0;
    if (minuteCount >= 8 || dayCount >= 100) return false;
    transaction.set(rateRef, {
      minuteBucket,
      minuteCount: minuteCount + 1,
      dayBucket,
      dayCount: dayCount + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
}

async function consumeWhatsAppToolRateLimit(identityId, now = Date.now()) {
  const minuteBucket = Math.floor(now / 60000);
  const dayBucket = new Date(now).toISOString().slice(0, 10);
  const rateRef = db.collection('whatsappToolRateLimits').doc(identityId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(rateRef);
    const previous = snapshot.data() || {};
    const minuteCount = Number(previous.minuteBucket) === minuteBucket ? Number(previous.minuteCount || 0) : 0;
    const dayCount = String(previous.dayBucket || '') === dayBucket ? Number(previous.dayCount || 0) : 0;
    if (minuteCount >= 4 || dayCount >= 40) return false;
    transaction.set(rateRef, {
      minuteBucket, minuteCount: minuteCount + 1, dayBucket, dayCount: dayCount + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      retentionExpiresAtMs: now + 2 * 24 * 60 * 60 * 1000,
    }, { merge: true });
    return true;
  });
}

async function deleteExpiredWhatsAppCollectionDocuments(collectionName, now, limit = 300) {
  const snapshot = await db.collection(collectionName).where('retentionExpiresAtMs', '<=', now).limit(limit).get();
  if (snapshot.empty) return 0;
  const batch = db.batch();
  let deletions = 0;
  for (const document of snapshot.docs) {
    if (collectionName === 'whatsappMessages') {
      const message = document.data() || {};
      const ticketId = String(message.ticketId || message.supportTicketId || '').trim();
      if (ticketId) {
        const ticketSnapshot = await db.collection('supportTickets').doc(ticketId).get();
        if (shouldDeleteConversationMessage(message, ticketSnapshot.exists ? ticketSnapshot.data()?.status || '' : null)) batch.delete(document.ref);
        else continue;
      } else batch.delete(document.ref);
    } else batch.delete(document.ref);
    deletions += 1;
  }
  if (deletions) await batch.commit();
  return deletions;
}

async function cleanupExpiredWhatsAppMedia(now, limit = 100) {
  const snapshot = await db.collection('whatsappMediaAssets').where('retentionExpiresAtMs', '<=', now).limit(limit).get();
  let deleted = 0;
  for (const document of snapshot.docs) {
    const assetRef = document.ref;
    const initial = document.data() || {};
    const path = String(initial.storagePath || '');
    if (!path.startsWith('whatsapp-private/')) continue;
    const ticketId = String(initial.supportTicketId || '').trim();
    let effectiveExpiry = Number(initial.retentionExpiresAtMs || 0);
    if (ticketId) {
      const ticketSnapshot = await db.collection('supportTickets').doc(ticketId).get();
      if (!ticketSnapshot.exists) {
        // A missing ticket may have been deleted through an approved privacy cleanup.
      } else {
        const ticket = ticketSnapshot.data() || {};
        if (!['closed', 'resolved'].includes(String(ticket.status || '').toLowerCase())) continue;
        effectiveExpiry = Number(ticket.retentionExpiresAtMs || 0);
      }
    }
    if (!effectiveExpiry || effectiveExpiry > now) continue;
    const claim = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(assetRef);
      if (!current.exists) return false;
      const asset = current.data() || {};
      if (String(asset.storagePath || '') !== path || String(asset.status || '') !== 'stored'
        || Number(asset.retentionExpiresAtMs || 0) > now) return false;
      transaction.set(assetRef, { status: 'deleting', cleanupClaimedAtMs: now }, { merge: true });
      return true;
    });
    if (!claim) continue;
    try {
      await admin.storage().bucket().file(path).delete({ ignoreNotFound: true });
      await assetRef.delete();
      deleted += 1;
    } catch (error) {
      await assetRef.set({ status: 'stored', cleanupFailedAtMs: now, cleanupErrorCode: String(error?.code || 'storage-delete-failed').slice(0, 60) }, { merge: true }).catch(() => null);
      logger.warn('whatsapp_media_retention_delete_failed', { assetId: document.id, errorCode: String(error?.code || 'storage-delete-failed').slice(0, 60) });
    }
  }
  return deleted;
}

async function cleanupClosedWhatsAppSupportTickets(now, limit = 50) {
  const snapshot = await db.collection('supportTickets').where('retentionExpiresAtMs', '<=', now).limit(limit).get();
  let deleted = 0;
  for (const ticketDoc of snapshot.docs) {
    const ticket = ticketDoc.data() || {};
    if (!['closed', 'resolved'].includes(String(ticket.status || '').toLowerCase())) continue;
    const messages = await ticketDoc.ref.collection('messages').limit(401).get();
    const batch = db.batch();
    for (const message of messages.docs.slice(0, 400)) batch.delete(message.ref);
    if (messages.size <= 400) batch.delete(ticketDoc.ref);
    if (!messages.empty || messages.size <= 400) await batch.commit();
    if (messages.size <= 400) deleted += 1;
  }
  return deleted;
}

async function clearExpiredWhatsAppConversationMemory(now) {
  const cutoff = now - retentionDays(process.env, 'WHATSAPP_MESSAGE_RETENTION_DAYS') * 24 * 60 * 60 * 1000;
  const snapshot = await db.collection('whatsappConversations').where('lastInboundMessageAtMs', '<=', cutoff).limit(100).get();
  let cleared = 0;
  for (const document of snapshot.docs) {
    const conversation = document.data() || {};
    if (conversation.humanHandoff === true || conversation.activeDraftId || conversation.activeServiceRequestId || conversation.activeSupportTicketId) continue;
    await db.runTransaction(async (transaction) => {
      const currentSnapshot = await transaction.get(document.ref);
      const current = currentSnapshot.data() || {};
      if (!currentSnapshot.exists || current.humanHandoff === true || current.activeDraftId || current.activeServiceRequestId || current.activeSupportTicketId
        || Number(current.lastInboundMessageAtMs || 0) > cutoff) return;
      transaction.set(document.ref, {
        recentHistory: [],
        conversationSummary: {},
        memoryClearedAtMs: now,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      cleared += 1;
    });
  }
  return cleared;
}

exports.cleanupWhatsAppRetention = onSchedule({
  schedule: 'every day 03:15',
  timeZone: 'Africa/Johannesburg',
  maxInstances: 1,
  ...HALF_CPU_OPTIONS,
  memory: '256MiB',
  timeoutSeconds: 300,
}, async () => {
  if (String(process.env.WHATSAPP_RETENTION_CLEANUP_ENABLED || '').trim().toLowerCase() !== 'true') {
    logger.info('whatsapp_retention_cleanup_disabled');
    return;
  }
  const now = Date.now();
  const counts = {};
  for (const collectionName of [
    'whatsappWebhookEvents', 'whatsappAssistantJobs', 'whatsappMessageStatuses',
    'whatsappToolExecutions', 'whatsappToolRateLimits', 'whatsappRateLimits',
    'whatsappAuthChallenges', 'whatsappProfileChangeRequests', 'whatsappMessages',
  ]) {
    counts[collectionName] = await deleteExpiredWhatsAppCollectionDocuments(collectionName, now, 300);
  }
  counts.mediaAssets = await cleanupExpiredWhatsAppMedia(now, 100);
  counts.supportTickets = await cleanupClosedWhatsAppSupportTickets(now, 50);
  counts.conversationMemories = await clearExpiredWhatsAppConversationMemory(now);
  logger.info('whatsapp_retention_cleanup_completed', counts);
});

async function expirePendingHelperPoliceClearances(nowMs, limit = 100) {
  const snapshot = await db.collection('helperPoliceClearanceSubmissions')
    .where('reviewDeadlineAtMs', '<=', nowMs)
    .limit(limit)
    .get();
  let expired = 0;
  for (const submissionSnapshot of snapshot.docs) {
    const submissionRef = submissionSnapshot.ref;
    const initial = submissionSnapshot.data() || {};
    if (String(initial.status || '') !== 'pending') continue;
    const helperUid = String(initial.helperUid || '').trim();
    const submissionId = String(initial.submissionId || submissionSnapshot.id);
    if (!helperUid || !/^[a-f0-9]{64}$/.test(submissionId)) continue;
    const recordRef = db.collection('helperPoliceClearanceRecords').doc(helperUid);
    const profileRef = db.collection('users').doc(helperUid);
    const auditRef = db.collection('auditEvents').doc(stableEventId(`helper-police-clearance-expired:${submissionId}`));
    const didExpire = await db.runTransaction(async (transaction) => {
      const [currentSubmission, currentRecord, currentProfile, auditSnapshot] = await Promise.all([
        transaction.get(submissionRef), transaction.get(recordRef), transaction.get(profileRef),
        transaction.get(auditRef),
      ]);
      const submission = currentSubmission.data() || {};
      if (!currentSubmission.exists || String(submission.status || '') !== 'pending'
        || Number(submission.reviewDeadlineAtMs || 0) > nowMs) return false;
      const now = admin.firestore.FieldValue.serverTimestamp();
      transaction.set(submissionRef, { status: 'expired', expiredAtMs: nowMs, updatedAt: now }, { merge: true });
      if (String(currentRecord.data()?.currentSubmissionId || '') === submissionId) {
        transaction.set(recordRef, { status: 'expired', updatedAt: now }, { merge: true });
        if (currentProfile.exists) transaction.set(profileRef, { policeClearanceStatus: 'expired', updatedAt: now }, { merge: true });
      }
      if (!auditSnapshot.exists) transaction.create(auditRef, {
        eventType: 'helper_police_clearance_review_window_expired', helperUid, submissionId,
        reviewDeadlineAtMs: Number(submission.reviewDeadlineAtMs || 0), createdAt: now,
      });
      return true;
    });
    if (didExpire) expired += 1;
  }
  return expired;
}

exports.expirePendingHelperPoliceClearances = onSchedule({
  schedule: 'every day 03:30',
  timeZone: 'Africa/Johannesburg',
  maxInstances: 1,
  ...HALF_CPU_OPTIONS,
  memory: '256MiB',
  timeoutSeconds: 300,
}, async () => {
  const count = await expirePendingHelperPoliceClearances(Date.now(), 100);
  logger.info('helper_police_clearance_review_deadlines_processed', { expired: count });
});

function getWhatsAppMetaClient() {
  if (!whatsappMessagingEnabled()) throw new Error('WhatsApp messaging is disabled.');
  const secrets = getWhatsAppSecrets();
  return {
    secrets,
    client: createMetaWhatsAppClient({
      accessToken: secrets.accessToken,
      phoneNumberId: secrets.phoneNumberId,
      graphApiVersion: secrets.graphApiVersion,
      approvedTemplateNames: secrets.approvedTemplateNames,
      requestTimeoutMs: process.env.WHATSAPP_META_SEND_TIMEOUT_MS,
      isRecipientAllowed: (recipient) => isWhatsAppRecipientAllowed(recipient, process.env),
    }),
  };
}

async function processWhatsAppInboundMedia({ identityId, eventId, identity, conversation, inbound }) {
  if (!whatsappMediaEnabled()) return { code: 'disabled' };
  if (String(process.env.WHATSAPP_MEDIA_RETENTION_ENFORCED || '').trim().toLowerCase() !== 'true'
    || String(process.env.WHATSAPP_RETENTION_CLEANUP_ENABLED || '').trim().toLowerCase() !== 'true'
    || String(process.env.WHATSAPP_STORAGE_RETENTION_POLICY_VERIFIED || '').trim().toLowerCase() !== 'true') {
    return { code: 'retention-not-configured' };
  }
  const mediaType = ({ image: 'image', audio: 'audio', document: 'document' })[String(inbound?.type || '').toLowerCase()];
  if (!mediaType || !inbound?.media?.mediaId) return { code: 'unsupported' };

  const assetId = stableEventId(`media:${eventId}`);
  const assetRef = db.collection('whatsappMediaAssets').doc(assetId);
  const existingAsset = await assetRef.get();
  if (existingAsset.exists) {
    const asset = existingAsset.data() || {};
    if (String(asset.identityId || '') !== identityId || String(asset.sourceEventId || '') !== eventId
      || !String(asset.storagePath || '').startsWith('whatsapp-private/')) return { code: 'conflict' };
    const [buffer] = await admin.storage().bucket().file(asset.storagePath).download();
    return { code: 'stored', assetId, asset, buffer, mediaType: asset.mediaType, mimeType: asset.mimeType, storagePath: asset.storagePath, duplicate: true };
  }

  const { secrets } = getWhatsAppMetaClient();
  const media = await downloadMetaMedia({
    mediaId: inbound.media.mediaId,
    mediaType,
    mimeType: inbound.media.mimeType,
    sha256: inbound.media.sha256,
    accessToken: secrets.accessToken,
    graphApiVersion: secrets.graphApiVersion,
  });

  let requestId = '';
  let draftId = '';
  let supportTicketId = '';
  if (conversation.activeServiceRequestId) {
    const requestAccess = await getWhatsAppRequestForIdentity({ db, identity, requestId: conversation.activeServiceRequestId });
    if (requestAccess.code === 'found') requestId = requestAccess.request.id;
  }
  if (conversation.activeDraftId) {
    const candidate = String(conversation.activeDraftId || '').trim();
    const draftSnapshot = await db.collection('serviceRequestDrafts').doc(candidate).get();
    if (draftSnapshot.exists && String(draftSnapshot.data()?.identityId || '') === identityId) draftId = candidate;
  }
  if (conversation.activeSupportTicketId) {
    const candidate = String(conversation.activeSupportTicketId || '').trim();
    const ticketSnapshot = await db.collection('supportTickets').doc(candidate).get();
    if (ticketSnapshot.exists && String(ticketSnapshot.data()?.identityId || '') === identityId) supportTicketId = candidate;
  }

  const stored = await storeWhatsAppMedia({
    storageBucket: admin.storage().bucket(),
    media,
    identityId,
    eventId,
    requestId,
    supportTicketId,
    retentionEnforced: true,
    retentionDays: retentionDays(process.env, 'WHATSAPP_MEDIA_RETENTION_DAYS'),
  });
  const draftRef = draftId ? db.collection('serviceRequestDrafts').doc(draftId) : null;
  const ticketRef = supportTicketId ? db.collection('supportTickets').doc(supportTicketId) : null;
  try {
    await db.runTransaction(async (transaction) => {
      const reads = [transaction.get(assetRef)];
      if (draftRef) reads.push(transaction.get(draftRef));
      if (ticketRef) reads.push(transaction.get(ticketRef));
      const snapshots = await Promise.all(reads);
      const assetSnapshot = snapshots[0];
      if (assetSnapshot.exists) return;
      let index = 1;
      const currentDraft = draftRef ? snapshots[index++] : null;
      const currentTicket = ticketRef ? snapshots[index] : null;
      const draftIsOwned = Boolean(currentDraft?.exists && String(currentDraft.data()?.identityId || '') === identityId);
      const ticketIsOwned = Boolean(currentTicket?.exists && String(currentTicket.data()?.identityId || '') === identityId);
      transaction.create(assetRef, {
        assetId,
        identityId,
        sourceEventId: eventId,
        storagePath: stored.path,
        mediaType: media.mediaType,
        mimeType: media.mimeType,
        size: media.size,
        requestId: requestId || null,
        draftId: draftIsOwned ? draftId : null,
        supportTicketId: ticketIsOwned ? supportTicketId : null,
        status: 'stored',
        retentionExpiresAtMs: retentionExpiryMs(process.env, 'WHATSAPP_MEDIA_RETENTION_DAYS'),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (draftIsOwned) transaction.set(draftRef, {
        mediaAssetIds: admin.firestore.FieldValue.arrayUnion(assetId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  } catch (error) {
    // The private object has already been uploaded. Keep a deterministic
    // retention record if draft/ticket association failed, so it is not orphaned.
    await assetRef.set({
      assetId, identityId, sourceEventId: eventId, storagePath: stored.path,
      mediaType: media.mediaType, mimeType: media.mimeType, size: media.size,
      requestId: requestId || null, draftId: draftId || null, supportTicketId: supportTicketId || null,
      status: 'stored', cleanupAfterAssociationFailure: true,
      retentionExpiresAtMs: retentionExpiryMs(process.env, 'WHATSAPP_MEDIA_RETENTION_DAYS'),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }).catch((recordError) => {
      logger.error('whatsapp_media_retention_record_failed', { assetId, errorCode: String(recordError?.code || 'firestore-write-failed').slice(0, 80) });
    });
    throw error;
  }
  return {
    code: 'stored', assetId, requestId, draftId, supportTicketId,
    mediaType: media.mediaType, mimeType: media.mimeType, size: media.size,
    buffer: media.buffer, storagePath: stored.path, duplicate: stored.duplicate,
  };
}

function helperPoliceClearanceUploadReady() {
  return whatsappMessagingEnabled()
    && whatsappOnboardingEnabled()
    && isPoliceClearanceUploadConfigured(process.env);
}

async function scrubWhatsAppPoliceClearanceInbound(eventId) {
  const removeSensitiveMediaMetadata = {
    'media.mediaId': admin.firestore.FieldValue.delete(),
    'media.sha256': admin.firestore.FieldValue.delete(),
    'media.filename': admin.firestore.FieldValue.delete(),
    'media.caption': admin.firestore.FieldValue.delete(),
  };
  await Promise.all([
    db.collection('whatsappMessages').doc(eventId).update(removeSensitiveMediaMetadata).catch(() => null),
    db.collection('whatsappWebhookEvents').doc(eventId).update(removeSensitiveMediaMetadata).catch(() => null),
  ]);
}

async function receiveWhatsAppPoliceClearance({ uid, identityId, eventId, inbound }) {
  if (!helperPoliceClearanceUploadReady()) return { code: 'disabled' };
  const descriptor = normalizePoliceClearanceInbound(inbound);
  if (!descriptor) return { code: 'unsupported' };
  const reviewValidityDays = policeClearanceReviewValidityDays(process.env);
  if (!reviewValidityDays) return { code: 'review-validity-not-configured' };
  const submissionId = policeClearanceSubmissionId(uid, eventId);
  const submissionRef = db.collection('helperPoliceClearanceSubmissions').doc(submissionId);
  const recordRef = db.collection('helperPoliceClearanceRecords').doc(uid);
  const identityRef = db.collection('whatsappIdentities').doc(identityId);
  const userLinkRef = db.collection('whatsappUserLinks').doc(uid);
  const profileRef = db.collection('users').doc(uid);
  const conversationRef = db.collection('whatsappConversations').doc(identityId);
  const auditRef = db.collection('auditEvents').doc(stableEventId(`helper-police-clearance-upload:${submissionId}`));
  const objectPath = policeClearanceStoragePath(uid, eventId, descriptor.extension);

  const reservation = await db.runTransaction(async (transaction) => {
    const [identitySnapshot, linkSnapshot, profileSnapshot, conversationSnapshot, recordSnapshot, submissionSnapshot] = await Promise.all([
      transaction.get(identityRef), transaction.get(userLinkRef), transaction.get(profileRef),
      transaction.get(conversationRef), transaction.get(recordRef), transaction.get(submissionRef),
    ]);
    if (submissionSnapshot.exists) {
      const existing = submissionSnapshot.data() || {};
      if (String(existing.helperUid || '') !== uid || String(existing.sourceEventId || '') !== eventId) return { code: 'conflict' };
      if (existing.status === 'uploading') return { code: 'resume' };
      return { code: existing.status === 'pending' ? 'duplicate' : 'already-processed', status: existing.status };
    }

    const identity = identitySnapshot.data() || {};
    const userLink = linkSnapshot.data() || {};
    const profile = profileSnapshot.data() || {};
    const conversation = conversationSnapshot.data() || {};
    const currentRecord = recordSnapshot.data() || {};
    let senderPhoneHash = '';
    let profilePhoneMatches = false;
    try {
      const senderPhone = normalizeWhatsAppIdentityPhone(`+${String(identity.waId || '')}`).phoneNumber;
      senderPhoneHash = createHash('sha256').update(senderPhone).digest('hex');
      profilePhoneMatches = normalizeWhatsAppIdentityPhone(String(profile.whatsappPhoneNumber || '')).phoneNumber === senderPhone;
    } catch (_) {
      return { code: 'helper-identity-required' };
    }
    if (!identitySnapshot.exists || !profileSnapshot.exists || !isHelperUserRecord(profile)
      || String(identity.linkedFirebaseUid || '') !== uid || String(identity.role || '').toLowerCase() !== 'helper'
      || !normalizeTimestamp(identity.verifiedAt) || !normalizeTimestamp(profile.whatsappVerifiedAt)
      || String(userLink.uid || '') !== uid || String(userLink.identityId || '') !== identityId
      || String(userLink.phoneHash || '') !== senderPhoneHash || !profilePhoneMatches) {
      return { code: 'helper-identity-required' };
    }
    if (String(conversation.lastInboundEventId || '') !== eventId
      || String(conversation.whatsappOnboarding?.stage || '') !== 'awaiting_helper_police_clearance') {
      return { code: 'not-current-onboarding-step' };
    }
    const currentStatus = normalizePoliceClearanceStatus(currentRecord.status || profile.policeClearanceStatus);
    if (['pending', 'uploading', 'approved'].includes(currentStatus)) return { code: 'already-in-review-or-approved', status: currentStatus };

    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.create(submissionRef, {
      submissionId,
      helperUid: uid,
      identityId,
      sourceEventId: eventId,
      status: 'uploading',
      mimeType: descriptor.mimeType,
      storagePath: objectPath,
      createdAtMs: Date.now(),
      createdAt: now,
    });
    transaction.set(recordRef, {
      helperUid: uid,
      currentSubmissionId: submissionId,
      status: 'uploading',
      updatedAt: now,
    }, { merge: true });
    transaction.set(profileRef, { policeClearanceStatus: 'uploading', updatedAt: now }, { merge: true });
    transaction.set(conversationRef, {
      whatsappOnboarding: { stage: 'awaiting_helper_police_clearance_review', updatedAtMs: Date.now() },
      currentMode: 'onboarding', updatedAt: now,
    }, { merge: true });
    transaction.create(auditRef, {
      eventType: 'helper_police_clearance_uploaded',
      helperUid: uid,
      submissionId,
      sourceEventId: eventId,
      createdAt: now,
    });
    return { code: 'reserved' };
  });

  if (!['reserved', 'resume'].includes(reservation.code)) return reservation;

  let stored;
  try {
    const { secrets } = getWhatsAppMetaClient();
    const media = await downloadMetaMedia({
      mediaId: inbound.media.mediaId,
      mediaType: descriptor.mediaType,
      mimeType: descriptor.mimeType,
      sha256: inbound.media.sha256,
      accessToken: secrets.accessToken,
      graphApiVersion: secrets.graphApiVersion,
    });
    if (media.size > descriptor.maxBytes || media.mimeType !== descriptor.mimeType) {
      throw new Error('Police-clearance document validation failed.');
    }
    stored = await storePoliceClearanceObject({
      storageBucket: admin.storage().bucket(), uid, eventId, media,
    });

    const finalized = await db.runTransaction(async (transaction) => {
      const [identitySnapshot, linkSnapshot, profileSnapshot, conversationSnapshot, recordSnapshot, submissionSnapshot] = await Promise.all([
        transaction.get(identityRef), transaction.get(userLinkRef), transaction.get(profileRef),
        transaction.get(conversationRef), transaction.get(recordRef), transaction.get(submissionRef),
      ]);
      const identity = identitySnapshot.data() || {};
      const link = linkSnapshot.data() || {};
      const profile = profileSnapshot.data() || {};
      const conversation = conversationSnapshot.data() || {};
      const record = recordSnapshot.data() || {};
      const submission = submissionSnapshot.data() || {};
      let senderPhoneMatches = false;
      try {
        const senderPhone = normalizeWhatsAppIdentityPhone(`+${String(identity.waId || '')}`).phoneNumber;
        senderPhoneMatches = normalizeWhatsAppIdentityPhone(String(profile.whatsappPhoneNumber || '')).phoneNumber === senderPhone
          && String(link.phoneHash || '') === createHash('sha256').update(senderPhone).digest('hex');
      } catch (_) {
        senderPhoneMatches = false;
      }
      if (!identitySnapshot.exists || !profileSnapshot.exists || !submissionSnapshot.exists
        || String(identity.linkedFirebaseUid || '') !== uid || String(identity.role || '').toLowerCase() !== 'helper'
        || !normalizeTimestamp(identity.verifiedAt) || String(link.uid || '') !== uid
        || String(link.identityId || '') !== identityId || !normalizeTimestamp(profile.whatsappVerifiedAt)
        || !senderPhoneMatches
        || String(record.currentSubmissionId || '') !== submissionId
        || String(submission.status || '') !== 'uploading'
        || String(conversation.whatsappOnboarding?.stage || '') !== 'awaiting_helper_police_clearance_review') {
        return { code: 'state-changed' };
      }
      const uploadedAtMs = Date.now();
      const reviewDeadlineAtMs = clearanceReviewDeadlineMs(uploadedAtMs, reviewValidityDays);
      if (!reviewDeadlineAtMs) return { code: 'review-validity-invalid' };
      const now = admin.firestore.FieldValue.serverTimestamp();
      transaction.set(submissionRef, {
        status: 'pending',
        mimeType: media.mimeType,
        size: media.size,
        storagePath: stored.path,
        uploadedAtMs,
        uploadedAt: now,
        reviewValidityDays,
        reviewDeadlineAtMs,
        updatedAt: now,
      }, { merge: true });
      transaction.set(recordRef, {
        status: 'pending',
        currentSubmissionId: submissionId,
        updatedAt: now,
        reviewDeadlineAtMs,
      }, { merge: true });
      transaction.set(profileRef, { policeClearanceStatus: 'pending', updatedAt: now }, { merge: true });
      return { code: 'submitted' };
    });
    if (finalized.code !== 'submitted') {
      const current = await submissionRef.get();
      if (String(current.data()?.status || '') !== 'pending') {
        throw Object.assign(new Error('Police-clearance onboarding state changed during upload.'), { code: 'helper_clearance_state_changed' });
      }
    }
    await scrubWhatsAppPoliceClearanceInbound(eventId);
    return { code: 'submitted', duplicate: stored.duplicate === true };
  } catch (error) {
    if (stored?.path) {
      const current = await submissionRef.get().catch(() => null);
      const currentSubmission = current?.data() || {};
      if (current?.exists && String(currentSubmission.status || '') === 'pending'
        && String(currentSubmission.storagePath || '') === stored.path) {
        await scrubWhatsAppPoliceClearanceInbound(eventId);
        return { code: 'submitted', duplicate: true };
      }
    }
    await db.runTransaction(async (transaction) => {
      const [submissionSnapshot, recordSnapshot, profileSnapshot, conversationSnapshot] = await Promise.all([
        transaction.get(submissionRef), transaction.get(recordRef), transaction.get(profileRef), transaction.get(conversationRef),
      ]);
      const submission = submissionSnapshot.data() || {};
      const record = recordSnapshot.data() || {};
      if (!submissionSnapshot.exists || String(record.currentSubmissionId || '') !== submissionId
        || String(submission.status || '') !== 'uploading') return;
      const now = admin.firestore.FieldValue.serverTimestamp();
      transaction.set(submissionRef, { status: 'failed', errorCode: String(error?.code || 'media_processing_failed').slice(0, 80), updatedAt: now }, { merge: true });
      transaction.set(recordRef, { status: 'failed', updatedAt: now }, { merge: true });
      transaction.set(profileRef, { policeClearanceStatus: 'failed', updatedAt: now }, { merge: true });
      if (conversationSnapshot.exists) transaction.set(conversationRef, {
        whatsappOnboarding: { stage: 'awaiting_helper_police_clearance', updatedAtMs: Date.now() },
        currentMode: 'onboarding', updatedAt: now,
      }, { merge: true });
    }).catch(() => null);
    if (stored?.path) {
      await db.collection('auditEvents').doc(stableEventId(`helper-police-clearance-preserved-after-upload-error:${submissionId}`)).set({
        eventType: 'helper_police_clearance_file_preserved_after_upload_error',
        helperUid: uid,
        submissionId,
        storagePath: stored.path,
        errorCode: String(error?.code || 'media_processing_failed').slice(0, 80),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }).catch(() => null);
    }
    logger.warn('whatsapp_helper_police_clearance_upload_failed', {
      submissionId,
      errorCode: String(error?.code || 'media_processing_failed').slice(0, 80),
    });
    await scrubWhatsAppPoliceClearanceInbound(eventId);
    return { code: 'failed' };
  }
}

async function associateWhatsAppMediaWithSupportTicket({ assetId, identityId, ticketId }) {
  if (!assetId || !identityId || !ticketId) return false;
  const assetRef = db.collection('whatsappMediaAssets').doc(String(assetId));
  const ticketRef = db.collection('supportTickets').doc(String(ticketId));
  return db.runTransaction(async (transaction) => {
    const [assetSnapshot, ticketSnapshot] = await Promise.all([transaction.get(assetRef), transaction.get(ticketRef)]);
    if (!assetSnapshot.exists || !ticketSnapshot.exists || String(assetSnapshot.data()?.status || '') !== 'stored') return false;
    if (String(assetSnapshot.data()?.identityId || '') !== identityId
      || String(ticketSnapshot.data()?.identityId || '') !== identityId) return false;
    transaction.set(assetRef, { supportTicketId: ticketId, associatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
}

async function applyWhatsAppDeliveryStatusToMessage(messageRef, statusEvent) {
  await db.runTransaction(async (transaction) => {
    const messageSnap = await transaction.get(messageRef);
    if (!messageSnap.exists) return;
    const message = messageSnap.data() || {};
    if (!shouldApplyDeliveryStatus(message, statusEvent)) return;
    const ticketMessageId = message.ticketId && message.replyId ? `admin_${String(message.replyId)}` : '';
    const ticketMessageRef = ticketMessageId
      ? db.collection('supportTickets').doc(String(message.ticketId)).collection('messages').doc(ticketMessageId)
      : null;
    const ticketMessageSnapshot = ticketMessageRef ? await transaction.get(ticketMessageRef) : null;
    transaction.update(messageRef, {
      status: statusEvent.status,
      deliveryStatus: statusEvent.status,
      statusTimestampMs: statusEvent.timestampMs,
      statusErrors: statusEvent.errors || [],
      statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    if (ticketMessageSnapshot?.exists) transaction.set(ticketMessageRef, {
      deliveryStatus: statusEvent.status,
      statusTimestampMs: statusEvent.timestampMs,
      statusErrors: statusEvent.errors || [],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function reconcileWhatsAppDeliveryStatuses({ metaMessageId, recipientId, messageRef }) {
  const id = String(metaMessageId || '').trim();
  if (!id || !recipientId || !messageRef) return;
  const statuses = await db.collection('whatsappMessageStatuses')
    .where('messageId', '==', id).limit(10).get();
  const relevant = statuses.docs
    .map((doc) => doc.data() || {})
    .filter((statusEvent) => String(statusEvent.recipientId || '') === String(recipientId))
    .sort((left, right) => Number(left.timestampMs || 0) - Number(right.timestampMs || 0));
  for (const statusEvent of relevant) await applyWhatsAppDeliveryStatusToMessage(messageRef, statusEvent);
}

function getWhatsAppQuestionnaireServices(service, catalog) {
  const includedIds = Array.isArray(service?.includedServiceIds) ? service.includedServiceIds : [];
  return catalog.filter((item) => item.id === service.id || includedIds.includes(item.id));
}

function getWhatsAppServiceIds(service) {
  const includedIds = Array.isArray(service?.includedServiceIds) ? service.includedServiceIds : [];
  return includedIds.length ? includedIds : [service.id];
}

function renderWhatsAppCatalog(catalog, { includePricing = false } = {}) {
  return formatWhatsAppServiceList(catalog, { includePricing });
}

async function persistWhatsAppAssistantReply({ sourceEventId, identityId, identity, conversationRef, text, interactive = null, requireCurrentInbound = true, purpose = 'assistant_reply' }) {
  const recipient = String(identity?.waId || '').trim();
  const phoneNumberId = String(identity?.phoneNumberId || '').trim();
  const formattedText = formatWhatsAppText(text);
  const formattedInteractive = interactive ? {
    ...interactive,
    ...(interactive.body ? { body: { ...interactive.body, text: formatWhatsAppText(interactive.body.text || '') } } : {}),
  } : null;
  const stage = async (failureStage, operation) => {
    try {
      return await operation();
    } catch (error) {
      throw withWhatsAppFailureStage(error, failureStage);
    }
  };
  const conversationSnapshot = await stage('read_conversation_state', () => conversationRef.get());
  const lastInboundAtMs = Number(conversationSnapshot.data()?.lastInboundMessageAtMs || 0);
  const outboundId = stableEventId(`assistant-reply:${sourceEventId}`);
  const outboundRef = db.collection('whatsappMessages').doc(outboundId);
  const claim = await stage('claim_outbound_record', () => db.runTransaction(async (transaction) => {
    const [existing, conversationSnapshot] = await Promise.all([transaction.get(outboundRef), transaction.get(conversationRef)]);
    if (existing.exists) return { claimed: false, stale: false };
    if (!conversationSnapshot.exists
      || (requireCurrentInbound && String(conversationSnapshot.data()?.lastInboundEventId || '') !== sourceEventId)) {
      return { claimed: false, stale: true };
    }
    transaction.create(outboundRef, {
      eventId: outboundId,
      sourceEventId,
      identityId,
      phoneNumberId,
      to: recipient,
      direction: 'outbound',
      type: formattedInteractive ? 'interactive' : 'text',
      text: formattedText,
      status: 'sending',
      createdAtMs: Date.now(),
      retentionExpiresAtMs: Date.now() + whatsappRetentionDays('WHATSAPP_MESSAGE_RETENTION_DAYS', 180) * 24 * 60 * 60 * 1000,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { claimed: true, stale: false };
  }));
  if (!claim.claimed) return { sent: false, duplicate: !claim.stale, stale: claim.stale };

  let failureStage = 'create_meta_client';
  try {
    const { secrets, client } = getWhatsAppMetaClient();
    failureStage = 'validate_sender_identity';
    if (phoneNumberId !== secrets.phoneNumberId) {
      const error = new Error('WhatsApp sender number does not match configured phone number.');
      error.code = 'meta_sender_number_mismatch';
      throw error;
    }
    failureStage = 'meta_send_request';
    const delivery = formattedInteractive
      ? await client.sendInteractive({ to: recipient, interactive: formattedInteractive, lastInboundAtMs })
      : await client.sendText({ to: recipient, text: formattedText, lastInboundAtMs });
    failureStage = 'record_meta_acceptance';
    await outboundRef.set({
      status: 'sent',
      metaMessageId: delivery.messageId || null,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    failureStage = 'reconcile_delivery_status';
    await reconcileWhatsAppDeliveryStatuses({ metaMessageId: delivery.messageId, recipientId: recipient, messageRef: outboundRef });
    failureStage = 'persist_conversation_memory';
    await db.runTransaction(async (transaction) => {
      const conversationSnap = await transaction.get(conversationRef);
      const conversation = conversationSnap.data() || {};
      const memory = appendBoundedConversationTurn({
        recentHistory: conversation.recentHistory,
        conversationSummary: conversation.conversationSummary || {},
        turn: { role: 'assistant', text: formattedText, timestampMs: Date.now() },
      });
      transaction.set(conversationRef, {
        recentHistory: memory.recentHistory,
        conversationSummary: memory.conversationSummary,
        lastMessageAtMs: Date.now(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    return { sent: true };
  } catch (error) {
    const taggedError = withWhatsAppFailureStage(error, failureStage);
    const diagnostics = buildWhatsAppSendFailureDiagnostics(taggedError);
    const deliveryStatus = classifyMetaDeliveryError(taggedError);
    await outboundRef.set({
      status: deliveryStatus,
      deliveryStatus,
      ...diagnostics,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }).catch(() => null);
    if (purpose !== 'assistant_failure_fallback') {
      logger.warn('whatsapp_outbound_send_failed', { purpose, deliveryStatus, ...diagnostics });
    }
    throw taggedError;
  }
}

async function relayWhatsAppText({ eventId, identityId, identity, conversation, inbound, conversationRef }) {
  const requestId = String(conversation.activeServiceRequestId || '').trim();
  if (!requestId) return { handled: false };
  if (String(inbound?.type || '').toLowerCase() !== 'text') return { handled: true, code: 'media-not-supported' };
  const requestRef = db.collection('serviceRequests').doc(requestId);
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists) return { handled: false };
  const request = requestSnap.data() || {};
  const helperId = String(request.helperAssignment?.helperId || '').trim();
  if (!helperId || !isWhatsAppRelayRequestOpen(request)) {
    return { handled: false };
  }
  const senderRole = String(identity.role || (identity.guestPrincipalId ? 'customer' : '')).toLowerCase();
  const senderUid = String(identity.linkedFirebaseUid || '').trim();
  const customerId = String(request.customerId || '').trim();
  const guestOwnerUid = senderRole === 'customer' && senderUid && customerId.startsWith('guest_')
    ? String((await db.collection('whatsappGuestOwnership').doc(customerId).get()).data()?.uid || '')
    : '';
  if (!canAccessWhatsAppRequest({ request, identity, guestOwnerUid })) {
    return { handled: false };
  }

  let recipientIdentityId = '';
  if (senderRole === 'customer') {
    const helperLink = await db.collection('whatsappUserLinks').doc(helperId).get();
    recipientIdentityId = String(helperLink.data()?.identityId || '').trim();
  } else {
    recipientIdentityId = String(request.originIdentityId || '').trim();
    if (!recipientIdentityId && customerId && !customerId.startsWith('guest_')) {
      const customerLink = await db.collection('whatsappUserLinks').doc(customerId).get();
      recipientIdentityId = String(customerLink.data()?.identityId || '').trim();
    }
  }
  if (!recipientIdentityId || recipientIdentityId === identityId) return { handled: true, code: 'recipient-not-linked' };
  const recipientIdentityRef = db.collection('whatsappIdentities').doc(recipientIdentityId);
  const recipientConversationRef = db.collection('whatsappConversations').doc(recipientIdentityId);
  const [recipientIdentitySnap, recipientConversationSnap] = await Promise.all([
    recipientIdentityRef.get(), recipientConversationRef.get(),
  ]);
  if (!recipientIdentitySnap.exists || !recipientConversationSnap.exists) return { handled: true, code: 'recipient-not-found' };
  const recipientIdentity = recipientIdentitySnap.data() || {};
  const recipientConversation = recipientConversationSnap.data() || {};
  const recipientIsExpected = isExpectedWhatsAppRelayRecipient({ senderRole, customerId, helperId, recipientIdentity });
  if (String(recipientIdentity.phoneNumberId || '') !== String(identity.phoneNumberId || '')
    || !String(recipientIdentity.waId || '').trim() || !recipientIsExpected) return { handled: true, code: 'recipient-invalid' };
  const recipientLastInbound = Number(recipientConversation.lastInboundMessageAtMs || 0);
  if (!isWithinCustomerServiceWindow(recipientLastInbound)) return { handled: true, code: 'recipient-window-closed' };

  const text = String(inbound.text || inbound.media?.caption || '').trim().slice(0, 4096);
  if (!text) return { handled: true, code: 'text-empty' };
  const outboundId = stableEventId(`relay:${eventId}:${recipientIdentityId}`);
  const outboundRef = db.collection('whatsappMessages').doc(outboundId);
  const sourceMessageRef = db.collection('whatsappMessages').doc(eventId);
  const claimed = await db.runTransaction(async (transaction) => {
    const [currentRequestSnap, currentRecipientConversation, currentRecipientIdentity, existingOutbound, sourceMessageSnap] = await Promise.all([
      transaction.get(requestRef), transaction.get(recipientConversationRef),
      transaction.get(recipientIdentityRef), transaction.get(outboundRef), transaction.get(sourceMessageRef),
    ]);
    if (existingOutbound.exists || !currentRequestSnap.exists || !currentRecipientConversation.exists || !currentRecipientIdentity.exists) return false;
    const currentRequest = currentRequestSnap.data() || {};
    const currentRecipient = currentRecipientIdentity.data() || {};
    const stillExpectedParticipant = isExpectedWhatsAppRelayRecipient({ senderRole, customerId, helperId, recipientIdentity: currentRecipient });
    if (String(currentRequest.customerId || '') !== customerId
      || String(currentRequest.helperAssignment?.helperId || '') !== helperId
      || !stillExpectedParticipant
      || !isWhatsAppRelayRequestOpen(currentRequest)) return false;
    const nextLastInbound = Number(currentRecipientConversation.data()?.lastInboundMessageAtMs || 0);
    if (!isWithinCustomerServiceWindow(nextLastInbound)) return false;
    transaction.create(outboundRef, {
      eventId: outboundId,
      sourceEventId: eventId,
      identityId: recipientIdentityId,
      requestId,
      phoneNumberId: String(identity.phoneNumberId || ''),
      to: String(recipientIdentity.waId || ''),
      direction: 'relay',
      type: 'text',
      text,
      status: 'sending',
      createdAtMs: Date.now(),
      retentionExpiresAtMs: Date.now() + whatsappRetentionDays('WHATSAPP_MESSAGE_RETENTION_DAYS', 180) * 24 * 60 * 60 * 1000,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    if (sourceMessageSnap.exists) transaction.set(sourceMessageRef, {
      requestId,
      relayRecipientIdentityId: recipientIdentityId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
  if (!claimed) return { handled: true, code: 'duplicate-or-stale' };

  try {
    const { client } = getWhatsAppMetaClient();
    const delivery = await client.sendText({ to: recipientIdentity.waId, text, lastInboundAtMs: recipientLastInbound });
    await outboundRef.set({ status: 'sent', deliveryStatus: 'accepted', metaMessageId: delivery.messageId || null, sentAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await reconcileWhatsAppDeliveryStatuses({ metaMessageId: delivery.messageId, recipientId: recipientIdentity.waId, messageRef: outboundRef });
    await conversationRef.set({ currentMode: 'provider_relay', activeServiceRequestId: requestId, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { handled: true, sent: true };
  } catch (error) {
    const deliveryStatus = classifyMetaDeliveryError(error);
    await outboundRef.set({
      status: deliveryStatus,
      deliveryStatus,
      errorCode: String(error?.code || 'meta_delivery_unknown').slice(0, 100),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    logger.warn('whatsapp_relay_delivery_failed', { requestId, eventId, deliveryStatus, errorCode: String(error?.code || 'unknown').slice(0, 80) });
    return { handled: true, code: deliveryStatus === 'outcome_unknown' ? 'delivery-unknown' : 'delivery-failed' };
  }
}

async function relayWhatsAppAttachment({ eventId, identityId, identity, conversation, inbound, conversationRef }) {
  const requestId = String(conversation.activeServiceRequestId || '').trim();
  if (!requestId || !['image', 'audio', 'document'].includes(String(inbound?.type || '').toLowerCase())) {
    return { handled: false };
  }
  if (!whatsappMediaEnabled()) return { handled: true, code: 'media-relay-disabled' };
  if (String(process.env.WHATSAPP_MEDIA_RETENTION_ENFORCED || '').trim().toLowerCase() !== 'true'
    || String(process.env.WHATSAPP_RETENTION_CLEANUP_ENABLED || '').trim().toLowerCase() !== 'true'
    || String(process.env.WHATSAPP_STORAGE_RETENTION_POLICY_VERIFIED || '').trim().toLowerCase() !== 'true') {
    return { handled: true, code: 'retention-not-configured' };
  }

  const requestAccess = await getWhatsAppRequestForIdentity({ db, identity, requestId });
  if (requestAccess.code !== 'found') return { handled: true, code: 'request-not-authorized' };
  const request = requestAccess.request;
  const helperId = String(request.helperAssignment?.helperId || '').trim();
  if (!helperId || !isWhatsAppRelayRequestOpen(request)) return { handled: true, code: 'relay-closed' };
  const senderRole = String(identity.role || (identity.guestPrincipalId ? 'customer' : '')).toLowerCase();
  const customerId = String(request.customerId || '').trim();
  const senderUid = String(identity.linkedFirebaseUid || '').trim();
  let recipientIdentityId = '';
  let expectedRecipientRole = '';
  if (senderRole === 'customer') {
    const helperLink = await db.collection('whatsappUserLinks').doc(helperId).get();
    recipientIdentityId = String(helperLink.data()?.identityId || '').trim();
    expectedRecipientRole = 'helper';
  } else if (senderRole === 'helper' && senderUid === helperId) {
    recipientIdentityId = String(request.originIdentityId || '').trim();
    if (!recipientIdentityId && customerId && !customerId.startsWith('guest_')) {
      const customerLink = await db.collection('whatsappUserLinks').doc(customerId).get();
      recipientIdentityId = String(customerLink.data()?.identityId || '').trim();
    }
    expectedRecipientRole = 'customer';
  } else {
    return { handled: true, code: 'request-not-authorized' };
  }
  if (!recipientIdentityId || recipientIdentityId === identityId) return { handled: true, code: 'recipient-not-linked' };
  const recipientIdentityRef = db.collection('whatsappIdentities').doc(recipientIdentityId);
  const recipientConversationRef = db.collection('whatsappConversations').doc(recipientIdentityId);
  const [recipientIdentitySnap, recipientConversationSnap] = await Promise.all([
    recipientIdentityRef.get(), recipientConversationRef.get(),
  ]);
  if (!recipientIdentitySnap.exists || !recipientConversationSnap.exists) return { handled: true, code: 'recipient-not-found' };
  const recipientIdentity = recipientIdentitySnap.data() || {};
  const recipientConversation = recipientConversationSnap.data() || {};
  const isExpectedParticipant = expectedRecipientRole === String(recipientIdentity.role || '').toLowerCase()
    && isExpectedWhatsAppRelayRecipient({ senderRole, customerId, helperId, recipientIdentity });
  if (!isExpectedParticipant
    || String(recipientIdentity.phoneNumberId || '') !== String(identity.phoneNumberId || '')
    || !String(recipientIdentity.waId || '').trim()) return { handled: true, code: 'recipient-invalid' };
  const recipientLastInbound = Number(recipientConversation.lastInboundMessageAtMs || 0);
  if (!isWithinCustomerServiceWindow(recipientLastInbound)) return { handled: true, code: 'recipient-window-closed' };

  let mediaResult;
  try {
    mediaResult = await processWhatsAppInboundMedia({ identityId, eventId, identity, conversation, inbound });
  } catch (error) {
    logger.warn('whatsapp_relay_media_download_failed', { eventId, errorCode: String(error?.code || 'media_processing_failed').slice(0, 80) });
    return { handled: true, code: 'media-processing-failed' };
  }
  if (mediaResult.code !== 'stored' || !Buffer.isBuffer(mediaResult.buffer)) {
    return { handled: true, code: mediaResult.code === 'disabled' ? 'media-relay-disabled' : 'media-processing-failed' };
  }

  const outboundId = stableEventId(`relay:${eventId}:${recipientIdentityId}`);
  const outboundRef = db.collection('whatsappMessages').doc(outboundId);
  const sourceMessageRef = db.collection('whatsappMessages').doc(eventId);
  const caption = String(inbound.media?.caption || '').trim().slice(0, 1024);
  const mediaAssetRef = db.collection('whatsappMediaAssets').doc(mediaResult.assetId);
  const claim = await db.runTransaction(async (transaction) => {
    const [currentRequestSnap, currentRecipientConversation, currentRecipientIdentity, existingOutbound, assetSnap] = await Promise.all([
      transaction.get(db.collection('serviceRequests').doc(requestId)),
      transaction.get(recipientConversationRef),
      transaction.get(recipientIdentityRef),
      transaction.get(outboundRef),
      transaction.get(mediaAssetRef),
    ]);
    if (existingOutbound.exists || !currentRequestSnap.exists || !currentRecipientConversation.exists
      || !currentRecipientIdentity.exists || !assetSnap.exists) return false;
    const currentRequest = currentRequestSnap.data() || {};
    const currentRecipient = currentRecipientIdentity.data() || {};
    if (String(currentRequest.customerId || '') !== customerId
      || String(currentRequest.helperAssignment?.helperId || '') !== helperId
      || !isExpectedWhatsAppRelayRecipient({ senderRole, customerId, helperId, recipientIdentity: currentRecipient })
      || String(currentRecipient.waId || '') !== String(recipientIdentity.waId || '')
      || String(currentRecipient.phoneNumberId || '') !== String(identity.phoneNumberId || '')
      || !isWhatsAppRelayRequestOpen(currentRequest)) return false;
    const nextLastInbound = Number(currentRecipientConversation.data()?.lastInboundMessageAtMs || 0);
    if (!isWithinCustomerServiceWindow(nextLastInbound)) return false;
    const currentAsset = assetSnap.data() || {};
    if (String(currentAsset.identityId || '') !== identityId
      || String(currentAsset.sourceEventId || '') !== eventId
      || String(currentAsset.requestId || '') !== requestId
      || String(currentAsset.status || '') !== 'stored') return false;
    transaction.create(outboundRef, {
      eventId: outboundId,
      sourceEventId: eventId,
      identityId: recipientIdentityId,
      requestId,
      phoneNumberId: String(identity.phoneNumberId || ''),
      to: String(recipientIdentity.waId || ''),
      direction: 'relay',
      type: inbound.type,
      text: caption,
      media: {
        assetId: mediaResult.assetId,
        storagePath: mediaResult.storagePath,
        mediaType: mediaResult.mediaType,
        mimeType: mediaResult.mimeType,
      },
      status: 'sending',
      createdAtMs: Date.now(),
      retentionExpiresAtMs: Date.now() + whatsappRetentionDays('WHATSAPP_MESSAGE_RETENTION_DAYS', 180) * 24 * 60 * 60 * 1000,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.set(sourceMessageRef, {
      media: {
        assetId: mediaResult.assetId,
        storagePath: mediaResult.storagePath,
        mediaType: mediaResult.mediaType,
        mimeType: mediaResult.mimeType,
        caption,
      },
      requestId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
  if (!claim) return { handled: true, code: 'duplicate-or-stale' };

  try {
    const { client, secrets } = getWhatsAppMetaClient();
    if (String(identity.phoneNumberId || '') !== secrets.phoneNumberId) throw new Error('WhatsApp sender number does not match configured phone number.');
    const delivery = await client.sendMedia({
      to: recipientIdentity.waId,
      buffer: mediaResult.buffer,
      mimeType: mediaResult.mimeType,
      mediaType: mediaResult.mediaType,
      filename: inbound.media?.filename || `attachment.${mediaResult.storagePath.split('.').pop()}`,
      caption,
      lastInboundAtMs: recipientLastInbound,
    });
    await outboundRef.set({
      status: 'sent', deliveryStatus: 'accepted', metaMessageId: delivery.messageId || null,
      sentAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await reconcileWhatsAppDeliveryStatuses({ metaMessageId: delivery.messageId, recipientId: recipientIdentity.waId, messageRef: outboundRef });
    await conversationRef.set({ currentMode: 'provider_relay', activeServiceRequestId: requestId, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { handled: true, sent: true };
  } catch (error) {
    const deliveryStatus = classifyMetaDeliveryError(error);
    await outboundRef.set({
      status: deliveryStatus, deliveryStatus,
      errorCode: String(error?.code || 'meta_media_delivery_unknown').slice(0, 100),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { handled: true, code: deliveryStatus === 'outcome_unknown' ? 'delivery-unknown' : 'delivery-failed' };
  }
}

async function syncWhatsAppCanonicalRequestDraft({ identityId, identity, draftRef, service, serviceIds, selectedPackageId, answers, location }) {
  const previousDraftSnap = await draftRef.get();
  const previousDraft = previousDraftSnap.exists ? previousDraftSnap.data() || {} : {};
  const principalId = String(previousDraft.principalId || identity.linkedFirebaseUid || identity.guestPrincipalId || '').trim();
  if (!principalId) return { code: 'identity-unavailable' };
  const requestId = `wa_req_${createHash('sha256').update(draftRef.id).digest('hex').slice(0, 32)}`;
  const profile = {
    fullName: String(identity.preferredName || identity.profileName || '').trim() || 'WhatsApp customer',
    phoneNumber: String(identity.waId || '').trim(),
  };
  const created = await marketplaceRequestOperations.createDraft({
    requestId,
    principalId,
    profile,
    categoryId: service.categoryId,
    serviceIds,
    selectedPackageId,
    structuredAnswers: answers,
    location,
    intakeMode: 'whatsapp',
    source: 'whatsapp',
    channel: 'whatsapp',
    identityId,
  });
  if (!['created', 'already-created'].includes(created.code)) return created;
  const updated = await marketplaceRequestOperations.updateDraft({
    requestId,
    principalId,
    categoryId: service.categoryId,
    serviceIds,
    selectedPackageId,
    structuredAnswers: answers,
    location,
  });
  if (updated.code !== 'updated') return updated;
  await draftRef.set({ requestId, principalId, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { code: 'ready', requestId };
}

async function confirmWhatsAppServiceDraft({ identityId, identity, conversationRef, draftRef }) {
  const [conversationSnap, draftSnap] = await Promise.all([conversationRef.get(), draftRef.get()]);
  if (!conversationSnap.exists || !draftSnap.exists) return { code: 'draft-not-found' };
  const conversation = conversationSnap.data() || {};
  const draft = draftSnap.data() || {};
  if (String(conversation.activeDraftId || '') !== draftRef.id || String(draft.identityId || '') !== identityId) {
    return { code: 'draft-not-owned' };
  }
  if (draft.status === 'confirmed' && draft.requestId) return { code: 'already-confirmed', requestId: draft.requestId };
  if (draft.status !== 'quoted' || Number(draft.quoteExpiresAtMs || 0) < Date.now()) return { code: 'quote-expired' };
  const principalId = String(draft.principalId || identity.linkedFirebaseUid || identity.guestPrincipalId || '').trim();
  const requestId = String(draft.requestId || '').trim();
  if (!principalId || !requestId) return { code: 'identity-unavailable' };

  const outcome = await marketplaceRequestOperations.confirmDraft({
    requestId,
    principalId,
    approvedQuote: draft.quoteSnapshot || {},
    quoteExpiresAtMs: Number(draft.quoteExpiresAtMs || 0),
    source: 'whatsapp',
    paymentFlowVersion: explicitPaymentSelectionEnabled() ? 'explicit_v1' : null,
    walletAccountingVersion: helperWalletEnabled() ? 1 : null,
  });
  if (outcome.code === 'quote-changed') {
    const refreshedQuote = await marketplaceRequestOperations.quoteDraft({ requestId, principalId });
    const quote = refreshedQuote.code === 'quoted' ? refreshedQuote.quote : outcome.quote;
    const quoteExpiresAtMs = refreshedQuote.code === 'quoted'
      ? refreshedQuote.quoteExpiresAtMs
      : Date.now() + (15 * 60 * 1000);
    await draftRef.set({
      quoteSnapshot: quote,
      questionnaireVersion: quote?.questionnaireVersion || '',
      serviceCatalogVersion: quote?.serviceCatalogVersion || '',
      quoteExpiresAtMs,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ...outcome, quote, quoteExpiresAtMs };
  }
  if (outcome.code === 'submitted' || outcome.code === 'already-submitted') {
    await db.runTransaction(async (transaction) => {
      const currentConversation = await transaction.get(conversationRef);
      const currentDraft = await transaction.get(draftRef);
      if (!currentDraft.exists || String(currentDraft.data()?.identityId || '') !== identityId) return;
      transaction.set(draftRef, {
        status: 'confirmed',
        requestId,
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      if (currentConversation.exists) {
        transaction.set(conversationRef, {
          currentMode: 'active_booking',
          activeServiceRequestId: requestId,
          activeDraftId: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    });
    return { code: outcome.code === 'submitted' ? 'confirmed' : 'already-confirmed', requestId };
  }
  if (outcome.code === 'active-request') return { code: 'active-request', requestId: outcome.activeRequestId };
  return outcome;
}

function whatsappDiagnosticHash(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

async function commitWhatsAppIdentityLink({ uid, role, identityId, phone }) {
  const phoneNumberId = String(getWhatsAppSecrets().phoneNumberId || '').trim();
  if (!phoneNumberId || !uid || !identityId || !phone?.phoneNumber || !phone?.waId) {
    return { code: 'incomplete-link-context' };
  }
  const identityRef = db.collection('whatsappIdentities').doc(identityId);
  const conversationRef = db.collection('whatsappConversations').doc(identityId);
  const userRef = db.collection('users').doc(uid);
  const userLinkRef = db.collection('whatsappUserLinks').doc(uid);
  const normalizedPhone = normalizeWhatsAppIdentityPhone(phone.phoneNumber).phoneNumber;
  const phoneHash = createHash('sha256').update(normalizedPhone).digest('hex');
  const phoneOwnerRef = db.collection('whatsappPhoneOwnership').doc(phoneHash);
  const auditRef = db.collection('auditEvents').doc(stableEventId(`whatsapp-identity-link:${identityId}:${uid}`));

  return db.runTransaction(async (transaction) => {
    const identitySnap = await transaction.get(identityRef);
    const identity = identitySnap.data() || {};
    const guestPrincipalId = String(identity.guestPrincipalId || buildWhatsAppGuestPrincipalId(identityId));
    const guestLinkRef = db.collection('whatsappGuestOwnership').doc(guestPrincipalId);
    const [conversationSnap, profileSnap, userLinkSnap, auditSnap, guestLinkSnap, phoneOwnerSnap] = await Promise.all([
      transaction.get(conversationRef), transaction.get(userRef), transaction.get(userLinkRef),
      transaction.get(auditRef), transaction.get(guestLinkRef), transaction.get(phoneOwnerRef),
    ]);
    if (!profileSnap.exists || !profileAllowsRole(profileSnap.data() || {}, role)) return { code: 'role-mismatch' };
    if (identity.waId && String(identity.waId) !== phone.waId) return { code: 'identity-phone-mismatch' };
    if (identity.phoneNumberId && String(identity.phoneNumberId) !== phoneNumberId) return { code: 'identity-sender-mismatch' };
    const currentOwner = String(identity.linkedFirebaseUid || '').trim();
    if (identity.relinkRequiresSupport === true) return { code: 'identity-recovery-required' };
    if (currentOwner && currentOwner !== uid) return { code: 'identity-linked-elsewhere' };
    const existingUserLink = userLinkSnap.data() || {};
    if (userLinkSnap.exists && String(existingUserLink.identityId || '') !== identityId) return { code: 'account-linked-elsewhere' };
    const existingWhatsAppPhoneValue = String(profileSnap.data()?.whatsappPhoneNumber || '').trim();
    const existingWhatsAppPhone = existingWhatsAppPhoneValue
      ? normalizeWhatsAppIdentityPhone(existingWhatsAppPhoneValue).phoneNumber
      : '';
    if (existingWhatsAppPhone && existingWhatsAppPhone !== normalizedPhone) return { code: 'account-whatsapp-already-set' };
    const phoneOwner = phoneOwnerSnap.data() || {};
    if (phoneOwnerSnap.exists && (String(phoneOwner.uid || '') !== uid || String(phoneOwner.identityId || '') !== identityId)) {
      return { code: 'whatsapp-number-linked-elsewhere' };
    }
    const guestOwner = String(guestLinkSnap.data()?.uid || '').trim();
    if (guestOwner && guestOwner !== uid) return { code: 'guest-history-linked-elsewhere' };
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(identityRef, {
      channel: 'whatsapp', phoneNumberId, waId: phone.waId, guestPrincipalId,
      linkedFirebaseUid: uid, role, verifiedAt: now, whatsappPhoneNumber: phone.phoneNumber,
      guestAccessRevokedAt: null, updatedAt: now, createdAt: identity.createdAt || now,
    }, { merge: true });
    transaction.set(conversationRef, {
      channel: 'whatsapp', identityId, linkedFirebaseUid: uid,
      currentMode: conversationSnap.data()?.currentMode || 'assistant',
      updatedAt: now, createdAt: conversationSnap.data()?.createdAt || now,
    }, { merge: true });
    transaction.set(userLinkRef, {
      uid, identityId, role, guestPrincipalId,
      phoneHash: createHash('sha256').update(phone.phoneNumber).digest('hex'),
      linkedAt: userLinkSnap.data()?.linkedAt || now, updatedAt: now,
    }, { merge: true });
    transaction.set(phoneOwnerRef, {
      uid, identityId, role, phoneHash,
      linkedAt: phoneOwnerSnap.data()?.linkedAt || now, updatedAt: now,
    }, { merge: true });
    transaction.set(guestLinkRef, {
      uid, identityId, role, linkedAt: guestLinkSnap.data()?.linkedAt || now, updatedAt: now,
    }, { merge: true });
    transaction.set(userRef, {
      whatsappPhoneNumber: phone.phoneNumber,
      whatsappVerifiedAt: now,
      whatsappGuestPrincipalIds: admin.firestore.FieldValue.arrayUnion(guestPrincipalId),
      updatedAt: now,
    }, { merge: true });
    if (!auditSnap.exists) transaction.create(auditRef, {
      eventType: 'whatsapp_identity_linked', actorUid: uid, identityId, role,
      phoneHash: createHash('sha256').update(phone.phoneNumber).digest('hex'), createdAt: now,
    });
    return { code: currentOwner === uid ? 'already-linked' : 'linked', identityId, guestPrincipalId };
  });
}

async function findWhatsAppAccountMatches(phoneNumber) {
  const normalizedPhone = normalizeWhatsAppIdentityPhone(phoneNumber).phoneNumber;
  const records = [];
  try {
    const authUser = await admin.auth().getUserByPhoneNumber(normalizedPhone);
    const profileSnapshot = await db.collection('users').doc(authUser.uid).get();
    if (profileSnapshot.exists) records.push({
      uid: authUser.uid,
      authPhone: authUser.phoneNumber || normalizedPhone,
      authPhoneVerified: true,
      profile: profileSnapshot.data() || {},
    });
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }

  const [whatsappProfiles, verifiedPhoneProfiles] = await Promise.all([
    db.collection('users').where('whatsappPhoneNumber', '==', normalizedPhone).limit(3).get(),
    db.collection('users').where('phoneNumber', '==', normalizedPhone).limit(3).get(),
  ]);
  const byUid = new Map(records.map((record) => [record.uid, record]));
  for (const snapshot of [whatsappProfiles, verifiedPhoneProfiles]) {
    for (const document of snapshot.docs) {
      byUid.set(document.id, {
        uid: document.id,
        authPhone: '',
        authPhoneVerified: false,
        ...(byUid.get(document.id) || {}),
        profile: document.data() || {},
      });
    }
  }
  return [...byUid.values()];
}

async function autoLinkVerifiedWhatsAppAccount(identityId, identity) {
  if (String(identity?.linkedFirebaseUid || '').trim()) return { identity, unverifiedCandidate: null };
  const identityRef = db.collection('whatsappIdentities').doc(identityId);
  const nowMs = Date.now();
  const shouldCheck = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(identityRef);
    if (!snapshot.exists) return false;
    const current = snapshot.data() || {};
    if (current.linkedFirebaseUid) return false;
    if (nowMs - Number(current.accountResolutionCheckedAtMs || 0) < 5 * 60 * 1000) return false;
    transaction.set(identityRef, {
      accountResolutionCheckedAtMs: nowMs,
      accountResolutionStatus: 'checking',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
  if (!shouldCheck) return { identity, unverifiedCandidate: null };
  const phone = normalizeWhatsAppIdentityPhone(`+${String(identity?.waId || '').trim()}`);
  let matches;
  try {
    matches = await findWhatsAppAccountMatches(phone.phoneNumber);
  } catch (error) {
    await identityRef.set({ accountResolutionStatus: 'lookup_failed', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    logger.warn('whatsapp_account_candidate_lookup_failed', { errorCode: String(error?.code || 'account_lookup_failed').slice(0, 80) });
    return { identity, unverifiedCandidate: null };
  }
  const candidate = selectUniqueVerifiedWhatsAppAccount(matches, phone.phoneNumber);
  if (!candidate) {
    const unverifiedCandidate = selectUniqueWhatsAppAccountCandidate(matches, phone.phoneNumber);
    await identityRef.set({
      accountResolutionStatus: unverifiedCandidate ? 'account_link_required' : 'no_verified_match',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { identity, unverifiedCandidate };
  }
  const expectedIdentityId = buildWhatsAppIdentityId({
    phoneNumberId: identity.phoneNumberId,
    phoneNumber: phone.phoneNumber,
    stableEventId,
  });
  if (expectedIdentityId !== identityId) return { identity, unverifiedCandidate: null };
  const outcome = await commitWhatsAppIdentityLink({ uid: candidate.uid, role: candidate.role, identityId, phone });
  if (!['linked', 'already-linked'].includes(outcome.code)) {
    logger.info('whatsapp_verified_account_auto_link_skipped', { outcome: outcome.code });
    return { identity, unverifiedCandidate: null };
  }
  const refreshed = await identityRef.get();
  return { identity: refreshed.exists ? refreshed.data() || identity : identity, unverifiedCandidate: null };
}

async function persistWhatsAppOnboardingDetails({ identityId, eventId, identity, conversationRef, state, preferredName = '', homeAddress = '', providerType = '', businessName = '', fullName = '' }) {
  const identityRef = db.collection('whatsappIdentities').doc(identityId);
  const uid = String(identity?.linkedFirebaseUid || '').trim();
  const userRef = uid ? db.collection('users').doc(uid) : null;
  const userLinkRef = uid ? db.collection('whatsappUserLinks').doc(uid) : null;
  const auditRef = db.collection('auditEvents').doc(stableEventId(`whatsapp-onboarding:${eventId}`));
  const safePreferredName = String(preferredName || '').trim().slice(0, 100);
  const safeHomeAddress = String(homeAddress || '').trim().slice(0, 500);
  const safeProviderType = String(providerType || '').trim().toLowerCase();
  const safeBusinessName = String(businessName || '').trim().slice(0, 120);
  const safeFullName = String(fullName || '').trim().replace(/\s+/g, ' ').slice(0, 180);
  if ((!safePreferredName && !safeHomeAddress && !safeProviderType && !safeBusinessName && !safeFullName)
    || (preferredName && !safePreferredName) || (homeAddress && safeHomeAddress.length < 5)
    || (providerType && !['individual', 'business'].includes(safeProviderType))
    || (businessName && !safeBusinessName) || (fullName && safeFullName.length < 2)) {
    return { code: 'invalid-onboarding-value' };
  }

  return db.runTransaction(async (transaction) => {
    const identitySnapshot = await transaction.get(identityRef);
    const conversationSnapshot = await transaction.get(conversationRef);
    const auditSnapshot = await transaction.get(auditRef);
    const [profileSnapshot, linkSnapshot] = userRef
      ? await Promise.all([transaction.get(userRef), transaction.get(userLinkRef)])
      : [null, null];
    const currentIdentity = identitySnapshot.data() || {};
    if (!identitySnapshot.exists || String(currentIdentity.waId || '') !== String(identity.waId || '')) return { code: 'identity-mismatch' };
    if (uid) {
      const link = linkSnapshot?.data() || {};
      if (!profileSnapshot?.exists
        || String(currentIdentity.linkedFirebaseUid || '') !== uid
        || String(link.uid || '') !== uid
        || String(link.identityId || '') !== identityId
        || !normalizeTimestamp(currentIdentity.verifiedAt)) return { code: 'identity-verification-required' };
    } else if (!currentIdentity.guestPrincipalId || state.role !== 'customer') {
      return { code: 'identity-verification-required' };
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const identityUpdates = { updatedAt: now };
    if (safePreferredName) identityUpdates.preferredName = safePreferredName;
    if (safeHomeAddress) identityUpdates.homeAddress = safeHomeAddress;
    transaction.set(identityRef, identityUpdates, { merge: true });
    transaction.set(conversationRef, {
      whatsappOnboarding: {
        ...state,
        preferredName: safePreferredName || state.preferredName || '',
        updatedAtMs: Date.now(),
      },
      currentMode: state.stage === 'complete' ? 'assistant' : 'onboarding',
      updatedAt: now,
    }, { merge: true });
    if (uid && profileSnapshot?.exists) {
      const profileUpdates = { updatedAt: now };
      if (safePreferredName) profileUpdates.whatsappPreferredName = safePreferredName;
      if (safeHomeAddress) profileUpdates.homeAddress = safeHomeAddress;
      if (safeProviderType) profileUpdates.providerType = safeProviderType;
      if (safeBusinessName) profileUpdates.businessName = safeBusinessName;
      if (safeFullName) {
        const nameParts = safeFullName.split(/\s+/).filter(Boolean);
        profileUpdates.fullName = safeFullName;
        profileUpdates.displayName = safeFullName;
        profileUpdates.firstName = nameParts[0] || '';
        profileUpdates.lastName = nameParts.slice(1).join(' ');
      }
      transaction.set(userRef, profileUpdates, { merge: true });
    }
    if (!auditSnapshot.exists) transaction.create(auditRef, {
      eventType: 'whatsapp_onboarding_profile_updated',
      actorUid: uid || String(currentIdentity.guestPrincipalId || ''),
      identityId,
      fields: [
        safePreferredName ? 'preferredName' : '', safeHomeAddress ? 'homeAddress' : '',
        safeProviderType ? 'providerType' : '', safeBusinessName ? 'businessName' : '', safeFullName ? 'fullName' : '',
      ].filter(Boolean),
      createdAt: now,
    });
    return { code: 'saved', linked: Boolean(uid), preferredName: safePreferredName, hasHomeAddress: Boolean(safeHomeAddress || currentIdentity.homeAddress) };
  });
}

function normalizeWhatsAppHelperServiceName(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function submitWhatsAppHelperServices({ identityId, identity, conversationRef, onboardingState, requestedServices }) {
  const authorization = (await resolveWhatsAppToolAuthorization(identityId, identity)).authorization || {};
  if (authorization.role !== 'helper' || authorization.verified !== true || authorization.linked !== true || !authorization.uid) {
    return { code: 'helper-authentication-required' };
  }
  const catalogue = (await getLiveServiceCatalogEntries()).filter((entry) => entry.active !== false && entry.approved !== false);
  const requested = String(requestedServices || '').split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean).slice(0, 5);
  if (!requested.length) return { code: 'no-services-selected' };
  const selected = [];
  const unmatched = [];
  for (const item of requested) {
    const needle = normalizeWhatsAppHelperServiceName(item);
    const match = catalogue.find((entry) => (
      normalizeWhatsAppHelperServiceName(entry.label) === needle
      || normalizeWhatsAppHelperServiceName(entry.id) === needle
    ));
    if (!match) unmatched.push(item.slice(0, 80));
    else if (!selected.some((entry) => entry.id === match.id)) selected.push(match);
  }
  if (unmatched.length || !selected.length) return { code: 'service-not-in-catalog', unmatched };

  const refs = selected.map((entry) => {
    const serviceSlug = normalizeServiceToken(entry.id);
    return { entry, ref: db.collection('helperServices').doc(`${authorization.uid}_${serviceSlug}`) };
  });
  await db.runTransaction(async (transaction) => {
    const snapshots = await Promise.all(refs.map(({ ref }) => transaction.get(ref)));
    refs.forEach(({ entry, ref }, index) => {
      if (snapshots[index].exists) return;
      transaction.create(ref, {
        offeringId: ref.id,
        helperId: authorization.uid,
        serviceId: String(entry.id),
        categoryId: String(entry.categoryId || ''),
        serviceName: String(entry.label || entry.id),
        status: 'pending',
        active: false,
        approved: false,
        verified: false,
        photos: [],
        approvalSource: '',
        derivedFromBundleIds: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    transaction.set(conversationRef, {
      whatsappOnboarding: { ...onboardingState, stage: 'helper_readiness', updatedAtMs: Date.now() },
      currentMode: 'onboarding', updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { code: 'submitted', names: selected.map((entry) => String(entry.label || entry.id)) };
}

async function getWhatsAppHelperReadiness(uid) {
  const [profileSnapshot, offerings, catalogue, agreementBundle, clearanceSnapshot] = await Promise.all([
    db.collection('users').doc(uid).get(), getHelperServiceOfferings(uid), getLiveServiceCatalogEntries(),
    getCanonicalHelperAgreementBundle({ db, admin, userId: uid }),
    db.collection('helperPoliceClearanceRecords').doc(uid).get(),
  ]);
  const profile = profileSnapshot.data() || {};
  const clearanceRecord = clearanceSnapshot.data() || {};
  let policeClearanceStatus = normalizePoliceClearanceStatus(clearanceRecord.status || profile.policeClearanceStatus);
  if (isClearanceReviewExpired(policeClearanceStatus, clearanceRecord.reviewDeadlineAtMs, Date.now())) {
    policeClearanceStatus = 'expired';
  }
  const policeClearanceRequired = helperPoliceClearanceRequired();
  const activeCatalogIds = new Set(catalogue.filter((entry) => entry.active !== false && entry.approved !== false).map((entry) => normalizeServiceToken(entry.id)));
  const approvedOffering = offerings.some((offering) => (
    offering.active !== false && offering.approved === true && offering.verified === true
    && String(offering.status || '').toLowerCase() === 'approved'
    && activeCatalogIds.has(normalizeServiceToken(offering.serviceId))
    && Array.isArray(offering.photos) && offering.photos.length > 0
  ));
  const pendingOffering = offerings.some((offering) => String(offering.status || '').toLowerCase() === 'pending');
  const activeAgreementVersion = String(agreementBundle.activeVersion?.version || '').trim();
  const agreementCurrent = Boolean(activeAgreementVersion
    && String(profile.agreement?.acceptedVersion || '').trim() === activeAgreementVersion
    && isHelperAgreementCurrent(profile));
  const hasName = Boolean(String(profile.fullName || '').trim() || (String(profile.firstName || '').trim() && String(profile.lastName || '').trim()));
  const hasAddress = Boolean(String(profile.homeAddress || '').trim());
  const providerType = String(profile.providerType || '').toLowerCase();
  const hasProviderType = ['individual', 'business'].includes(providerType);
  const hasBusinessName = providerType !== 'business' || Boolean(String(profile.businessName || '').trim());
  const hasProfilePhoto = Boolean(String(profile.profilePhoto || profile.selfieUrl || '').trim());
  const clearancePrerequisitesComplete = Boolean(hasName && hasAddress && hasProviderType && hasBusinessName
    && hasProfilePhoto && approvedOffering && agreementCurrent);
  const missing = [];
  if (!hasName) missing.push('your full name');
  if (!hasAddress) missing.push('your home address');
  if (!hasProviderType) missing.push('whether you are an individual or a business');
  if (!hasBusinessName) missing.push('your business name');
  if (!hasProfilePhoto) missing.push('a helper profile photo');
  if (!offerings.length) missing.push('at least one service offering');
  else if (!approvedOffering) missing.push(pendingOffering ? 'admin approval and portfolio photos for your service offering' : 'an approved service offering with portfolio photos');
  if (!agreementCurrent) missing.push('acceptance of the current Helper Agreement');
  if (policeClearanceRequired && !isHelperPoliceClearanceApproved(policeClearanceStatus)) {
    missing.push(policeClearanceStatus === 'pending' || policeClearanceStatus === 'uploading'
      ? 'admin review of your police-clearance document'
      : 'an approved police-clearance document');
  }
  if (getHelperPayoutVerificationStatus(profile) !== 'verified') missing.push('verified payout details');
  if (String(profile.verificationStatus || '').toLowerCase() !== 'verified') missing.push('Uncedo helper verification');
  if (!profile.whatsappVerifiedAt || !profile.whatsappPhoneNumber) missing.push('a verified WhatsApp link');
  return {
    profile, missing, hasOfferings: offerings.length > 0, approvedOffering, agreementCurrent, activeAgreementVersion,
    policeClearanceStatus,
    policeClearanceRequired,
    policeClearanceEligible: policeClearanceRequired && clearancePrerequisitesComplete && policeClearanceStatus !== 'approved',
    readyByCurrentAppRules: missing.length === 0,
  };
}

function describeWhatsAppHelperReadiness(readiness = {}) {
  const missing = Array.isArray(readiness.missing) ? readiness.missing : [];
  return missing.length
    ? `You cannot go online yet. Please complete these helper requirements first:\n${missing.map((item) => `• ${item}`).join('\n')}`
    : 'Your helper profile is not currently eligible to go online. Please use the Helpers app or contact Uncedo support.';
}

function isCurrentWhatsAppHelperLink({ identity = {}, expectedIdentity = {}, link = {}, profile = {}, identityId = '', helperId = '' } = {}) {
  let expectedPhone = '';
  let profilePhone = '';
  try {
    expectedPhone = normalizeWhatsAppIdentityPhone(`+${String(identity.waId || '')}`).phoneNumber;
    profilePhone = normalizeWhatsAppIdentityPhone(String(profile.whatsappPhoneNumber || '')).phoneNumber;
  } catch (_) {
    return false;
  }
  return Boolean(helperId && identityId && profilePhone && expectedPhone === profilePhone
    && String(identity.waId || '') === String(expectedIdentity.waId || '')
    && String(identity.phoneNumberId || '') === String(expectedIdentity.phoneNumberId || '')
    && String(identity.linkedFirebaseUid || '') === helperId
    && String(identity.role || '').toLowerCase() === 'helper'
    && String(link.uid || '') === helperId
    && String(link.identityId || '') === identityId
    && String(link.role || '').toLowerCase() === 'helper'
    && normalizeTimestamp(identity.verifiedAt) > 0
    && normalizeTimestamp(profile.whatsappVerifiedAt) > 0
    && isHelperUserRecord(profile)
    && String(profile.verificationStatus || '').toLowerCase() === 'verified');
}

async function beginWhatsAppHelperOnline({ identityId, eventId, identity, conversationRef, reply }) {
  if (!whatsappOnboardingEnabled()) {
    await reply('WhatsApp helper availability is not enabled yet. Please use the Helpers app to change your availability.');
    return { code: 'disabled' };
  }
  const resolution = await resolveWhatsAppToolAuthorization(identityId, identity);
  const authorization = resolution.authorization || {};
  const helperId = String(authorization.uid || '').trim();
  if (authorization.role !== 'helper' || !helperId || authorization.verified !== true || authorization.linked !== true) {
    await reply('Only a verified helper account linked to this WhatsApp chat can go online. Please link your helper account first.');
    return { code: 'helper-link-required' };
  }

  const userRef = db.collection('users').doc(helperId);
  const [profileSnapshot, readiness] = await Promise.all([userRef.get(), getWhatsAppHelperReadiness(helperId)]);
  const profile = profileSnapshot.data() || {};
  if (!profileSnapshot.exists || isHelperProfileBlocked(profile)) {
    await reply('Your helper account cannot go online at the moment. Please contact Uncedo support.');
    return { code: 'helper-unavailable' };
  }
  if (!readiness.readyByCurrentAppRules) {
    await reply(describeWhatsAppHelperReadiness(readiness));
    return { code: 'profile-not-ready' };
  }

  const requestId = String(profile.activeServiceRequestId || '').trim();
  if (requestId) {
    await reply('You already have an active service request. Finish that request before going online for new offers.');
    return { code: 'active-request' };
  }
  if (String(profile.onlineStatus || '').toLowerCase() === 'online' && isHelperLocationFresh(getLiveLocationSnapshot(profile))) {
    await reply('You are already online. Send “offline” when you want to stop receiving new offers.');
    return { code: 'already-online' };
  }

  const identityRef = db.collection('whatsappIdentities').doc(identityId);
  const linkRef = db.collection('whatsappUserLinks').doc(helperId);
  const auditRef = db.collection('auditEvents').doc(stableEventId(`whatsapp-helper-online-location-request:${eventId}`));
  const nowMs = Date.now();
  const result = await db.runTransaction(async (transaction) => {
    const [identitySnapshot, linkSnapshot, currentProfileSnapshot, conversationSnapshot, auditSnapshot] = await Promise.all([
      transaction.get(identityRef), transaction.get(linkRef), transaction.get(userRef), transaction.get(conversationRef), transaction.get(auditRef),
    ]);
    const currentIdentity = identitySnapshot.data() || {};
    const currentProfile = currentProfileSnapshot.data() || {};
    if (!identitySnapshot.exists || !linkSnapshot.exists || !currentProfileSnapshot.exists
      || !conversationSnapshot.exists || String(conversationSnapshot.data()?.lastInboundEventId || '') !== eventId
      || !isCurrentWhatsAppHelperLink({ identity: currentIdentity, expectedIdentity: identity, link: linkSnapshot.data(), profile: currentProfile, identityId, helperId })
      || isHelperProfileBlocked(currentProfile)) return { code: 'state-changed' };
    const currentRequestId = String(currentProfile.activeServiceRequestId || conversationSnapshot.data()?.activeServiceRequestId || '').trim();
    if (currentRequestId) return { code: 'active-request' };
    if (String(currentProfile.onlineStatus || '').toLowerCase() === 'online'
      && isHelperLocationFresh(getLiveLocationSnapshot(currentProfile), nowMs)) return { code: 'already-online' };
    const expiresAtMs = nowMs + WHATSAPP_HELPER_ONLINE_LOCATION_TTL_MS;
    transaction.set(conversationRef, {
      pendingHelperOnlineLocation: {
        purpose: 'go_online', helperId, identityId, sourceEventId: eventId,
        requestedAtMs: nowMs, expiresAtMs,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    if (!auditSnapshot.exists) transaction.create(auditRef, {
      eventType: 'whatsapp_helper_online_location_requested', actorUid: helperId,
      identityId, sourceEventId: eventId, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { code: 'location-required', expiresAtMs };
  });

  if (result.code === 'location-required') {
    await reply('Before I can put you online, please share your current WhatsApp location pin. This is a one-time location update, not continuous tracking. If you move while online, send another pin. The request expires in 10 minutes, and a shared pin can be used for matching for up to 60 minutes.');
  } else if (result.code === 'already-online') {
    await reply('You are already online. Send “offline” when you want to stop receiving new offers.');
  } else if (result.code === 'active-request') {
    await reply('You already have an active service request. Finish that request before going online for new offers.');
  } else {
    await reply('I could not verify that your helper account is still linked and ready. No availability change was made. Please try again or contact Uncedo support.');
  }
  return result;
}

async function setWhatsAppHelperOffline({ identityId, eventId, identity, conversationRef, reply }) {
  if (!whatsappOnboardingEnabled()) {
    await reply('WhatsApp helper availability is not enabled yet. Please use the Helpers app to change your availability.');
    return { code: 'disabled' };
  }
  const resolution = await resolveWhatsAppToolAuthorization(identityId, identity);
  const authorization = resolution.authorization || {};
  const helperId = String(authorization.uid || '').trim();
  if (authorization.role !== 'helper' || !helperId || authorization.verified !== true || authorization.linked !== true) {
    await reply('Only a verified helper account linked to this WhatsApp chat can change availability.');
    return { code: 'helper-link-required' };
  }

  const userRef = db.collection('users').doc(helperId);
  const identityRef = db.collection('whatsappIdentities').doc(identityId);
  const linkRef = db.collection('whatsappUserLinks').doc(helperId);
  const auditRef = db.collection('auditEvents').doc(stableEventId(`whatsapp-helper-offline:${eventId}`));
  const result = await db.runTransaction(async (transaction) => {
    const [identitySnapshot, linkSnapshot, profileSnapshot, conversationSnapshot, auditSnapshot] = await Promise.all([
      transaction.get(identityRef), transaction.get(linkRef), transaction.get(userRef), transaction.get(conversationRef), transaction.get(auditRef),
    ]);
    const currentIdentity = identitySnapshot.data() || {};
    const profile = profileSnapshot.data() || {};
    if (!identitySnapshot.exists || !linkSnapshot.exists || !profileSnapshot.exists || !conversationSnapshot.exists
      || String(conversationSnapshot.data()?.lastInboundEventId || '') !== eventId
      || !isCurrentWhatsAppHelperLink({ identity: currentIdentity, expectedIdentity: identity, link: linkSnapshot.data(), profile, identityId, helperId })) {
      return { code: 'state-changed' };
    }
    if (String(profile.activeServiceRequestId || conversationSnapshot.data()?.activeServiceRequestId || '').trim()) return { code: 'active-request' };
    if (String(profile.onlineStatus || '').toLowerCase() === 'offline') {
      transaction.set(conversationRef, { pendingHelperOnlineLocation: admin.firestore.FieldValue.delete(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return { code: 'already-offline' };
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(userRef, { onlineStatus: 'offline', locationSharingEnabled: false, updatedAt: now });
    transaction.set(conversationRef, { pendingHelperOnlineLocation: admin.firestore.FieldValue.delete(), updatedAt: now }, { merge: true });
    if (!auditSnapshot.exists) transaction.create(auditRef, {
      eventType: 'whatsapp_helper_went_offline', actorUid: helperId,
      identityId, sourceEventId: eventId, createdAt: now,
    });
    return { code: 'offline' };
  });

  if (result.code === 'offline') {
    await syncHelperDispatchIndexById(helperId).catch((error) => logger.warn('whatsapp_helper_offline_dispatch_sync_failed', {
      helperId, errorCode: String(error?.code || 'dispatch_sync_failed').slice(0, 80),
    }));
    await reply('You are offline and will not receive new service offers. Your last shared location remains saved as your last known location.');
  } else if (result.code === 'already-offline') {
    await reply('You are already offline and will not receive new service offers.');
  } else if (result.code === 'active-request') {
    await reply('You have an active service request. I cannot take you offline until it is finished or handled through the Helpers app.');
  } else {
    await reply('I could not verify your helper account state, so I did not change your availability. Please try again or contact Uncedo support.');
  }
  return result;
}

async function processWhatsAppHelperLocation({ identityId, eventId, identity, conversation, conversationRef, inbound, reply }) {
  const resolution = await resolveWhatsAppToolAuthorization(identityId, identity);
  const authorization = resolution.authorization || {};
  const helperId = String(authorization.uid || '').trim();
  if (authorization.role !== 'helper' || !helperId || authorization.verified !== true || authorization.linked !== true) {
    await reply('I could not verify this as a location from the helper account linked to this WhatsApp chat. No helper location was changed.');
    return { code: 'helper-link-required' };
  }
  if (!whatsappOnboardingEnabled()) {
    await reply('WhatsApp helper location updates are not enabled yet. Please use the Helpers app to manage availability and location.');
    return { code: 'disabled' };
  }

  const nowMs = Date.now();
  const location = normalizeWhatsAppHelperLocation(inbound.location || {}, {
    capturedAtMs: inbound.createdAtMs || inbound.timestampMs,
    receivedAtMs: inbound.receivedAtMs,
    sourceEventId: eventId,
  });
  if (!location || !isHelperLocationFresh(location, nowMs)) {
    await reply('I could not use that location pin because its coordinates or timestamp are invalid or too old. Please share your current location again.');
    return { code: 'invalid-or-stale-location' };
  }

  const userRef = db.collection('users').doc(helperId);
  const [profileSnapshot, readiness] = await Promise.all([userRef.get(), getWhatsAppHelperReadiness(helperId)]);
  if (!profileSnapshot.exists) {
    await reply('I could not find the linked helper profile. No location was saved.');
    return { code: 'helper-profile-not-found' };
  }
  const profile = profileSnapshot.data() || {};
  const pending = conversation.pendingHelperOnlineLocation || {};
  const activeRequestId = String(profile.activeServiceRequestId || conversation.activeServiceRequestId || '').trim();
  const requestRef = activeRequestId ? db.collection('serviceRequests').doc(activeRequestId) : null;
  const activeRequestSnapshot = requestRef ? await requestRef.get() : null;
  const activeRequest = activeRequestSnapshot?.exists ? activeRequestSnapshot.data() || {} : null;
  const assignedActiveRequest = activeRequest && isWhatsAppRelayRequestOpen(activeRequest)
    ? { id: activeRequestId, helperId: String(activeRequest.helperAssignment?.helperId || ''), open: true }
    : null;
  const effectiveProfile = { ...profile, activeServiceRequestId: activeRequestId };
  const mode = resolveWhatsAppHelperLocationMode({
    authorization, identityId, helperId, profile: effectiveProfile, pending,
    assignedActiveRequest, readinessReady: readiness.readyByCurrentAppRules, nowMs,
  });
  if (mode.code === 'profile-not-ready') {
    await reply(describeWhatsAppHelperReadiness(readiness));
    return mode;
  }
  if (mode.code === 'online-command-required') {
    await reply('Send “online” first, then share a current location pin when asked. If you are already online, send “online” again to refresh a location that has gone stale.');
    return mode;
  }
  if (!['activate-online', 'refresh-online', 'active-request'].includes(mode.code)) {
    await reply(mode.code === 'active-request-unavailable'
      ? 'I could not verify an active service request for this location. No location was shared.'
      : 'Your helper account is not available for location updates right now. No location was saved.');
    return mode;
  }

  const identityRef = db.collection('whatsappIdentities').doc(identityId);
  const linkRef = db.collection('whatsappUserLinks').doc(helperId);
  const auditRef = db.collection('auditEvents').doc(stableEventId(`whatsapp-helper-location:${eventId}`));
  const requestId = assignedActiveRequest?.id || '';
  const txRequestRef = requestId ? db.collection('serviceRequests').doc(requestId) : null;
  const transactionResult = await db.runTransaction(async (transaction) => {
    const reads = [transaction.get(identityRef), transaction.get(linkRef), transaction.get(userRef), transaction.get(conversationRef), transaction.get(auditRef)];
    if (txRequestRef) reads.push(transaction.get(txRequestRef));
    const [identitySnapshot, linkSnapshot, currentProfileSnapshot, conversationSnapshot, auditSnapshot, requestSnapshot] = await Promise.all(reads);
    const currentIdentity = identitySnapshot.data() || {};
    const currentProfile = currentProfileSnapshot.data() || {};
    const currentConversation = conversationSnapshot.data() || {};
    if (!identitySnapshot.exists || !linkSnapshot.exists || !currentProfileSnapshot.exists || !conversationSnapshot.exists
      || String(currentConversation.lastInboundEventId || '') !== eventId
      || !isCurrentWhatsAppHelperLink({ identity: currentIdentity, expectedIdentity: identity, link: linkSnapshot.data(), profile: currentProfile, identityId, helperId })) {
      return { code: 'state-changed' };
    }

    const currentActiveRequestId = String(currentProfile.activeServiceRequestId || currentConversation.activeServiceRequestId || '').trim();
    if (currentActiveRequestId !== activeRequestId) return { code: 'state-changed' };
    const currentRequest = requestSnapshot?.exists ? requestSnapshot.data() || {} : null;
    const currentAssignedRequest = currentRequest && isWhatsAppRelayRequestOpen(currentRequest)
      ? { id: requestId, helperId: String(currentRequest.helperAssignment?.helperId || ''), open: true }
      : null;
    const currentMode = resolveWhatsAppHelperLocationMode({
      authorization, identityId, helperId,
      profile: { ...currentProfile, activeServiceRequestId: currentActiveRequestId },
      pending: currentConversation.pendingHelperOnlineLocation || {},
      assignedActiveRequest: currentAssignedRequest,
      readinessReady: readiness.readyByCurrentAppRules,
      nowMs: Date.now(),
    });
    if (!['activate-online', 'refresh-online', 'active-request'].includes(currentMode.code)) return currentMode;
    if (String(currentProfile.liveLocation?.sourceEventId || '') === eventId) return { code: 'duplicate' };
    if (!isIncomingWhatsAppLocationNewer(location, currentProfile.liveLocation || {})) return { code: 'newer-location-exists' };
    const now = admin.firestore.FieldValue.serverTimestamp();
    const updates = {
      liveLocation: { ...location, updatedAt: now },
      locationSharingEnabled: true,
      updatedAt: now,
    };
    if (currentMode.code === 'activate-online') updates.onlineStatus = 'online';
    transaction.update(userRef, updates);
    transaction.set(conversationRef, {
      pendingHelperOnlineLocation: admin.firestore.FieldValue.delete(),
      updatedAt: now,
    }, { merge: true });
    if (!auditSnapshot.exists) transaction.create(auditRef, {
      eventType: 'whatsapp_helper_location_updated', actorUid: helperId,
      identityId, requestId: currentMode.code === 'active-request' ? requestId : '',
      sourceEventId: eventId, locationSource: 'whatsapp', createdAt: now,
    });
    return { code: 'updated', mode: currentMode.code, requestId: currentMode.code === 'active-request' ? requestId : '' };
  });

  if (transactionResult.code === 'newer-location-exists') {
    await reply('A more recent location is already saved, so I left it unchanged.');
    return transactionResult;
  }
  if (transactionResult.code === 'duplicate') {
    await reply('I already saved that location pin.');
    return transactionResult;
  }
  if (transactionResult.code !== 'updated') {
    await reply('I could not confirm your current helper status, so I did not update or share this location. Please send “online” again or contact Uncedo support.');
    return transactionResult;
  }

  await syncHelperDispatchIndexById(helperId).catch((error) => logger.warn('whatsapp_helper_location_dispatch_sync_failed', {
    helperId, errorCode: String(error?.code || 'dispatch_sync_failed').slice(0, 80),
  }));

  let trackingUpdated = false;
  if (transactionResult.requestId) {
    const customerTrackingLocation = {
      latitude: location.latitude, longitude: location.longitude,
      accuracy: null, altitude: null, altitudeAccuracy: null, heading: null, speed: null,
      source: 'whatsapp', updatedAtMs: location.updatedAtMs,
    };
    try {
      await admin.database().ref(`liveTracking/serviceRequests/${transactionResult.requestId}`).update({
        helperLocation: customerTrackingLocation,
        helperLocationUpdatedAtMs: location.updatedAtMs,
        updatedAtMs: Date.now(),
      });
      trackingUpdated = true;
    } catch (error) {
      logger.warn('whatsapp_helper_location_tracking_update_failed', {
        requestId: transactionResult.requestId, errorCode: String(error?.code || 'tracking_update_failed').slice(0, 80),
      });
    }

    const mapUrl = buildHelperLocationMapUrl(location);
    try {
      await relayWhatsAppText({
        eventId, identityId, identity,
        conversation: { ...conversation, activeServiceRequestId: transactionResult.requestId },
        inbound: { type: 'text', text: `Your assigned helper shared a current location pin for this request: ${mapUrl}` },
        conversationRef,
      });
    } catch (error) {
      logger.warn('whatsapp_helper_location_customer_relay_failed', {
        requestId: transactionResult.requestId, eventId, errorCode: String(error?.code || 'location_relay_failed').slice(0, 80),
      });
    }
  }

  if (transactionResult.mode === 'activate-online') {
    await reply('Your current location is saved and you are online. This is your last shared location, not continuous tracking. Send a new pin if you move. A pin is used for new matching for up to 60 minutes; send “offline” to stop receiving offers.');
  } else if (transactionResult.mode === 'active-request') {
    await reply(trackingUpdated
      ? 'Your current location pin is saved for your active request and is available in its tracking view. It is a static update, not continuous tracking.'
      : 'Your location pin is saved for your active request, but I could not update its tracking view just now. Please try again or contact Uncedo support.');
  } else {
    await reply('Your current location pin has been refreshed. It is used for new matching for up to 60 minutes. Send another pin if you move.');
  }
  return transactionResult;
}

async function resolveWhatsAppToolAuthorization(identityId, eventIdentity) {
  const identity = await getWhatsAppIdentityForCurrentSender(identityId, eventIdentity);
  if (!identity) return { identity: null, authorization: { role: 'guest', verified: false, linked: false } };
  const uid = String(identity.linkedFirebaseUid || '').trim();
  if (!uid || !normalizeTimestamp(identity.verifiedAt)) {
    return { identity, authorization: { role: 'guest', verified: false, linked: false } };
  }
  const [linkSnapshot, profileSnapshot] = await Promise.all([
    db.collection('whatsappUserLinks').doc(uid).get(),
    db.collection('users').doc(uid).get(),
  ]);
  const link = linkSnapshot.data() || {};
  const profile = profileSnapshot.data() || {};
  const linked = profileSnapshot.exists
    && String(link.identityId || '') === identityId
    && String(link.uid || '') === uid
    && String(identity.linkedFirebaseUid || '') === uid
    && normalizeTimestamp(link.linkedAt) > 0;
  if (!linked) return { identity, authorization: { role: 'guest', verified: false, linked: false } };

  const linkedRole = String(identity.role || link.role || '').trim().toLowerCase();
  if (linkedRole === 'customer' && profileAllowsRole(profile, 'customer')) {
    return {
      identity: {
        ...identity,
        preferredName: identity.preferredName || profile.whatsappPreferredName || profile.firstName || profile.fullName || profile.displayName || '',
      },
      authorization: { uid, role: 'customer', verified: true, linked: true },
    };
  }
  if (linkedRole === 'helper' && profileAllowsRole(profile, 'helper')
    && String(profile.verificationStatus || '').toLowerCase() === 'verified') {
    return {
      identity: {
        ...identity,
        preferredName: identity.preferredName || profile.whatsappPreferredName || profile.firstName || profile.fullName || profile.displayName || '',
      },
      authorization: { uid, role: 'helper', verified: true, linked: true, helperVerified: true },
    };
  }
  return { identity, authorization: { uid, role: 'guest', verified: false, linked: false } };
}

function buildWhatsAppAssistantToolRegistry({ identity, authorization, conversationRef, eventId, inbound }) {
  return createWhatsAppToolRegistry({
    getCatalogEntries: getLiveServiceCatalogEntries,
    getSupportArticles: async () => {
      const snapshot = await db.collection('supportArticles').where('published', '==', true).limit(100).get();
      return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
    },
    handlers: {
      async getMyProfile(_args, context) {
        const profileSnapshot = await db.collection('users').doc(context.authorization.uid).get();
        if (!profileSnapshot.exists) return { code: 'profile-not-found' };
        const profile = profileSnapshot.data() || {};
        return {
          firstName: String(profile.firstName || profile.givenName || String(profile.fullName || profile.displayName || '').trim().split(/\s+/)[0] || '').slice(0, 100),
          lastName: String(profile.lastName || profile.surname || String(profile.fullName || profile.displayName || '').trim().split(/\s+/).slice(1).join(' ') || '').slice(0, 100),
          email: String(profile.email || '').slice(0, 180),
          role: context.authorization.role,
          ...(context.authorization.role === 'helper' ? { verificationStatus: String(profile.verificationStatus || 'pending') } : {}),
        };
      },
      async proposeProfileChange(args, context) {
        const value = String(args.value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
        if (!value || value.length < 1) return { code: 'invalid-value' };
        const proposalId = stableEventId(`whatsapp-profile-change:${identityId}:${eventId}`);
        const proposalRef = db.collection('whatsappProfileChangeRequests').doc(proposalId);
        const nowMs = Date.now();
        await db.runTransaction(async (transaction) => {
          const [proposalSnapshot, conversationSnapshot] = await Promise.all([transaction.get(proposalRef), transaction.get(conversationRef)]);
          if (proposalSnapshot.exists) return;
          if (!conversationSnapshot.exists || String(conversationSnapshot.data()?.lastInboundEventId || '') !== eventId) return;
          transaction.create(proposalRef, {
            proposalId, identityId, uid: context.authorization.uid, role: context.authorization.role,
            field: args.field, value, status: 'pending', sourceEventId: eventId,
            expiresAtMs: nowMs + 15 * 60 * 1000, createdAt: admin.firestore.FieldValue.serverTimestamp(),
            retentionExpiresAtMs: retentionExpiryMs(process.env, 'WHATSAPP_JOB_RETENTION_DAYS', nowMs),
          });
          transaction.set(conversationRef, {
            pendingProfileChange: { proposalId, field: args.field, value, expiresAtMs: nowMs + 15 * 60 * 1000 },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        });
        const savedProposal = await proposalRef.get();
        if (!savedProposal.exists || String(savedProposal.data()?.uid || '') !== context.authorization.uid) return { code: 'stale' };
        return { code: 'confirmation-required', proposalId, field: args.field, value };
      },
      async listMyBookings(_args, context) {
        const requestIdentity = { ...identity, linkedFirebaseUid: context.authorization.uid, role: context.authorization.role };
        const requests = await listWhatsAppRequests({ db, identity: requestIdentity, perPrincipalLimit: 25, resultLimit: 5 });
        return { bookings: requests.map((request) => ({
          ...buildWhatsAppRequestSummary(request),
          createdAtMs: normalizeTimestamp(request.createdAtMs || request.createdAt) || null,
        })) };
      },
      async getBookingStatus(args, context) {
        const requestIdentity = { ...identity, linkedFirebaseUid: context.authorization.uid, role: context.authorization.role };
        const access = await getWhatsAppRequestForIdentity({ db, identity: requestIdentity, requestId: args.requestId });
        if (access.code !== 'found') return { code: 'not-found' };
        return { code: 'found', booking: buildWhatsAppRequestSummary(access.request) };
      },
      async getMyPaymentSummary(args, context) {
        const requestIdentity = { ...identity, linkedFirebaseUid: context.authorization.uid, role: 'customer' };
        const access = await getWhatsAppRequestForIdentity({ db, identity: requestIdentity, requestId: args.requestId });
        if (access.code !== 'found') return { code: 'not-found' };
        const [paymentSnapshot, financialSnapshot] = await Promise.all([
          db.collection(PAYMENT_OPERATIONS).doc(access.request.id).get(),
          db.collection(FINANCIAL_OPERATIONS_COLLECTION).doc(serviceFinancialOperationId(access.request.id)).get(),
        ]);
        const payment = paymentSnapshot.exists ? paymentSnapshot.data() || {} : null;
        const financial = financialSnapshot.exists ? financialSnapshot.data() || {} : null;
        const state = paymentStateForRequest(access.request, payment, financial);
        const amount = getFinalPayableAmount(access.request, financial);
        return {
          code: 'available', requestId: access.request.id, state,
          amount: Number.isFinite(Number(amount)) ? Number(amount) : null,
          currency: String(payment?.currency || financial?.currency || 'ZAR').toUpperCase(),
          settledAtMs: normalizeTimestamp(payment?.settledAt || payment?.settledAtMs || financial?.settledAtMs) || null,
        };
      },
      async getMyWalletSummary(_args, context) {
        const walletSnapshot = await helperWalletReference(db, context.authorization.uid).get();
        return normalizeWalletForClient(walletSnapshot.exists ? walletSnapshot.data() || {} : emptyHelperWallet(context.authorization.uid));
      },
      async listMyWalletTransactions(args, context) {
        const snapshot = await helperWalletReference(db, context.authorization.uid).collection('transactions')
          .orderBy('createdAtMs', 'desc').limit(args.limit || 10).get();
        return { transactions: snapshot.docs.map((document) => {
          const entry = document.data() || {};
          return {
            entryType: String(entry.entryType || 'wallet_entry').slice(0, 50),
            amountMinor: Math.max(0, Number(entry.amountMinor || 0)),
            availableDeltaMinor: Number(entry.availableDeltaMinor || 0),
            outstandingCommissionDeltaMinor: Number(entry.outstandingCommissionDeltaMinor || 0),
            description: String(entry.description || '').slice(0, 240),
            createdAtMs: Number(entry.createdAtMs || 0),
          };
        }) };
      },
      async getMyPayoutStatus(_args, context) {
        const snapshot = await db.collection(HELPER_PAYOUT_COLLECTION).where('helperId', '==', context.authorization.uid).limit(20).get();
        const payouts = snapshot.docs.map((document) => {
          const payout = document.data() || {};
          return {
            documentId: document.id,
            status: String(payout.status || 'unknown').slice(0, 40),
            amount: Number(payout.amount ?? payout.amountZar ?? payout.totalAmount ?? payout.helperAmount ?? (Number(payout.amountMinor || 0) / 100)) || 0,
            currency: String(payout.currency || 'ZAR').toUpperCase(),
            periodStart: String(payout.periodStart || payout.weekStart || '').slice(0, 40),
            periodEnd: String(payout.periodEnd || payout.weekEnd || '').slice(0, 40),
            weekKey: String(payout.weekKey || '').slice(0, 40),
            scheduledAtMs: normalizeTimestamp(payout.scheduledAt || payout.scheduledFor || payout.nextPayoutAt) || null,
            reason: String(payout.pendingReason || payout.reconciliationReason || '').slice(0, 160),
          };
        }).sort((left, right) => right.weekKey.localeCompare(left.weekKey) || right.documentId.localeCompare(left.documentId)).slice(0, 5);
        return { payouts: payouts.map(({ documentId, ...payout }) => payout) };
      },
      async listMyAvailableOffers(_args, context) {
        const snapshot = await db.collection('serviceRequests')
          .where('currentOfferHelperId', '==', context.authorization.uid)
          .limit(20)
          .get();
        const catalog = await getLiveServiceCatalogEntries();
        const catalogById = new Map((Array.isArray(catalog) ? catalog : [])
          .filter((service) => service.active === true && service.approved === true)
          .map((service) => [String(service.id || ''), service]));
        const now = Date.now();
        const offers = snapshot.docs.map((document) => {
          const request = document.data() || {};
          const expiresAtMs = normalizeTimestamp(request.offerExpiresAt);
          if (request.status !== 'helper_found' || request.helperAssignment?.helperId || !request.offerToken || expiresAtMs <= now) return null;
          const total = Number(request.pricingSnapshot?.total ?? request.totalAmount);
          const serviceIds = [...new Set([
            ...(Array.isArray(request.serviceIds) ? request.serviceIds : []),
            request.selectedPackageId,
          ].map((id) => String(id || '').trim()).filter(Boolean))];
          const serviceSummary = serviceIds.map((id) => catalogById.get(id)?.label).filter(Boolean).slice(0, 4).join(', ')
            || String(request.categoryId || '').replace(/[_-]+/g, ' ').slice(0, 80)
            || 'Service request';
          return {
            serviceSummary,
            amount: Number.isFinite(total) ? total : null,
            currency: String(request.pricingSnapshot?.currency || request.currency || 'ZAR').toUpperCase(),
            expiresAtMs,
          };
        }).filter(Boolean).slice(0, 10);
        return { offers };
      },
      async getMyEarningsSummary(_args, context) {
        const uid = context.authorization.uid;
        const [walletSnapshot, payoutSnapshot] = await Promise.all([
          helperWalletReference(db, uid).get(),
          db.collection(HELPER_PAYOUT_COLLECTION).where('helperId', '==', uid).limit(24).get(),
        ]);
        const wallet = normalizeWalletForClient(walletSnapshot.exists ? walletSnapshot.data() || {} : emptyHelperWallet(uid));
        const recentPeriods = payoutSnapshot.docs.map((document) => {
          const payout = document.data() || {};
          const money = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
          return {
            weekKey: String(payout.weekKey || '').slice(0, 40),
            status: String(payout.status || 'unknown').slice(0, 40),
            completedJobs: Number.isFinite(Number(payout.completedJobs || 0)) ? Math.max(0, Number(payout.completedJobs || 0)) : 0,
            helperAmount: money(payout.helperAmount ?? payout.amount ?? (Number.isFinite(Number(payout.amountMinor)) ? Number(payout.amountMinor) / 100 : null)),
            platformAmount: money(payout.platformAmount),
            paidAtMs: normalizeTimestamp(payout.paidAt || payout.transferCompletedAt) || null,
            scheduledAtMs: normalizeTimestamp(payout.scheduledAt || payout.scheduledFor || payout.nextPayoutAt) || null,
          };
        }).sort((left, right) => right.weekKey.localeCompare(left.weekKey)).slice(0, 8);
        return {
          currency: 'ZAR',
          availableWalletMinor: wallet.availableMinor,
          reservedWalletMinor: wallet.reservedMinor,
          outstandingCommissionMinor: wallet.outstandingCommissionMinor,
          recentPeriods,
        };
      },
      async requestHumanSupport(args, context) {
        const result = await createOrAppendWhatsAppSupportMessage({
          db, admin, identityId, conversationRef, eventId,
          principalId: context.authorization.uid || identity.guestPrincipalId || '',
          linkedUid: context.authorization.uid || '',
          role: context.authorization.role === 'guest' ? 'customer' : context.authorization.role,
          requestId: String((await conversationRef.get()).data()?.activeServiceRequestId || ''),
          inbound: { ...inbound, text: inbound.text || args.reason }, escalationReason: args.reason,
        });
        if (result.stale) return { code: 'stale' };
        return { code: 'handed_off', ticketId: result.ticketId, duplicate: result.duplicate === true };
      },
    },
  });
}

function formatWhatsAppToolResult(toolName, result = {}, { includePricing = false } = {}) {
  if (toolName === 'listAvailableServices') {
    return formatWhatsAppServiceList(result.services || [], { includePricing });
  }
  if (toolName === 'getServiceDetails') {
    const details = `*${result.label || 'Service'}*${result.description ? `\n${result.description}` : ''}`;
    return includePricing && result.priceRange
      ? `${details}\n\n${formatWhatsAppPriceGuidance(result.label, result.priceRange)}`
      : `${details}\n\nWould you like to know more or start a service enquiry?`;
  }
  if (toolName === 'getServiceQuestionnaire') return (result.questions || []).length
    ? `This service asks:\n${result.questions.map((question) => `• ${question.prompt || question.id}${question.required ? ' (required)' : ''}`).join('\n')}`
    : 'There are no questionnaire fields currently published for that service.';
  if (toolName === 'getServicePricingInformation') return includePricing
    ? formatWhatsAppPriceGuidance(result.serviceName, result.priceRange)
    : `*${result.serviceName || 'This service'}* is available through Uncedo. Ask me for a price range if you’d like to know about pricing.`;
  if (toolName === 'getSupportKnowledge') return result.found
    ? result.articles.map((article) => `${article.title}\n${article.content}`).join('\n\n').slice(0, 3000)
    : 'I could not find an approved Uncedo support article with that information. I can refer this to a support person if you would like.';
  if (toolName === 'getMyProfile') return `Your Uncedo account is a ${result.role || 'linked'} account${result.firstName ? ` for ${result.firstName}${result.lastName ? ` ${result.lastName}` : ''}` : ''}${result.email ? ` (${result.email})` : ''}.`;
  if (toolName === 'proposeProfileChange') return `I can change your ${result.field === 'firstName' ? 'first name' : 'surname'} to “${result.value}”. Please confirm this change.`;
  if (toolName === 'listMyBookings') return formatWhatsAppRequestHistory(result.bookings || []);
  if (toolName === 'getBookingStatus') return result.code === 'found' ? formatWhatsAppRequestSummary(result.booking) : 'I could not find a booking you are authorized to view.';
  if (toolName === 'getMyPaymentSummary') return result.code === 'available'
    ? `Request ${result.requestId} payment is ${result.state}${result.amount === null ? '' : ` for R${Number(result.amount).toFixed(2)} ${result.currency || 'ZAR'}`}.`
    : 'I could not verify payment information for that booking.';
  if (toolName === 'getMyWalletSummary') return `Helper wallet: available R${(Number(result.availableMinor || 0) / 100).toFixed(2)}, reserved R${(Number(result.reservedMinor || 0) / 100).toFixed(2)}, outstanding commission R${(Number(result.outstandingCommissionMinor || 0) / 100).toFixed(2)}.`;
  if (toolName === 'listMyWalletTransactions') return (result.transactions || []).length
    ? `Recent helper wallet entries:\n${result.transactions.slice(0, 10).map((item) => `• ${item.description || item.entryType}: R${(Number(item.amountMinor || 0) / 100).toFixed(2)}`).join('\n')}`
    : 'There are no recent helper wallet transactions.';
  if (toolName === 'getMyPayoutStatus') return (result.payouts || []).length
    ? `Recent weekly payout records:\n${result.payouts.map((item) => `• ${item.status}, R${Number(item.amount || 0).toFixed(2)} ${item.currency}${item.weekKey ? ` for ${item.weekKey}` : ''}${item.scheduledAtMs ? `; scheduled ${new Date(item.scheduledAtMs).toLocaleDateString('en-ZA')}` : ''}${item.reason ? `; ${item.reason}` : ''}`).join('\n')}`
    : 'I could not find a weekly payout record for this helper account.';
  if (toolName === 'listMyAvailableOffers') return (result.offers || []).length
    ? `You have ${result.offers.length} unexpired offer${result.offers.length === 1 ? '' : 's'} addressed to you:\n${result.offers.map((item) => `• ${item.serviceSummary}${item.amount === null ? '' : ` — R${Number(item.amount).toFixed(2)} ${item.currency}`}; expires ${new Date(item.expiresAtMs).toLocaleTimeString('en-ZA')}`).join('\n')}\nOpen the helper app to review and accept or decline an offer.`
    : 'You do not have any current unexpired offers.';
  if (toolName === 'getMyEarningsSummary') return (result.recentPeriods || []).length
    ? `Your recent payout records:\n${result.recentPeriods.map((item) => `• ${item.weekKey || 'Period'}: ${item.status}; ${item.completedJobs} completed jobs${item.helperAmount === null ? '' : `; helper earnings R${Number(item.helperAmount).toFixed(2)}`}${item.platformAmount === null ? '' : `; platform commission R${Number(item.platformAmount).toFixed(2)}`}`).join('\n')}\nWallet: available R${(Number(result.availableWalletMinor || 0) / 100).toFixed(2)}, reserved R${(Number(result.reservedWalletMinor || 0) / 100).toFixed(2)}, outstanding commission R${(Number(result.outstandingCommissionMinor || 0) / 100).toFixed(2)}.`
    : `I could not find a weekly earnings record yet. Your wallet currently shows available R${(Number(result.availableWalletMinor || 0) / 100).toFixed(2)}, reserved R${(Number(result.reservedWalletMinor || 0) / 100).toFixed(2)}, and outstanding commission R${(Number(result.outstandingCommissionMinor || 0) / 100).toFixed(2)}.`;
  if (toolName === 'requestHumanSupport') return `I’ve referred this to Uncedo support. Ticket reference: ${result.ticketId}. A support person will handle this chat until the request is closed.`;
  return 'I could not complete that request safely.';
}

async function runWhatsAppToolWithTimeout(operation, timeoutMs = 12_000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Tool execution timed out.'), { code: 'tool-timeout' })), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

exports.processWhatsAppAssistantJobOnCreate = onDocumentCreated({
  document: 'whatsappAssistantJobs/{jobId}',
  maxInstances: 2,
  ...HALF_CPU_OPTIONS,
  memory: '256MiB',
  timeoutSeconds: 60,
  retry: false,
}, async (event) => {
  const jobRef = event.data?.ref;
  const initialJob = event.data?.data();
  if (!jobRef || !initialJob) return;
  if (!whatsappMessagingEnabled()) {
    await jobRef.set({ status: 'disabled', reason: 'whatsapp_messaging_disabled', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return;
  }

  const claim = await db.runTransaction(async (transaction) => {
    const jobSnap = await transaction.get(jobRef);
    if (!jobSnap.exists || jobSnap.data()?.status !== 'pending') return false;
    transaction.update(jobRef, {
      status: 'processing',
      phase: 'preparation',
      attemptCount: Number(jobSnap.data()?.attemptCount || 0) + 1,
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (!claim) return;

  let assistantPhase = 'preparation';
  let toolExecutionStarted = false;
  let outboundAttempted = false;
  let sendAssistantReply = null;
  try {
    const identityId = String(initialJob.identityId || '').trim();
    const eventId = String(initialJob.eventId || event.params.jobId || '').trim();
    if (!identityId || !eventId) throw new Error('WhatsApp assistant job context is incomplete.');
    const identityRef = db.collection('whatsappIdentities').doc(identityId);
    const conversationRef = db.collection('whatsappConversations').doc(identityId);
    const inboundRef = db.collection('whatsappMessages').doc(eventId);
    const [identitySnap, conversationSnap, inboundSnap] = await Promise.all([
      identityRef.get(), conversationRef.get(), inboundRef.get(),
    ]);
    if (!identitySnap.exists || !conversationSnap.exists || !inboundSnap.exists) throw new Error('WhatsApp conversation context is unavailable.');
    let identity = identitySnap.data() || {};
    let conversation = conversationSnap.data() || {};
    let inbound = inboundSnap.data() || {};
    const originalUserText = String(inbound.text || inbound.media?.caption || '').slice(0, 1200);
    if (String(conversation.lastInboundEventId || '') !== eventId) {
      await jobRef.set({ status: 'superseded', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    const accountResolution = await autoLinkVerifiedWhatsAppAccount(identityId, identity);
    identity = accountResolution.identity || identity;

    const reply = async (text, interactive = null, purpose = 'assistant_reply') => {
      outboundAttempted = true;
      assistantPhase = 'outbound_attempted';
      try {
        await jobRef.set({ phase: assistantPhase, outboundAttempted: true, retrySafe: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      } catch (error) {
        throw withWhatsAppFailureStage(error, 'mark_assistant_send_attempt');
      }
      let sendResult;
      try {
        sendResult = await persistWhatsAppAssistantReply({
          sourceEventId: eventId,
          identityId,
          identity,
          conversationRef,
          text,
          interactive,
          purpose,
        });
      } catch (error) {
        throw withWhatsAppFailureStage(error, 'persist_outbound_reply');
      }
      assistantPhase = 'outbound_completed';
      try {
        await jobRef.set({ phase: assistantPhase, outboundCompleted: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      } catch (error) {
        throw withWhatsAppFailureStage(error, 'mark_assistant_send_complete');
      }
      return sendResult;
    };
    // Keep the sender in the outer function scope: the catch block needs it
    // when classification fails and a deterministic fallback is appropriate.
    sendAssistantReply = reply;

    if (conversation.humanHandoff === true) {
      const clearanceStepActive = String(conversation.whatsappOnboarding?.stage || '')
        .startsWith('awaiting_helper_police_clearance');
      if (clearanceStepActive && inbound.media) {
        await scrubWhatsAppPoliceClearanceInbound(eventId);
        const safeInbound = { ...inbound, media: null, text: '' };
        await createOrAppendWhatsAppSupportMessage({
          db, admin, identityId, conversationRef, eventId,
          principalId: identity.linkedFirebaseUid || identity.guestPrincipalId || '',
          linkedUid: identity.linkedFirebaseUid || '',
          role: identity.role || 'unknown',
          requestId: conversation.activeServiceRequestId || '',
          inbound: safeInbound,
        }).catch((error) => logger.warn('whatsapp_support_message_append_failed', { eventId, errorCode: String(error?.code || 'ticket_write_failed').slice(0, 80) }));
        await reply('A support person is currently handling this chat. I did not attach this file to the support conversation. Please wait for support to return the chat to onboarding, then resend your police-clearance document when asked.');
        await jobRef.set({ status: 'completed', intent: 'helper_police_clearance', reason: 'human_handoff_active', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      let mediaResult = null;
      if (inbound.media) {
        try {
          mediaResult = await processWhatsAppInboundMedia({ identityId, eventId, identity, conversation, inbound });
          if (mediaResult.code === 'stored') inbound = { ...inbound, media: { ...inbound.media, assetId: mediaResult.assetId, storagePath: mediaResult.storagePath || mediaResult.asset?.storagePath || '' } };
        } catch (error) {
          logger.warn('whatsapp_support_media_processing_failed', { eventId, errorCode: String(error?.code || 'media_processing_failed').slice(0, 80) });
        }
      }
      await createOrAppendWhatsAppSupportMessage({
        db, admin, identityId, conversationRef, eventId,
        principalId: identity.linkedFirebaseUid || identity.guestPrincipalId || '',
        linkedUid: identity.linkedFirebaseUid || '',
        role: identity.role || (identity.guestPrincipalId ? 'customer' : 'unknown'),
        requestId: conversation.activeServiceRequestId || '',
        inbound,
      }).catch((error) => logger.warn('whatsapp_support_message_append_failed', { eventId, errorCode: String(error?.code || 'ticket_write_failed').slice(0, 80) }));
      const mediaNote = inbound.media && mediaResult?.code !== 'stored' ? ' I could not securely attach that media yet; please describe the issue in text.' : '';
      await reply(`Your message is with the Uncedo support team. A support person is handling this conversation.${mediaNote}`);
      await jobRef.set({ status: 'completed', intent: 'human_escalation', reason: 'human_handoff_active', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }

    if (whatsappOnboardingEnabled() && accountResolution.unverifiedCandidate && !identity.linkedFirebaseUid) {
      let accountLink;
      try {
        accountLink = await createWhatsAppExistingAccountLink({
          identityId,
          sourceEventId: eventId,
          candidate: accountResolution.unverifiedCandidate,
        });
      } catch (error) {
        logger.warn('whatsapp_existing_account_link_creation_failed', {
          identityId,
          errorCode: String(error?.code || 'account_link_creation_failed').slice(0, 80),
        });
      }
      if (accountLink?.code === 'created') {
        await reply(`To securely connect this WhatsApp chat to your Uncedo account, open this one-time verification link: ${accountLink.url}\n\nIt expires in 24 hours. If this is not your account, do not continue and contact Uncedo support.`);
      } else if (accountLink?.code === 'recent-link-sent') {
        await reply('A secure account-link was sent recently. Please use the link in that earlier message; if it has expired, send “Hi” again to request a fresh one.');
      } else if (accountLink?.code === 'phone-already-linked' || accountLink?.code === 'account-already-linked') {
        await reply('This number or account is already connected to another WhatsApp chat. For your protection, I cannot link it here. Please contact Uncedo support.');
      } else {
        await reply('I could not safely connect this number to an existing account. Please contact Uncedo support for help linking your account.');
      }
      await jobRef.set({ status: 'completed', intent: 'existing_account_link', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }

    const buttonId = String(inbound.interactive?.buttonId || '').trim();

    // Policy acknowledgement and account onboarding are deterministic backend
    // workflows. They must remain available when the optional AI router is off.
    if (buttonId === 'wa_ai_consent_yes') {
      await conversationRef.set({
        whatsappPolicyAcceptedAtMs: Date.now(),
        whatsappPolicyAcceptedVersion: WHATSAPP_POLICY_ACCEPTANCE_VERSION,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      conversation = {
        ...conversation,
        whatsappPolicyAcceptedAtMs: Date.now(),
        whatsappPolicyAcceptedVersion: WHATSAPP_POLICY_ACCEPTANCE_VERSION,
      };
      if (whatsappOnboardingEnabled()) {
        const uid = String(identity.linkedFirebaseUid || '').trim();
        if (uid) {
          const profileSnapshot = await db.collection('users').doc(uid).get();
          const profile = profileSnapshot.data() || {};
          const role = ['customer', 'helper'].includes(String(identity.role || '').toLowerCase()) ? String(identity.role).toLowerCase() : '';
          const preferredName = String(identity.preferredName || profile.whatsappPreferredName || '').trim();
          const hasHomeAddress = Boolean(String(identity.homeAddress || profile.homeAddress || '').trim());
          const state = {
            role,
            accountMode: 'account',
            homeAddressExists: hasHomeAddress,
            stage: !role ? 'complete' : !preferredName ? 'awaiting_preferred_name'
              : !hasHomeAddress ? 'awaiting_home_address'
                : role === 'helper' ? 'helper_readiness' : 'complete',
            createdAtMs: Date.now(),
          };
          await conversationRef.set({ whatsappOnboarding: state, currentMode: state.stage === 'complete' ? 'assistant' : 'onboarding' }, { merge: true });
          if (!role) {
            await reply('Your WhatsApp identity is linked, but I could not confirm whether this is a customer or helper account. Please contact Uncedo support.');
          } else if (state.stage === 'awaiting_preferred_name') {
            const knownName = String(profile.firstName || profile.fullName || profile.displayName || '').trim().split(/\s+/)[0];
            await reply(`Welcome back${knownName ? `, ${knownName}` : ''}. What name would you like Uncedo to use when speaking with you?`);
          } else if (state.stage === 'awaiting_address_choice') {
            await reply(addressChoicePrompt().text, addressChoicePrompt().interactive);
          } else if (state.stage === 'awaiting_home_address') {
            await reply('Welcome back. Please send the home address you want saved to your Uncedo profile.');
          } else if (state.stage === 'helper_readiness') {
            await reply('Welcome back. I’ll check your helper profile requirements now.');
          } else {
            const name = String(profile.whatsappPreferredName || profile.firstName || profile.fullName || '').trim().split(/\s+/)[0];
            await reply(`Thanks${name ? `, ${name}` : ''}. You can now ask about Uncedo services or start a service enquiry.`);
          }
        } else {
          const state = { stage: 'awaiting_role', role: '', accountMode: '', createdAtMs: Date.now() };
          await conversationRef.set({ whatsappOnboarding: state, currentMode: 'onboarding', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          const prompt = roleSelectionPrompt();
          await reply(prompt.text, prompt.interactive);
        }
      } else {
        const linkedUid = String(identity.linkedFirebaseUid || '').trim();
        let name = '';
        if (linkedUid) {
          const profile = (await db.collection('users').doc(linkedUid).get()).data() || {};
          name = String(profile.whatsappPreferredName || profile.firstName || profile.fullName || '').trim().split(/\s+/)[0];
        }
        await reply(`Thanks${name ? `, ${name}` : ''}. You can now ask about Uncedo services or start a service enquiry.`);
      }
      await jobRef.set({ status: 'completed', intent: 'policy_acceptance', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (buttonId === 'wa_ai_consent_no') {
      await conversationRef.set({ whatsappPolicyAcceptedAtMs: 0, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      await reply('Understood. You can review Uncedo’s policies and continue using Uncedo through the app.');
      await jobRef.set({ status: 'completed', intent: 'policy_declined', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (!hasCurrentWhatsAppPolicyAcceptance(conversation)) {
      const policyConsent = buildWhatsAppPolicyConsent(getWhatsAppDisplayName(identity));
      await reply(policyConsent.text, policyConsent.interactive);
      await jobRef.set({ status: 'completed', intent: 'policy_acceptance_required', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }

    let onboardingState = conversation.whatsappOnboarding || {};
    const helperAvailabilityCommand = inbound.type === 'text'
      ? parseWhatsAppHelperAvailabilityCommand(originalUserText)
      : '';
    const linkedHelperUid = String(identity.linkedFirebaseUid || '').trim();
    if (whatsappOnboardingEnabled()
      && linkedHelperUid
      && String(identity.role || '').toLowerCase() === 'helper'
      && normalizeTimestamp(identity.verifiedAt)) {
      const helperAuthorization = (await resolveWhatsAppToolAuthorization(identityId, identity)).authorization || {};
      if (helperAuthorization.role === 'helper' && helperAuthorization.uid === linkedHelperUid
        && helperAuthorization.verified === true && helperAuthorization.linked === true) {
        const readiness = await getWhatsAppHelperReadiness(linkedHelperUid);
        let readinessState = resolveWhatsAppHelperReadinessState({
          state: onboardingState,
          ready: readiness.readyByCurrentAppRules,
          policeClearanceRequired: readiness.policeClearanceRequired,
          policeClearanceStatus: readiness.policeClearanceStatus,
        });
        const readinessStage = String(readinessState.state.stage || '');
        if (helperPoliceClearanceUploadReady() && readiness.policeClearanceEligible
          && ['helper_readiness', 'complete', 'awaiting_helper_police_clearance', 'awaiting_helper_police_clearance_review'].includes(readinessStage)) {
          const clearanceStage = ['pending', 'uploading'].includes(readiness.policeClearanceStatus)
            ? 'awaiting_helper_police_clearance_review'
            : 'awaiting_helper_police_clearance';
          if (readinessStage !== clearanceStage) {
            readinessState = { changed: true, state: { ...readinessState.state, role: 'helper', accountMode: 'account', stage: clearanceStage, updatedAtMs: Date.now() } };
          }
        }
        if (!readiness.readyByCurrentAppRules && !readinessState.changed
          && isWhatsAppHelperProfileCaptureStage(onboardingState.stage)) {
          // Recalculate current profile and agreement state, but do not replace
          // the profile answer currently being collected.
        } else if (readinessState.changed) {
          onboardingState = readinessState.state;
          const currentMode = onboardingState.stage === 'complete' ? 'assistant' : 'onboarding';
          await conversationRef.set({ whatsappOnboarding: onboardingState, currentMode, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          conversation = { ...conversation, whatsappOnboarding: onboardingState, currentMode };
        }
        if (readinessState.reason === 'police-clearance-approved'
          && !['go_online', 'go_offline'].includes(helperAvailabilityCommand)) {
          const response = readiness.readyByCurrentAppRules
            ? 'Your police-clearance document has been approved. Your helper profile meets the current setup checks. Send “online” when you are ready to receive offers, then share your current WhatsApp location pin.'
            : `Your police-clearance document has been approved. Your helper profile still needs:\n${readiness.missing.map((item) => `• ${item}`).join('\n')}\n\nOnce those are complete, send “online” to continue.`;
          await reply(response);
          await jobRef.set({
            status: 'completed', intent: 'helper_police_clearance', reason: 'admin_approved',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          return;
        }
      }
    }
    if (helperAvailabilityCommand) {
      const result = helperAvailabilityCommand === 'go_online'
        ? await beginWhatsAppHelperOnline({ identityId, eventId, identity, conversationRef, reply })
        : await setWhatsAppHelperOffline({ identityId, eventId, identity, conversationRef, reply });
      await jobRef.set({
        status: 'completed', intent: 'helper_availability', reason: result.code,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return;
    }
    const helperOnboardingStage = String(onboardingState.stage || '').trim();
    const helperLocationBelongsToAvailabilityFlow = ['complete', 'helper_readiness'].includes(helperOnboardingStage)
      || Boolean(conversation.pendingHelperOnlineLocation)
      || Boolean(conversation.activeServiceRequestId);
    if (inbound.type === 'location'
      && String(identity.role || '').toLowerCase() === 'helper'
      && helperLocationBelongsToAvailabilityFlow) {
      const result = await processWhatsAppHelperLocation({
        identityId, eventId, identity, conversation, conversationRef, inbound, reply,
      });
      await jobRef.set({
        status: 'completed', intent: 'helper_location', reason: result.code,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return;
    }
    if (whatsappOnboardingEnabled()
      && linkedHelperUid
      && String(identity.role || '').toLowerCase() === 'helper'
      && normalizeTimestamp(identity.verifiedAt)
      && ['awaiting_helper_police_clearance', 'awaiting_helper_police_clearance_review'].includes(String(onboardingState.stage || ''))) {
      const clearanceAuthorization = (await resolveWhatsAppToolAuthorization(identityId, identity)).authorization || {};
      if (clearanceAuthorization.role !== 'helper' || clearanceAuthorization.uid !== linkedHelperUid
        || clearanceAuthorization.verified !== true || clearanceAuthorization.linked !== true) {
        await reply('I could not verify this WhatsApp number as the linked helper account. No police-clearance file was processed.');
      } else if (onboardingState.stage === 'awaiting_helper_police_clearance_review') {
        await reply('Your police-clearance document is awaiting Uncedo review. I will update the helper setup status after an administrator reviews it.');
      } else if (!helperPoliceClearanceUploadReady()) {
        await reply('Police-clearance uploads are temporarily unavailable. Please do not send the document until Uncedo confirms this step is ready.');
      } else if (!['document', 'image'].includes(String(inbound.type || '').toLowerCase())) {
        await reply('Please upload your police-clearance document here as a PDF or a clear JPG/PNG image. It will be stored privately for Uncedo review.');
      } else {
        const result = await receiveWhatsAppPoliceClearance({ uid: linkedHelperUid, identityId, eventId, inbound });
        if (result.code === 'submitted' || result.code === 'duplicate') {
          await reply('I received your police-clearance document securely. Its status is pending Uncedo administrator review. Its contents will only be shared with relevant, authorised parties who need them for the review.');
        } else if (result.code === 'already-in-review-or-approved') {
          await reply(result.status === 'approved'
            ? 'Your police-clearance document is already approved.'
            : 'A police-clearance document is already awaiting review. Please wait for an administrator update.');
        } else if (result.code === 'unsupported') {
          await reply('This file type is not supported for police clearance. Please send a PDF, JPG or PNG file.');
        } else if (result.code === 'helper-identity-required') {
          await reply('I could not verify this WhatsApp number as the linked helper account. No police-clearance file was processed.');
        } else if (result.code === 'not-current-onboarding-step') {
          await reply('Your helper profile is not currently at the police-clearance upload step. Please send “Hi” to check your current setup requirements.');
        } else if (result.code === 'disabled' || result.code === 'review-validity-not-configured') {
          await reply('Police-clearance uploads are temporarily unavailable. Please do not resend the document until Uncedo confirms this step is ready.');
        } else {
          await reply('I could not safely receive that document. Please try sending it again as a PDF, JPG or PNG, or contact Uncedo support.');
        }
      }
      if (inbound.media) await scrubWhatsAppPoliceClearanceInbound(eventId);
      await jobRef.set({
        status: 'completed', intent: 'helper_police_clearance',
        reason: String(onboardingState.stage || ''), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return;
    }
    if (whatsappOnboardingEnabled() && onboardingState.stage && onboardingState.stage !== 'complete') {
      const transition = transitionWhatsAppOnboarding({ state: onboardingState, buttonId, text: originalUserText, inboundType: inbound.type });
      if (transition.action !== 'not-in-onboarding') {
        if (transition.homeAddress && transition.action === 'check-helper-readiness') {
          const addressSaved = await persistWhatsAppOnboardingDetails({
            identityId, eventId, identity, conversationRef, state: transition.state,
            homeAddress: transition.homeAddress,
          });
          if (addressSaved.code !== 'saved') throw new Error(`WhatsApp onboarding address update failed: ${addressSaved.code}`);
          identity = { ...identity, homeAddress: transition.homeAddress };
        }
        await conversationRef.set({
          whatsappOnboarding: { ...transition.state, updatedAtMs: Date.now() },
          currentMode: transition.state.stage === 'complete' ? 'assistant' : 'onboarding',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        if (transition.action === 'create-customer-signup-link' || transition.action === 'link-customer-account'
          || transition.action === 'create-helper-signup-link' || transition.action === 'link-helper-account') {
          let signup = null;
          try {
            const role = transition.action.includes('helper') ? 'helper' : 'customer';
            const mode = getWhatsAppAccountSetupMode(transition.action);
            signup = await createWhatsAppSignupLink({ identityId, role, sourceEventId: eventId, mode });
            await conversationRef.set({
              whatsappOnboarding: { ...transition.state, signupChallengeHash: signup.tokenHash, signupLinkExpiresAtMs: signup.expiresAtMs, updatedAtMs: Date.now() },
            }, { merge: true });
          } catch (error) {
            logger.warn('whatsapp_signup_link_creation_failed', { identityId, errorCode: String(error?.code || 'signup_link_failed').slice(0, 80) });
            const retryState = { ...transition.state, stage: transition.state.role === 'helper' ? 'awaiting_helper_account_choice' : 'awaiting_customer_choice' };
            await conversationRef.set({ whatsappOnboarding: retryState, currentMode: 'onboarding' }, { merge: true });
            await reply('I could not create the secure account link right now. Please choose the account option again or try again shortly.');
          }
          if (signup) {
            const linkExistingAccount = transition.action.startsWith('link-');
            const purpose = linkExistingAccount
              ? 'sign in with your existing email account'
              : 'create your account using your email address';
            const returnInstructions = linkExistingAccount
              ? 'After you sign in to your existing account, you’ll return to this chat.'
              : 'After you create your account, you’ll return to this chat.';
            await reply(`Use this secure link to ${purpose}: ${signup.url}\n\nYour WhatsApp number is prefilled for linking. ${returnInstructions} The link expires in 30 minutes.`);
          }
        } else if (transition.action === 'choose-customer-mode' || transition.action === 'reask-customer-mode'
          || transition.action === 'choose-helper-account-mode' || transition.action === 'reask-helper-account-mode'
          || transition.action === 'reask-role' || transition.action === 'reask-address-choice') {
          const prompt = transition.interactive ? transition : transition.action.includes('helper')
            ? helperAccountChoicePrompt()
            : transition.action.includes('role') ? roleSelectionPrompt() : addressChoicePrompt();
          await reply(prompt.text, prompt.interactive);
        } else if (transition.action === 'ask-preferred-name' || transition.action === 'reask-preferred-name'
          || transition.action === 'ask-home-address' || transition.action === 'reask-home-address'
          || transition.action === 'await-signup-link' || transition.action === 'reask-helper-services'
          || transition.action === 'reask-helper-full-name' || transition.action === 'reask-helper-business-name') {
          await reply(transition.reply || 'Please use the secure account link already sent in this chat.');
        } else if (transition.action === 'save-preferred-name'
          || transition.action === 'save-helper-full-name' || transition.action === 'save-helper-provider-type'
          || transition.action === 'save-helper-business-name'
          || (transition.action === 'complete-customer-onboarding' && (transition.preferredName || transition.homeAddress))) {
          const saved = await persistWhatsAppOnboardingDetails({
            identityId, eventId, identity, conversationRef, state: transition.state,
            preferredName: transition.preferredName || '', homeAddress: transition.homeAddress || '',
            fullName: transition.fullName || '', providerType: transition.providerType || '', businessName: transition.businessName || '',
          });
          if (saved.code !== 'saved') throw new Error(`WhatsApp onboarding profile update failed: ${saved.code}`);
          const prompt = transition.interactive ? transition : null;
          if (prompt) await reply(prompt.text, prompt.interactive);
          else await reply(transition.reply || `Thanks${transition.preferredName ? `, ${transition.preferredName}` : ''}. You can now ask about Uncedo services or start a service enquiry.`);
        } else if (transition.action === 'ask-home-address') {
          await reply(transition.reply);
        } else if (transition.action === 'check-helper-readiness') {
          const authorization = (await resolveWhatsAppToolAuthorization(identityId, identity)).authorization || {};
          if (authorization.role !== 'helper' || !authorization.uid || authorization.verified !== true) {
            await reply('Please create or link your helper account first. A customer or guest identity cannot access helper setup.');
          } else {
            const readiness = await getWhatsAppHelperReadiness(authorization.uid);
            if (!String(readiness.profile.fullName || '').trim()
              && !(String(readiness.profile.firstName || '').trim() && String(readiness.profile.lastName || '').trim())) {
              const nextState = { ...transition.state, stage: 'awaiting_helper_full_name' };
              await conversationRef.set({ whatsappOnboarding: nextState, currentMode: 'onboarding' }, { merge: true });
              await reply('Please send your first and last name for your helper profile.');
            } else if (!['individual', 'business'].includes(String(readiness.profile.providerType || '').toLowerCase())) {
              const prompt = helperProviderTypePrompt();
              const nextState = { ...transition.state, stage: 'awaiting_helper_provider_type' };
              await conversationRef.set({ whatsappOnboarding: nextState, currentMode: 'onboarding' }, { merge: true });
              await reply(prompt.text, prompt.interactive);
            } else if (String(readiness.profile.providerType || '').toLowerCase() === 'business' && !String(readiness.profile.businessName || '').trim()) {
              const nextState = { ...transition.state, stage: 'awaiting_helper_business_name' };
              await conversationRef.set({ whatsappOnboarding: nextState, currentMode: 'onboarding' }, { merge: true });
              await reply('Please send the registered or trading name of your business.');
            } else if (!String(readiness.profile.homeAddress || '').trim()) {
              const nextState = { ...transition.state, stage: 'awaiting_home_address', accountMode: 'account' };
              await conversationRef.set({ whatsappOnboarding: nextState, currentMode: 'onboarding' }, { merge: true });
              await reply('Please send the home address you want saved to your helper profile.');
            } else if (!readiness.hasOfferings) {
              const services = (await getLiveServiceCatalogEntries())
                .filter((entry) => entry.active !== false && entry.approved !== false)
                .slice(0, 18);
              const serviceText = services.map((entry) => `• ${entry.label || entry.id}`).join('\n');
              const nextState = { ...transition.state, stage: 'awaiting_helper_services' };
              await conversationRef.set({ whatsappOnboarding: nextState, currentMode: 'onboarding' }, { merge: true });
              await reply(`To start your helper profile, choose at least one service from Uncedo’s catalogue. Reply with the exact service name; you may send up to five, separated by commas.\n\n${serviceText}\n\nYour selections will be submitted for review. Add portfolio photos in the Helpers app before an offering can be approved.`);
            } else if (!readiness.agreementCurrent) {
              const agreement = await createWhatsAppHelperAgreementLink({ identityId, sourceEventId: eventId });
              if (agreement.code === 'already-current') {
                await conversationRef.set({ whatsappOnboarding: { ...transition.state, stage: 'helper_readiness' } }, { merge: true });
                await reply('Your current Helper Agreement is already signed. I’ll continue checking your helper profile requirements.');
              } else {
                const nextState = {
                  ...transition.state,
                  stage: 'awaiting_helper_agreement',
                  agreementLinkChallengeHash: agreement.tokenHash,
                  agreementLinkExpiresAtMs: agreement.expiresAtMs,
                };
                await conversationRef.set({ whatsappOnboarding: nextState, currentMode: 'onboarding' }, { merge: true });
                await reply(`Please read and sign the current Uncedo Helper Agreement (version ${agreement.version}) using this secure link: ${agreement.url}\n\nSign in with the email account linked to this WhatsApp number. We will verify the link belongs to your helper account before recording acceptance. It expires in 30 minutes; after signing, return to this chat to continue setup.`);
              }
            } else if (readiness.policeClearanceRequired && readiness.policeClearanceStatus !== 'approved') {
              if (['pending', 'uploading'].includes(readiness.policeClearanceStatus)) {
                const nextState = { ...transition.state, stage: 'awaiting_helper_police_clearance_review' };
                await conversationRef.set({ whatsappOnboarding: nextState, currentMode: 'onboarding' }, { merge: true });
                await reply('Your police-clearance document is awaiting Uncedo review. I will update the helper setup status after an administrator reviews it.');
              } else if (!helperPoliceClearanceUploadReady()) {
                await reply('Police-clearance upload is required for helper setup, but this step is temporarily unavailable. Please do not send the document until Uncedo confirms it is ready.');
              } else {
                const nextState = { ...transition.state, stage: 'awaiting_helper_police_clearance' };
                await conversationRef.set({ whatsappOnboarding: nextState, currentMode: 'onboarding' }, { merge: true });
                await reply('Please upload your police-clearance document here as a PDF or a clear JPG/PNG image. It will be stored privately for Uncedo administrator review. Do not send identity or banking documents in this step.');
              }
            } else {
              const items = readiness.missing.length ? readiness.missing.map((item) => `• ${item}`).join('\n') : '• Your existing helper profile meets the current app checks.';
              await reply(`Your helper profile still needs:\n${items}\n\nAfter each item is complete and approved, you can send “online” here and share a current WhatsApp location pin, or manage availability in the Helpers app.`);
            }
          }
        } else if (transition.action === 'submit-helper-services') {
          const submitted = await submitWhatsAppHelperServices({ identityId, identity, conversationRef, onboardingState: transition.state, requestedServices: transition.requestedServices });
          if (submitted.code === 'submitted') {
            await reply(`I submitted these service offerings as pending review: ${submitted.names.join(', ')}. They are not approved yet. Add portfolio photos in the Helpers app and wait for Uncedo’s review before going online.`);
          } else {
            await reply(submitted.code === 'service-not-in-catalog'
              ? `I could not match these to active Uncedo services: ${(submitted.unmatched || []).join(', ')}. Please send exact service names from the catalogue I listed.`
              : submitted.code === 'helper-authentication-required'
                ? 'I could not verify a linked helper account, so I did not add any service offerings.'
                : 'I could not submit those service selections. Please try again or use the Helpers app.');
          }
        } else if (transition.action === 'create-helper-agreement-link'
          || (transition.action === 'await-helper-agreement' && Number(onboardingState.agreementLinkExpiresAtMs || 0) <= Date.now())) {
          try {
            const agreement = await createWhatsAppHelperAgreementLink({ identityId, sourceEventId: eventId });
            if (agreement.code === 'already-current') {
              await conversationRef.set({ whatsappOnboarding: { ...transition.state, stage: 'helper_readiness' }, currentMode: 'onboarding' }, { merge: true });
              await reply('Your current Helper Agreement is already signed. I’ll continue checking your helper profile requirements.');
            } else {
              const nextState = { ...transition.state, stage: 'awaiting_helper_agreement', agreementLinkChallengeHash: agreement.tokenHash, agreementLinkExpiresAtMs: agreement.expiresAtMs };
              await conversationRef.set({ whatsappOnboarding: nextState, currentMode: 'onboarding' }, { merge: true });
              await reply(`Please read and sign the current Uncedo Helper Agreement (version ${agreement.version}) using this secure link: ${agreement.url}\n\nSign in with the email account linked to this WhatsApp number. The link expires in 30 minutes.`);
            }
          } catch (error) {
            logger.warn('whatsapp_helper_agreement_link_failed', { identityId, errorCode: String(error?.code || 'agreement_link_failed').slice(0, 80) });
            await reply('I could not create the secure agreement link. Please try “new agreement link” again or contact Uncedo support.');
          }
        } else if (transition.action === 'await-helper-agreement') {
          await reply('Please open the current Helper Agreement link I sent above. If it has expired, reply “new agreement link” to request another one.');
        } else if (transition.action === 'complete-customer-onboarding') {
          await reply(`Thanks${String(identity.preferredName || '').trim() ? `, ${identity.preferredName}` : ''}. You can now ask about Uncedo services or start a service enquiry.`);
        } else {
          await reply(transition.reply || 'Please continue with the current Uncedo account setup step.');
        }
        await jobRef.set({ status: 'completed', intent: 'account_onboarding', onboardingAction: transition.action, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
    }
    const profileChangeAction = buttonId.match(/^wa_profile_(confirm|cancel)_(wa_[a-f0-9]{64})$/i);
    if (profileChangeAction) {
      const [, action, proposalId] = profileChangeAction;
      const proposalRef = db.collection('whatsappProfileChangeRequests').doc(proposalId);
      const proposalSnapshot = await proposalRef.get();
      const proposal = proposalSnapshot.data() || {};
      if (!whatsappAiEnabled() || proposal.identityId !== identityId || Number(proposal.expiresAtMs || 0) <= Date.now()) {
        await reply('That profile change confirmation is unavailable or expired. No profile change was made.');
      } else if (action === 'cancel') {
        await db.runTransaction(async (transaction) => {
          const [currentProposal, currentConversation] = await Promise.all([transaction.get(proposalRef), transaction.get(conversationRef)]);
          if (!currentProposal.exists || currentProposal.data()?.status !== 'pending') return;
          transaction.set(proposalRef, { status: 'cancelled', completedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          if (currentConversation.data()?.pendingProfileChange?.proposalId === proposalId) {
            transaction.set(conversationRef, { pendingProfileChange: admin.firestore.FieldValue.delete(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          }
        });
        await reply('The profile change was cancelled. Your account was not changed.');
      } else {
        const verified = await resolveWhatsAppToolAuthorization(identityId, identity);
        const authorization = verified.authorization || {};
        if (!authorization.uid || authorization.verified !== true || authorization.linked !== true
          || authorization.role !== proposal.role || !['firstName', 'lastName'].includes(proposal.field)) {
          await reply('I could not verify the linked account for this change. No profile change was made.');
        } else {
          const userRef = db.collection('users').doc(authorization.uid);
          const auditRef = db.collection('auditEvents').doc(stableEventId(`whatsapp-profile-change:${proposalId}:${authorization.uid}`));
          const result = await db.runTransaction(async (transaction) => {
            const [currentProposal, currentConversation, profileSnapshot, auditSnapshot] = await Promise.all([
              transaction.get(proposalRef), transaction.get(conversationRef), transaction.get(userRef), transaction.get(auditRef),
            ]);
            const current = currentProposal.data() || {};
            const pending = currentConversation.data()?.pendingProfileChange || {};
            if (!currentProposal.exists || current.status !== 'pending' || current.uid !== authorization.uid
              || current.identityId !== identityId || pending.proposalId !== proposalId
              || Number(current.expiresAtMs || 0) <= Date.now() || !profileSnapshot.exists) return { code: 'stale' };
            if (!['firstName', 'lastName'].includes(current.field)) return { code: 'invalid-field' };
            const profile = profileSnapshot.data() || {};
            const oldParts = String(profile.fullName || profile.displayName || '').trim().split(/\s+/).filter(Boolean);
            let firstName = String(profile.firstName || oldParts[0] || '').trim();
            let lastName = String(profile.lastName || oldParts.slice(1).join(' ') || '').trim();
            if (current.field === 'firstName') firstName = String(current.value || '').trim();
            else lastName = String(current.value || '').trim();
            if (!firstName) return { code: 'first-name-required' };
            const fullName = [firstName, lastName].filter(Boolean).join(' ').slice(0, 180);
            const now = admin.firestore.FieldValue.serverTimestamp();
            transaction.update(userRef, { firstName, lastName, fullName, displayName: fullName, updatedAt: now });
            transaction.set(proposalRef, { status: 'completed', completedAt: now }, { merge: true });
            transaction.set(conversationRef, { pendingProfileChange: admin.firestore.FieldValue.delete(), updatedAt: now }, { merge: true });
            if (!auditSnapshot.exists) transaction.create(auditRef, {
              eventType: 'whatsapp_profile_name_changed', actorUid: authorization.uid, identityId,
              role: authorization.role, changedField: current.field, createdAt: now,
            });
            return { code: 'updated' };
          });
          await reply(result.code === 'updated' ? 'Your profile name has been updated.' : 'That profile change is no longer current. No change was made.');
        }
      }
      await jobRef.set({ status: 'completed', intent: 'profile_change_confirmation', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    const cashActionMatch = buttonId.match(/^wa_cash_(confirm|reject)_(wa_[a-f0-9]{64})$/i);
    if (cashActionMatch) {
      const [, action, actionId] = cashActionMatch;
      const actionRef = db.collection('whatsappPaymentActions').doc(actionId);
      const actionSnap = await actionRef.get();
      const paymentAction = actionSnap.exists ? actionSnap.data() || {} : null;
      const helperId = String(identity.linkedFirebaseUid || '');
      if (String(identity.role || '').toLowerCase() !== 'helper' || !paymentAction || paymentAction.helperId !== helperId
        || Number(paymentAction.expiresAtMs || 0) <= Date.now() || paymentAction.action !== action) {
        await reply('That payment confirmation is unavailable or expired. Open the helper app to review pending cash confirmations.');
      } else {
        const result = await handleCashPaymentConfirmation({ requestId: paymentAction.requestId, attemptId: paymentAction.attemptId, helperId, action });
        await actionRef.set({ status: result.action === 'settled' || result.action === 'rejected' ? 'completed' : 'stale', respondedAtMs: Date.now(), responseEventId: eventId }, { merge: true });
        await reply(result.action === 'settled'
          ? 'Cash payment confirmed. The request is marked paid.'
          : result.action === 'rejected'
            ? 'You reported that payment was not received. The request remains unpaid.'
            : 'This confirmation is no longer current. Check the helper app for the latest payment status.');
      }
      await jobRef.set({ status: 'completed', intent: 'cash_payment_confirmation', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    const cashPaidButton = buttonId.match(/^wa_cash_paid_([a-f0-9]{40})$/i);
    if (cashPaidButton) {
      const pending = conversation.pendingCashPayment || {};
      const attemptId = cashPaidButton[1];
      if (pending.identityId !== identityId || pending.attemptId !== attemptId || Number(pending.expiresAtMs || 0) <= Date.now()) {
        await reply('That cash payment prompt expired. Send “payment methods” to review the current request again.');
      } else {
        const result = await reportCashPayment({ db, admin, requestId: pending.requestId, customerId: String(identity.linkedFirebaseUid || identity.guestPrincipalId || ''), attemptId });
        if (result.action === 'reported' || result.action === 'already-reported') {
          const helperId = String(result.request?.helperAssignment?.helperId || '');
          await notifyCashPaymentToHelper({ requestId: pending.requestId, attemptId, helperId, amount: pending.amount });
          await reply('Thanks. I’ve asked your assigned helper to confirm the amount received. The request remains unpaid until the helper confirms.');
        } else {
          await reply('I could not submit that payment report. Check the payment status or contact support.');
        }
      }
      await jobRef.set({ status: 'completed', intent: 'cash_payment_report', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (['wa_payment_cash', 'wa_payment_card', 'wa_payment_saved'].includes(buttonId)) {
      const pending = conversation.pendingPaymentSelection || {};
      if (pending.identityId !== identityId || Number(pending.expiresAtMs || 0) <= Date.now()) {
        await reply('That payment selection expired. Send “payment methods” again to review the current request.');
        await jobRef.set({ status: 'completed', intent: 'payment_selection_expired', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      const context = await getWhatsAppPaymentContext({ identityId, identity, requestId: pending.requestId });
      if (context.code !== 'available') {
        await reply(context.code === 'already-paid' ? 'This request is already paid.' : 'This request is no longer payable. Ask “payment status” or contact support.');
        await jobRef.set({ status: 'completed', intent: 'payment_selection', reason: context.code, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      if (buttonId === 'wa_payment_cash') {
        const session = await createWhatsAppPaymentSession(context);
        const resolved = session.code === 'created' ? await resolveServicePaymentSession({ db, token: session.token }) : null;
        const begun = resolved?.code === 'available' ? await beginServicePaymentAttempt({ db, admin, sessionRef: resolved.sessionRef, session: resolved.session, method: 'cash', idempotencyKey: `wa-cash-select:${eventId}` }) : { action: session.code };
        if (!['created', 'existing'].includes(begun.action)) {
          await reply('Another payment is already being handled or this request is no longer payable. Send “payment status” for the current state.');
        } else {
          await conversationRef.set({
            pendingPaymentSelection: admin.firestore.FieldValue.delete(),
            pendingCashPayment: { identityId, requestId: pending.requestId, attemptId: begun.attempt.attemptId, amount: Number(begun.attempt.amount), expiresAtMs: Date.now() + 20 * 60 * 1000 },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          await reply(`Pay R${Number(begun.attempt.amount).toFixed(2)} directly to your assigned helper by cash, EFT or bank transfer. When you have paid, tap “I have paid”. The payment is not confirmed until your helper verifies receipt.`, {
            type: 'button', body: { text: 'Tell Uncedo after you pay the assigned helper directly.' }, action: { buttons: [
              { type: 'reply', reply: { id: `wa_cash_paid_${begun.attempt.attemptId}`, title: 'I have paid' } },
              { type: 'reply', reply: { id: 'wa_payment_cancel', title: 'Cancel' } },
            ] },
          });
        }
      } else if (buttonId === 'wa_payment_card') {
        const session = await createWhatsAppPaymentSession(context);
        if (session.code === 'created') {
          const paymentUrl = `${String(process.env.CUSTOMER_PAYMENT_URL || 'https://uncedo.bakayise.com/payment').replace(/\/$/, '')}?token=${encodeURIComponent(session.token)}`;
          await conversationRef.set({ pendingPaymentSelection: admin.firestore.FieldValue.delete(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          await reply(`Pay R${Number(context.amount).toFixed(2)} securely by card using this request-specific Uncedo payment link: ${paymentUrl}\nThe link expires in 20 minutes.`);
        } else await reply('I could not create a payment link for this request. Please try again or contact support.');
      } else if (context.cards.length) {
        await conversationRef.set({ pendingPaymentSelection: { ...pending, selectingSavedCard: true }, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        await reply('Choose a saved card. I will show the amount and ask you to confirm before any charge is attempted.', {
          type: 'list', body: { text: `Request ${pending.requestId} · R${Number(context.amount).toFixed(2)} ZAR` }, action: { button: 'Choose card', sections: [{ title: 'Saved cards', rows: context.cards.slice(0, 10).map((card) => ({ id: `wa_saved_card_${card.id}`, title: `${card.brand} •••• ${card.last4}`.slice(0, 24), description: card.isDefault ? 'Default payment card' : 'Saved payment card' })) }] },
        });
      } else {
        await reply('There are no eligible saved cards linked to this WhatsApp identity. Choose Cash or New card instead.');
      }
      await jobRef.set({ status: 'completed', intent: 'payment_selection', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    const savedCardChoice = String(inbound.interactive?.listId || '').match(/^wa_saved_card_([A-Za-z0-9_-]{1,128})$/);
    if (savedCardChoice) {
      const pending = conversation.pendingPaymentSelection || {};
      if (pending.identityId !== identityId || !pending.selectingSavedCard || Number(pending.expiresAtMs || 0) <= Date.now()) {
        await reply('That saved-card selection expired. Send “payment methods” to start again.');
        await jobRef.set({ status: 'completed', intent: 'saved_card_selection_expired', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      const context = await getWhatsAppPaymentContext({ identityId, identity, requestId: pending.requestId });
      const card = context.cards?.find((item) => item.id === savedCardChoice[1]);
      if (!card || !context.ownerUid || context.ownerUid !== String(identity.linkedFirebaseUid || '')) {
        await reply('A saved card is available only after this WhatsApp identity is linked to the customer account that owns it.');
        await jobRef.set({ status: 'completed', intent: 'saved_card_unavailable', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      const session = await createWhatsAppPaymentSession(context);
      const resolved = session.code === 'created' ? await resolveServicePaymentSession({ db, token: session.token }) : null;
      const begun = resolved?.code === 'available' ? await beginServicePaymentAttempt({ db, admin, sessionRef: resolved.sessionRef, session: resolved.session, method: 'saved_card', selectedCardId: card.id, idempotencyKey: `wa-saved-card:${eventId}` }) : { action: session.code };
      if (!['created', 'existing'].includes(begun.action)) {
        await reply('Another payment is active or this request is no longer payable. No saved-card charge was made.');
      } else {
        await conversationRef.set({
          pendingPaymentSelection: admin.firestore.FieldValue.delete(),
          pendingSavedCardPayment: { identityId, requestId: pending.requestId, attemptId: begun.attempt.attemptId, expiresAtMs: Date.now() + 10 * 60 * 1000 },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        await reply(`Please review before paying: request ${pending.requestId}, R${Number(begun.attempt.amount).toFixed(2)} ZAR, ${card.brand} ending ${card.last4}. This will charge the saved card only after you confirm.`, {
          type: 'button', body: { text: 'Confirm this saved-card charge?' }, action: { buttons: [
            { type: 'reply', reply: { id: `wa_saved_confirm_${begun.attempt.attemptId}`, title: 'Confirm payment' } },
            { type: 'reply', reply: { id: 'wa_saved_cancel', title: 'Cancel' } },
          ] },
        });
      }
      await jobRef.set({ status: 'completed', intent: 'saved_card_confirmation', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    const savedCardConfirm = buttonId.match(/^wa_saved_confirm_([a-f0-9]{40})$/i);
    if (savedCardConfirm || buttonId === 'wa_saved_cancel' || buttonId === 'wa_payment_cancel') {
      const pending = conversation.pendingSavedCardPayment || conversation.pendingCashPayment || {};
      if (buttonId !== 'wa_saved_cancel' && buttonId !== 'wa_payment_cancel'
        && (pending.identityId !== identityId || pending.attemptId !== savedCardConfirm?.[1] || Number(pending.expiresAtMs || 0) <= Date.now())) {
        await reply('That payment confirmation expired. No card was charged. Send “payment methods” to review the current balance.');
      } else if (buttonId === 'wa_saved_cancel') {
        await conversationRef.set({ pendingSavedCardPayment: admin.firestore.FieldValue.delete(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        await reply('No saved-card charge was made.');
      } else if (buttonId === 'wa_payment_cancel') {
        await conversationRef.set({ pendingCashPayment: admin.firestore.FieldValue.delete(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        await reply('No payment was reported.');
      } else {
        const context = await getWhatsAppPaymentContext({ identityId, identity, requestId: pending.requestId });
        const selectedAttemptSnap = await db.collection(PAYMENT_OPERATIONS).doc(pending.requestId).collection('attempts').doc(pending.attemptId).get();
        const selectedCardId = String(selectedAttemptSnap.data()?.selectedCardId || '');
        const card = context.ownerUid
          ? await getServerPaymentMethod({ db, admin, uid: context.ownerUid, methodId: selectedCardId })
          : null;
        if (!card || context.ownerUid !== String(identity.linkedFirebaseUid || '') || !['available'].includes(context.code)) {
          await reply('I could not verify the linked saved card or current request. No charge was made.');
        } else {
          let paystackSecretKey = '';
          try { paystackSecretKey = getPaymentsSecrets().PAYSTACK_SECRET_KEY; } catch { await reply('Saved-card payments are temporarily unavailable. No charge was initiated.'); }
          if (paystackSecretKey) {
            const reference = getRequestPaymentReference(pending.requestId, pending.attemptId);
            const claim = await claimSavedCardPayment({ db, admin, requestId: pending.requestId, attemptId: pending.attemptId, gatewayReference: reference });
            if (['charge', 'reconcile'].includes(claim.action)) {
              const outcome = await executeServiceChargeAttempt({
                operation: { ...claim.attempt, requestId: pending.requestId, operationId: `payment_${pending.requestId}`, gatewayReference: reference },
                action: claim.action,
                email: String((await db.collection('users').doc(context.ownerUid).get()).data()?.email || ''),
                authorizationCode: card.paystackAuthorizationCode,
                paystack: { chargeAuthorization: (input) => chargeAuthorizationWithPaystack({ paystackSecretKey, ...input }), verifyTransaction: (input) => verifyPaystackTransaction({ paystackSecretKey, ...input }) },
              });
              const result = await settleRequestPayment({ db, admin, requestId: pending.requestId, attemptId: pending.attemptId, outcome: outcome.outcome, gatewayTransactionId: outcome.transaction?.id ? String(outcome.transaction.id) : '', gatewayReference: reference, providerStatus: outcome.transaction?.status || outcome.outcome, walletEnabled: helperWalletEnabled() });
              if (['settled', 'already-paid'].includes(result.action)) await issuePaidRequestPostEffects({ requestId: pending.requestId, paymentResult: result });
              await reply(result.action === 'settled' || result.action === 'already-paid'
                ? `Payment confirmed. Receipt ${result.receiptId || 'recorded'}.`
                : result.action === 'failed' ? 'Paystack confirmed that the saved-card payment failed. You can try a different method.' : 'Paystack has not confirmed the result yet. I will not retry the charge while it is uncertain.');
            } else await reply(claim.action === 'already-paid' ? 'This request has already been paid.' : 'This payment confirmation is no longer active. No new charge was started.');
          }
        }
        await conversationRef.set({ pendingSavedCardPayment: admin.firestore.FieldValue.delete(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
      await jobRef.set({ status: 'completed', intent: 'saved_card_payment', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (buttonId === 'wa_cancel_abort') {
      await conversationRef.set({ pendingCancellation: admin.firestore.FieldValue.delete(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      await reply('The request has not been canceled.');
      await jobRef.set({ status: 'completed', intent: 'cancellation_aborted', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    const typedCancellationConfirmation = inbound.type === 'text'
      && /^(?:confirm cancellation|confirm cancel|yes, cancel it)$/i.test(String(inbound.text || '').trim());
    if (buttonId === 'wa_cancel_confirm' || typedCancellationConfirmation) {
      const pending = conversation.pendingCancellation || null;
      if (!whatsappCancellationEnabled()) {
        await reply('WhatsApp cancellation is not enabled yet. Please use the Uncedo app or contact support.');
        await jobRef.set({ status: 'completed', intent: 'cancellation', reason: 'whatsapp_cancellation_disabled', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      if (!pending || String(pending.identityId || '') !== identityId || Number(pending.expiresAtMs || 0) <= Date.now()) {
        await conversationRef.set({ pendingCancellation: admin.firestore.FieldValue.delete() }, { merge: true });
        await reply('That cancellation confirmation expired. Send “cancel my booking” to review the current request and any applicable fee.');
        await jobRef.set({ status: 'completed', intent: 'cancellation', reason: 'confirmation_expired', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      const preview = await getWhatsAppCustomerCancellationPreview({ identityId, identity, requestId: pending.requestId });
      if (preview.code !== 'eligible') {
        await conversationRef.set({ pendingCancellation: admin.firestore.FieldValue.delete() }, { merge: true });
        await reply(preview.code === 'already-cancelled'
          ? 'This request is already canceled.'
          : preview.code === 'already-completed'
            ? 'This request is already completed and cannot be canceled.'
            : 'This request cannot be canceled from its current state. I have not changed it.');
        await jobRef.set({ status: 'completed', intent: 'cancellation', reason: preview.code, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      if (!cancellationQuoteMatches(pending, preview)) {
        const refreshed = {
          identityId,
          requestId: preview.requestId,
          status: preview.status,
          cancellationAmount: preview.cancellationAmount,
          billingRule: preview.billingRule,
          expiresAtMs: Date.now() + 5 * 60 * 1000,
        };
        await conversationRef.set({ pendingCancellation: refreshed, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        const feeText = Number(preview.cancellationAmount || 0) > 0
          ? `The current cancellation fee is R${Number(preview.cancellationAmount).toFixed(2)} ZAR.`
          : 'There is no cancellation fee under the current request state.';
        await reply(`The request state or fee changed. ${feeText} Review and confirm again if you still want to cancel.`, {
          type: 'button', body: { text: feeText }, action: { buttons: [
            { type: 'reply', reply: { id: 'wa_cancel_confirm', title: 'Confirm cancel' } },
            { type: 'reply', reply: { id: 'wa_cancel_abort', title: 'Keep booking' } },
          ] },
        });
        await jobRef.set({ status: 'completed', intent: 'cancellation', reason: 'terms_changed', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      const result = await cancelCustomerServiceRequestFromWhatsApp({
        identityId,
        identity,
        requestId: pending.requestId,
        expectedCancellation: { status: preview.status, cancellationAmount: preview.cancellationAmount },
      });
      if (result.statusCode === 200 && result.body?.success === true) {
        await db.runTransaction(async (transaction) => {
          const currentConversation = await transaction.get(conversationRef);
          const current = currentConversation.data() || {};
          const patch = { pendingCancellation: admin.firestore.FieldValue.delete(), updatedAt: admin.firestore.FieldValue.serverTimestamp() };
          if (String(current.activeServiceRequestId || '') === String(pending.requestId)) patch.activeServiceRequestId = null;
          transaction.set(conversationRef, patch, { merge: true });
        });
        const fee = Number(result.body.cancellation?.cancellationAmount ?? preview.cancellationAmount ?? 0);
        const reconciliation = result.body.charge?.pendingReconciliation === true;
        const chargeConfirmed = result.body.charge?.ok === true;
        await reply(fee <= 0
          ? 'Your request was canceled. No cancellation fee was recorded.'
          : reconciliation
            ? `Your request was canceled. The applicable fee is R${fee.toFixed(2)} ZAR. Its payment result is still being verified; Uncedo will not start another charge while it is unresolved.`
            : chargeConfirmed
              ? `Your request was canceled. The cancellation fee of R${fee.toFixed(2)} ZAR was confirmed as paid.`
              : `Your request was canceled. The applicable fee is R${fee.toFixed(2)} ZAR, but payment was not confirmed. Please check payment status in the Uncedo app or contact support.`);
      } else if (result.statusCode === 409 && result.body?.code === 'cancellation-terms-changed') {
        const currentPreview = result.body.cancellationPreview || preview;
        const refreshed = {
          identityId, requestId: pending.requestId, status: currentPreview.status,
          cancellationAmount: currentPreview.cancellationAmount, billingRule: currentPreview.billingRule,
          expiresAtMs: Date.now() + 5 * 60 * 1000,
        };
        await conversationRef.set({ pendingCancellation: refreshed }, { merge: true });
        await reply(`The cancellation fee changed to R${Number(currentPreview.cancellationAmount || 0).toFixed(2)} ZAR. Please confirm again if you want to continue.`, {
          type: 'button', body: { text: `Updated cancellation fee: R${Number(currentPreview.cancellationAmount || 0).toFixed(2)} ZAR.` }, action: { buttons: [
            { type: 'reply', reply: { id: 'wa_cancel_confirm', title: 'Confirm cancel' } },
            { type: 'reply', reply: { id: 'wa_cancel_abort', title: 'Keep booking' } },
          ] },
        });
      } else {
        await reply('I could not complete the cancellation. The request was not confirmed as canceled. Please check the Uncedo app or contact support before trying again.');
      }
      await jobRef.set({ status: 'completed', intent: 'cancellation', resultCode: result.body?.code || null, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    const explicitSupportRequest = inbound.type === 'text'
      && /^(?:support|human support|human agent|talk to support|speak to a person|contact support)$/i.test(String(inbound.text || '').trim());
    if (explicitSupportRequest) {
      if (!whatsappSupportEnabled()) {
        await reply('WhatsApp human support is not available yet. Please use the Uncedo app to contact support.');
      } else {
        const ticket = await createOrAppendWhatsAppSupportMessage({
          db, admin, identityId, conversationRef, eventId,
          principalId: identity.linkedFirebaseUid || identity.guestPrincipalId || '',
          linkedUid: identity.linkedFirebaseUid || '',
          role: identity.role || (identity.guestPrincipalId ? 'customer' : 'unknown'),
          requestId: conversation.activeServiceRequestId || '',
          inbound,
        });
        if (inbound.media?.assetId) await associateWhatsAppMediaWithSupportTicket({ assetId: inbound.media.assetId, identityId, ticketId: ticket.ticketId });
        await reply(`I’ve sent this conversation to Uncedo support. Your ticket reference is ${ticket.ticketId}. A support person will handle this chat until the request is closed.`);
      }
      await jobRef.set({ status: 'completed', intent: 'human_escalation', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    const offerActionMatch = buttonId.match(/^wa_offer_(accept|decline)_(wa_[a-f0-9]{64})$/i);
    if (offerActionMatch) {
      const [, action, actionId] = offerActionMatch;
      if (String(identity.role || '').toLowerCase() !== 'helper' || !identity.linkedFirebaseUid) {
        await reply('Please link and verify your Uncedo helper account before responding to offers on WhatsApp.');
        await jobRef.set({ status: 'completed', intent: 'helper_offer', errorCode: 'helper_identity_unlinked', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      const actionRef = db.collection('whatsappOfferActions').doc(actionId);
      const actionSnap = await actionRef.get();
      const offerAction = actionSnap.exists ? actionSnap.data() || {} : null;
      if (!offerAction || offerAction.helperId !== identity.linkedFirebaseUid) {
        await reply('That helper offer action is invalid or belongs to another helper.');
        await jobRef.set({ status: 'completed', intent: 'helper_offer', errorCode: 'offer_action_not_authorized', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      const outcome = await serviceRequestOfferOperations.respond({
        requestId: offerAction.requestId,
        helperId: identity.linkedFirebaseUid,
        offerToken: offerAction.offerToken,
        offerRevision: offerAction.offerRevision,
        action,
      });
      if (outcome.didApply) {
        await recordHelperOfferLifecycleEvent({
          helperId: identity.linkedFirebaseUid,
          requestId: offerAction.requestId,
          offerRevision: offerAction.offerRevision,
          categoryId: outcome.categoryId,
          serviceIds: outcome.serviceIds,
          outcome: action === 'accept' ? 'accepted' : 'declined',
          offeredAtMs: outcome.offerStartedAtMs,
          closedAtMs: Date.now(),
          responseMinutes: Math.max(0, Number(((Date.now() - outcome.offerStartedAtMs) / 60000).toFixed(2))),
          sourceStatus: action === 'accept' ? 'accepted' : 'matching',
        }).catch((error) => logger.warn('whatsapp_helper_offer_stats_failed', { requestId: offerAction.requestId, error: error.message }));
      }
      const replyText = outcome.error
        ? outcome.error === 'offer-expired'
          ? 'This helper offer has expired. Uncedo will continue matching the request.'
          : outcome.error === 'helper-already-has-active-request'
            ? 'You already have an active service request, so this offer was not accepted.'
            : 'This helper offer is no longer available.'
        : action === 'accept'
          ? 'You accepted the service offer. The request is now assigned to you.'
          : 'You declined the service offer. Uncedo will look for the next eligible helper.';
      await reply(replyText);
      if (!outcome.error && action === 'accept') {
        await conversationRef.set({
          currentMode: 'provider_relay',
          currentIntent: 'provider_relay',
          activeServiceRequestId: offerAction.requestId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      await actionRef.set({
        lastResponseEventId: eventId,
        lastResponseAction: action,
        lastResponseAt: admin.firestore.FieldValue.serverTimestamp(),
        lastResponseError: outcome.error || null,
      }, { merge: true });
      await jobRef.set({ status: 'completed', intent: 'helper_offer', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }

    const commandText = inbound.type === 'text' ? String(inbound.text || '').trim() : '';
    const helperCashResponse = commandText.match(/^(?:confirm cash|cash received|reject cash|cash not received)(?: payment)?\s+(?:request\s+)?([A-Za-z0-9_-]{6,128})$/i);
    if (helperCashResponse) {
      const helperId = String(identity.linkedFirebaseUid || '');
      const action = /^(?:reject cash|cash not received)/i.test(commandText) ? 'reject' : 'confirm';
      const requestId = helperCashResponse[1];
      const requestSnap = String(identity.role || '').toLowerCase() === 'helper' && helperId
        ? await db.collection('serviceRequests').doc(requestId).get().catch(() => null)
        : null;
      if (!requestSnap?.exists || String(requestSnap.data()?.helperAssignment?.helperId || '') !== helperId) {
        await reply('I could not verify that you are the assigned helper for this request.');
      } else {
        const paymentSnap = await db.collection(PAYMENT_OPERATIONS).doc(requestId).get();
        const payment = paymentSnap.data() || {};
        if (payment.status !== 'awaiting_cash_confirmation' || !payment.activeAttemptId) {
          await reply('There is no pending cash confirmation for that request.');
        } else {
          const result = await handleCashPaymentConfirmation({ requestId, attemptId: String(payment.activeAttemptId), helperId, action });
          await reply(result.action === 'settled'
            ? 'Cash payment confirmed. The request is now marked paid.'
            : result.action === 'rejected'
              ? 'Payment not confirmed. The request remains unpaid.'
              : 'That cash payment confirmation is no longer active.');
        }
      }
      await jobRef.set({ status: 'completed', intent: 'cash_payment_confirmation', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (/^(?:i have paid|i paid|paid the helper|cash paid)$/i.test(commandText)) {
      const pending = conversation.pendingCashPayment || {};
      if (pending.identityId !== identityId || Number(pending.expiresAtMs || 0) <= Date.now()) {
        await reply('I do not have an active cash payment report for this conversation. Send “payment methods” to start again.');
      } else {
        const result = await reportCashPayment({ db, admin, requestId: pending.requestId, customerId: String(identity.linkedFirebaseUid || identity.guestPrincipalId || ''), attemptId: pending.attemptId });
        if (result.action === 'reported' || result.action === 'already-reported') {
          const helperId = String(result.request?.helperAssignment?.helperId || '');
          await notifyCashPaymentToHelper({ requestId: pending.requestId, attemptId: pending.attemptId, helperId, amount: pending.amount });
          await reply('I’ve asked your assigned helper to confirm the amount received. The request remains unpaid until the helper confirms.');
        } else await reply('I could not submit that payment report. Check payment status or contact support.');
      }
      await jobRef.set({ status: 'completed', intent: 'cash_payment_report', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    const command = parseWhatsAppCommand(commandText);
    if (command?.type === 'booking_history') {
      const requests = await listWhatsAppRequests({ db, identity, perPrincipalLimit: 25, resultLimit: 5 });
      await reply(formatWhatsAppRequestHistory(requests));
      await jobRef.set({ status: 'completed', intent: 'booking_history', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (command?.type === 'booking_status' || command?.type === 'booking_details') {
      const requestId = String(command.requestId || conversation.activeServiceRequestId || '').trim();
      const result = requestId ? await getWhatsAppRequestForIdentity({ db, identity, requestId }) : { code: 'not-found' };
      if (result.code === 'forbidden') {
        await reply('I could not verify access to that service request. Please sign in to the Uncedo app or contact support.');
      } else if (result.code !== 'found') {
        await reply('I could not find a request linked to this WhatsApp conversation. Ask “booking history” to see your recent requests, or use the Uncedo app.');
      } else {
        await reply(formatWhatsAppRequestSummary(buildWhatsAppRequestSummary(result.request)));
      }
      await jobRef.set({ status: 'completed', intent: command.type, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (command?.type === 'payment_status') {
      let requestId = String(command.requestId || conversation.activeServiceRequestId || '').trim();
      if (!requestId && !command.requestId) {
        const history = await listWhatsAppRequests({ db, identity, perPrincipalLimit: 25, resultLimit: 5 });
        const finalized = history.filter((request) => ['completed', 'canceled', 'cancelled'].includes(String(request.status || '').toLowerCase()));
        if (finalized.length === 1) requestId = String(finalized[0].id || '');
      }
      const result = requestId ? await getWhatsAppRequestForIdentity({ db, identity, requestId }) : { code: 'not-found' };
      if (result.code === 'forbidden') {
        await reply('I could not verify access to that payment record. Please sign in to the Uncedo app or contact support.');
      } else if (result.code !== 'found') {
        await reply('I could not identify one of your completed requests. Ask “booking history”, then send “payment status request <reference>”.');
      } else {
        const request = result.request;
        const [operationSnap, paymentSnap] = await Promise.all([
          db.collection(FINANCIAL_OPERATIONS_COLLECTION).doc(serviceFinancialOperationId(request.id)).get(),
          db.collection(PAYMENT_OPERATIONS).doc(request.id).get(),
        ]);
        const operation = paymentSnap.exists ? paymentSnap.data() || {} : operationSnap.exists ? operationSnap.data() || {} : null;
        const summary = buildWhatsAppPaymentSummary({ request, operation });
        await reply(formatWhatsAppPaymentSummary(summary));
      }
      await jobRef.set({ status: 'completed', intent: 'payment_status', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (command?.type === 'cancellation_request') {
      if (!whatsappCancellationEnabled()) {
        await reply('WhatsApp cancellation is not enabled yet. Please use the Uncedo app, or reply “support” for help.');
        await jobRef.set({ status: 'completed', intent: 'cancellation', reason: 'whatsapp_cancellation_disabled', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      const role = String(identity.role || (identity.guestPrincipalId ? 'customer' : '')).toLowerCase();
      if (role !== 'customer') {
        await reply('Only the customer who created a request can cancel it through WhatsApp.');
        await jobRef.set({ status: 'completed', intent: 'cancellation', reason: 'customer_role_required', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      let targetRequestId = String(command.requestId || conversation.activeServiceRequestId || '').trim();
      if (!targetRequestId && !command.requestId) {
        const recent = await listWhatsAppRequests({ db, identity, perPrincipalLimit: 25, resultLimit: 10 });
        const eligible = recent.filter((item) => [...PRE_ASSIGNMENT_SERVICE_REQUEST_STATUSES, ...POST_ASSIGNMENT_SERVICE_REQUEST_STATUSES]
          .includes(String(item.status || '').toLowerCase()));
        if (eligible.length === 1) targetRequestId = String(eligible[0].id || '');
        else if (eligible.length > 1) {
          await reply('You have more than one request that may be canceled. Send “cancel request <reference>” using the reference from “booking history”.');
          await jobRef.set({ status: 'completed', intent: 'cancellation', reason: 'request_selection_required', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          return;
        }
      }
      const preview = targetRequestId
        ? await getWhatsAppCustomerCancellationPreview({ identityId, identity, requestId: targetRequestId })
        : { code: 'not-found' };
      if (preview.code !== 'eligible') {
        await reply(preview.code === 'forbidden'
          ? 'I could not verify that you own this request.'
          : preview.code === 'already-cancelled'
            ? 'This request is already canceled.'
            : preview.code === 'already-completed'
              ? 'This request is already completed and cannot be canceled.'
              : preview.code === 'not-cancellable'
                ? 'This request cannot be canceled from its current state.'
                : 'I could not identify a request to cancel. Ask “booking history” or include the request reference.');
        await jobRef.set({ status: 'completed', intent: 'cancellation', reason: preview.code, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      const pendingCancellation = {
        identityId,
        requestId: preview.requestId,
        status: preview.status,
        cancellationAmount: preview.cancellationAmount,
        billingRule: preview.billingRule,
        expiresAtMs: Date.now() + 5 * 60 * 1000,
      };
      await conversationRef.set({ pendingCancellation, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      const feeText = Number(preview.cancellationAmount || 0) > 0
        ? `The current cancellation fee is R${Number(preview.cancellationAmount).toFixed(2)} ZAR.`
        : 'There is no cancellation fee under the current request state.';
      await reply(`${feeText} Cancel request ${preview.requestId}? Nothing will change until you confirm.`, {
        type: 'button', body: { text: `${feeText} Confirm only if you want to cancel this service request.` }, action: { buttons: [
          { type: 'reply', reply: { id: 'wa_cancel_confirm', title: 'Confirm cancel' } },
          { type: 'reply', reply: { id: 'wa_cancel_abort', title: 'Keep booking' } },
        ] },
      });
      await jobRef.set({ status: 'completed', intent: 'cancellation', requestId: preview.requestId, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }

    if (command?.type === 'payment_initiation') {
      if (!whatsappPaymentsEnabled()) {
        await reply('WhatsApp payment options are not enabled yet. You can still ask “payment status” to check a recorded result.');
        await jobRef.set({ status: 'completed', intent: 'payment_help', reason: 'whatsapp_payments_disabled', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      const role = String(identity.role || (identity.guestPrincipalId ? 'customer' : '')).toLowerCase();
      if (role !== 'customer') {
        await reply('Only the customer who owns a request can choose its payment method.');
        await jobRef.set({ status: 'completed', intent: 'payment_help', reason: 'customer_role_required', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      let candidates = [];
      const directRequestId = String(conversation.activeServiceRequestId || '').trim();
      if (directRequestId) {
        const context = await getWhatsAppPaymentContext({ identityId, identity, requestId: directRequestId });
        if (context.code === 'available') candidates = [context];
      }
      if (!candidates.length) {
        const history = await listWhatsAppRequests({ db, identity, perPrincipalLimit: 25, resultLimit: 8 });
        for (const item of history) {
          if (String(item.status || '').toLowerCase() !== 'completed') continue;
          const context = await getWhatsAppPaymentContext({ identityId, identity, requestId: item.id });
          if (context.code === 'available') candidates.push(context);
        }
      }
      if (candidates.length !== 1) {
        await reply(candidates.length > 1
          ? 'You have more than one unpaid completed request. Send “payment status request <reference>” and use the reference from your booking history, or open the request-specific payment link in the Uncedo app.'
          : 'I could not find an unpaid completed request linked to this WhatsApp identity. Send “booking history” or “payment status” for help.');
        await jobRef.set({ status: 'completed', intent: 'payment_help', reason: candidates.length > 1 ? 'request_selection_required' : 'no_payable_request', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      const context = candidates[0];
      const pendingPaymentSelection = { identityId, requestId: context.request.id, amount: context.amount, expiresAtMs: Date.now() + 10 * 60 * 1000 };
      await conversationRef.set({ pendingPaymentSelection, currentMode: 'payment', currentIntent: 'payment_method_selection', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      const methodButtons = [
        { type: 'reply', reply: { id: 'wa_payment_cash', title: 'Cash / transfer' } },
        { type: 'reply', reply: { id: 'wa_payment_card', title: 'New card' } },
        ...(context.cards.length ? [{ type: 'reply', reply: { id: 'wa_payment_saved', title: 'Saved card' } }] : []),
      ];
      await reply(`Choose how to pay for request ${context.request.publicRequestReference || context.request.id}. Amount due: R${Number(context.amount).toFixed(2)} ZAR.`, {
        type: 'button', body: { text: 'Choose a payment method. Saved-card payment always requires a separate confirmation.' }, action: { buttons: methodButtons },
      });
      await jobRef.set({ status: 'completed', intent: 'payment_method_selection', requestId: context.request.id, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }

    const relayCommand = inbound.type === 'text'
      && /^(?:\/assistant|assistant|help|talk to uncedo|ask uncedo|return to assistant)$/i.test(commandText);
    const helperChatCommand = /^(?:message helper|talk to helper|return to helper)$/i.test(commandText);
    if (helperChatCommand && conversation.activeServiceRequestId) {
      if (!whatsappRelayEnabled()) {
        await reply('WhatsApp message relay is not enabled yet. Please use the Uncedo app chat for this request.');
      } else {
        await conversationRef.set({ currentMode: 'provider_relay', currentIntent: 'provider_relay', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        await reply('You can message your assigned helper here. I’ll pass your messages to them.');
      }
      await jobRef.set({ status: 'completed', intent: 'provider_relay', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (relayCommand && conversation.activeServiceRequestId) {
      await conversationRef.set({ currentMode: 'assistant', currentIntent: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      conversation = { ...conversation, currentMode: 'assistant' };
    } else if (['active_booking', 'provider_relay'].includes(String(conversation.currentMode || '').toLowerCase())
      && whatsappRelayEnabled()) {
      const relayResult = String(inbound?.type || '').toLowerCase() === 'text'
        ? await relayWhatsAppText({ eventId, identityId, identity, conversation, inbound, conversationRef })
        : await relayWhatsAppAttachment({ eventId, identityId, identity, conversation, inbound, conversationRef });
      if (relayResult.handled) {
        if (relayResult.code === 'recipient-window-closed') {
          await reply('I could not deliver that message because the other participant’s WhatsApp service window is closed. They need to message Uncedo first, or you can use the app chat.');
        } else if (relayResult.code === 'recipient-not-linked' || relayResult.code === 'recipient-not-found') {
          await reply('The other participant is not currently reachable on WhatsApp. Please use the Uncedo app chat for this request.');
        } else if (relayResult.code === 'delivery-unknown') {
          await reply('I could not confirm delivery of that message, so I will not send it again automatically. Please check the Uncedo app chat or try again after confirming whether it arrived.');
        } else if (relayResult.code === 'delivery-failed') {
          await reply('WhatsApp rejected that message, and I have not resent it. Please use the Uncedo app chat or try again later.');
        } else if (relayResult.code === 'text-empty') {
          await reply('WhatsApp relay currently supports text messages. Please use the Uncedo app for attachments.');
        } else if (relayResult.code === 'media-not-supported') {
          await reply('WhatsApp relay attachments are not available yet. Please use the Uncedo app chat to share images, voice notes or documents.');
        } else if (relayResult.code === 'media-relay-disabled') {
          await reply('WhatsApp attachment relay is not enabled yet. Please use the Uncedo app chat for media.');
        } else if (relayResult.code === 'retention-not-configured') {
          await reply('Secure media retention is not configured yet, so I did not download or forward the attachment. Please use the Uncedo app chat.');
        } else if (relayResult.code === 'request-not-authorized') {
          await reply('I could not verify that this WhatsApp identity is a participant in the active service request.');
        } else if (relayResult.code === 'relay-closed') {
          await reply('This request is no longer open for WhatsApp message relay. Please use the Uncedo app or contact support.');
        } else if (relayResult.code === 'media-processing-failed') {
          await reply('I could not safely process that attachment. It was not forwarded. Please use the Uncedo app chat or describe the issue in text.');
        }
        await jobRef.set({ status: 'completed', intent: 'provider_relay', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
    } else if (['active_booking', 'provider_relay'].includes(String(conversation.currentMode || '').toLowerCase())) {
      await reply('WhatsApp messaging relay is not enabled yet. Please use the Uncedo app chat for this request.');
      await jobRef.set({ status: 'completed', intent: 'provider_relay', reason: 'whatsapp_relay_disabled', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }

    if (!whatsappAiEnabled()) {
      if (relayCommand) await reply('WhatsApp service support is temporarily unavailable. You can use the Uncedo app, or send “status” to check this request.');
      await jobRef.set({ status: 'disabled', reason: 'whatsapp_ai_disabled', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    const conversationDraftId = String(conversation.activeDraftId || '').trim();
    const activeDraftRef = conversationDraftId ? db.collection('serviceRequestDrafts').doc(conversationDraftId) : null;
    const draftSnap = activeDraftRef ? await activeDraftRef.get() : null;
    const activeDraft = draftSnap?.exists ? draftSnap.data() || {} : null;

    if (buttonId === 'wa_ai_consent_yes') {
      await conversationRef.set({
        whatsappPolicyAcceptedAtMs: Date.now(),
        whatsappPolicyAcceptedVersion: WHATSAPP_POLICY_ACCEPTANCE_VERSION,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      await reply('Thanks. You can now ask about Uncedo services or start a service enquiry.');
      await jobRef.set({ status: 'completed', intent: 'ai_consent', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (buttonId === 'wa_ai_consent_no') {
      await conversationRef.set({ whatsappPolicyAcceptedAtMs: 0, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      await reply('Understood. You can review the policies and continue using Uncedo through the app.');
      await jobRef.set({ status: 'completed', intent: 'ai_consent_declined', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (buttonId === 'wa_draft_edit') {
      if (!activeDraft || !activeDraftRef) {
        await reply('There is no active quotation to edit. Tell me which service you need.');
      } else {
        await activeDraftRef.set({ status: 'collecting', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        await reply('Tell me what you would like to change, and I will update the service details.');
      }
      await jobRef.set({ status: 'completed', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (buttonId === 'wa_draft_confirm' || (activeDraft?.status === 'quoted' && /^(yes|confirm|confirm booking|book it)$/i.test(String(inbound.text || '').trim()))) {
      if (!activeDraft || !activeDraftRef) {
        await reply('I could not find the current quotation. Please tell me which service you want to book.');
      } else {
        const confirmation = await confirmWhatsAppServiceDraft({ identityId, identity, conversationRef, draftRef: activeDraftRef });
        if (confirmation.code === 'confirmed' || confirmation.code === 'already-confirmed') {
          await reply(`Your service request is confirmed${confirmation.requestId ? ` (reference ${confirmation.requestId})` : ''}. The matching system will look for an eligible helper.`);
        } else if (confirmation.code === 'quote-changed') {
          const quote = confirmation.quote || {};
          const currentQuoteText = `R${Number(quote.total || 0).toFixed(2)} ${quote.currency || 'ZAR'}`;
          await reply(`The service details or quote have changed. The current quote is *${currentQuoteText}*. Please review it and confirm again.`, {
            type: 'button',
            body: { text: `*Current quote: ${currentQuoteText}*\nConfirm to submit this request or edit the details.` },
            action: { buttons: [
              { type: 'reply', reply: { id: 'wa_draft_confirm', title: 'Confirm' } },
              { type: 'reply', reply: { id: 'wa_draft_edit', title: 'Edit details' } },
            ] },
          });
        } else if (confirmation.code === 'active-request') {
          await reply(`You already have an active Uncedo request (${confirmation.requestId}). I have not created another request.`);
        } else {
          await reply('I could not confirm this quotation. It may have expired or the service details changed. Please send the service details again.');
        }
      }
      await jobRef.set({ status: 'completed', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }

    if (!hasCurrentWhatsAppPolicyAcceptance(conversation)) {
      const policyConsent = buildWhatsAppPolicyConsent(getWhatsAppDisplayName(identity));
      await reply(policyConsent.text, policyConsent.interactive);
      await jobRef.set({ status: 'completed', intent: 'ai_consent_required', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }

    if (inbound.type === 'image' || inbound.type === 'audio' || inbound.type === 'document') {
      let mediaResult;
      try {
        mediaResult = await processWhatsAppInboundMedia({ identityId, eventId, identity, conversation, inbound });
      } catch (error) {
        logger.warn('whatsapp_media_processing_failed', { eventId, errorCode: String(error?.code || 'media_processing_failed').slice(0, 80) });
        mediaResult = { code: 'failed' };
      }
      if (mediaResult.code !== 'stored') {
        const message = mediaResult.code === 'retention-not-configured'
          ? 'Secure media retention is not configured yet, so I did not download or store that file. Please describe the service details in text.'
          : mediaResult.code === 'disabled'
            ? 'WhatsApp media intake is not enabled yet. Please describe the service details in text or use the Uncedo app.'
            : 'I could not safely process that file. Please describe the service details in text or contact support.';
        await reply(message);
        await jobRef.set({ status: 'completed', intent: 'media_intake', reason: mediaResult.code, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      inbound = { ...inbound, media: { ...inbound.media, assetId: mediaResult.assetId, storagePath: mediaResult.storagePath || '' } };
      if (inbound.type === 'audio') {
        if (!whatsappTranscriptionEnabled()) {
          await reply('I received the voice note, but voice transcription is not enabled yet. Please send the service details as text.');
          await jobRef.set({ status: 'completed', intent: 'media_intake', reason: 'transcription_disabled', mediaAssetId: mediaResult.assetId, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          return;
        }
        try {
          inbound = {
            ...inbound,
            type: 'text',
            text: await transcribeWhatsAppAudio({
              buffer: mediaResult.buffer,
              mimeType: mediaResult.mimeType,
              apiKey: process.env.OPENAI_API_KEY,
              model: process.env.WHATSAPP_TRANSCRIPTION_MODEL,
            }),
          };
        } catch (error) {
          logger.warn('whatsapp_voice_transcription_failed', { eventId, errorCode: String(error?.code || 'transcription_failed').slice(0, 80) });
          await reply('I could not transcribe that voice note. Please send the service details as text.');
          await jobRef.set({ status: 'completed', intent: 'media_intake', reason: 'transcription_failed', mediaAssetId: mediaResult.assetId, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          return;
        }
      } else if (inbound.type === 'image') {
        const caption = String(inbound.media?.caption || '').trim();
        const mayInterpretImage = whatsappImageInterpretationEnabled();
        if (!caption && !mayInterpretImage) {
          await reply('I received the image securely, but image interpretation is not enabled. Please describe what you need and include the relevant details in text.');
          await jobRef.set({ status: 'completed', intent: 'media_intake', reason: 'image_interpretation_unavailable', mediaAssetId: mediaResult.assetId, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          return;
        }
        inbound = {
          ...inbound,
          type: 'text',
          text: caption || 'The customer attached an image for service context.',
          mediaBuffer: mayInterpretImage ? mediaResult.buffer : null,
          mediaMimeType: mayInterpretImage ? mediaResult.mimeType : '',
        };
      } else {
        try {
          const documentText = await extractWhatsAppDocumentText({
            buffer: mediaResult.buffer,
            mimeType: mediaResult.mimeType,
          });
          const caption = String(inbound.media?.caption || '').trim();
          inbound = {
            ...inbound,
            type: 'text',
            text: [caption, `Untrusted extracted document text: ${documentText}`].filter(Boolean).join('\n').slice(0, 9000),
          };
        } catch (error) {
          logger.info('whatsapp_document_extraction_unavailable', { eventId, mimeType: mediaResult.mimeType, errorCode: String(error?.code || 'document_extraction_failed').slice(0, 80) });
          await reply('I received the document securely, but could not safely extract text from this format. Please describe the relevant details in text or contact support.');
          await jobRef.set({ status: 'completed', intent: 'media_intake', reason: 'document_extraction_unavailable', mediaAssetId: mediaResult.assetId, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          return;
        }
      }
    }

    if (inbound.type !== 'text') {
      if (inbound.type === 'location') {
        if (activeDraft && activeDraftRef && inbound.location) {
          await activeDraftRef.set({ location: inbound.location, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          if (activeDraft.requestId) {
            await marketplaceRequestOperations.updateDraft({
              requestId: activeDraft.requestId,
              principalId: String(identity.linkedFirebaseUid || identity.guestPrincipalId || ''),
              categoryId: activeDraft.categoryId,
              serviceIds: activeDraft.serviceIds,
              selectedPackageId: activeDraft.selectedPackageId || '',
              structuredAnswers: activeDraft.structuredAnswers || {},
              location: inbound.location,
            });
          }
          await reply('Thanks, I saved that location for your current service enquiry. Send the remaining service details when you are ready.');
        } else {
          await reply('I received your location. Tell me what service you need so I can guide you.');
        }
      } else {
        await reply('I can currently process text and location messages. Please describe the service details in text for now.');
      }
      await jobRef.set({ status: 'completed', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }

    const catalog = (await getLiveServiceCatalogEntries())
      .filter((service) => service.active === true && service.approved === true);
    const selectedService = activeDraft ? catalog.find((service) => service.id === activeDraft.serviceId) : null;
    const questionServices = selectedService ? getWhatsAppQuestionnaireServices(selectedService, catalog) : [];
    const questions = selectedService
      ? getQuestionnaireForSelection({ services: questionServices, selectedPackageId: selectedService.id })
      : [];
    if (!(await consumeWhatsAppAiRateLimit(identityId))) {
      await reply('I have reached the message limit for this WhatsApp conversation. Please wait a little before trying again.');
      await jobRef.set({ status: 'rate_limited', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    const model = createWhatsAppIntentRouter({
      openAiApiKey: String(process.env.OPENAI_API_KEY || '').trim(),
      openAiModel: String(process.env.OPENAI_MODEL || 'gpt-6-luna').trim(),
      geminiModel: String(process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim(),
      ...whatsappGeminiVertexConfig(),
    });
    const toolPrincipal = await resolveWhatsAppToolAuthorization(identityId, identity);
    const toolIdentity = toolPrincipal.identity || identity;
    const toolAuthorization = toolPrincipal.authorization;
    const toolRegistry = buildWhatsAppAssistantToolRegistry({ identity: toolIdentity, authorization: toolAuthorization, conversationRef, eventId, inbound });
    const availableTools = toolRegistry.definitions({ identity: toolIdentity, authorization: toolAuthorization });
    assistantPhase = 'classification';
    await jobRef.set({ phase: assistantPhase, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    const intentResult = await model.classify({
      message: inbound,
      recentHistory: Array.isArray(conversation.recentHistory) ? conversation.recentHistory : [],
      conversationSummary: conversation.conversationSummary || {},
      conversationState: {
        mode: conversation.currentMode,
        intent: conversation.currentIntent,
        selectedServiceId: activeDraft?.serviceId || '',
        answers: activeDraft?.structuredAnswers || {},
        missingQuestionIds: activeDraft?.missingQuestionIds || [],
      },
      services: catalog.slice(0, 50),
      questions,
      availableTools,
    });
    const explicitlyAsksPricing = intentResult.intent === 'price_enquiry' || isPriceQuestion(originalUserText);
    assistantPhase = 'workflow';
    await jobRef.set({ phase: assistantPhase, retrySafe: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

    const latestConversationSnapshot = await conversationRef.get();
    if (!latestConversationSnapshot.exists || String(latestConversationSnapshot.data()?.lastInboundEventId || '') !== eventId) {
      await jobRef.set({ status: 'superseded', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }

    let selectedTool = String(intentResult.toolName || '').trim();
    let selectedToolArguments = intentResult.toolArguments || {};
    if (!selectedTool && ['customer_support', 'provider_support', 'platform_information'].includes(intentResult.intent)) {
      selectedTool = 'getSupportKnowledge';
      const priorUserTurns = (Array.isArray(conversation.recentHistory) ? conversation.recentHistory : [])
        .filter((turn) => turn?.role === 'user')
        .slice(-2)
        .map((turn) => String(turn.text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 180));
      selectedToolArguments = { query: [String(inbound.text || '').slice(0, 300), ...priorUserTurns].filter(Boolean).join(' ').slice(0, 600) };
    }
    if (selectedTool) {
      if (selectedTool === 'requestHumanSupport' && !whatsappSupportEnabled()) {
        await reply('WhatsApp support handoff is not enabled yet. Please use the Uncedo app to contact support.');
        await jobRef.set({ status: 'completed', intent: intentResult.intent, toolName: selectedTool, reason: 'support_handoff_disabled', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      if (!(await consumeWhatsAppToolRateLimit(identityId))) {
        await reply('I have reached the safe limit for account lookups in this conversation. Please wait a little and try again.');
        await jobRef.set({ status: 'rate_limited', intent: intentResult.intent, toolName: selectedTool, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      const argumentHash = createHash('sha256').update(JSON.stringify(selectedToolArguments)).digest('hex');
      const executionId = stableEventId(`whatsapp-tool:${eventId}:${selectedTool}`);
      let toolResult = null;
      let executionCode = 'ok';
      toolExecutionStarted = true;
      assistantPhase = 'tool_execution';
      await jobRef.set({ phase: assistantPhase, toolExecutionStarted: true, retrySafe: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      try {
        toolResult = await runWhatsAppToolWithTimeout(() => toolRegistry.execute(selectedTool, selectedToolArguments, { identity: toolIdentity, authorization: toolAuthorization, role: toolAuthorization.role, eventId, inbound, originalUserText }));
      } catch (error) {
        executionCode = String(error?.code || 'tool-failed').slice(0, 80);
        logger.warn('whatsapp_ai_tool_execution_failed', { eventId, toolName: selectedTool, errorCode: executionCode });
      }
      await db.collection('whatsappToolExecutions').doc(executionId).create({
        executionId, eventId, identityId, toolName: selectedTool, role: toolAuthorization.role,
        status: toolResult ? 'completed' : 'failed', resultCode: executionCode,
        argumentHash, createdAt: admin.firestore.FieldValue.serverTimestamp(),
        retentionExpiresAtMs: Date.now() + whatsappRetentionDays('WHATSAPP_JOB_RETENTION_DAYS', 30) * 24 * 60 * 60 * 1000,
      }).catch((error) => {
        if (error?.code !== 6 && error?.code !== 'already-exists') logger.warn('whatsapp_ai_tool_audit_write_failed', { eventId, toolName: selectedTool });
      });

      if (selectedTool === 'getSupportKnowledge' && toolResult && toolResult.found !== true
        && ['customer_support', 'provider_support', 'human_escalation'].includes(intentResult.intent)) {
        if (whatsappSupportEnabled()) {
          selectedTool = 'requestHumanSupport';
          selectedToolArguments = { reason: String(inbound.text || 'Support request').slice(0, 300) };
          toolResult = await runWhatsAppToolWithTimeout(() => toolRegistry.execute(selectedTool, selectedToolArguments, { identity: toolIdentity, authorization: toolAuthorization, role: toolAuthorization.role, eventId, inbound, originalUserText, escalationRequired: true }));
          if (inbound.media?.assetId) await associateWhatsAppMediaWithSupportTicket({ assetId: inbound.media.assetId, identityId, ticketId: toolResult.ticketId });
          const fallbackExecutionId = stableEventId(`whatsapp-tool:${eventId}:${selectedTool}`);
          await db.collection('whatsappToolExecutions').doc(fallbackExecutionId).create({
            executionId: fallbackExecutionId, eventId, identityId, toolName: selectedTool, role: toolAuthorization.role,
            status: 'completed', resultCode: 'handed_off', argumentHash: createHash('sha256').update(JSON.stringify(selectedToolArguments)).digest('hex'),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            retentionExpiresAtMs: Date.now() + whatsappRetentionDays('WHATSAPP_JOB_RETENTION_DAYS', 30) * 24 * 60 * 60 * 1000,
          }).catch(() => null);
        } else {
          await reply('I could not find approved guidance for this issue. Please contact Uncedo support through the app.');
          await jobRef.set({ status: 'completed', intent: intentResult.intent, toolName: selectedTool, resultCode: 'knowledge-not-found-support-disabled', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          return;
        }
      }
      if (!toolResult) {
        const safeError = executionCode === 'escalation-not-authorized'
          ? 'I can continue helping here. If you want a support person, say “talk to a person” or describe the issue that needs review.'
          : executionCode === 'identity-verification-required' || executionCode === 'helper-verification-required'
          ? 'Please verify and link your Uncedo account before I show private account information.'
          : executionCode === 'tool-permission-denied'
            ? 'That account action is not available for this WhatsApp identity.'
            : 'I could not safely retrieve that information right now. Please try again later.';
        await reply(safeError);
        await jobRef.set({ status: 'completed', intent: intentResult.intent, toolName: selectedTool, resultCode: executionCode, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      if (toolResult.code === 'stale') {
        await reply('I received a newer message before I could complete that step. Please send the latest request again.');
        await jobRef.set({ status: 'superseded', intent: intentResult.intent, toolName: selectedTool, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      const toolText = formatWhatsAppToolResult(selectedTool, toolResult, { includePricing: explicitlyAsksPricing });
      let responseText = toolText;
      if (whatsappNaturalResponsesEnabled() && toolRegistry.isReadOnly(selectedTool) && supportsNaturalResponse(selectedTool)
        && !(selectedTool === 'getSupportKnowledge' && toolResult.found !== true)) {
        try {
          const responseGenerator = createWhatsAppResponseGenerator({
            openAiApiKey: String(process.env.OPENAI_API_KEY || '').trim(),
            openAiModel: String(process.env.OPENAI_MODEL || 'gpt-6-luna').trim(),
            geminiModel: String(process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim(),
            ...whatsappGeminiVertexConfig(),
          });
          const generated = await runWhatsAppToolWithTimeout(() => responseGenerator.generate({
            question: originalUserText,
            recentHistory: Array.isArray(conversation.recentHistory) ? conversation.recentHistory : [],
            toolName: selectedTool,
            toolResult,
            customerName: getWhatsAppDisplayName(toolIdentity),
            includePricing: explicitlyAsksPricing,
          }), 9000);
          responseText = generated.response;
          await jobRef.set({ responseProvider: generated.provider, responseModel: generated.model, responseGeneration: 'natural', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        } catch (error) {
          logger.warn('whatsapp_natural_response_fallback', {
            eventId,
            toolName: selectedTool,
            errorCode: String(error?.code || 'response_generation_failed').slice(0, 100),
            providerFailures: safeProviderFailures(error?.providerFailures),
          });
          responseText = toolText;
          await jobRef.set({ responseGeneration: 'deterministic_fallback', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
      }
      if (selectedTool === 'requestHumanSupport') {
        await reply(toolText);
      } else if (selectedTool === 'getSupportKnowledge' && toolResult.found !== true
        && ['customer_support', 'provider_support', 'human_escalation'].includes(intentResult.intent)) {
        await reply(toolText);
      } else {
        if (selectedTool === 'proposeProfileChange' && toolResult.code === 'confirmation-required') {
          await reply(toolText, {
            type: 'button', body: { text: 'Confirm this profile name change?' }, action: { buttons: [
              { type: 'reply', reply: { id: `wa_profile_confirm_${toolResult.proposalId}`, title: 'Confirm change' } },
              { type: 'reply', reply: { id: `wa_profile_cancel_${toolResult.proposalId}`, title: 'Cancel' } },
            ] },
          });
        } else await reply(responseText);
      }
      await jobRef.set({
        status: 'completed', intent: intentResult.intent, toolName: selectedTool,
        toolResultCode: toolResult.code || 'ok', aiProvider: intentResult.provider || null,
        aiModel: intentResult.model || null, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return;
    }

    if (intentResult.intent === 'greeting') {
      const name = getWhatsAppDisplayName(toolIdentity);
      await reply(name
        ? `Hi *${name}*! Welcome back to *Uncedo*. I can help you explore services or start a service enquiry. What can I help with?`
        : 'Hi there! Welcome to *Uncedo*. I can help you explore services or start a service enquiry. What can I help with?');
      await jobRef.set({ status: 'completed', intent: intentResult.intent, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (intentResult.intent === 'service_discovery') {
      await reply(renderWhatsAppCatalog(catalog, { includePricing: explicitlyAsksPricing }));
      await jobRef.set({ status: 'completed', intent: intentResult.intent, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (intentResult.intent === 'service_information' && intentResult.serviceId) {
      const info = catalog.find((service) => service.id === intentResult.serviceId);
      const response = info
        ? explicitlyAsksPricing
          ? `${formatWhatsAppPriceGuidance(info.label, getConfiguredServicePriceRange(info))}\n\nWould you like to start a service enquiry?`
          : `*${info.label}*${info.description ? `\n${info.description}` : ''}\n\nWould you like to know more or start a service enquiry?`
        : renderWhatsAppCatalog(catalog, { includePricing: explicitlyAsksPricing });
      await reply(response);
      await jobRef.set({ status: 'completed', intent: intentResult.intent, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (intentResult.intent === 'booking_status') {
      const requestId = String(conversation.activeServiceRequestId || '').trim();
      const result = requestId ? await getWhatsAppRequestForIdentity({ db, identity, requestId }) : { code: 'not-found' };
      if (result.code === 'found') await reply(formatWhatsAppRequestSummary(buildWhatsAppRequestSummary(result.request)));
      else await reply('I could not verify a request linked to this WhatsApp conversation. Ask “booking history” or use the Uncedo app.');
      await jobRef.set({ status: 'completed', intent: intentResult.intent, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (['payment_question', 'payment_initiation'].includes(intentResult.intent)) {
      await reply('I can report a payment status that is already recorded, but payment initiation through WhatsApp is not available yet. Ask “payment status” or use the Uncedo app payment flow.');
      await jobRef.set({ status: 'completed', intent: intentResult.intent, reason: 'payment_initiation_not_connected', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (['customer_support', 'provider_support', 'human_escalation'].includes(intentResult.intent)) {
      if (!whatsappSupportEnabled()) {
        await reply('I could not safely resolve the request using approved Uncedo guidance. WhatsApp support handoff is not enabled yet; please contact support through the Uncedo app.');
      } else {
        const ticket = await createOrAppendWhatsAppSupportMessage({
          db, admin, identityId, conversationRef, eventId,
          principalId: identity.linkedFirebaseUid || identity.guestPrincipalId || '',
          linkedUid: identity.linkedFirebaseUid || '',
          role: identity.role || (identity.guestPrincipalId ? 'customer' : 'unknown'),
          requestId: conversation.activeServiceRequestId || '', inbound,
        });
        if (inbound.media?.assetId) await associateWhatsAppMediaWithSupportTicket({ assetId: inbound.media.assetId, identityId, ticketId: ticket.ticketId });
        await reply(`I’ve sent this conversation to Uncedo support. Your ticket reference is ${ticket.ticketId}. A support person will handle this chat until the request is closed.`);
      }
      await jobRef.set({ status: 'completed', intent: intentResult.intent, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (!['service_booking', 'price_enquiry'].includes(intentResult.intent)) {
      await reply('I can answer public service questions, collect service booking details, and help with booking history/status and recorded payment status. WhatsApp cancellation changes, payment initiation, account management, and unsupported actions still need the Uncedo app or support team.');
      await jobRef.set({ status: 'completed', intent: intentResult.intent, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }

    const serviceId = selectedService?.id || intentResult.serviceId;
    const service = catalog.find((item) => item.id === serviceId);
    if (!service || intentResult.confidence < 0.45) {
      await reply(renderWhatsAppCatalog(catalog, { includePricing: explicitlyAsksPricing }));
      await jobRef.set({ status: 'completed', intent: intentResult.intent, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (intentResult.intent === 'price_enquiry') {
      await reply(`${formatWhatsAppPriceGuidance(service.label, getConfiguredServicePriceRange(service))}\n\nWould you like to start a service enquiry?`);
      await jobRef.set({ status: 'completed', intent: intentResult.intent, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (service.requiresPortfolioSelection) {
      await reply(`${service.label} needs a customer selection that is not available in this WhatsApp flow yet. Please complete that request in the Uncedo app.`);
      await jobRef.set({ status: 'completed', intent: intentResult.intent, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }

    const selectedQuestionServices = getWhatsAppQuestionnaireServices(service, catalog);
    const serviceQuestions = getQuestionnaireForSelection({ services: selectedQuestionServices, selectedPackageId: service.id });
    let answerExtraction = {
      answers: intentResult.extractedAnswers || {},
      attempted: false,
      fallback: false,
    };
    if (questionnaireNeedsExtractionPass({
      intent: intentResult.intent,
      availableQuestions: questions,
      questionnaire: serviceQuestions,
    })) {
      assistantPhase = 'questionnaire_extraction';
      await jobRef.set({ phase: assistantPhase, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      answerExtraction = await runWhatsAppToolWithTimeout(() => extractQuestionnaireAnswers({
        model,
        message: inbound,
        service,
        questions: serviceQuestions,
        existingAnswers: activeDraft?.serviceId === service.id ? activeDraft.structuredAnswers || {} : {},
        fallbackAnswers: intentResult.extractedAnswers || {},
      }), 18_000).catch((error) => ({
        answers: intentResult.extractedAnswers || {},
        attempted: true,
        fallback: true,
        errorCode: String(error?.code || 'questionnaire_extraction_timeout').slice(0, 100),
      }));
      await jobRef.set({
        questionnaireExtraction: answerExtraction.fallback ? 'deterministic_fallback' : 'completed',
        ...(answerExtraction.provider ? { questionnaireExtractionProvider: answerExtraction.provider } : {}),
        ...(answerExtraction.model ? { questionnaireExtractionModel: answerExtraction.model } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      if (answerExtraction.fallback) {
        logger.info('whatsapp_booking_questionnaire_extraction_fallback', {
          eventId,
          errorCode: String(answerExtraction.errorCode || 'questionnaire_extraction_failed').slice(0, 100),
        });
      }
      const postExtractionConversation = await conversationRef.get();
      if (!postExtractionConversation.exists || String(postExtractionConversation.data()?.lastInboundEventId || '') !== eventId) {
        await jobRef.set({ status: 'superseded', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
    }
    const allowedQuestionIds = new Set(serviceQuestions.map((question) => question.id));
    const incomingAnswers = Object.fromEntries(Object.entries(answerExtraction.answers || {}).filter(([key]) => allowedQuestionIds.has(key)));
    const baseAnswers = activeDraft?.serviceId === service.id && activeDraft?.structuredAnswers
      ? activeDraft.structuredAnswers
      : {};
    let validation;
    try {
      validation = normalizeAndValidateAnswers({
        answers: { ...baseAnswers, ...incomingAnswers },
        questions: serviceQuestions,
        strictUnknown: true,
      });
    } catch (error) {
      await reply('I could not validate one of those answers against this service questionnaire. Please restate the service details or choose an option from the questionnaire.');
      await jobRef.set({ status: 'completed', intent: intentResult.intent, errorCode: 'invalid_questionnaire_answer', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }

    const serviceIds = getWhatsAppServiceIds(service);
    const selectedPackageId = ['bundle', 'package'].includes(String(service.type || '').toLowerCase()) ? service.id : '';
    const draftId = stableEventId(`draft:${identityId}`);
    const draftRef = db.collection('serviceRequestDrafts').doc(draftId);
    const currentMediaAssetId = String(inbound.media?.assetId || '').trim();
    const currentMediaAssetRef = currentMediaAssetId ? db.collection('whatsappMediaAssets').doc(currentMediaAssetId) : null;
    const now = Date.now();
    if (validation.missingRequired.length) {
      const missingQuestion = getFirstMissingRequiredQuestion(serviceQuestions, validation.missingRequired);
      let canonicalRequestId = String(activeDraft?.requestId || '').trim();
      if (intentResult.intent === 'service_booking') {
        const requestDraft = await syncWhatsAppCanonicalRequestDraft({
          identityId,
          identity,
          draftRef,
          service,
          serviceIds,
          selectedPackageId,
          answers: validation.answers,
          location: activeDraft?.location || null,
        });
        if (requestDraft.code !== 'ready') {
          await reply(requestDraft.code === 'active-request'
            ? `You already have an active Uncedo request (${requestDraft.activeRequestId}). I have not started another one.`
            : 'I could not start this request yet. Please check your active requests or contact Uncedo support.');
          await jobRef.set({ status: 'completed', intent: intentResult.intent, errorCode: requestDraft.code, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          return;
        }
        canonicalRequestId = requestDraft.requestId;
      }
      await db.runTransaction(async (transaction) => {
        transaction.set(draftRef, {
          identityId,
          status: 'collecting',
          intent: intentResult.intent,
          serviceId: service.id,
          categoryId: service.categoryId,
          serviceIds,
          selectedPackageId,
          requestId: canonicalRequestId || null,
          structuredAnswers: validation.answers,
          ...(currentMediaAssetId ? { mediaAssetIds: admin.firestore.FieldValue.arrayUnion(currentMediaAssetId) } : {}),
          missingQuestionIds: validation.missingRequired,
          questionnaireVersion: stableEventId(JSON.stringify(serviceQuestions)),
          location: activeDraft?.serviceId === service.id ? activeDraft.location || null : null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: activeDraft?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        if (currentMediaAssetRef) transaction.set(currentMediaAssetRef, {
          draftId,
          requestId: canonicalRequestId || null,
          associatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(conversationRef, {
          currentMode: 'booking_intake',
          currentIntent: intentResult.intent,
          activeDraftId: draftId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      const nextQuestion = missingQuestion ? renderWhatsAppQuestion(missingQuestion) : 'Please provide the remaining required service details.';
      const priceContext = intentResult.intent === 'service_booking' && explicitlyAsksPricing
        ? `${formatWhatsAppPriceGuidance(service.label, getConfiguredServicePriceRange(service))}\n\n`
        : '';
      await reply(`${priceContext}${nextQuestion}`);
      await jobRef.set({ status: 'completed', intent: intentResult.intent, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return;
    }

    let quote = quoteFromCatalogEntries({
      entries: catalog,
      categoryId: service.categoryId,
      serviceIds,
      selectedPackageId,
      structuredAnswers: validation.answers,
      strictUnknownAnswers: true,
    });
    const isBooking = intentResult.intent === 'service_booking';
    const bookingConfirmation = isBooking
      ? formatWhatsAppBookingConfirmation({ service, questions: serviceQuestions, answers: validation.answers, quote })
      : null;
    const replyText = bookingConfirmation?.text || `*${service.label}*\n\nIndicative estimate: *R${Number(quote.total || 0).toFixed(2)} ${quote.currency || 'ZAR'}*. This is based on the current Uncedo pricing calculation. To book this service, tell me you would like to book it.`;
    let canonicalRequestId = String(activeDraft?.requestId || '').trim();
    let quoteExpiresAtMs = now + (15 * 60 * 1000);
    if (isBooking) {
      const requestDraft = await syncWhatsAppCanonicalRequestDraft({
        identityId,
        identity,
        draftRef,
        service,
        serviceIds,
        selectedPackageId,
        answers: validation.answers,
        location: activeDraft?.location || null,
      });
      if (requestDraft.code !== 'ready') {
        await reply(requestDraft.code === 'active-request'
          ? `You already have an active Uncedo request (${requestDraft.activeRequestId}). I have not started another one.`
          : 'I could not start this request yet. Please check your active requests or contact Uncedo support.');
        await jobRef.set({ status: 'completed', intent: intentResult.intent, errorCode: requestDraft.code, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      canonicalRequestId = requestDraft.requestId;
      const canonicalQuote = await marketplaceRequestOperations.quoteDraft({
        requestId: canonicalRequestId,
        principalId: String(activeDraft?.principalId || identity.linkedFirebaseUid || identity.guestPrincipalId || '').trim(),
      });
      if (canonicalQuote.code !== 'quoted') {
        await reply(canonicalQuote.code === 'invalid-service-answers'
          ? 'I still need valid answers to the service questionnaire before I can quote this request.'
          : 'I could not prepare a current quote. Please check the service details and try again.');
        await jobRef.set({ status: 'completed', intent: intentResult.intent, errorCode: canonicalQuote.code, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return;
      }
      quote = canonicalQuote.quote;
      quoteExpiresAtMs = canonicalQuote.quoteExpiresAtMs;
    }
    await db.runTransaction(async (transaction) => {
      transaction.set(draftRef, {
        identityId,
        status: isBooking ? 'quoted' : 'estimate_ready',
        intent: intentResult.intent,
        serviceId: service.id,
        categoryId: service.categoryId,
        serviceIds,
        selectedPackageId,
        requestId: canonicalRequestId || null,
        structuredAnswers: validation.answers,
        ...(currentMediaAssetId ? { mediaAssetIds: admin.firestore.FieldValue.arrayUnion(currentMediaAssetId) } : {}),
        missingQuestionIds: [],
        questionnaireVersion: quote.questionnaireVersion,
        serviceCatalogVersion: quote.serviceCatalogVersion,
        quoteSnapshot: quote,
        quoteExpiresAtMs,
        location: activeDraft?.serviceId === service.id ? activeDraft.location || null : null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: activeDraft?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      if (currentMediaAssetRef) transaction.set(currentMediaAssetRef, {
        draftId,
        requestId: canonicalRequestId || null,
        associatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(conversationRef, {
        currentMode: isBooking ? 'quote_pending' : 'public_information',
        currentIntent: intentResult.intent,
        activeDraftId: draftId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    if (isBooking) {
      await reply(replyText, {
        type: 'button',
        body: { text: bookingConfirmation.buttonBody },
        action: { buttons: [
          { type: 'reply', reply: { id: 'wa_draft_confirm', title: 'Confirm' } },
          { type: 'reply', reply: { id: 'wa_draft_edit', title: 'Edit details' } },
        ] },
      });
    } else {
      await reply(replyText);
    }
    await jobRef.set({
      status: 'completed',
      intent: intentResult.intent,
      aiProvider: intentResult.provider || null,
      aiModel: intentResult.model || null,
      fallbackUsed: intentResult.provider === 'gemini',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    const failedPhase = assistantPhase;
    logger.error('whatsapp_assistant_job_failed', {
      jobId: event.params.jobId,
      errorCode: String(error?.code || 'assistant_processing_failed').slice(0, 120),
      providerFailures: safeProviderFailures(error?.providerFailures),
      // Deliberately omit inbound content, phone numbers, prompts, and credentials.
    });
    let fallbackResponseSent = false;
    let fallbackFailureDiagnostics = null;
    try {
      const fallbackResult = await attemptAiUnavailableReply({
        phase: failedPhase,
        toolExecutionStarted,
        outboundAttempted,
        sendReply: sendAssistantReply,
      });
      fallbackResponseSent = fallbackResult.sent;
    } catch (sendError) {
      fallbackFailureDiagnostics = buildWhatsAppSendFailureDiagnostics(sendError);
      logger.warn('whatsapp_ai_unavailable_reply_failed', {
        jobId: event.params.jobId,
        ...fallbackFailureDiagnostics,
      });
    }
    await jobRef.set({
      status: 'failed',
      errorCode: String(error?.code || 'assistant_processing_failed').slice(0, 120),
      phase: failedPhase,
      toolExecutionStarted,
      outboundAttempted,
      fallbackResponseSent,
      ...(fallbackFailureDiagnostics ? { fallbackFailureDiagnostics } : {}),
      retrySafe: !fallbackResponseSent && failedPhase === 'classification' && !toolExecutionStarted && !outboundAttempted,
      manualRecoveryAvailable: !fallbackResponseSent && failedPhase === 'classification' && !toolExecutionStarted && !outboundAttempted,
      attemptCount: Math.max(1, Number(initialJob.attemptCount || 0) + 1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }).catch(() => null);
  }
});

exports.listWhatsAppAssistantFailures = onCall({ maxInstances: 2, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 20 }, async (request) => {
  await requireWhatsAppSupportAdmin(request);
  const snapshot = await db.collection('whatsappAssistantJobs').where('status', '==', 'failed').orderBy('updatedAt', 'desc').limit(50).get();
  return { jobs: snapshot.docs.map((document) => sanitizeAssistantFailure(document.id, document.data() || {})) };
});

exports.retryWhatsAppAssistantJob = onCall({ maxInstances: 2, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 20 }, async (request) => {
  const adminUid = await requireWhatsAppSupportAdmin(request);
  const jobId = String(request.data?.jobId || '').trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(jobId)) throw new HttpsError('invalid-argument', 'A valid assistant job is required.');
  const oldRef = db.collection('whatsappAssistantJobs').doc(jobId);
  const oldSnapshot = await oldRef.get();
  if (!oldSnapshot.exists) throw new HttpsError('not-found', 'Assistant job not found.');
  const oldJob = oldSnapshot.data() || {};
  if (!isManuallyRetryableAssistantJob(oldJob)) throw new HttpsError('failed-precondition', 'This job is not safe for manual retry.');
  const retryJobId = stableEventId(`whatsapp-assistant-manual-retry:${jobId}:${Number(oldJob.attemptCount || 0)}`);
  const retryRef = db.collection('whatsappAssistantJobs').doc(retryJobId);
  const outcome = await db.runTransaction(async (transaction) => {
    const [current, existingRetry] = await Promise.all([transaction.get(oldRef), transaction.get(retryRef)]);
    const job = current.data() || {};
    if (!current.exists || !isManuallyRetryableAssistantJob(job)) return { code: 'not-retryable' };
    if (job.recoveryJobId) return { code: 'already-retried', retryJobId: job.recoveryJobId };
    if (existingRetry.exists) {
      transaction.update(oldRef, { recoveryJobId: retryJobId, manualRecoveryRequestedBy: adminUid, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { code: 'already-retried', retryJobId };
    }
    transaction.create(retryRef, {
      identityId: String(job.identityId), eventId: String(job.eventId), status: 'pending',
      attemptCount: Number(job.attemptCount || 0), retryOfJobId: jobId,
      manualRecoveryRequestedBy: adminUid, createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      retentionExpiresAtMs: Date.now() + whatsappRetentionDays('WHATSAPP_JOB_RETENTION_DAYS', 30) * 24 * 60 * 60 * 1000,
    });
    transaction.update(oldRef, { recoveryJobId: retryJobId, manualRecoveryRequestedBy: adminUid, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    transaction.create(db.collection('auditEvents').doc(stableEventId(`whatsapp-assistant-manual-retry:${jobId}:${adminUid}`)), {
      eventType: 'whatsapp_assistant_job_manual_retry_requested', jobId, retryJobId, actorUid: adminUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { code: 'queued', retryJobId };
  });
  if (outcome.code === 'not-retryable') throw new HttpsError('failed-precondition', 'This job is not safe for manual retry.');
  return { queued: outcome.code === 'queued', duplicate: outcome.code === 'already-retried', retryJobId: outcome.retryJobId };
});

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
    transaction.set(db.collection('helperDispatchIndex').doc(selectedHelperId), {
      lastOfferAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
});

exports.scheduleServiceRequestOfferExpiryOnServiceRequestWrite = onDocumentWritten({
  document: 'serviceRequests/{requestId}',
  ...HALF_CPU_OPTIONS,
}, async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!after || String(after.status || '').toLowerCase() !== SERVICE_REQUEST_STATUS.HELPER_FOUND) return;

  const requestId = String(event.params.requestId || '').trim();
  const helperId = String(after.currentOfferHelperId || '').trim();
  const offerToken = String(after.offerToken || '').trim();
  const offerRevision = normalizeRevision(after.offerRevision);
  const expiresAtMs = normalizeTimestamp(after.offerExpiresAt);
  if (!requestId || !helperId || !offerToken || !offerRevision || !expiresAtMs) return;
  if (
    before
    && String(before.status || '').toLowerCase() === SERVICE_REQUEST_STATUS.HELPER_FOUND
    && String(before.offerToken || '') === offerToken
    && normalizeRevision(before.offerRevision) === offerRevision
  ) return;

  const taskId = `offer-expiry_${createHash('sha256').update(`${requestId}:${offerRevision}`).digest('hex').slice(0, 32)}`;
  const delaySeconds = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000) + 1);
  try {
    await getFunctions().taskQueue('expireServiceRequestOffer').enqueue({
      requestId,
      helperId,
      offerToken,
      offerRevision,
      expiresAtMs,
    }, {
      id: taskId,
      scheduleDelaySeconds: delaySeconds,
      dispatchDeadlineSeconds: 30,
    });
  } catch (error) {
    if (String(error?.code || '').includes('task-already-exists')) {
      logger.info('service_request_offer_expiry_task_already_scheduled', { requestId, offerRevision });
      return;
    }
    logger.error('service_request_offer_expiry_task_schedule_failed', {
      requestId,
      offerRevision,
      error: error?.message || 'unknown_error',
    });
    throw error;
  }
});

exports.expireServiceRequestOffer = onTaskDispatched({
  retryConfig: { maxAttempts: 5, minBackoffSeconds: 5, maxBackoffSeconds: 60 },
  rateLimits: { maxConcurrentDispatches: 50, maxDispatchesPerSecond: 20 },
  ...HALF_CPU_OPTIONS,
}, async (event) => {
  const input = event.data || {};
  const requestId = String(input.requestId || '').trim();
  const helperId = String(input.helperId || '').trim();
  const offerToken = String(input.offerToken || '').trim();
  const offerRevision = normalizeRevision(input.offerRevision);
  if (!requestId || !helperId || !offerToken || !offerRevision) {
    logger.warn('service_request_offer_expiry_task_invalid_payload');
    return;
  }

  const requestRef = db.collection('serviceRequests').doc(requestId);
  const result = await db.runTransaction(async (transaction) => {
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists) return { expired: false, reason: 'request-not-found' };
    const request = requestSnap.data() || {};
    const decision = evaluateOfferExpiry(request, { helperId, offerToken, offerRevision }, Date.now());
    if (!decision.shouldExpire) return { expired: false, reason: decision.code };

    const helperQueue = (Array.isArray(request.helperQueue) ? request.helperQueue : [])
      .map((value) => String(value || '').trim())
      .filter((value) => value && value !== helperId);
    const offerCycleExcludedHelperIds = [...new Set([
      ...(Array.isArray(request.offerCycleExcludedHelperIds) ? request.offerCycleExcludedHelperIds : []),
      helperId,
    ].map((value) => String(value || '').trim()).filter(Boolean))];

    transaction.update(requestRef, {
      status: SERVICE_REQUEST_STATUS.MATCHING,
      statusDetail: 'Helper offer expired. Matching the next helper.',
      helperQueue,
      currentOfferHelperId: null,
      offerExpiresAt: null,
      offerToken: null,
      offerCycleExcludedHelperIds,
      lastOfferResponse: {
        helperId,
        offerToken,
        offerRevision,
        action: 'expired',
        respondedAtMs: Date.now(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {
      expired: true,
      categoryId: request.categoryId || '',
      serviceIds: Array.isArray(request.serviceIds) ? request.serviceIds : [],
      offeredAtMs: normalizeTimestamp(request.lastOfferAt) || Date.now(),
    };
  });

  if (result.expired) {
    await recordHelperOfferLifecycleEvent({
      helperId,
      requestId,
      offerRevision,
      categoryId: result.categoryId,
      serviceIds: result.serviceIds,
      outcome: 'expired',
      offeredAtMs: result.offeredAtMs,
      closedAtMs: Date.now(),
      responseMinutes: null,
      sourceStatus: 'matching',
    }).catch((error) => logger.warn('helper_offer_expiry_stats_failed', { requestId, helperId, error: error.message }));
  }

  logger.info('service_request_offer_expiry_task_finished', {
    requestId,
    helperId,
    offerRevision,
    expired: result.expired,
    reason: result.reason || null,
  });
});

function whatsappNotificationsEnabled() {
  return String(process.env.WHATSAPP_NOTIFICATIONS_ENABLED || '').trim().toLowerCase() === 'true';
}

function whatsappRelayEnabled() {
  return String(process.env.WHATSAPP_RELAY_ENABLED || '').trim().toLowerCase() === 'true';
}

function whatsappSupportEnabled() {
  return String(process.env.WHATSAPP_SUPPORT_ENABLED || '').trim().toLowerCase() === 'true';
}

exports.notifyWhatsAppHelperOfferOnServiceRequestWrite = onDocumentWritten({
  document: 'serviceRequests/{requestId}',
  maxInstances: 2,
  ...HALF_CPU_OPTIONS,
}, async (event) => {
  if (!whatsappNotificationsEnabled() || !whatsappMessagingEnabled()) return;
  const before = event.data.before.exists ? event.data.before.data() || {} : null;
  const after = event.data.after.exists ? event.data.after.data() || {} : null;
  if (!after || String(after.status || '').toLowerCase() !== SERVICE_REQUEST_STATUS.HELPER_FOUND) return;
  const requestId = String(event.params.requestId || '').trim();
  const helperId = String(after.currentOfferHelperId || '').trim();
  const offerToken = String(after.offerToken || '').trim();
  const offerRevision = normalizeRevision(after.offerRevision);
  if (!requestId || !helperId || !offerToken || !offerRevision) return;
  if (before
    && String(before.currentOfferHelperId || '') === helperId
    && String(before.offerToken || '') === offerToken
    && normalizeRevision(before.offerRevision) === offerRevision) return;

  const linkSnap = await db.collection('whatsappUserLinks').doc(helperId).get();
  if (!linkSnap.exists) return;
  const identityId = String(linkSnap.data()?.identityId || '').trim();
  if (!identityId) return;
  const identityRef = db.collection('whatsappIdentities').doc(identityId);
  const [identitySnap, conversationSnap] = await Promise.all([
    identityRef.get(), db.collection('whatsappConversations').doc(identityId).get(),
  ]);
  if (!identitySnap.exists || !conversationSnap.exists) return;
  const identity = identitySnap.data() || {};
  if (String(identity.linkedFirebaseUid || '') !== helperId
    || String(identity.role || '').toLowerCase() !== 'helper'
    || !(Number(identity.whatsappNotificationsConsentAtMs || 0) > 0 || identity.whatsappNotificationsEnabled === true)) return;

  const secrets = getWhatsAppSecrets();
  const templateName = String(process.env.WHATSAPP_HELPER_OFFER_TEMPLATE_NAME || '').trim();
  const languageCode = String(process.env.WHATSAPP_HELPER_OFFER_TEMPLATE_LANGUAGE || '').trim();
  if (!secrets.accessToken || !secrets.phoneNumberId || !secrets.graphApiVersion
    || !templateName || !languageCode || !secrets.approvedTemplateNames.includes(templateName)) {
    logger.info('whatsapp_helper_offer_notification_not_configured', { requestId, offerRevision });
    return;
  }
  if (String(identity.phoneNumberId || '') !== secrets.phoneNumberId) return;
  const recipient = String(identity.waId || '').trim();
  if (!recipient) return;

  const acceptActionId = stableEventId(`helper-offer-action:${requestId}:${offerRevision}:accept`);
  const declineActionId = stableEventId(`helper-offer-action:${requestId}:${offerRevision}:decline`);
  const outboundId = stableEventId(`helper-offer-notification:${requestId}:${offerRevision}:${helperId}`);
  const outboundRef = db.collection('whatsappMessages').doc(outboundId);
  const acceptRef = db.collection('whatsappOfferActions').doc(acceptActionId);
  const declineRef = db.collection('whatsappOfferActions').doc(declineActionId);
  const claimed = await db.runTransaction(async (transaction) => {
    const [outboundSnap, currentRequestSnap, acceptSnap, declineSnap] = await Promise.all([
      transaction.get(outboundRef), transaction.get(db.collection('serviceRequests').doc(requestId)),
      transaction.get(acceptRef), transaction.get(declineRef),
    ]);
    if (outboundSnap.exists || !currentRequestSnap.exists) return false;
    const current = currentRequestSnap.data() || {};
    if (current.status !== SERVICE_REQUEST_STATUS.HELPER_FOUND
      || String(current.currentOfferHelperId || '') !== helperId
      || String(current.offerToken || '') !== offerToken
      || normalizeRevision(current.offerRevision) !== offerRevision
      || normalizeTimestamp(current.offerExpiresAt) <= Date.now()) return false;
    const now = admin.firestore.FieldValue.serverTimestamp();
    const actionData = {
      requestId, helperId, identityId, offerToken, offerRevision,
      expiresAtMs: normalizeTimestamp(current.offerExpiresAt),
      createdAt: now,
    };
    if (!acceptSnap.exists) transaction.create(acceptRef, { ...actionData, action: 'accept' });
    if (!declineSnap.exists) transaction.create(declineRef, { ...actionData, action: 'decline' });
    transaction.create(outboundRef, {
      eventId: outboundId, identityId, phoneNumberId: secrets.phoneNumberId, to: recipient,
      requestId, direction: 'outbound', type: 'template', status: 'sending',
      templateName, offerRevision, createdAtMs: Date.now(),
      retentionExpiresAtMs: Date.now() + whatsappRetentionDays('WHATSAPP_MESSAGE_RETENTION_DAYS', 180) * 24 * 60 * 60 * 1000,
      createdAt: now,
    });
    return true;
  });
  if (!claimed) return;

  const bodySummary = String(after.serviceSummary || after.subject || 'Uncedo service request').trim().slice(0, 500);
  const indicativeTotal = toRand(after.pricingSnapshot?.total ?? after.pricingSnapshot?.finalAmount ?? 0);
  try {
    const client = createMetaWhatsAppClient({
      accessToken: secrets.accessToken,
      phoneNumberId: secrets.phoneNumberId,
      graphApiVersion: secrets.graphApiVersion,
      approvedTemplateNames: secrets.approvedTemplateNames,
      requestTimeoutMs: process.env.WHATSAPP_META_SEND_TIMEOUT_MS,
      isRecipientAllowed: (recipient) => isWhatsAppRecipientAllowed(recipient, process.env),
    });
    const delivery = await client.sendTemplate({
      to: recipient,
      name: templateName,
      languageCode,
      components: buildHelperOfferTemplateComponents({
        serviceSummary: bodySummary,
        amountText: formatMoney(indicativeTotal),
        acceptActionId,
        declineActionId,
      }),
    });
    await outboundRef.set({ status: 'sent', metaMessageId: delivery.messageId || null, sentAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await reconcileWhatsAppDeliveryStatuses({ metaMessageId: delivery.messageId, recipientId: recipient, messageRef: outboundRef });
  } catch (error) {
    const deliveryStatus = classifyMetaDeliveryError(error);
    await outboundRef.set({
      status: deliveryStatus,
      deliveryStatus,
      errorCode: String(error?.code || 'meta_delivery_unknown').slice(0, 100),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    logger.warn('whatsapp_helper_offer_delivery_failed', { requestId, offerRevision, deliveryStatus, errorCode: String(error?.code || 'unknown').slice(0, 80) });
  }
});

exports.respondToServiceRequestOffer = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed.' });
    return;
  }

  const token = getBearerToken(req);
  const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) {
    res.status(401).json({ success: false, message: 'Unauthorized request.' });
    return;
  }

  const requestId = String(req.body?.requestId || '').trim();
  const offerToken = String(req.body?.offerToken || '').trim();
  const offerRevision = normalizeRevision(req.body?.offerRevision);
  const action = String(req.body?.action || '').trim().toLowerCase();
  if (!requestId || !offerToken || !offerRevision || !['accept', 'decline'].includes(action)) {
    res.status(400).json({ success: false, message: 'A valid offer action is required.' });
    return;
  }

  const helperId = decoded.uid;
  const requestRef = db.collection('serviceRequests').doc(requestId);
  try {
    const operation = await serviceRequestOfferOperations.respond({
      requestId, helperId, offerToken, offerRevision, action,
    });

    if (operation.error) {
      const status = operation.error === 'request-not-found' ? 404 : operation.error === 'helper-account-required' ? 403 : 409;
      res.status(status).json({ success: false, message: operation.error === 'request-not-found'
        ? 'Service request not found.'
        : operation.error === 'helper-account-required'
          ? 'A helper account is required to respond to this offer.'
          : operation.error === 'helper-already-has-active-request'
            ? 'You already have an active service request.'
            : operation.error === 'offer-expired'
              ? 'This helper offer has expired.'
              : 'This helper offer is no longer current.' });
      return;
    }

    if (operation.didApply) {
      await recordHelperOfferLifecycleEvent({
        helperId,
        requestId,
        offerRevision,
        categoryId: operation.categoryId,
        serviceIds: operation.serviceIds,
        outcome: action === 'accept' ? 'accepted' : 'declined',
        offeredAtMs: operation.offerStartedAtMs,
        closedAtMs: Date.now(),
        responseMinutes: Math.max(0, Number(((Date.now() - operation.offerStartedAtMs) / 60000).toFixed(2))),
        sourceStatus: action === 'accept' ? 'accepted' : 'matching',
      }).catch((error) => logger.warn('helper_offer_response_stats_failed', { requestId, helperId, error: error.message }));
    }

    const refreshed = await requestRef.get();
    res.status(200).json({
      success: true,
      idempotent: Boolean(operation.idempotent),
      request: refreshed.exists ? { id: refreshed.id, ...refreshed.data() } : null,
    });
  } catch (error) {
    logger.error('service_request_offer_response_failed', {
      requestId,
      helperId,
      action,
      error: error?.message || 'unknown_error',
    });
    res.status(500).json({ success: false, message: 'Unable to process this helper offer right now.' });
  }
});

exports.updateHelperServiceRequest = onRequest({ cors: true, ...HALF_CPU_OPTIONS }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed.' });
    return;
  }
  const token = getBearerToken(req);
  const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) {
    res.status(401).json({ success: false, message: 'Unauthorized request.' });
    return;
  }

  const requestId = String(req.body?.requestId || '').trim();
  const action = String(req.body?.action || 'transition').trim().toLowerCase();
  const nextStatus = String(req.body?.status || '').trim().toLowerCase();
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  if (!requestId || !['transition', 'cancel'].includes(action) || (action === 'transition' && !nextStatus)) {
    res.status(400).json({ success: false, message: 'A valid service request action is required.' });
    return;
  }

  const helperId = decoded.uid;
  const requestRef = db.collection('serviceRequests').doc(requestId);
  const helperRef = db.collection('users').doc(helperId);
  const financialOperationRef = db.collection(FINANCIAL_OPERATIONS_COLLECTION).doc(serviceFinancialOperationId(requestId));
  try {
    const result = await db.runTransaction(async (transaction) => {
      const [requestSnap, helperSnap, financialOperationSnap] = await Promise.all([
        transaction.get(requestRef),
        transaction.get(helperRef),
        transaction.get(financialOperationRef),
      ]);
      if (!requestSnap.exists) return { error: 'request-not-found', status: 404 };
      if (!helperSnap.exists || !isHelperUserRecord(helperSnap.data() || {})) {
        return { error: 'helper-account-required', status: 403 };
      }
      const request = requestSnap.data() || {};
      const helper = helperSnap.data() || {};
      if (String(request?.helperAssignment?.helperId || '') !== helperId) {
        return { error: 'not-assigned-helper', status: 403 };
      }
      if (financialOperationSnap.exists) {
        return { error: 'financial-operation-already-claimed', status: 409 };
      }

      if (action === 'cancel') {
        const cancelableStatuses = new Set(['accepted', 'driving', 'en_route', 'buying_resources', 'arrived', 'work_started']);
        if (!cancelableStatuses.has(String(request.status || '').toLowerCase())) {
          return { error: 'request-not-cancelable', status: 409 };
        }
        transaction.update(requestRef, {
          status: SERVICE_REQUEST_STATUS.CANCELED,
          statusDetail: 'Helper canceled the session.',
          canceledBy: 'helper',
          canceledReason: reason,
          canceledAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          financialOperationId: serviceFinancialOperationId(requestId),
        });
        transaction.create(financialOperationRef, {
          operationId: serviceFinancialOperationId(requestId),
          requestId,
          operationType: 'helper_cancellation',
          status: 'settled_no_charge',
          finalOutcome: 'no_charge',
          paymentStatus: 'not_applicable',
          paymentSettled: true,
          settlementApplied: true,
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
        });
        transaction.set(helperRef, {
          activeServiceRequestId: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return { changed: true };
      }

      if (nextStatus === 'completed') {
        return { error: 'billing-finalization-required', status: 409 };
      }

      const decision = evaluateHelperRequestTransition(request, { helperId, nextStatus });
      if (!decision.ok) return { error: decision.code, status: decision.code === 'not-assigned-helper' ? 403 : 409 };
      const statusDetails = {
        en_route: 'Helper is on the way.',
        driving: 'Helper is driving to your location.',
        buying_resources: 'Helper stopped to buy resources before arrival.',
        arrived: 'Helper has arrived.',
        work_started: 'The job is now in progress.',
        completed: 'Service completed.',
      };
      const updates = {
        status: nextStatus,
        statusDetail: statusDetails[nextStatus],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (nextStatus === 'arrived') updates.arrivedAt = admin.firestore.FieldValue.serverTimestamp();
      if (nextStatus === 'work_started') updates.workStartedAt = admin.firestore.FieldValue.serverTimestamp();
      transaction.update(requestRef, updates);

      if (nextStatus === 'completed') {
        transaction.set(helperRef, {
          activeServiceRequestId: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      return { changed: true };
    });

    if (result.error) {
      const messages = {
        'request-not-found': 'Service request not found.',
        'helper-account-required': 'A helper account is required for this action.',
        'not-assigned-helper': 'You are not assigned to this service request.',
        'request-not-cancelable': 'This service request can no longer be canceled by the helper.',
        'financial-operation-already-claimed': 'A financial or closure operation is already being processed for this request.',
        'billing-finalization-required': 'Complete this request through the billing finalization flow.',
        'invalid-current-status': 'This service request is not active.',
        'invalid-status-transition': 'That service request status change is not allowed.',
      };
      res.status(result.status).json({ success: false, message: messages[result.error] || 'This service request action is not allowed.' });
      return;
    }
    const refreshed = await requestRef.get();
    res.status(200).json({ success: true, request: refreshed.exists ? { id: refreshed.id, ...refreshed.data() } : null });
  } catch (error) {
    logger.error('helper_service_request_action_failed', {
      requestId,
      helperId,
      action,
      error: error?.message || 'unknown_error',
    });
    res.status(500).json({ success: false, message: 'Unable to update this service request right now.' });
  }
});

exports.syncServiceRequestAssignmentState = onDocumentWritten({
  document: 'serviceRequests/{requestId}',
  ...HALF_CPU_OPTIONS,
}, async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!after) return;

  const requestId = event.params.requestId;
  const beforeStatus = String(before?.status || '').toLowerCase();
  const afterStatus = String(after?.status || '').toLowerCase();
  const helperId = after?.helperAssignment?.helperId || before?.helperAssignment?.helperId || null;

  if (afterStatus === SERVICE_REQUEST_STATUS.ACCEPTED && helperId && beforeStatus !== SERVICE_REQUEST_STATUS.ACCEPTED) {
    logger.info('service_request_assignment_state_write', {
      requestId,
      helperId,
      afterStatus,
      traceLabel: 'functions:syncServiceRequestAssignmentState:accepted',
    });
    const customerId = after.customerId || before?.customerId || null;
    const helperName = after?.helperAssignment?.helperName || 'A helper';
    const acceptedAtMs = normalizeTimestamp(after?.helperAssignment?.acceptedAt) || Date.now();
    const customerLocation = normalizeCoordinate(after.location || after.requestPayload?.location || null);
    const helperSnapshot = await db.collection('users').doc(helperId).get();
    const helperLocation = getLiveLocationSnapshot(helperSnapshot.data() || {});
    const initialTracking = {
      requestId,
      helperId,
      customerId: customerId || '',
      helperLocation,
      customerLocation,
      destination: customerLocation,
      routeSnapshot: {
        routeCoordinates: [],
        routeSteps: [],
        encodedPolyline: '',
        overviewEncodedPolyline: '',
        distanceMeters: null,
        durationSeconds: null,
        routeProvider: '',
        lastRouteOrigin: helperLocation,
        lastDestination: customerLocation,
        lastSuccessfulRouteFetchAtMs: 0,
      },
      distanceTravelledMeters: 0,
      status: after.status || 'accepted',
      acceptedAtMs,
      startedAtMs: acceptedAtMs,
      updatedAtMs: Date.now(),
    };
    const acceptedNotificationRef = customerId
      ? db.collection('notifications').doc(`request_accepted_${requestId}_${helperId}`)
      : null;
    const effects = [
      db.collection('users').doc(helperId).set({
        activeServiceRequestId: requestId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }),
      db.collection('helperDispatchIndex').doc(helperId).set({
        activeServiceRequestId: requestId,
        available: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }),
      admin.database().ref(`liveTracking/serviceRequests/${requestId}`).update(initialTracking),
    ];
    if (acceptedNotificationRef) {
      effects.push(acceptedNotificationRef.set({
        userId: customerId,
        title: 'Helper selected',
        message: `${helperName} accepted your request.`,
        type: 'request_accepted',
        requestId,
        sessionId: null,
        targetPath: `/customer/requests/${requestId}`,
        metadata: {},
        read: false,
        readAt: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }));
    }
    await Promise.all(effects);
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
    await syncHelperDispatchIndexById(helperId);
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

exports.trackCustomerServiceEvents = onDocumentCreated({
  document: 'customerServiceEvents/{eventId}',
  ...HALF_CPU_OPTIONS,
}, async (event) => {
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

exports.promoteScheduledServiceRequests = onSchedule({
  schedule: '0 0 * * *',
  timeZone: 'Africa/Johannesburg',
}, async () => {
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



exports.syncHelperDispatchIndexOnServiceOfferingWrite = onDocumentWritten({
  document: 'helperServices/{offeringId}',
  ...HALF_CPU_OPTIONS,
}, async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  const helperId = String(after?.helperId || before?.helperId || '').trim();
  if (!helperId) return;
  await syncHelperDispatchIndexById(helperId);
});

exports.syncHelperDispatchIndex = onDocumentWritten({
  document: 'users/{uid}',
  ...HALF_CPU_OPTIONS,
}, async (event) => {
  const after = event.data.after.exists ? event.data.after.data() : null;
  const helperId = event.params.uid;

  if (!after || !isHelperUserRecord(after)) {
    await db.collection('helperDispatchIndex').doc(helperId).delete().catch((error) => {
      logger.warn('helper_dispatch_index_delete_failed', { helperId, error: error.message });
    });
    return;
  }

  const result = await writeHelperDispatchIndexFromUser(helperId, after);
  logger.info('helper_dispatch_index_synced', {
    helperId,
    skipped: Boolean(result.skipped),
    available: result.available ?? null,
    traceLabel: 'functions:syncHelperDispatchIndex:synced',
  });
});

async function isAdminAuthorizationHeader(req) {
  const header = String(req.get('authorization') || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    return isTrustedAdminToken(decoded);
  } catch (error) {
    logger.warn('helper_dispatch_index_rebuild_auth_failed', { error: error.message });
    return false;
  }
}

exports.rebuildHelperDispatchIndex = onRequest({ cors: true, ...HALF_CPU_OPTIONS }, async (req, res) => {
  if (!(await isAdminAuthorizationHeader(req))) {
    res.status(403).json({ ok: false, error: 'Admin authorization required.' });
    return;
  }

  const catalogIndex = buildActiveServiceCatalogIndex(await getLiveServiceCatalogEntries());
  const snap = await db.collection('users').where('activeRole', '==', 'helper').get();
  const counts = { processed: 0, updated: 0, skipped: 0, failed: 0 };

  for (const docSnap of snap.docs) {
    counts.processed += 1;
    try {
      const result = await writeHelperDispatchIndexFromUser(docSnap.id, docSnap.data() || {}, catalogIndex);
      if (result.skipped) counts.skipped += 1;
      else counts.updated += 1;
    } catch (error) {
      counts.failed += 1;
      logger.error('helper_dispatch_index_rebuild_record_failed', { helperId: docSnap.id, error: error.message });
    }
  }

  logger.info('helper_dispatch_index_rebuild_complete', counts);
  res.json({ ok: true, ...counts });
});

exports.getCustomerNearbyHelpers = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 20 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  const token = getBearerToken(req);
  const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) return res.status(401).json({ success: false, message: 'Sign in to view nearby helpers.' });
  const profileSnapshot = await db.collection('users').doc(decoded.uid).get();
  if (!profileSnapshot.exists || !profileAllowsRole(profileSnapshot.data() || {}, 'customer')) {
    return res.status(403).json({ success: false, message: 'A customer account is required.' });
  }
  const origin = validMapOrigin(req.body?.latitude, req.body?.longitude);
  if (!origin) return res.status(400).json({ success: false, message: 'A valid customer location is required.' });
  const radiusKm = Math.max(1, Math.min(50, Number(req.body?.radiusKm) || 20));
  const limit = Math.max(1, Math.min(50, Math.floor(Number(req.body?.limit) || 24)));
  const cells = getH3QueryCellsForLocation(origin);
  const pages = await Promise.all(chunkList(cells, 10).map((cellChunk) => db.collection('helperDispatchIndex')
    .where('h3Cell', 'in', cellChunk).limit(60).get()));
  const documents = [...new Map(pages.flatMap((page) => page.docs).map((document) => [document.id, document]))
    .values()].map((document) => ({ id: document.id, data: document.data() || {} }));
  const eligibleDocuments = helperPoliceClearanceRequired()
    ? documents.filter((document) => isHelperPoliceClearanceApproved(document.data?.policeClearanceStatus))
    : documents;
  const helpers = buildNearbyHelperMapResults({ documents: eligibleDocuments, origin, radiusKm, limit });
  return res.status(200).json({ success: true, currentUser: { id: decoded.uid, ...origin }, helpers, radiusKm });
});

exports.getMyOfferedTutorSummary = onCall({ maxInstances: 5, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 15 }, async (request) => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to view this offer.');
  const requestId = String(request.data?.requestId || '').trim();
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(requestId)) throw new HttpsError('invalid-argument', 'A valid request is required.');

  const requestSnapshot = await db.collection('classRequests').doc(requestId).get();
  const classRequest = requestSnapshot.exists ? requestSnapshot.data() || {} : null;
  if (!classRequest || String(classRequest.studentId || '') !== uid) {
    throw new HttpsError('not-found', 'The request is unavailable.');
  }
  if (String(classRequest.status || '').toLowerCase() !== 'offered') {
    throw new HttpsError('failed-precondition', 'There is no current offer for this request.');
  }

  const tutorId = String(classRequest.currentOfferTutorId || classRequest.tutorId || '').trim();
  if (!tutorId) throw new HttpsError('not-found', 'The offer is unavailable.');
  const tutorSnapshot = await db.collection('users').doc(tutorId).get();
  const tutor = tutorSnapshot.exists ? tutorSnapshot.data() || {} : {};
  if (!profileAllowsRole(tutor, 'tutor')) throw new HttpsError('not-found', 'The offer is unavailable.');

  return buildPublicTutorSummary(tutor, classRequest.tutorName);
});

exports.syncHelperQueueOnHelperOnline = onDocumentWritten('users/{uid}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!after || !isHelperUserRecord(after)) return;

  const wasOnline = String(before?.onlineStatus || '').toLowerCase() === 'online';
  const isOnline = String(after.onlineStatus || '').toLowerCase() === 'online';
  if (wasOnline || !isOnline) return;
  await writeHelperDispatchIndexFromUser(event.params.uid, after);
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
    const helperOfferings = await getHelperServiceOfferings(event.params.uid);
    if (!isHelperDispatchEligible(after, categoryId, requestServiceIds, catalogIndex, helperOfferings)) {
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

function isAdminToken(decoded = {}) {
  return isTrustedAdminToken(decoded);
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

function assertRequiredSecrets(groupName, secrets, requiredKeys) {
  const missingKeys = requiredKeys.filter((key) => !secrets[key]);
  if (missingKeys.length) {
    throw new Error(`${groupName} is missing required field(s): ${missingKeys.join(', ')}`);
  }
}

function getPaymentsSecrets() {
  const secrets = {
    PAYSTACK_SECRET_KEY: String(process.env.PAYSTACK_SECRET_KEY || '').trim(),
  };

  assertRequiredSecrets('functions/.env', secrets, ['PAYSTACK_SECRET_KEY']);
  return secrets;
}

function getEmailSecrets() {
  const secrets = {
    RESEND_API_KEY: String(process.env.RESEND_API_KEY || '').trim(),
    EMAIL_FROM: String(process.env.EMAIL_FROM || '').trim(),
  };

  assertRequiredSecrets('functions/.env', secrets, ['RESEND_API_KEY', 'EMAIL_FROM']);
  return secrets;
}

function getWhatsAppSecrets() {
  return {
    accessToken: String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim(),
    phoneNumberId: String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim(),
    verifyToken: String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim(),
    appSecret: String(process.env.META_APP_SECRET || '').trim(),
    graphApiVersion: String(process.env.GRAPH_API_VERSION || '').trim(),
    approvedTemplateNames: String(process.env.APPROVED_TEMPLATE_NAMES || '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  };
}

function getWhatsAppAuthConfiguration() {
  const whatsapp = getWhatsAppSecrets();
  return {
    ...whatsapp,
    messagingEnabled: whatsappMessagingEnabled(),
    enabled: String(process.env.WHATSAPP_AUTH_ENABLED || '').trim().toLowerCase() === 'true',
    templateName: String(process.env.WHATSAPP_AUTH_TEMPLATE_NAME || '').trim(),
    templateLanguage: String(process.env.WHATSAPP_AUTH_TEMPLATE_LANGUAGE || '').trim(),
  };
}

function getWhatsAppAuthClient(config) {
  if (!config.messagingEnabled) throw new HttpsError('failed-precondition', 'WhatsApp messaging is disabled.');
  if (!config.enabled) throw new HttpsError('failed-precondition', 'WhatsApp authentication is not configured.');
  if (!config.accessToken || !config.phoneNumberId || !config.graphApiVersion || !config.appSecret) {
    throw new HttpsError('failed-precondition', 'WhatsApp authentication is not configured.');
  }
  if (!config.templateName || !config.templateLanguage || !config.approvedTemplateNames.includes(config.templateName)) {
    throw new HttpsError('failed-precondition', 'The approved WhatsApp authentication template is not configured.');
  }
  return createMetaWhatsAppClient({
    accessToken: config.accessToken,
    phoneNumberId: config.phoneNumberId,
    graphApiVersion: config.graphApiVersion,
    approvedTemplateNames: config.approvedTemplateNames,
    requestTimeoutMs: process.env.WHATSAPP_META_SEND_TIMEOUT_MS,
    isRecipientAllowed: (recipient) => isWhatsAppRecipientAllowed(recipient, process.env),
  });
}

async function consumeWhatsAppAuthRateLimit({ key, limit, windowMs }) {
  const ref = db.collection('whatsappAuthRateLimits').doc(key);
  const now = Date.now();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() || {} : {};
    const windowStartedAt = Number(data.windowStartedAt || 0);
    const count = now - windowStartedAt < windowMs ? Number(data.count || 0) : 0;
    if (count >= limit) {
      throw new HttpsError('resource-exhausted', 'Too many code requests. Please try again later.');
    }
    transaction.set(ref, {
      windowStartedAt: count ? windowStartedAt : now,
      count: count + 1,
      expiresAt: admin.firestore.Timestamp.fromMillis(now + windowMs),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

function getAuthRequestIpHash(request) {
  const rawRequest = request?.rawRequest;
  const ip = String(rawRequest?.ip || rawRequest?.socket?.remoteAddress || 'unknown').trim();
  return createHash('sha256').update(`wa-auth-ip:${ip}`).digest('hex');
}

async function getFirebaseUserByPhoneNumber(phoneNumber) {
  try {
    return await admin.auth().getUserByPhoneNumber(phoneNumber);
  } catch (error) {
    if (error?.code === 'auth/user-not-found') return null;
    throw error;
  }
}

async function getFirebaseUserByEmail(email) {
  try {
    return await admin.auth().getUserByEmail(email);
  } catch (error) {
    if (error?.code === 'auth/user-not-found') return null;
    throw error;
  }
}

function sanitizeAuthDisplayName(name) {
  return String(name || '').trim().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 120);
}

async function buildWhatsAppAuthUserProfile({ uid, role, email, name, phoneNumber }) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const base = {
    uid,
    email,
    fullName: name,
    displayName: name,
    role,
    activeRole: role,
    roles: [role],
    phoneNumber,
    phoneNumberVerified: true,
    phoneNumberVerifiedAt: now,
    whatsappPhoneNumber: phoneNumber,
    whatsappVerifiedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  if (role === 'customer') {
    return {
      ...base,
      customerProfile: {
        accountType: '',
        customerType: '',
        serviceAddress: '',
        discoverySource: '',
        preferredServiceCategories: [],
        businessName: '',
        businessEmail: email,
        businessCategory: '',
      },
      paymentMethods: [],
      studentProfile: { grade: null, curriculum: '', discoverySource: '' },
    };
  }
  const agreementSnap = await db.collection('legalDocuments').doc('helper_agreement').get().catch(() => null);
  const agreementDocument = agreementSnap?.exists ? agreementSnap.data() || {} : {};
  const agreementVersion = String(agreementDocument.currentVersion || '1.0.1').trim();
  const agreementVersionId = String(agreementDocument.currentVersionId || `helper_agreement_${agreementVersion}`).trim();
  const nameParts = name.split(/\s+/).filter(Boolean);
  return {
    ...base,
    firstName: nameParts[0] || '',
    lastName: nameParts.slice(1).join(' '),
    providerType: '',
    businessName: '',
    verificationStatus: 'pending',
    onlineStatus: 'offline',
    profilePhoto: '',
    services: [],
    agreement: {
      documentId: 'helper_agreement',
      title: agreementDocument.title || 'Helper Agreement',
      legalEntityName: agreementDocument.legalEntityName || LEGAL_ENTITY_NAME,
      acceptedVersion: '',
      requiredVersion: agreementVersion,
      requiredVersionId: agreementVersionId,
      currentVersion: agreementVersion,
      currentVersionId: agreementVersionId,
      currentVersionAccepted: false,
      acceptedCurrentVersion: false,
      acceptedAt: null,
    },
    payout: { bankName: '', accountHolder: '', accountNumber: '', recipientCode: '', verificationStatus: 'pending' },
  };
}

exports.startWhatsAppAuthChallenge = onCall({
  maxInstances: 2,
  ...HALF_CPU_OPTIONS,
  memory: '256MiB',
  timeoutSeconds: 30,
}, async (request) => {
  const config = getWhatsAppAuthConfiguration();
  const client = getWhatsAppAuthClient(config);
  let input;
  try {
    input = normalizeWhatsAppAuthInput(request.data || {});
  } catch (error) {
    throw new HttpsError('invalid-argument', error.message);
  }
  const challengeId = randomUUID();
  const code = generateWhatsAppOtp();
  const phoneHash = createHash('sha256').update(`wa-auth-phone:${input.phoneNumber}`).digest('hex');
  await Promise.all([
    consumeWhatsAppAuthRateLimit({ key: `phone_${phoneHash}`, limit: 3, windowMs: 60 * 60 * 1000 }),
    consumeWhatsAppAuthRateLimit({ key: `ip_${getAuthRequestIpHash(request)}`, limit: 10, windowMs: 60 * 60 * 1000 }),
  ]);

  let deliverable = true;
  const existingPhoneUser = await getFirebaseUserByPhoneNumber(input.phoneNumber);
  if (input.mode === 'login') {
    const profileSnap = existingPhoneUser ? await db.collection('users').doc(existingPhoneUser.uid).get() : null;
    deliverable = Boolean(existingPhoneUser && profileSnap?.exists && profileAllowsRole(profileSnap.data(), input.role));
  } else {
    const existingEmailUser = await getFirebaseUserByEmail(input.email);
    deliverable = !existingPhoneUser && !existingEmailUser;
  }

  const challengeRef = db.collection('whatsappAuthChallenges').doc(challengeId);
  await challengeRef.set({
    phoneNumber: input.phoneNumber,
    phoneHash,
    role: input.role,
    mode: input.mode,
    name: sanitizeAuthDisplayName(input.name),
    email: input.email,
    codeHash: hashWhatsAppOtp({ challengeId, code, secret: config.appSecret }),
    attempts: 0,
    maxAttempts: 5,
    deliverable,
    consumed: false,
    deliveryStatus: deliverable ? 'sending' : 'not_sent',
    retentionExpiresAtMs: retentionExpiryMs(process.env, 'WHATSAPP_AUTH_RETENTION_DAYS'),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 5 * 60 * 1000),
  });

  if (deliverable) {
    try {
      const delivery = await client.sendTemplate({
        to: input.phoneNumber,
        name: config.templateName,
        languageCode: config.templateLanguage,
        components: buildOtpTemplateComponents(code),
      });
      await challengeRef.set({ deliveryStatus: 'sent', metaMessageId: delivery.messageId || null, deliveredAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    } catch (error) {
      const deliveryStatus = classifyMetaDeliveryError(error);
      await challengeRef.set({ deliveryStatus, deliveryFailed: deliveryStatus === 'failed', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      logger.warn('whatsapp_auth_code_delivery_failed', { deliveryStatus, errorCode: String(error?.code || 'delivery_failed').slice(0, 80) });
      throw new HttpsError('unavailable', 'Unable to send a WhatsApp sign-in code right now.');
    }
  }
  return { challengeId, expiresInSeconds: 300 };
});

exports.completeWhatsAppAuthChallenge = onCall({
  maxInstances: 2,
  ...HALF_CPU_OPTIONS,
  memory: '256MiB',
  timeoutSeconds: 30,
}, async (request) => {
  const challengeId = String(request.data?.challengeId || '').trim();
  const code = String(request.data?.code || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !/^\d{6}$/.test(code)) {
    throw new HttpsError('invalid-argument', 'The verification code is invalid or expired.');
  }
  const challengeRef = db.collection('whatsappAuthChallenges').doc(challengeId);
  const challengeOutcome = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(challengeRef);
    if (!snapshot.exists) return null;
    const challenge = snapshot.data() || {};
    const now = Date.now();
    if (challenge.consumed || challenge.expiresAt?.toMillis?.() <= now || Number(challenge.attempts || 0) >= Number(challenge.maxAttempts || 5)) return null;
    const config = getWhatsAppAuthConfiguration();
    const candidateHash = hashWhatsAppOtp({ challengeId, code, secret: config.appSecret });
    const valid = constantTimeHashMatch(challenge.codeHash, candidateHash);
    if (!valid) {
      transaction.set(challengeRef, { attempts: admin.firestore.FieldValue.increment(1), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return { valid: false };
    }
    transaction.set(challengeRef, { consumed: true, consumedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { valid: true, challenge };
  });
  if (!challengeOutcome?.valid || !challengeOutcome.challenge?.deliverable) {
    throw new HttpsError('unauthenticated', 'The verification code is invalid or expired.');
  }
  const challenge = challengeOutcome.challenge;
  let userRecord;
  if (challenge.mode === 'signup') {
    try {
      userRecord = await admin.auth().createUser({
        email: challenge.email,
        phoneNumber: challenge.phoneNumber,
        displayName: challenge.name,
        emailVerified: false,
      });
    } catch (error) {
      logger.warn('whatsapp_auth_account_creation_failed', { errorCode: String(error?.code || 'account_creation_failed').slice(0, 80) });
      throw new HttpsError('already-exists', 'Unable to create an account with those details. Sign in or contact Uncedo support.');
    }
    const profile = await buildWhatsAppAuthUserProfile({
      uid: userRecord.uid,
      role: challenge.role,
      email: challenge.email,
      name: challenge.name,
      phoneNumber: challenge.phoneNumber,
    });
    await db.collection('users').doc(userRecord.uid).set(profile, { merge: false });
  } else {
    userRecord = await getFirebaseUserByPhoneNumber(challenge.phoneNumber);
    const profileSnap = userRecord ? await db.collection('users').doc(userRecord.uid).get() : null;
    if (!userRecord || !profileSnap?.exists || !profileAllowsRole(profileSnap.data(), challenge.role)) {
      throw new HttpsError('unauthenticated', 'The verification code is invalid or expired.');
    }
  }
  const token = await admin.auth().createCustomToken(userRecord.uid, {
    role: challenge.role,
    whatsappAuthenticated: true,
  });
  return { customToken: token, role: challenge.role };
});

async function requireWhatsAppHelperAgreementChallenge(uid, rawToken) {
  const token = normalizeAgreementLinkToken(rawToken);
  if (!token) throw new HttpsError('invalid-argument', 'The helper agreement link is invalid or expired.');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const challengeRef = db.collection('whatsappAgreementChallenges').doc(tokenHash);
  const challengeSnapshot = await challengeRef.get();
  if (!challengeSnapshot.exists) throw new HttpsError('not-found', 'The helper agreement link is invalid or expired.');
  const challenge = challengeSnapshot.data() || {};
  const access = validateAgreementLinkChallenge({ challenge, uid, nowMs: Date.now() });
  if (!access.valid) {
    const code = access.code === 'account-mismatch' || access.code === 'role-mismatch' ? 'permission-denied'
      : access.code === 'expired' ? 'deadline-exceeded' : 'failed-precondition';
    throw new HttpsError(code, 'This agreement link is not valid for the signed-in helper account.');
  }
  const [identitySnapshot, profileSnapshot, userLinkSnapshot] = await Promise.all([
    db.collection('whatsappIdentities').doc(String(challenge.identityId)).get(),
    db.collection('users').doc(uid).get(),
    db.collection('whatsappUserLinks').doc(uid).get(),
  ]);
  const identity = identitySnapshot.data() || {};
  const profile = profileSnapshot.data() || {};
  const userLink = userLinkSnapshot.data() || {};
  const identityPhone = normalizeWhatsAppIdentityPhone(`+${String(identity.waId || '')}`);
  const phoneHash = createHash('sha256').update(identityPhone.phoneNumber).digest('hex');
  if (!identitySnapshot.exists || !profileSnapshot.exists || !isHelperUserRecord(profile)
    || String(identity.linkedFirebaseUid || '') !== uid || String(identity.role || '').toLowerCase() !== 'helper'
    || !normalizeTimestamp(identity.verifiedAt) || String(userLink.identityId || '') !== String(challenge.identityId)
    || String(userLink.uid || '') !== uid || String(challenge.phoneHash || '') !== phoneHash) {
    throw new HttpsError('permission-denied', 'The WhatsApp number is not linked to this helper account.');
  }
  return { tokenHash, challengeRef, challenge, identity, profile };
}

async function acceptHelperAgreementForUid({ uid, typedSignatureName, expectedVersion, userAgent = '' }) {
  const signature = String(typedSignatureName || '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 180);
  if (signature.length < 2) throw new HttpsError('invalid-argument', 'Type your full legal name to sign the Helper Agreement.');
  const profileSnapshot = await db.collection('users').doc(uid).get();
  const profile = profileSnapshot.data() || {};
  if (!profileSnapshot.exists || !isHelperUserRecord(profile)) throw new HttpsError('permission-denied', 'Only a helper account can sign the Helper Agreement.');
  const bundle = await getCanonicalHelperAgreementBundle({ db, admin, userId: uid });
  const activeVersion = String(bundle.activeVersion?.version || '').trim();
  if (!activeVersion) throw new HttpsError('failed-precondition', 'The current Helper Agreement is not available.');
  if (String(expectedVersion || '').trim() && String(expectedVersion).trim() !== activeVersion) {
    throw new HttpsError('failed-precondition', 'The Helper Agreement has changed. Reload the page and review the current version before signing.');
  }
  try {
    return await acceptCanonicalHelperAgreement({
      db,
      admin,
      user: { uid, ...profile },
      typedSignatureName: signature,
      checkboxAccepted: true,
      expectedVersion: expectedVersion || '',
      userAgent: String(userAgent || '').slice(0, 240),
    });
  } catch (error) {
    logger.warn('helper_agreement_acceptance_failed', { uid, errorCode: String(error?.code || 'acceptance_failed').slice(0, 80) });
    throw new HttpsError('failed-precondition', String(error?.message || 'Unable to accept the current Helper Agreement.').slice(0, 240));
  }
}

exports.getWhatsAppHelperAgreementSession = onCall({ maxInstances: 3, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in with the helper email account linked to WhatsApp.');
  const link = await requireWhatsAppHelperAgreementChallenge(uid, request.data?.token);
  const bundle = await getCanonicalHelperAgreementBundle({ db, admin, userId: uid });
  const activeVersion = bundle.activeVersion;
  if (!activeVersion) throw new HttpsError('failed-precondition', 'The current Helper Agreement is not available.');
  const accepted = String(link.profile.agreement?.acceptedVersion || '') === String(activeVersion.version || '')
    && isHelperAgreementCurrent(link.profile);
  return {
    activeVersion: {
      id: activeVersion.id,
      version: activeVersion.version,
      title: activeVersion.title,
      effectiveDate: activeVersion.effectiveDate || '',
      reviewedAt: activeVersion.reviewedAt || '',
      contentMarkdown: String(activeVersion.contentMarkdown || ''),
      contentHash: String(activeVersion.contentHash || ''),
      legalEntityName: String(activeVersion.legalEntityName || LEGAL_ENTITY_NAME),
    },
    accepted,
    acceptedVersion: String(link.profile.agreement?.acceptedVersion || ''),
    acceptedAt: link.profile.agreement?.acceptedAt || null,
    maskedWhatsAppNumber: `+${String(link.identity.waId || '').replace(/(\d{2,4})\d{4}(\d{2,4})$/, '$1••••$2')}`,
    challengeExpiresAtMs: Number(link.challenge.expiresAtMs || 0),
  };
});

exports.acceptHelperAgreement = onCall({ maxInstances: 3, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 60 }, async (request) => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in before accepting the Helper Agreement.');
  if (request.data?.checkboxAccepted !== true) throw new HttpsError('invalid-argument', 'Confirm that you accept the Helper Agreement.');
  const result = await acceptHelperAgreementForUid({
    uid,
    typedSignatureName: request.data?.typedSignatureName,
    expectedVersion: request.data?.expectedVersion,
    userAgent: request.rawRequest?.headers?.['user-agent'] || '',
  });
  return { success: true, ...result };
});

exports.acceptWhatsAppHelperAgreement = onCall({ maxInstances: 3, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 60 }, async (request) => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in with the helper email account linked to WhatsApp.');
  if (request.data?.checkboxAccepted !== true) throw new HttpsError('invalid-argument', 'Confirm that you accept the Helper Agreement.');
  const link = await requireWhatsAppHelperAgreementChallenge(uid, request.data?.token);
  const challengeRef = link.challengeRef;
  const claim = await db.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(challengeRef);
    if (!currentSnapshot.exists) return { code: 'missing' };
    const current = currentSnapshot.data() || {};
    const access = validateAgreementLinkChallenge({ challenge: current, uid, nowMs: Date.now() });
    if (!access.valid) return { code: access.code };
    if (current.status === 'completed') return { code: 'completed', challenge: current };
    if (current.status === 'accepting' && Date.now() - Number(current.acceptingAtMs || 0) < 120000) return { code: 'in-progress' };
    transaction.set(challengeRef, { status: 'accepting', acceptingAtMs: Date.now(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { code: 'claimed', challenge: current };
  });
  if (claim.code === 'completed') {
    let confirmationSent = false;
    try {
      confirmationSent = await sendWhatsAppHelperAgreementSignedConfirmation({ uid, identityId: link.challenge.identityId, tokenHash: link.tokenHash });
    } catch (error) {
      logger.warn('whatsapp_helper_agreement_confirmation_failed', { identityId: String(link.challenge.identityId || ''), errorCode: String(error?.code || 'send_failed').slice(0, 80) });
    }
    return {
      success: true,
      alreadyAccepted: true,
      acceptedVersion: String(claim.challenge.acceptedVersion || ''),
      confirmationSent,
      returnUrl: getWhatsAppBusinessReturnUrl(),
    };
  }
  if (claim.code === 'in-progress') throw new HttpsError('aborted', 'The Helper Agreement is being recorded. Refresh in a moment to check its status.');
  if (claim.code !== 'claimed') throw new HttpsError('failed-precondition', 'This Helper Agreement link is no longer available.');

  try {
    const result = await acceptHelperAgreementForUid({
      uid,
      typedSignatureName: request.data?.typedSignatureName,
      expectedVersion: request.data?.expectedVersion,
      userAgent: request.rawRequest?.headers?.['user-agent'] || '',
    });
    const acceptedVersion = String(result.activeVersion?.version || result.acceptance?.version || request.data?.expectedVersion || '');
    await db.runTransaction(async (transaction) => {
      const currentSnapshot = await transaction.get(challengeRef);
      const current = currentSnapshot.data() || {};
      if (!currentSnapshot.exists || String(current.uid || '') !== uid) throw new HttpsError('permission-denied', 'The agreement link is not valid for this helper account.');
      transaction.set(challengeRef, {
        status: 'completed', acceptedVersion,
        acceptanceId: String(result.acceptanceId || ''), completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(db.collection('whatsappConversations').doc(String(link.challenge.identityId)), {
        whatsappOnboarding: { stage: 'helper_readiness', role: 'helper', accountMode: 'account', updatedAtMs: Date.now() },
        currentMode: 'onboarding', updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    let confirmationSent = false;
    try {
      confirmationSent = await sendWhatsAppHelperAgreementSignedConfirmation({ uid, identityId: link.challenge.identityId, tokenHash: link.tokenHash });
    } catch (error) {
      logger.warn('whatsapp_helper_agreement_confirmation_failed', { identityId: String(link.challenge.identityId || ''), errorCode: String(error?.code || 'send_failed').slice(0, 80) });
    }
    return {
      success: true,
      alreadyAccepted: false,
      acceptedVersion,
      acceptanceId: String(result.acceptanceId || ''),
      confirmationSent,
      returnUrl: getWhatsAppBusinessReturnUrl(),
    };
  } catch (error) {
    await challengeRef.set({ status: 'pending', lastFailureCode: String(error?.code || 'acceptance_failed').slice(0, 80), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(() => null);
    throw error;
  }
});

exports.completeWhatsAppSignupLink = onCall({
  maxInstances: 3,
  ...HALF_CPU_OPTIONS,
  memory: '256MiB',
  timeoutSeconds: 30,
}, async (request) => {
  const uid = String(request.auth?.uid || '').trim();
  const token = String(request.data?.token || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in with your Uncedo email account before linking WhatsApp.');
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new HttpsError('invalid-argument', 'The WhatsApp link is invalid or expired.');
  if (!whatsappOnboardingEnabled()) throw new HttpsError('failed-precondition', 'WhatsApp account onboarding is not enabled.');
  const actorHash = whatsappDiagnosticHash(uid);
  logger.info('whatsapp_signup_link_attempt', { actorHash });

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const challengeRef = db.collection('whatsappSignupChallenges').doc(tokenHash);
  const challengeSnap = await challengeRef.get();
  if (!challengeSnap.exists) throw new HttpsError('not-found', 'The WhatsApp signup link is invalid or expired.');
  const challenge = challengeSnap.data() || {};
  if (Number(challenge.expiresAtMs || 0) <= Date.now() || !['customer', 'helper'].includes(challenge.role)) {
    throw new HttpsError('deadline-exceeded', 'The WhatsApp signup link has expired. Start again from your WhatsApp chat.');
  }

  const profileRef = db.collection('users').doc(uid);
  const [profileSnap, identitySnap] = await Promise.all([
    profileRef.get(), db.collection('whatsappIdentities').doc(String(challenge.identityId || '')).get(),
  ]);
  if (!profileSnap.exists || !profileAllowsRole(profileSnap.data() || {}, challenge.role)) {
    logger.warn('whatsapp_signup_link_rejected', {
      actorHash,
      identityHash: whatsappDiagnosticHash(challenge.identityId),
      reason: profileSnap.exists ? 'profile_role_mismatch' : 'profile_missing',
    });
    throw new HttpsError('permission-denied', 'This Uncedo account does not match the account type selected in WhatsApp.');
  }
  if (!identitySnap.exists) {
    logger.warn('whatsapp_signup_link_rejected', { actorHash, reason: 'identity_missing' });
    throw new HttpsError('failed-precondition', 'The WhatsApp conversation could not be found. Start again from that chat.');
  }
  const identity = identitySnap.data() || {};
  const phone = normalizeWhatsAppIdentityPhone(`+${String(identity.waId || '')}`);
  if (String(challenge.phoneHash || '') !== createHash('sha256').update(phone.phoneNumber).digest('hex')) {
    logger.warn('whatsapp_signup_link_rejected', {
      actorHash, identityHash: whatsappDiagnosticHash(challenge.identityId), reason: 'phone_hash_mismatch',
    });
    throw new HttpsError('failed-precondition', 'The WhatsApp identity has changed. Start again from that chat.');
  }

  const claim = await db.runTransaction(async (transaction) => {
    const currentSnap = await transaction.get(challengeRef);
    if (!currentSnap.exists) return { code: 'missing' };
    const current = currentSnap.data() || {};
    if (Number(current.expiresAtMs || 0) <= Date.now()) return { code: 'expired' };
    if (current.status === 'used') return String(current.usedByUid || '') === uid ? { code: 'already-used' } : { code: 'used-elsewhere' };
    if (current.claimedUid && String(current.claimedUid) !== uid) return { code: 'claimed-elsewhere' };
    transaction.set(challengeRef, {
      claimedUid: uid,
      status: 'claimed',
      claimedAt: current.claimedAt || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { code: 'claimed' };
  });
  if (!['claimed', 'already-used'].includes(claim.code)) {
    logger.warn('whatsapp_signup_link_rejected', {
      actorHash, identityHash: whatsappDiagnosticHash(challenge.identityId), reason: `challenge_${claim.code}`,
    });
    throw new HttpsError(claim.code === 'expired' ? 'deadline-exceeded' : 'already-exists', 'This WhatsApp signup link is no longer available. Start again from your WhatsApp chat.');
  }

  if (claim.code !== 'already-used') {
    let linked;
    try {
      linked = await commitWhatsAppIdentityLink({
        uid,
        role: challenge.role,
        identityId: String(challenge.identityId),
        phone,
      });
    } catch (error) {
      logger.error('whatsapp_signup_link_commit_failed', {
        actorHash,
        identityHash: whatsappDiagnosticHash(challenge.identityId),
        errorCode: String(error?.code || 'commit_failed').slice(0, 80),
      });
      throw error;
    }
    if (!['linked', 'already-linked'].includes(linked.code)) {
      logger.warn('whatsapp_signup_link_conflict', {
        actorHash,
        identityHash: whatsappDiagnosticHash(challenge.identityId),
        conflictCode: String(linked.code || 'unknown').slice(0, 80),
      });
      const conflictMessages = {
        'identity-linked-elsewhere': 'This WhatsApp chat is still linked to a different Uncedo account. Deleting a Firebase Auth user does not automatically unlink its WhatsApp history. Contact support to review the old link safely.',
        'account-linked-elsewhere': 'This Uncedo account is already linked to a different WhatsApp chat. Contact support to review the existing link safely.',
        'guest-history-linked-elsewhere': 'This WhatsApp conversation history is linked to another Uncedo account. Contact support to review the existing link safely.',
        'whatsapp-number-linked-elsewhere': 'This WhatsApp number is reserved by another Uncedo account. Contact support to review the existing link safely.',
        'account-whatsapp-already-set': 'This Uncedo account already has a different WhatsApp number linked. Contact support to change it safely.',
      };
      throw new HttpsError('already-exists', conflictMessages[linked.code] || 'This WhatsApp identity is linked to another Uncedo account. Contact support to review it safely.');
    }
    logger.info('whatsapp_signup_link_committed', {
      actorHash, identityHash: whatsappDiagnosticHash(challenge.identityId), result: linked.code,
    });
    await db.runTransaction(async (transaction) => {
      const currentSnap = await transaction.get(challengeRef);
      const current = currentSnap.data() || {};
      if (current.status === 'used' && String(current.usedByUid || '') === uid) return;
      if (String(current.claimedUid || '') !== uid || Number(current.expiresAtMs || 0) <= Date.now()) {
        throw new HttpsError('deadline-exceeded', 'The WhatsApp signup link has expired. Start again from your WhatsApp chat.');
      }
      transaction.set(challengeRef, {
        status: 'used', usedByUid: uid, usedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      const conversationRef = db.collection('whatsappConversations').doc(String(challenge.identityId));
      transaction.set(conversationRef, {
        whatsappOnboarding: {
          stage: 'awaiting_preferred_name', role: challenge.role,
          accountMode: 'account', createdAtMs: Date.now(),
        },
        currentMode: 'onboarding', linkedFirebaseUid: uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  }

  const returnUrl = getWhatsAppBusinessReturnUrl();
  let confirmationSent = false;
  if (whatsappMessagingEnabled()) {
    try {
      const conversationRef = db.collection('whatsappConversations').doc(String(challenge.identityId));
      const currentConversation = await conversationRef.get();
      const sourceEventId = String(currentConversation.data()?.lastInboundEventId || challenge.sourceEventId || '');
      const currentIdentity = await db.collection('whatsappIdentities').doc(String(challenge.identityId)).get();
      if (sourceEventId && currentIdentity.exists) {
        const result = await persistWhatsAppAssistantReply({
          sourceEventId: `signup-link:${tokenHash}`,
          identityId: String(challenge.identityId),
          identity: currentIdentity.data(),
          conversationRef,
          text: 'Your Uncedo account is linked to this WhatsApp number. What name would you like us to use when speaking with you?',
          purpose: 'account_signup_confirmation',
          requireCurrentInbound: false,
        });
        confirmationSent = result.sent === true;
      }
    } catch (error) {
      logger.info('whatsapp_signup_confirmation_not_sent', { errorCode: String(error?.code || 'send_unavailable').slice(0, 80) });
    }
  }
  return { linked: true, role: challenge.role, returnUrl, confirmationSent };
});

exports.completeWhatsAppAccountLink = onCall({
  maxInstances: 3,
  ...HALF_CPU_OPTIONS,
  memory: '256MiB',
  timeoutSeconds: 30,
}, async (request) => {
  const token = String(request.data?.token || '').trim();
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new HttpsError('invalid-argument', 'The WhatsApp account link is invalid or expired.');
  if (!whatsappOnboardingEnabled()) throw new HttpsError('failed-precondition', 'WhatsApp account linking is not enabled.');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const challengeRef = db.collection('whatsappAccountLinkChallenges').doc(tokenHash);
  const challengeSnapshot = await challengeRef.get();
  if (!challengeSnapshot.exists) throw new HttpsError('not-found', 'The WhatsApp account link is invalid or expired.');
  const challenge = challengeSnapshot.data() || {};
  if (!isWhatsAppAccountLinkChallengeLive(challenge, Date.now()) && challenge.status !== 'claimed') {
    throw new HttpsError('deadline-exceeded', 'This WhatsApp account link has expired. Send “Hi” in your Uncedo chat to request a new one.');
  }
  const uid = String(challenge.uid || '').trim();
  const identityId = String(challenge.identityId || '').trim();
  const role = String(challenge.role || '').trim().toLowerCase();
  if (!uid || !identityId || !['customer', 'helper'].includes(role)) {
    throw new HttpsError('failed-precondition', 'The WhatsApp account link is incomplete. Request a new link from your chat.');
  }
  const [identitySnapshot, profileSnapshot] = await Promise.all([
    db.collection('whatsappIdentities').doc(identityId).get(),
    db.collection('users').doc(uid).get(),
  ]);
  if (!identitySnapshot.exists || !profileSnapshot.exists) throw new HttpsError('failed-precondition', 'The WhatsApp account or conversation is no longer available.');
  const identity = identitySnapshot.data() || {};
  const profile = profileSnapshot.data() || {};
  const phone = normalizeWhatsAppIdentityPhone(`+${String(identity.waId || '')}`);
  if (!phone.phoneNumber || String(identity.phoneNumberId || '') !== String(getWhatsAppSecrets().phoneNumberId || '')
    || String(challenge.phoneHash || '') !== createHash('sha256').update(phone.phoneNumber).digest('hex')
    || !profileAllowsRole(profile, role)) {
    throw new HttpsError('failed-precondition', 'The WhatsApp identity or account details changed. Request a new link from your chat.');
  }
  if (identity.linkedFirebaseUid && String(identity.linkedFirebaseUid) !== uid) {
    throw new HttpsError('already-exists', 'This WhatsApp chat is already linked to another Uncedo account. Contact Uncedo support if you need help.');
  }
  const matches = await findWhatsAppAccountMatches(phone.phoneNumber);
  const candidate = selectUniqueWhatsAppAccountCandidate(matches, phone.phoneNumber);
  if (!candidate || candidate.uid !== uid || candidate.role !== role) {
    throw new HttpsError('already-exists', 'The account could not be uniquely matched to this WhatsApp number. Contact Uncedo support for help.');
  }

  const claim = await db.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(challengeRef);
    if (!currentSnapshot.exists) return { code: 'missing' };
    const current = currentSnapshot.data() || {};
    if (Number(current.expiresAtMs || 0) <= Date.now()) return { code: 'expired' };
    if (current.status === 'used') return { code: String(current.usedByUid || '') === uid ? 'already-used' : 'used-elsewhere' };
    if (current.status === 'superseded' || current.status === 'revoked') return { code: 'unavailable' };
    if (current.status === 'claimed' && String(current.claimedUid || '') !== uid) return { code: 'claimed-elsewhere' };
    transaction.set(challengeRef, {
      status: 'claimed', claimedUid: uid,
      claimedAt: current.claimedAt || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { code: 'claimed' };
  });
  if (!['claimed', 'already-used'].includes(claim.code)) {
    throw new HttpsError(claim.code === 'expired' ? 'deadline-exceeded' : 'already-exists', 'This WhatsApp account link is no longer available. Request a fresh link from your chat.');
  }

  if (claim.code !== 'already-used') {
    const linked = await commitWhatsAppIdentityLink({ uid, role, identityId, phone });
    if (!['linked', 'already-linked'].includes(linked.code)) {
      throw new HttpsError('already-exists', 'This WhatsApp number is already connected elsewhere. Contact Uncedo support if you believe this is an error.');
    }
    const preferredName = String(profile.whatsappPreferredName || profile.firstName || profile.displayName || profile.fullName || '').trim().split(/\s+/)[0].slice(0, 100);
    const conversationRef = db.collection('whatsappConversations').doc(identityId);
    await db.runTransaction(async (transaction) => {
      const [currentChallenge, currentConversation] = await Promise.all([
        transaction.get(challengeRef), transaction.get(conversationRef),
      ]);
      const current = currentChallenge.data() || {};
      if (current.status === 'used' && String(current.usedByUid || '') === uid) return;
      if (current.status !== 'claimed' || String(current.claimedUid || '') !== uid) {
        throw new HttpsError('deadline-exceeded', 'This WhatsApp account link has expired. Request a fresh link from your chat.');
      }
      const now = admin.firestore.FieldValue.serverTimestamp();
      transaction.set(challengeRef, { status: 'used', usedByUid: uid, usedAt: now, updatedAt: now }, { merge: true });
      transaction.set(conversationRef, {
        linkedFirebaseUid: uid,
        whatsappOnboarding: {
          role,
          accountMode: 'account',
          stage: role === 'helper' ? 'helper_readiness' : preferredName ? 'complete' : 'awaiting_preferred_name',
          createdAtMs: Number(currentConversation.data()?.whatsappOnboarding?.createdAtMs || Date.now()),
          updatedAtMs: Date.now(),
        },
        currentMode: role === 'helper' || !preferredName ? 'onboarding' : 'assistant',
        updatedAt: now,
      }, { merge: true });
      if (preferredName) transaction.set(db.collection('whatsappIdentities').doc(identityId), { preferredName, updatedAt: now }, { merge: true });
    });
  }

  let confirmationSent = false;
  if (claim.code !== 'already-used' && whatsappMessagingEnabled()) {
    try {
      const conversationRef = db.collection('whatsappConversations').doc(identityId);
      const currentIdentity = await db.collection('whatsappIdentities').doc(identityId).get();
      if (currentIdentity.exists) {
        const result = await persistWhatsAppAssistantReply({
          sourceEventId: `account-link:${tokenHash}`,
          identityId,
          identity: currentIdentity.data(),
          conversationRef,
          text: 'Your Uncedo account is now connected to this WhatsApp chat. You can continue here.',
          purpose: 'account_link_confirmation',
          requireCurrentInbound: false,
        });
        confirmationSent = result.sent === true;
      }
    } catch (error) {
      logger.info('whatsapp_account_link_confirmation_not_sent', { errorCode: String(error?.code || 'send_unavailable').slice(0, 80) });
    }
  }
  return {
    linked: true,
    role,
    alreadyLinked: claim.code === 'already-used',
    confirmationSent,
    returnUrl: buildWhatsAppReturnUrl('27605239926'),
    expiresInMs: WHATSAPP_ACCOUNT_LINK_TTL_MS,
  };
});

exports.setWhatsAppContactNumber = onCall({ maxInstances: 5, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 20 }, async (request) => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in before saving your WhatsApp number.');
  let phone;
  try {
    phone = normalizeWhatsAppIdentityPhone(request.data?.phoneNumber);
  } catch (_) {
    throw new HttpsError('invalid-argument', 'Enter your WhatsApp number with its international country code, such as +27.');
  }
  const role = String(request.data?.role || '').trim().toLowerCase();
  if (!['customer', 'helper'].includes(role)) throw new HttpsError('invalid-argument', 'A customer or helper account is required.');
  const actorHash = whatsappDiagnosticHash(uid);
  logger.info('whatsapp_contact_number_reservation_attempt', { actorHash, role });
  const phoneHash = createHash('sha256').update(phone.phoneNumber).digest('hex');
  const userRef = db.collection('users').doc(uid);
  const claimRef = db.collection('whatsappContactPhoneClaims').doc(phoneHash);
  const verifiedOwnerRef = db.collection('whatsappPhoneOwnership').doc(phoneHash);
  const profileMatches = await db.collection('users').where('phoneNumber', '==', phone.phoneNumber).get();
  const whatsappMatches = await db.collection('users').where('whatsappPhoneNumber', '==', phone.phoneNumber).get();
  if ([...profileMatches.docs, ...whatsappMatches.docs].some((document) => document.id !== uid)) {
    logger.warn('whatsapp_contact_number_reservation_rejected', { actorHash, role, reason: 'number_in_another_profile' });
    throw new HttpsError('already-exists', 'This WhatsApp number is already associated with another Uncedo account. Use a different number or contact support.');
  }
  try {
    const authOwner = await admin.auth().getUserByPhoneNumber(phone.phoneNumber);
    if (authOwner.uid !== uid) {
      logger.warn('whatsapp_contact_number_reservation_rejected', {
        actorHash, role, reason: 'number_in_another_auth_account',
      });
      throw new HttpsError('already-exists', 'This number is already verified on another Uncedo account. Contact support if you need to change it.');
    }
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error?.code !== 'auth/user-not-found') {
      logger.error('whatsapp_contact_number_auth_lookup_failed', {
        actorHash, role, errorCode: String(error?.code || 'lookup_failed').slice(0, 80),
      });
      throw new HttpsError('unavailable', 'Unable to verify that this number is available right now.');
    }
  }
  const result = await db.runTransaction(async (transaction) => {
    const profileSnapshot = await transaction.get(userRef);
    if (!profileSnapshot.exists) return { code: 'profile-not-found' };
    const profile = profileSnapshot.data() || {};
    if (!profileAllowsRole(profile, role)) return { code: 'role-mismatch' };
    const oldPhone = String(profile.phoneNumber || '').trim();
    const verifiedPhone = String(profile.whatsappPhoneNumber || '').trim();
    if (profile.whatsappVerifiedAt && ((oldPhone && oldPhone !== phone.phoneNumber)
      || (verifiedPhone && verifiedPhone !== phone.phoneNumber))) return { code: 'verified-contact-immutable' };
    let oldClaimRef = null;
    try {
      const normalizedOld = oldPhone ? normalizeWhatsAppIdentityPhone(oldPhone).phoneNumber : '';
      if (normalizedOld && normalizedOld !== phone.phoneNumber) {
        oldClaimRef = db.collection('whatsappContactPhoneClaims').doc(createHash('sha256').update(normalizedOld).digest('hex'));
      }
    } catch (_) { oldClaimRef = null; }
    const [claimSnapshot, verifiedOwnerSnapshot, oldClaimSnapshot] = await Promise.all([
      transaction.get(claimRef), transaction.get(verifiedOwnerRef), oldClaimRef ? transaction.get(oldClaimRef) : Promise.resolve(null),
    ]);
    const claim = claimSnapshot.data() || {};
    const owner = verifiedOwnerSnapshot.data() || {};
    if (claimSnapshot.exists && String(claim.uid || '') !== uid) return { code: 'contact-claimed-elsewhere' };
    if (verifiedOwnerSnapshot.exists && String(owner.uid || '') !== uid) return { code: 'verified-number-claimed-elsewhere' };
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(claimRef, {
      uid, role, phoneHash, createdAt: claimSnapshot.data()?.createdAt || now, updatedAt: now,
    }, { merge: true });
    transaction.set(userRef, { phoneNumber: phone.phoneNumber, updatedAt: now }, { merge: true });
    if (oldClaimRef && oldClaimSnapshot?.exists && String(oldClaimSnapshot.data()?.uid || '') === uid) transaction.delete(oldClaimRef);
    return { code: 'saved' };
  });
  if (result.code !== 'saved') {
    logger.warn('whatsapp_contact_number_reservation_rejected', {
      actorHash, role, reason: String(result.code || 'unknown').slice(0, 80),
    });
  }
  if (result.code === 'profile-not-found') throw new HttpsError('not-found', 'Your Uncedo account profile is unavailable.');
  if (result.code === 'role-mismatch') throw new HttpsError('permission-denied', 'This account does not match the selected Uncedo app.');
  if (result.code === 'verified-contact-immutable') throw new HttpsError('failed-precondition', 'A WhatsApp-verified account number cannot be changed here. Contact Uncedo support for account recovery.');
  if (result.code !== 'saved') throw new HttpsError('already-exists', 'This WhatsApp number is already linked to another account. Use a different number or contact Uncedo support.');
  logger.info('whatsapp_contact_number_reserved', { actorHash, role });
  return { saved: true, phoneNumber: phone.phoneNumber };
});

exports.linkWhatsAppIdentity = onCall({ maxInstances: 2, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid || request.auth?.token?.whatsappAuthenticated !== true) {
    throw new HttpsError('unauthenticated', 'Verify your WhatsApp number before linking it to Uncedo.');
  }
  const role = String(request.auth.token.role || '').trim().toLowerCase();
  if (!['customer', 'helper'].includes(role)) throw new HttpsError('permission-denied', 'The verified account role is not supported.');
  const authUser = await admin.auth().getUser(uid);
  let phone;
  try {
    phone = normalizeWhatsAppIdentityPhone(authUser.phoneNumber || '');
  } catch (_) {
    throw new HttpsError('failed-precondition', 'The Firebase account does not have a verified WhatsApp phone number.');
  }
  const phoneNumberId = String(getWhatsAppSecrets().phoneNumberId || '').trim();
  if (!phoneNumberId) throw new HttpsError('failed-precondition', 'WhatsApp identity linking is not configured.');
  const identityId = buildWhatsAppIdentityId({ phoneNumberId, phoneNumber: phone.phoneNumber, stableEventId });
  const result = await commitWhatsAppIdentityLink({ uid, role, identityId, phone });
  if (result.code === 'role-mismatch') throw new HttpsError('permission-denied', 'This WhatsApp identity cannot be linked to the selected account role.');
  if (result.code === 'identity-linked-elsewhere' || result.code === 'account-linked-elsewhere'
    || result.code === 'guest-history-linked-elsewhere' || result.code === 'whatsapp-number-linked-elsewhere') {
    throw new HttpsError('already-exists', 'This WhatsApp identity or its history is already linked to another Uncedo account. Contact support if you believe this is an error.');
  }
  if (result.code === 'account-whatsapp-already-set') throw new HttpsError('already-exists', 'This Uncedo account already has a different WhatsApp number linked. Contact support to change it safely.');
  if (result.code === 'identity-phone-mismatch' || result.code === 'identity-sender-mismatch') throw new HttpsError('failed-precondition', 'The verified WhatsApp identity does not match this account-link request.');
  if (result.code === 'identity-recovery-required') throw new HttpsError('failed-precondition', 'This WhatsApp identity needs account recovery before it can be linked again.');
  return { identityId: result.identityId, guestPrincipalId: result.guestPrincipalId, linked: true, idempotent: result.code === 'already-linked' };
});

exports.unlinkWhatsAppIdentity = onCall({ maxInstances: 2, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  const uid = String(request.auth?.uid || '').trim();
  const authTime = Number(request.auth?.token?.auth_time || 0);
  const recentAuth = authTime > 0 && Date.now() / 1000 - authTime <= 10 * 60;
  const verifiedSession = request.auth?.token?.whatsappAuthenticated === true;
  const verifiedEmailRecovery = request.auth?.token?.email_verified === true;
  if (!uid || !recentAuth || !(verifiedSession || verifiedEmailRecovery)) {
    throw new HttpsError('unauthenticated', 'Sign in again with WhatsApp or a verified email account before unlinking.');
  }
  const userLinkRef = db.collection('whatsappUserLinks').doc(uid);
  const userRef = db.collection('users').doc(uid);
  const linkSnap = await userLinkRef.get();
  if (!linkSnap.exists) return { unlinked: false, idempotent: true };
  const link = linkSnap.data() || {};
  const identityId = String(link.identityId || '').trim();
  const guestPrincipalId = String(link.guestPrincipalId || '').trim();
  const identityRef = db.collection('whatsappIdentities').doc(identityId);
  const conversationRef = db.collection('whatsappConversations').doc(identityId);
  const guestLinkRef = db.collection('whatsappGuestOwnership').doc(guestPrincipalId);
  const phoneOwnerRef = link.phoneHash ? db.collection('whatsappPhoneOwnership').doc(String(link.phoneHash)) : null;
  const auditRef = db.collection('auditEvents').doc(stableEventId(`whatsapp-identity-unlink:${identityId}:${uid}:${authTime}`));
  await db.runTransaction(async (transaction) => {
    const [identitySnap, conversationSnap, profileSnap, auditSnap, phoneOwnerSnap] = await Promise.all([
      transaction.get(identityRef), transaction.get(conversationRef), transaction.get(userRef), transaction.get(auditRef),
      phoneOwnerRef ? transaction.get(phoneOwnerRef) : Promise.resolve(null),
    ]);
    const identity = identitySnap.data() || {};
    if (String(identity.linkedFirebaseUid || '') !== uid) throw new HttpsError('permission-denied', 'This WhatsApp identity is not linked to your account.');
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(identityRef, { linkedFirebaseUid: null, role: null, verifiedAt: null, updatedAt: now }, { merge: true });
    transaction.set(conversationRef, {
      linkedFirebaseUid: null,
      currentMode: 'assistant',
      currentIntent: null,
      activeDraftId: null,
      activeServiceRequestId: null,
      activeSupportTicketId: null,
      humanHandoff: false,
      updatedAt: now,
    }, { merge: true });
    transaction.delete(userLinkRef);
    if (phoneOwnerSnap?.exists && String(phoneOwnerSnap.data()?.uid || '') === uid) transaction.delete(phoneOwnerRef);
    const oldIds = Array.isArray(profileSnap.data()?.whatsappGuestPrincipalIds) ? profileSnap.data().whatsappGuestPrincipalIds : [];
    const nextGuestPrincipalId = `guest_${randomUUID()}`;
    transaction.set(identityRef, {
      guestPrincipalId: nextGuestPrincipalId,
      previousOwnerUid: uid,
      guestAccessRevokedAt: now,
      updatedAt: now,
    }, { merge: true });
    transaction.set(userRef, {
      whatsappPhoneNumber: null,
      whatsappVerifiedAt: null,
      // Keep historical guest ownership on this account. New WhatsApp use gets
      // a fresh guest principal, so a reassigned number cannot inherit history.
      whatsappGuestPrincipalIds: oldIds,
      updatedAt: now,
    }, { merge: true });
    if (!oldIds.includes(guestPrincipalId)) logger.warn('whatsapp_identity_unlink_missing_guest_index', { uid, identityId });
    if (!auditSnap.exists) transaction.create(auditRef, { eventType: 'whatsapp_identity_unlinked', actorUid: uid, identityId, role: link.role || null, createdAt: now });
  });
  return { unlinked: true };
});

exports.getWhatsAppConversationHistory = onCall({ maxInstances: 3, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to view WhatsApp conversation history.');
  const requestedIdentityId = String(request.data?.identityId || '').trim();
  const trustedAdmin = isAdminToken(request.auth?.token || {});
  let identityId = '';
  if (trustedAdmin) {
    identityId = requestedIdentityId;
  } else {
    const linkSnapshot = await db.collection('whatsappUserLinks').doc(uid).get();
    identityId = String(linkSnapshot.data()?.identityId || '').trim();
    if (!identityId || (requestedIdentityId && requestedIdentityId !== identityId)) {
      throw new HttpsError('permission-denied', 'This WhatsApp conversation is not linked to your account.');
    }
    const identitySnapshot = await db.collection('whatsappIdentities').doc(identityId).get();
    const identity = identitySnapshot.data() || {};
    if (!identitySnapshot.exists || String(identity.linkedFirebaseUid || '') !== uid || !normalizeTimestamp(identity.verifiedAt)) {
      throw new HttpsError('permission-denied', 'A verified WhatsApp identity is required to view conversation history.');
    }
  }
  if (!/^[a-f0-9]{64}$/.test(identityId)) throw new HttpsError('invalid-argument', 'A valid WhatsApp conversation is required.');
  const result = await queryWhatsAppConversationHistory({
    db,
    documentIdField: admin.firestore.FieldPath.documentId(),
    timestampFactory: (seconds, nanoseconds) => new admin.firestore.Timestamp(seconds, nanoseconds),
    identityId,
    pageSize: request.data?.pageSize,
    cursor: request.data?.cursor,
  });
  if (result.code === 'invalid-cursor' || result.code === 'invalid-input') throw new HttpsError('invalid-argument', 'The conversation history cursor is invalid.');
  return result;
});

async function requireWhatsAppSupportAdmin(request) {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Admin sign-in is required.');
  const token = request.auth?.token || {};
  if (!isAdminToken(token)) throw new HttpsError('permission-denied', 'Admin authorization is required.');
  return uid;
}

function requireHelperUid(value) {
  const uid = String(value || '').trim();
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) throw new HttpsError('invalid-argument', 'A valid helper account is required.');
  return uid;
}

function policeClearanceSubmissionSummary(submissionId, submission = {}) {
  const status = normalizePoliceClearanceStatus(submission.status);
  return {
    id: String(submissionId || ''),
    status,
    mimeType: String(submission.mimeType || '').slice(0, 80),
    size: Number(submission.size || 0),
    uploadedAtMs: Number(submission.uploadedAtMs || submission.createdAtMs || 0),
    reviewDeadlineAtMs: Number(submission.reviewDeadlineAtMs || 0) || null,
    reviewedAtMs: Number(submission.reviewedAtMs || 0) || null,
    reviewReason: String(submission.reviewReason || '').slice(0, 500),
    canView: Boolean(String(submission.storagePath || '').startsWith('helper-police-clearance-private/')),
  };
}

async function listHelperPoliceClearanceSubmissions(helperUid) {
  const snapshot = await db.collection('helperPoliceClearanceSubmissions')
    .where('helperUid', '==', helperUid)
    .orderBy('createdAtMs', 'desc')
    .limit(50)
    .get();
  return snapshot.docs
    .filter((document) => String(document.data()?.helperUid || '') === helperUid)
    .map((document) => policeClearanceSubmissionSummary(document.id, document.data() || {}))
    .sort((left, right) => Number(right.uploadedAtMs || 0) - Number(left.uploadedAtMs || 0));
}

exports.getHelperPoliceClearanceReview = onCall({ maxInstances: 2, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 20 }, async (request) => {
  await requireWhatsAppSupportAdmin(request);
  const helperUid = requireHelperUid(request.data?.helperUid);
  const [profileSnapshot, recordSnapshot] = await Promise.all([
    db.collection('users').doc(helperUid).get(),
    db.collection('helperPoliceClearanceRecords').doc(helperUid).get(),
  ]);
  const profile = profileSnapshot.data() || {};
  if (!profileSnapshot.exists || !isHelperUserRecord(profile)) throw new HttpsError('not-found', 'Helper profile not found.');
  const record = recordSnapshot.data() || {};
  const submissionId = String(record.currentSubmissionId || '').trim();
  const submissions = await listHelperPoliceClearanceSubmissions(helperUid);
  let status = normalizePoliceClearanceStatus(record.status || profile.policeClearanceStatus);
  const currentSubmission = submissions.find((submission) => submission.id === submissionId) || null;
  if (currentSubmission && isClearanceReviewExpired(currentSubmission.status, currentSubmission.reviewDeadlineAtMs, Date.now())) status = 'expired';
  if (!/^[a-f0-9]{64}$/.test(submissionId)) {
    return { helperUid, required: helperPoliceClearanceRequired(), status, submission: null, submissions };
  }
  const submissionSnapshot = await db.collection('helperPoliceClearanceSubmissions').doc(submissionId).get();
  if (!submissionSnapshot.exists) {
    return { helperUid, required: helperPoliceClearanceRequired(), status, submission: null, submissions, documentMissing: true };
  }
  const submission = submissionSnapshot.data() || {};
  if (String(submission.helperUid || '') !== helperUid || String(submission.submissionId || '') !== submissionId) {
    throw new HttpsError('permission-denied', 'Police-clearance record is not available for this helper.');
  }
  return {
    helperUid,
    required: helperPoliceClearanceRequired(),
    status,
    submission: policeClearanceSubmissionSummary(submissionId, submission),
    submissions,
  };
});

exports.getHelperPoliceClearanceViewUrl = onCall({ maxInstances: 2, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 20 }, async (request) => {
  const adminUid = await requireWhatsAppSupportAdmin(request);
  const helperUid = requireHelperUid(request.data?.helperUid);
  const recordSnapshot = await db.collection('helperPoliceClearanceRecords').doc(helperUid).get();
  const record = recordSnapshot.data() || {};
  const submissionId = String(request.data?.submissionId || record.currentSubmissionId || '').trim();
  if (!/^[a-f0-9]{64}$/.test(submissionId)) throw new HttpsError('not-found', 'Police-clearance document not found.');
  const submissionSnapshot = await db.collection('helperPoliceClearanceSubmissions').doc(submissionId).get();
  const submission = submissionSnapshot.data() || {};
  const storagePath = String(submission.storagePath || '');
  const helperHash = createHash('sha256').update(helperUid).digest('hex');
  if (!submissionSnapshot.exists || String(submission.helperUid || '') !== helperUid
    || !storagePath.startsWith(`helper-police-clearance-private/${helperHash}/`)
    || !/^helper-police-clearance-private\/[a-f0-9]{64}\/[a-f0-9]{64}\.(pdf|jpg|png)$/.test(storagePath)) {
    throw new HttpsError('not-found', 'Police-clearance document is not available.');
  }
  const file = admin.storage().bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError('not-found', 'Police-clearance document is not available in private storage.');
  const expiresAtMs = Date.now() + 5 * 60 * 1000;
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: expiresAtMs,
    version: 'v4',
    responseDisposition: `inline; filename="police-clearance.${storagePath.split('.').pop()}"`,
    responseType: String(submission.mimeType || 'application/pdf'),
  });
  await db.collection('auditEvents').doc(stableEventId(`helper-police-clearance-view:${submissionId}:${adminUid}:${randomUUID()}`)).create({
    eventType: 'helper_police_clearance_view_url_issued',
    helperUid,
    submissionId,
    actorUid: adminUid,
    actorRole: 'admin',
    expiresAtMs,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { url, expiresAtMs, mimeType: String(submission.mimeType || 'application/pdf') };
});

exports.getMyHelperPoliceClearanceReview = onCall({ maxInstances: 3, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 20 }, async (request) => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to view your clearance documents.');
  const profileSnapshot = await db.collection('users').doc(uid).get();
  const profile = profileSnapshot.data() || {};
  if (!profileSnapshot.exists || !isHelperUserRecord(profile)) throw new HttpsError('permission-denied', 'Only the helper account owner can view these documents.');
  const recordSnapshot = await db.collection('helperPoliceClearanceRecords').doc(uid).get();
  const record = recordSnapshot.data() || {};
  const submissions = await listHelperPoliceClearanceSubmissions(uid);
  let status = normalizePoliceClearanceStatus(record.status || profile.policeClearanceStatus);
  const current = submissions.find((submission) => submission.id === String(record.currentSubmissionId || '')) || null;
  if (current && isClearanceReviewExpired(current.status, current.reviewDeadlineAtMs, Date.now())) status = 'expired';
  return { required: helperPoliceClearanceRequired(), status, submissions };
});

exports.getMyHelperPoliceClearanceViewUrl = onCall({ maxInstances: 3, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 20 }, async (request) => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to view your clearance document.');
  const profileSnapshot = await db.collection('users').doc(uid).get();
  const profile = profileSnapshot.data() || {};
  if (!profileSnapshot.exists || !isHelperUserRecord(profile)) throw new HttpsError('permission-denied', 'Only the helper account owner can view these documents.');
  const submissionId = String(request.data?.submissionId || '').trim();
  if (!/^[a-f0-9]{64}$/.test(submissionId)) throw new HttpsError('invalid-argument', 'A valid clearance document is required.');
  const submissionSnapshot = await db.collection('helperPoliceClearanceSubmissions').doc(submissionId).get();
  const submission = submissionSnapshot.data() || {};
  const storagePath = String(submission.storagePath || '');
  const helperHash = createHash('sha256').update(uid).digest('hex');
  if (!submissionSnapshot.exists || String(submission.helperUid || '') !== uid
    || !storagePath.startsWith(`helper-police-clearance-private/${helperHash}/`)
    || !/^helper-police-clearance-private\/[a-f0-9]{64}\/[a-f0-9]{64}\.(pdf|jpg|png)$/.test(storagePath)) {
    throw new HttpsError('not-found', 'Police-clearance document not found.');
  }
  const file = admin.storage().bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError('not-found', 'Police-clearance document is not available in private storage.');
  const expiresAtMs = Date.now() + 5 * 60 * 1000;
  const [url] = await file.getSignedUrl({
    action: 'read', expires: expiresAtMs, version: 'v4',
    responseDisposition: `inline; filename="police-clearance.${storagePath.split('.').pop()}"`,
    responseType: String(submission.mimeType || 'application/pdf'),
  });
  await db.collection('auditEvents').doc(stableEventId(`helper-police-clearance-view:${submissionId}:${uid}:${randomUUID()}`)).create({
    eventType: 'helper_police_clearance_view_url_issued', helperUid: uid, submissionId, actorUid: uid,
    actorRole: 'helper', expiresAtMs, createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { url, expiresAtMs, mimeType: String(submission.mimeType || 'application/pdf') };
});

exports.reviewHelperPoliceClearance = onCall({ maxInstances: 2, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  const adminUid = await requireWhatsAppSupportAdmin(request);
  const helperUid = requireHelperUid(request.data?.helperUid);
  const decision = String(request.data?.decision || '').trim().toLowerCase();
  const reviewReason = String(request.data?.reason || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 500);
  if (!['approved', 'resubmission_required'].includes(decision)) {
    throw new HttpsError('invalid-argument', 'Choose approval or request a replacement document.');
  }
  const recordRef = db.collection('helperPoliceClearanceRecords').doc(helperUid);
  const profileRef = db.collection('users').doc(helperUid);
  const recordSnapshot = await recordRef.get();
  const submissionId = String(recordSnapshot.data()?.currentSubmissionId || '').trim();
  if (!/^[a-f0-9]{64}$/.test(submissionId)) throw new HttpsError('failed-precondition', 'There is no police-clearance submission to review.');
  const submissionRef = db.collection('helperPoliceClearanceSubmissions').doc(submissionId);
  const auditRef = db.collection('auditEvents').doc(stableEventId(`helper-police-clearance-review:${submissionId}:${decision}:${adminUid}`));
  const expiryAuditRef = db.collection('auditEvents').doc(stableEventId(`helper-police-clearance-expired:${submissionId}`));
  const result = await db.runTransaction(async (transaction) => {
    const [recordCurrent, submissionCurrent, profileCurrent, auditCurrent, expiryAuditCurrent] = await Promise.all([
      transaction.get(recordRef), transaction.get(submissionRef), transaction.get(profileRef), transaction.get(auditRef), transaction.get(expiryAuditRef),
    ]);
    const record = recordCurrent.data() || {};
    const submission = submissionCurrent.data() || {};
    const profile = profileCurrent.data() || {};
    if (!profileCurrent.exists || !isHelperUserRecord(profile)) return { code: 'helper-not-found' };
    if (!recordCurrent.exists || String(record.currentSubmissionId || '') !== submissionId
      || !submissionCurrent.exists || String(submission.helperUid || '') !== helperUid) return { code: 'submission-not-found' };
    if (String(record.status || '') === decision && String(submission.status || '') === decision) return { code: 'already-applied' };
    if (String(record.status || '') !== 'pending' || String(submission.status || '') !== 'pending'
      || !String(submission.storagePath || '').startsWith('helper-police-clearance-private/')) return { code: 'not-reviewable' };
    const now = admin.firestore.FieldValue.serverTimestamp();
    const nowMs = Date.now();
    if (isClearanceReviewExpired(submission.status, submission.reviewDeadlineAtMs, nowMs)) {
      transaction.set(submissionRef, { status: 'expired', expiredAtMs: nowMs, updatedAt: now }, { merge: true });
      transaction.set(recordRef, { status: 'expired', updatedAt: now }, { merge: true });
      transaction.set(profileRef, { policeClearanceStatus: 'expired', updatedAt: now }, { merge: true });
      if (!expiryAuditCurrent.exists) transaction.create(expiryAuditRef, {
        eventType: 'helper_police_clearance_review_window_expired', helperUid, submissionId,
        reviewDeadlineAtMs: Number(submission.reviewDeadlineAtMs || 0), actorUid: 'system', createdAt: now,
      });
      return { code: 'expired' };
    }
    transaction.set(submissionRef, {
      status: decision,
      reviewedByUid: adminUid,
      reviewedAtMs: nowMs,
      reviewedAt: now,
      reviewReason,
      ...(decision === 'approved' ? { approvedAtMs: nowMs, approvedAt: now } : {}),
      updatedAt: now,
    }, { merge: true });
    transaction.set(profileRef, {
      policeClearanceStatus: decision,
      policeClearanceReviewedAt: now,
      updatedAt: now,
    }, { merge: true });
    transaction.set(recordRef, {
      status: decision,
      approvedAtMs: decision === 'approved' ? nowMs : null,
      reviewedAtMs: nowMs,
      updatedAt: now,
    }, { merge: true });
    if (!auditCurrent.exists) transaction.create(auditRef, {
      eventType: 'helper_police_clearance_reviewed',
      helperUid,
      submissionId,
      decision,
      reason: reviewReason,
      actorUid: adminUid,
      createdAt: now,
    });
    return { code: 'reviewed' };
  });
  if (result.code === 'helper-not-found' || result.code === 'submission-not-found') throw new HttpsError('not-found', 'Police-clearance submission not found.');
  if (result.code === 'not-reviewable') throw new HttpsError('failed-precondition', 'This police-clearance submission is no longer waiting for review.');
  if (result.code === 'expired') throw new HttpsError('failed-precondition', 'The police-clearance review window has passed. Ask the helper to submit a current document for initial approval.');
  return { helperUid, submissionId, status: decision, idempotent: result.code === 'already-applied' };
});

exports.setWhatsAppSupportTicketState = onCall({ maxInstances: 2, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  const adminUid = await requireWhatsAppSupportAdmin(request);
  const ticketId = String(request.data?.ticketId || '').trim();
  const status = String(request.data?.status || '').trim().toLowerCase();
  if (!/^wa_support_[a-f0-9]{32}$/.test(ticketId) || !['open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'].includes(status)) {
    throw new HttpsError('invalid-argument', 'A valid support ticket and status are required.');
  }
  const ticketRef = db.collection('supportTickets').doc(ticketId);
  const result = await db.runTransaction(async (transaction) => {
    const ticketSnap = await transaction.get(ticketRef);
    if (!ticketSnap.exists) return { code: 'not-found' };
    const ticket = ticketSnap.data() || {};
    const conversationRef = ticket.identityId ? db.collection('whatsappConversations').doc(ticket.identityId) : null;
    const conversationSnap = conversationRef ? await transaction.get(conversationRef) : null;
    const now = admin.firestore.FieldValue.serverTimestamp();
    const statusTime = Date.now();
    transaction.set(ticketRef, {
      status, assignedAdminUid: adminUid, updatedAt: now, statusUpdatedBy: adminUid,
      ...(status === 'resolved' || status === 'closed' ? {
        closedAtMs: statusTime,
        retentionExpiresAtMs: retentionExpiryMs(process.env, 'WHATSAPP_SUPPORT_RETENTION_DAYS', statusTime),
      } : { closedAtMs: null, retentionExpiresAtMs: null }),
    }, { merge: true });
    if (conversationRef && ['resolved', 'closed'].includes(status) && conversationSnap?.exists) {
      transaction.set(conversationRef, { humanHandoff: false, currentMode: 'assistant', activeSupportTicketId: null, updatedAt: now }, { merge: true });
    }
    transaction.create(db.collection('auditEvents').doc(stableEventId(`support-ticket-state:${ticketId}:${status}:${adminUid}:${Date.now()}`)), {
      eventType: 'whatsapp_support_ticket_state_changed', ticketId, status, actorUid: adminUid, createdAt: now,
    });
    return { code: 'updated' };
  });
  if (result.code === 'not-found') throw new HttpsError('not-found', 'Support ticket not found.');
  return { ticketId, status };
});

exports.assignWhatsAppSupportTicket = onCall({ maxInstances: 2, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  const adminUid = await requireWhatsAppSupportAdmin(request);
  const ticketId = String(request.data?.ticketId || '').trim();
  if (!/^wa_support_[a-f0-9]{32}$/.test(ticketId)) throw new HttpsError('invalid-argument', 'A valid support ticket is required.');
  const ticketRef = db.collection('supportTickets').doc(ticketId);
  const outcome = await db.runTransaction(async (transaction) => {
    const auditRef = db.collection('auditEvents').doc(stableEventId(`whatsapp-support-assigned:${ticketId}:${adminUid}`));
    const [ticketSnapshot, auditSnapshot] = await Promise.all([transaction.get(ticketRef), transaction.get(auditRef)]);
    if (!ticketSnapshot.exists) return 'not-found';
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(ticketRef, { assignedAdminUid: adminUid, assignedAt: now, updatedAt: now }, { merge: true });
    if (!auditSnapshot.exists) transaction.create(auditRef, { eventType: 'whatsapp_support_ticket_assigned', ticketId, actorUid: adminUid, createdAt: now });
    return 'assigned';
  });
  if (outcome === 'not-found') throw new HttpsError('not-found', 'Support ticket not found.');
  return { ticketId, assignedAdminUid: adminUid };
});

exports.getWhatsAppSupportTicketDetails = onCall({ maxInstances: 3, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  await requireWhatsAppSupportAdmin(request);
  const ticketId = String(request.data?.ticketId || '').trim();
  if (!/^wa_support_[a-f0-9]{32}$/.test(ticketId)) throw new HttpsError('invalid-argument', 'A valid support ticket is required.');
  const ticketSnapshot = await db.collection('supportTickets').doc(ticketId).get();
  if (!ticketSnapshot.exists) throw new HttpsError('not-found', 'Support ticket not found.');
  const ticket = ticketSnapshot.data() || {};
  const [identitySnapshot, profileSnapshot, requestSnapshot] = await Promise.all([
    ticket.identityId ? db.collection('whatsappIdentities').doc(String(ticket.identityId)).get() : null,
    ticket.linkedUid ? db.collection('users').doc(String(ticket.linkedUid)).get() : null,
    ticket.requestId ? db.collection('serviceRequests').doc(String(ticket.requestId)).get() : null,
  ]);
  const identity = identitySnapshot?.data() || {};
  const profile = profileSnapshot?.data() || {};
  const phone = String(identity.waId || '');
  const requestData = requestSnapshot?.exists ? { id: requestSnapshot.id, ...(requestSnapshot.data() || {}) } : null;
  return {
    ticketId,
    participant: {
      uid: String(ticket.linkedUid || ''),
      role: String(ticket.role || 'unknown'),
      name: String(profile.fullName || profile.displayName || '').slice(0, 120),
      whatsappMasked: phone.length >= 4 ? `••••${phone.slice(-4)}` : '',
      linked: Boolean(ticket.linkedUid),
    },
    aiSummary: String(ticket.aiSummary || ticket.escalationReason || '').slice(0, 700),
    booking: requestData ? buildWhatsAppRequestSummary(requestData) : null,
  };
});

exports.listWhatsAppSupportArticles = onCall({ maxInstances: 2, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  await requireWhatsAppSupportAdmin(request);
  const snapshot = await db.collection('supportArticles').orderBy('updatedAt', 'desc').limit(100).get();
  return { articles: snapshot.docs.map((document) => {
    const article = document.data() || {};
    return { id: document.id, title: String(article.title || ''), category: String(article.category || ''), content: String(article.content || ''), keywords: Array.isArray(article.keywords) ? article.keywords : [], published: article.published === true, active: article.active !== false, updatedAtMs: normalizeTimestamp(article.updatedAt) };
  }) };
});

exports.saveWhatsAppSupportArticle = onCall({ maxInstances: 2, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  const adminUid = await requireWhatsAppSupportAdmin(request);
  const articleId = String(request.data?.articleId || '').trim().toLowerCase();
  const title = String(request.data?.title || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180);
  const category = String(request.data?.category || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
  const content = String(request.data?.content || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 6000);
  const keywords = [...new Set((Array.isArray(request.data?.keywords) ? request.data.keywords : [])
    .map((value) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60).toLowerCase()).filter(Boolean))].slice(0, 20);
  const published = request.data?.published === true;
  if (!/^[a-z0-9_-]{3,80}$/.test(articleId) || !title || !category || !content) throw new HttpsError('invalid-argument', 'Article ID, title, category and content are required.');
  const articleRef = db.collection('supportArticles').doc(articleId);
  const changeDigest = createHash('sha256').update(JSON.stringify({ title, category, content, keywords, published })).digest('hex');
  const auditRef = db.collection('auditEvents').doc(stableEventId(`support-article:${articleId}:${adminUid}:${changeDigest}`));
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db.runTransaction(async (transaction) => {
    const [existing, auditSnapshot] = await Promise.all([transaction.get(articleRef), transaction.get(auditRef)]);
    transaction.set(articleRef, {
      articleId, title, category, content, keywords, published, active: true,
      createdBy: existing.data()?.createdBy || adminUid,
      createdAt: existing.data()?.createdAt || now,
      updatedBy: adminUid, updatedAt: now,
      revision: Number(existing.data()?.revision || 0) + 1,
    }, { merge: false });
    if (!auditSnapshot.exists) transaction.create(auditRef, { eventType: 'whatsapp_support_article_saved', articleId, published, actorUid: adminUid, createdAt: now });
  });
  return { articleId, published };
});

exports.archiveWhatsAppSupportArticle = onCall({ maxInstances: 2, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  const adminUid = await requireWhatsAppSupportAdmin(request);
  const articleId = String(request.data?.articleId || '').trim();
  if (!/^[a-z0-9_-]{3,80}$/.test(articleId)) throw new HttpsError('invalid-argument', 'A valid support article is required.');
  const articleRef = db.collection('supportArticles').doc(articleId);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(articleRef);
    if (!existing.exists) throw new HttpsError('not-found', 'Support article not found.');
    const article = existing.data() || {};
    const auditRef = db.collection('auditEvents').doc(stableEventId(`support-article-archive:${articleId}:${adminUid}:${Number(article.revision || 0)}`));
    const auditSnapshot = await transaction.get(auditRef);
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(articleRef, { published: false, active: false, updatedBy: adminUid, updatedAt: now, revision: Number(article.revision || 0) + 1 }, { merge: true });
    if (!auditSnapshot.exists) transaction.create(auditRef, { eventType: 'whatsapp_support_article_archived', articleId, actorUid: adminUid, createdAt: now });
  });
  return { articleId, archived: true };
});

exports.markWhatsAppSupportTicketRead = onCall({ maxInstances: 2, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  const adminUid = await requireWhatsAppSupportAdmin(request);
  const ticketId = String(request.data?.ticketId || '').trim();
  if (!/^wa_support_[a-f0-9]{32}$/.test(ticketId)) throw new HttpsError('invalid-argument', 'A valid support ticket is required.');
  const ticketRef = db.collection('supportTickets').doc(ticketId);
  const result = await db.runTransaction(async (transaction) => {
    const ticketSnapshot = await transaction.get(ticketRef);
    if (!ticketSnapshot.exists) return { code: 'not-found' };
    transaction.set(ticketRef, {
      unreadCount: 0,
      lastReadAtMs: Date.now(),
      lastReadBy: adminUid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { code: 'read' };
  });
  if (result.code === 'not-found') throw new HttpsError('not-found', 'Support ticket not found.');
  return { ticketId, read: true };
});

exports.replyToWhatsAppSupportTicket = onCall({ maxInstances: 2, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  const adminUid = await requireWhatsAppSupportAdmin(request);
  if (!whatsappSupportEnabled() || !whatsappMessagingEnabled()) throw new HttpsError('failed-precondition', 'WhatsApp support messaging is disabled.');
  const ticketId = String(request.data?.ticketId || '').trim();
  const replyId = String(request.data?.replyId || '').trim();
  const text = String(request.data?.text || '').trim().slice(0, 3500);
  if (!/^wa_support_[a-f0-9]{32}$/.test(ticketId) || !/^[A-Za-z0-9_-]{8,100}$/.test(replyId) || !text) {
    throw new HttpsError('invalid-argument', 'A valid ticket, reply ID and reply message are required.');
  }
  const ticketRef = db.collection('supportTickets').doc(ticketId);
  const ticketMessageRef = ticketRef.collection('messages').doc(`admin_${replyId}`);
  const outboundRef = db.collection('whatsappMessages').doc(stableEventId(`support-reply:${ticketId}:${replyId}`));
  const claim = await db.runTransaction(async (transaction) => {
    const [ticketSnap, outboundSnap] = await Promise.all([transaction.get(ticketRef), transaction.get(outboundRef)]);
    if (!ticketSnap.exists) return { code: 'not-found' };
    if (outboundSnap.exists) return { code: 'already-sent' };
    const ticket = ticketSnap.data() || {};
    if (['resolved', 'closed'].includes(String(ticket.status || '').toLowerCase())) return { code: 'closed' };
    if (!ticket.identityId) return { code: 'identity-missing' };
    const identityRef = db.collection('whatsappIdentities').doc(ticket.identityId);
    const conversationRef = db.collection('whatsappConversations').doc(ticket.identityId);
    const [identitySnap, conversationSnap] = await Promise.all([transaction.get(identityRef), transaction.get(conversationRef)]);
    if (!identitySnap.exists || !conversationSnap.exists) return { code: 'identity-missing' };
    const identity = identitySnap.data() || {};
    const conversation = conversationSnap.data() || {};
    if (!identity.waId || identity.phoneNumberId !== getWhatsAppSecrets().phoneNumberId) return { code: 'identity-invalid' };
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.create(outboundRef, {
      identityId: ticket.identityId, requestId: ticket.requestId || null, to: identity.waId,
      phoneNumberId: identity.phoneNumberId, direction: 'outbound', type: 'human_support_reply',
      text, status: 'sending', ticketId, replyId, createdBy: adminUid, createdAtMs: Date.now(),
      retentionExpiresAtMs: Date.now() + whatsappRetentionDays('WHATSAPP_MESSAGE_RETENTION_DAYS', 180) * 24 * 60 * 60 * 1000,
      createdAt: now,
    });
    transaction.create(ticketMessageRef, {
      messageId: replyId, senderType: 'admin', senderUid: adminUid,
      text, type: 'text', createdAt: now, createdAtMs: Date.now(), deliveryStatus: 'sending',
    });
    transaction.set(ticketRef, { status: 'waiting_on_customer', lastMessageAtMs: Date.now(), updatedAt: now }, { merge: true });
    return {
      code: 'claimed', to: String(identity.waId), identityId: ticket.identityId,
      lastInboundAtMs: Number(conversation.lastInboundMessageAtMs || 0),
      phoneNumberId: String(identity.phoneNumberId),
    };
  });
  if (claim.code === 'not-found') throw new HttpsError('not-found', 'Support ticket not found.');
  if (claim.code === 'already-sent') return { ticketId, replyId, idempotent: true };
  if (claim.code !== 'claimed') throw new HttpsError('failed-precondition', 'This support ticket cannot receive a WhatsApp reply.');

  try {
    const { client, secrets } = getWhatsAppMetaClient();
    let delivery;
    if (isWithinCustomerServiceWindow(claim.lastInboundAtMs)) {
      delivery = await client.sendText({ to: claim.to, text, lastInboundAtMs: claim.lastInboundAtMs });
    } else {
      const templateName = String(process.env.WHATSAPP_SUPPORT_REPLY_TEMPLATE_NAME || '').trim();
      const languageCode = String(process.env.WHATSAPP_SUPPORT_REPLY_TEMPLATE_LANGUAGE || '').trim();
      if (!templateName || !languageCode || !secrets.approvedTemplateNames.includes(templateName)) {
        await outboundRef.set({ status: 'blocked_template_required', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        await ticketMessageRef.set({ deliveryStatus: 'blocked_template_required', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        throw new HttpsError('failed-precondition', 'An approved support reply template is required outside the WhatsApp customer-service window.');
      }
      delivery = await client.sendTemplate({ to: claim.to, name: templateName, languageCode, components: buildSupportReplyTemplateComponents(text) });
    }
    await outboundRef.set({ status: 'sent', metaMessageId: delivery.messageId || null, sentAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await reconcileWhatsAppDeliveryStatuses({ metaMessageId: delivery.messageId, recipientId: claim.to, messageRef: outboundRef });
    await ticketMessageRef.set({ deliveryStatus: 'sent', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { ticketId, replyId, sent: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const deliveryStatus = classifyMetaDeliveryError(error);
    await outboundRef.set({ status: deliveryStatus, deliveryStatus, errorCode: String(error?.code || 'meta_delivery_unknown').slice(0, 100), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await ticketMessageRef.set({ deliveryStatus, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    throw new HttpsError('unavailable', deliveryStatus === 'outcome_unknown'
      ? 'WhatsApp could not confirm the reply delivery. It is held for review to avoid duplicates.'
      : 'WhatsApp rejected the reply. It is recorded as failed and was not automatically resent.');
  }
});

exports.getWhatsAppSupportMediaUrl = onCall({ maxInstances: 2, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  await requireWhatsAppSupportAdmin(request);
  const ticketId = String(request.data?.ticketId || '').trim();
  const messageId = String(request.data?.messageId || '').trim();
  const result = await createWhatsAppSupportMediaUrl({
    db,
    storageBucket: admin.storage().bucket(),
    ticketId,
    messageId,
  });
  if (result.code === 'not-found' || result.code === 'media-not-found') throw new HttpsError('not-found', 'Support attachment not found.');
  if (result.code !== 'available') throw new HttpsError('permission-denied', 'This attachment is not available for this support ticket.');
  return { url: result.url, expiresAtMs: result.expiresAtMs, mimeType: result.mimeType };
});

exports.setWhatsAppNotificationPreference = onCall({ maxInstances: 2, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  const uid = String(request.auth?.uid || '').trim();
  const enabled = request.data?.enabled === true;
  const authTime = Number(request.auth?.token?.auth_time || 0);
  const recentlyAuthenticated = authTime > 0 && Date.now() / 1000 - authTime <= 10 * 60;
  if (!uid || !recentlyAuthenticated) throw new HttpsError('unauthenticated', 'Sign in again before changing WhatsApp notification preferences.');
  const userLinkRef = db.collection('whatsappUserLinks').doc(uid);
  const userLinkSnap = await userLinkRef.get();
  if (!userLinkSnap.exists) throw new HttpsError('failed-precondition', 'Link your WhatsApp identity before changing notification preferences.');
  const identityId = String(userLinkSnap.data()?.identityId || '').trim();
  const identityRef = db.collection('whatsappIdentities').doc(identityId);
  const nowMs = Date.now();
  const result = await db.runTransaction(async (transaction) => {
    const identitySnap = await transaction.get(identityRef);
    if (!identitySnap.exists || String(identitySnap.data()?.linkedFirebaseUid || '') !== uid) return { code: 'not-linked' };
    transaction.set(identityRef, {
      whatsappNotificationsEnabled: enabled,
      whatsappNotificationsConsentAtMs: enabled ? nowMs : null,
      whatsappNotificationsConsentVersion: enabled ? '2026-10' : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    const auditRef = db.collection('auditEvents').doc(stableEventId(`whatsapp-notification-preference:${uid}:${identityId}:${nowMs}`));
    transaction.create(auditRef, { eventType: 'whatsapp_notification_preference_changed', actorUid: uid, identityId, enabled, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    return { code: 'updated' };
  });
  if (result.code !== 'updated') throw new HttpsError('permission-denied', 'The WhatsApp identity is not linked to this account.');
  return { enabled };
});

const WHATSAPP_STATUS_NOTIFICATION_CONFIG = {
  matching: { key: 'BOOKING_CONFIRMED', description: 'Your booking is confirmed and Uncedo is looking for a helper.' },
  accepted: { key: 'HELPER_ASSIGNED', description: 'A helper accepted your service request.' },
  driving: { key: 'HELPER_ON_THE_WAY', description: 'Your helper is travelling to your service location.' },
  en_route: { key: 'HELPER_ON_THE_WAY', description: 'Your helper is on the way.' },
  work_started: { key: 'SERVICE_STARTED', description: 'Your service has started.' },
  completed: { key: 'SERVICE_COMPLETED', description: 'Your service is complete. Payment may be required.' },
  canceled: { key: 'BOOKING_CANCELED', description: 'Your service request was canceled.' },
};

async function syncWhatsAppRelayModeForRequestTransition({ after, status, beforeStatus, requestId }) {
  if (!['accepted', 'completed', 'canceled', 'expired', 'no_helper_available'].includes(status) || status === beforeStatus) return;
  const identities = [];
  const customerId = String(after.customerId || '').trim();
  const originIdentityId = String(after.originIdentityId || '').trim();
  if (originIdentityId) identities.push(originIdentityId);
  else if (customerId && !customerId.startsWith('guest_')) {
    const link = await db.collection('whatsappUserLinks').doc(customerId).get();
    if (link.exists) identities.push(String(link.data()?.identityId || '').trim());
  }
  const helperId = String(after.helperAssignment?.helperId || '').trim();
  if (helperId) {
    const link = await db.collection('whatsappUserLinks').doc(helperId).get();
    if (link.exists) identities.push(String(link.data()?.identityId || '').trim());
  }
  const activeIdentities = [...new Set(identities.filter(Boolean))];
  for (const identityId of activeIdentities) {
    const conversationRef = db.collection('whatsappConversations').doc(identityId);
    await db.runTransaction(async (transaction) => {
      const conversationSnap = await transaction.get(conversationRef);
      if (status === 'accepted') {
        transaction.set(conversationRef, {
          currentMode: 'provider_relay', currentIntent: 'provider_relay',
          activeServiceRequestId: requestId, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return;
      }
      if (String(conversationSnap.data()?.activeServiceRequestId || '') === requestId) {
        transaction.set(conversationRef, {
          currentMode: 'assistant', currentIntent: null, activeServiceRequestId: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    });
  }
}

exports.notifyWhatsAppServiceRequestLifecycle = onDocumentWritten({
  document: 'serviceRequests/{requestId}', maxInstances: 2, ...HALF_CPU_OPTIONS,
}, async (event) => {
  const before = event.data.before.exists ? event.data.before.data() || {} : null;
  const after = event.data.after.exists ? event.data.after.data() || {} : null;
  if (!after) return;
  const beforeStatus = String(before?.status || '').toLowerCase();
  const status = String(after.status || '').toLowerCase();
  const requestId = String(event.params.requestId || '').trim();
  await syncWhatsAppRelayModeForRequestTransition({ after, status, beforeStatus, requestId }).catch((error) => {
    logger.warn('whatsapp_relay_mode_sync_failed', { requestId, status, errorCode: String(error?.code || 'conversation_sync_failed').slice(0, 80) });
  });
  if (!whatsappNotificationsEnabled() || !whatsappMessagingEnabled()) return;
  const statusEvent = beforeStatus !== status ? WHATSAPP_STATUS_NOTIFICATION_CONFIG[status] : null;
  const paymentChanged = before && String(before.paymentStatus || '') !== String(after.paymentStatus || '')
    && ['paid', 'unpaid', 'payment_reconciliation_required'].includes(String(after.paymentStatus || '').toLowerCase());
  const eventConfig = statusEvent || (paymentChanged ? {
    key: String(after.paymentStatus || '').toLowerCase() === 'paid' ? 'PAYMENT_CONFIRMED' : 'PAYMENT_REQUIRED',
    description: String(after.paymentStatus || '').toLowerCase() === 'paid' ? 'Payment for your service was confirmed.' : 'Payment is required for your service request.',
  } : null);
  if (!eventConfig || status === 'helper_found') return;

  const identities = [];
  const customerIdentityId = String(after.originIdentityId || '').trim();
  if (customerIdentityId) identities.push({ identityId: customerIdentityId, eventRole: 'customer' });
  else if (String(after.customerId || '').trim() && !String(after.customerId).startsWith('guest_')) {
    const link = await db.collection('whatsappUserLinks').doc(String(after.customerId)).get();
    if (link.exists) identities.push({ identityId: String(link.data()?.identityId || ''), eventRole: 'customer' });
  }
  if (status === 'accepted' || ['driving', 'en_route', 'work_started', 'completed'].includes(status)) {
    const helperId = String(after.helperAssignment?.helperId || '').trim();
    if (helperId) {
      const link = await db.collection('whatsappUserLinks').doc(helperId).get();
      if (link.exists) identities.push({ identityId: String(link.data()?.identityId || ''), eventRole: 'helper' });
    }
  }

  const secrets = getWhatsAppSecrets();
  const templateName = String(process.env[`WHATSAPP_TEMPLATE_${eventConfig.key}_NAME`] || '').trim();
  const languageCode = String(process.env[`WHATSAPP_TEMPLATE_${eventConfig.key}_LANGUAGE`] || '').trim();
  if (!templateName || !languageCode || !secrets.approvedTemplateNames.includes(templateName)
    || !secrets.accessToken || !secrets.phoneNumberId || !secrets.graphApiVersion) return;
  const client = createMetaWhatsAppClient({ accessToken: secrets.accessToken, phoneNumberId: secrets.phoneNumberId, graphApiVersion: secrets.graphApiVersion, approvedTemplateNames: secrets.approvedTemplateNames, requestTimeoutMs: process.env.WHATSAPP_META_SEND_TIMEOUT_MS, isRecipientAllowed: (recipient) => isWhatsAppRecipientAllowed(recipient, process.env) });

  for (const recipient of identities) {
    if (!recipient.identityId) continue;
    const identityRef = db.collection('whatsappIdentities').doc(recipient.identityId);
    const identitySnap = await identityRef.get();
    if (!identitySnap.exists) continue;
    const identity = identitySnap.data() || {};
    if (identity.phoneNumberId !== secrets.phoneNumberId
      || !(Number(identity.whatsappNotificationsConsentAtMs || 0) > 0 || identity.whatsappNotificationsEnabled === true)) continue;
    const notificationId = stableEventId(`lifecycle:${requestId}:${status}:${String(after.paymentStatus || '')}:${recipient.identityId}`);
    const outboundRef = db.collection('whatsappMessages').doc(notificationId);
    const claimed = await db.runTransaction(async (transaction) => {
      const [outboundSnap, currentRequestSnap] = await Promise.all([transaction.get(outboundRef), transaction.get(db.collection('serviceRequests').doc(requestId))]);
      if (outboundSnap.exists || !currentRequestSnap.exists) return false;
      const current = currentRequestSnap.data() || {};
      if (String(current.status || '').toLowerCase() !== status || String(current.paymentStatus || '') !== String(after.paymentStatus || '')) return false;
      transaction.create(outboundRef, {
        eventId: notificationId, identityId: recipient.identityId, requestId, phoneNumberId: secrets.phoneNumberId,
        to: identity.waId, direction: 'outbound', type: 'template', status: 'sending',
        templateName, createdAtMs: Date.now(),
        retentionExpiresAtMs: Date.now() + whatsappRetentionDays('WHATSAPP_MESSAGE_RETENTION_DAYS', 180) * 24 * 60 * 60 * 1000,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (!claimed) continue;
    try {
      const delivery = await client.sendTemplate({
        to: identity.waId, name: templateName, languageCode,
        components: buildServiceUpdateTemplateComponents({
          service: String(after.serviceSummary || after.subject || 'Uncedo service').slice(0, 180),
          update: String(eventConfig.description).slice(0, 240),
        }),
      });
      await outboundRef.set({ status: 'sent', metaMessageId: delivery.messageId || null, sentAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      await reconcileWhatsAppDeliveryStatuses({ metaMessageId: delivery.messageId, recipientId: identity.waId, messageRef: outboundRef });
    } catch (error) {
      const deliveryStatus = classifyMetaDeliveryError(error);
      await outboundRef.set({ status: deliveryStatus, deliveryStatus, errorCode: String(error?.code || 'meta_delivery_unknown').slice(0, 100), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      logger.warn('whatsapp_lifecycle_notification_delivery_failed', { requestId, status, deliveryStatus, errorCode: String(error?.code || 'unknown').slice(0, 80) });
    }
  }
});

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

exports.verifyPaystack = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
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
    const verifiedAccountEmail = String(decodedToken.email || studentData.email || '').trim().toLowerCase();
    const transactionEmail = String(transactionData.customer?.email || '').trim().toLowerCase();
    if (!verifiedAccountEmail || !transactionEmail || verifiedAccountEmail !== transactionEmail) {
      res.status(403).json({ success: false, message: 'This payment reference does not belong to the signed-in account.' });
      return;
    }
    await migrateLegacyPaymentMethods({ db, admin, uid });
    const savedCard = await storeReusablePaymentMethod({
      db,
      admin,
      uid,
      authorization,
      nickname,
      consentAtMs: Date.now(),
      consentPurpose: 'customer_added_payment_method',
    });
    if (!savedCard.saved) {
      res.status(409).json({ success: false, message: 'This card could not be securely saved to the account.' });
      return;
    }
    const safeCardRecord = savedCard.card;
    const duplicateMethod = savedCard.duplicate === true;

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

    const customerConfig = await getRewardConfig(db, 'customer');
    const paymentMethodReward = await applyRewardTransaction({
      db, admin, userId: uid, accountType: ACCOUNT_TYPES.CUSTOMER,
      direction: REWARD_TRANSACTION_DIRECTIONS.CREDIT,
      points: Number(customerConfig.rewards?.paymentMethodVerified || 50),
      reasonCode: REWARD_REASON_CODES.PAYMENT_METHOD_VERIFIED,
      reasonLabel: 'Verified payment method', sourceType: 'paystack_verification', sourceId: createHash('sha256').update(reference).digest('hex').slice(0, 24),
      idempotencyKey: `customer:${uid}:payment-method-verified:${createHash('sha256').update(reference).digest('hex').slice(0, 24)}`,
      metadata: { duplicateMethod: Boolean(duplicateMethod) },
      notifyUser: true,
    }).catch((error) => {
      logger.warn('verified_payment_reward_failed', { uid, error: error.message });
      return { applied: false, error: error.message };
    });
    const profileCompletionReward = await evaluateCustomerProfileCompletionReward({ db, admin, userId: uid }).catch((error) => {
      logger.warn('profile_completed_reward_failed', { uid, error: error.message });
      return { applied: false, error: error.message };
    });
    const referralStageOneResult = await awardReferralStage({ db, admin, referredUserId: uid, stage: 1 }).catch((error) => {
      logger.warn('referral_stage_one_failed', { uid, error: error.message });
      return { applied: false, error: error.message };
    });

    let refundSucceeded = false;
    let refundMessage = null;
    let refundOperation = null;
    try {
      const refundClaim = await claimPaystackRefund({
        db,
        reference,
        userId: uid,
        amountMinor: Number(transactionData.amount || 0),
        currency: transactionData.currency || 'ZAR',
      });
      if (refundClaim.action === 'conflict') {
        throw new Error('The refund operation is bound to a different account.');
      }
      if (refundClaim.action === 'submit') {
        let refundPayload = null;
        let refundOutcome = 'unknown';
        let refundReason = null;
        try {
          const refundResponse = await fetch('https://api.paystack.co/refund', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${paystackSecretKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ transaction: reference }),
            signal: AbortSignal.timeout(20_000),
          });
          refundPayload = await refundResponse.json().catch(() => null);
          const refundStatus = String(refundPayload?.data?.status || '').toLowerCase();
          if (refundResponse.ok && refundPayload?.status === true && ['processed', 'success'].includes(refundStatus)) {
            refundOutcome = 'success';
          } else if (refundResponse.ok && refundPayload?.status === true && ['failed', 'rejected'].includes(refundStatus)) {
            refundOutcome = 'failed_confirmed';
          } else {
            refundOutcome = 'unknown';
            refundReason = refundPayload?.message || `Refund response status ${refundResponse.status} requires reconciliation.`;
          }
        } catch (refundError) {
          refundReason = String(refundError?.code || 'refund_request_outcome_unknown').slice(0, 120);
        }
        await recordPaystackRefundObservation({
          db,
          operationRef: refundClaim.operationRef,
          outcome: refundOutcome,
          refund: refundPayload?.data || null,
          reason: refundReason,
        });
      }
      const refundSnap = await refundClaim.operationRef.get();
      refundOperation = refundSnap.data() || null;
      refundSucceeded = refundOperation?.status === 'refunded';
      if (!refundSucceeded) {
        refundMessage = refundOperation?.status === 'failed_confirmed'
          ? 'Card saved, but the refund was not confirmed. Please contact support before retrying.'
          : 'Card saved, but the refund outcome is still being reconciled. Please contact support if it does not appear shortly.';
      }
      logger.info('Paystack card authorization refund state recorded.', {
        reference,
        uid,
        refundStatus: refundOperation?.status || 'unknown',
        duplicateRequest: refundClaim.action === 'existing',
      });
    } catch (refundError) {
      refundMessage = 'Card saved, but the refund outcome could not be recorded. Please contact support before retrying.';
      logger.error('Paystack refund operation could not be recorded.', {
        reference,
        uid,
        error: refundError.message,
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
        createdAt: safeCardRecord.createdAt,
      },
      refunded: refundSucceeded,
      refundMessage,
      rewardResults: {
        paymentMethodVerified: paymentMethodReward,
        profileCompleted: profileCompletionReward,
        referralStageOne: referralStageOneResult,
      },
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


exports.seedRewardConfig = onRequest({ cors: true }, async (req, res) => {
  const token = getBearerToken(req);
  const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid || !isAdminToken(decoded)) {
    res.status(403).json({ success: false, message: 'Admin only.' }); return;
  }
  await seedDefaultRewardConfig(db, admin);
  res.status(200).json({ success: true });
});

exports.captureReferral = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ success: false, message: 'Method not allowed' }); return; }
  const token = getBearerToken(req); const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) { res.status(401).json({ success: false, message: 'Unauthorized request.' }); return; }
  try {
    const result = await attachReferral({ db, admin, referralCode: req.body?.referralCode, referredUserId: decoded.uid, referredAccountType: req.body?.accountType || ACCOUNT_TYPES.CUSTOMER });
    res.status(200).json({ success: true, ...result });
  } catch (error) { logger.warn('referral_rejected', { uid: decoded.uid, reason: error.message }); res.status(400).json({ success: false, message: error.message }); }
});

exports.ensureReferralCode = onRequest({ cors: true, ...HALF_CPU_OPTIONS }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ success: false, message: 'Method not allowed' }); return; }
  const token = getBearerToken(req); const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) { res.status(401).json({ success: false, message: 'Unauthorized request.' }); return; }
  const userSnap = await db.collection('users').doc(decoded.uid).get(); const user = userSnap.data() || {};
  const accountType = String(req.body?.accountType || user.activeRole || user.role || '').toLowerCase() === 'helper' || String(user.activeRole || '').toLowerCase() === 'tutor' ? ACCOUNT_TYPES.HELPER : ACCOUNT_TYPES.CUSTOMER;
  const result = await ensureReferralCode({ db, admin, userId: decoded.uid, accountType, displayName: user.displayName || user.fullName || user.name || decoded.name || '' });
  res.status(200).json({ success: true, code: result.code });
});

exports.getMyReferralSummary = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ success: false, message: 'Method not allowed' }); return; }
  const token = getBearerToken(req); const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) { res.status(401).json({ success: false, message: 'Unauthorized request.' }); return; }

  try {
    const userSnap = await db.collection('users').doc(decoded.uid).get();
    const user = userSnap.data() || {};
    const accountType = String(req.body?.accountType || user.activeRole || user.role || '').toLowerCase() === 'helper'
      ? ACCOUNT_TYPES.HELPER
      : ACCOUNT_TYPES.CUSTOMER;
    const referralCodeResult = await ensureReferralCode({
      db,
      admin,
      userId: decoded.uid,
      accountType,
      displayName: user.displayName || user.fullName || user.name || decoded.name || '',
    });
    const rewardConfig = await getRewardConfig(db, accountType === ACCOUNT_TYPES.HELPER ? 'helper' : 'customer');
    const referredByMeSnap = await db.collection('referrals')
      .where('referrerUserId', '==', decoded.uid)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
    const attributedSnap = await db.collection('referrals').doc(decoded.uid).get();

    const referrals = referredByMeSnap.docs.map((item, index) => {
      const data = item.data() || {};
      return {
        referralId: item.id,
        status: data.status || 'attributed',
        attributedAt: data.attributedAt || data.createdAt || null,
        stageOneQualifiedAt: data.stageOneQualifiedAt || null,
        stageOneAwardedAt: data.stageOneAwardedAt || null,
        stageTwoQualifiedAt: data.stageTwoQualifiedAt || null,
        stageTwoAwardedAt: data.stageTwoAwardedAt || null,
        displayLabel: `Referred customer ${index + 1}`,
      };
    });

    const stageOneQualifiedCount = referrals.filter((item) => item.stageOneQualifiedAt || item.stageOneAwardedAt).length;
    const stageTwoQualifiedCount = referrals.filter((item) => item.stageTwoQualifiedAt || item.stageTwoAwardedAt).length;
    const completedCount = referrals.filter((item) => item.stageTwoAwardedAt).length;

    res.status(200).json({
      success: true,
      summary: {
        code: referralCodeResult.code,
        linkBasePath: '/signup',
        stageOnePoints: Number(rewardConfig.rewards?.referralStageOne || rewardConfig.rewards?.referralReward || 0),
        stageTwoPoints: Number(rewardConfig.rewards?.referralStageTwo || rewardConfig.rewards?.referralReward || 0),
        attributedReferral: attributedSnap.exists ? {
          referralId: attributedSnap.id,
          ...(attributedSnap.data() || {}),
        } : null,
        totals: {
          totalAttributed: referrals.length,
          stageOneQualified: stageOneQualifiedCount,
          stageTwoQualified: stageTwoQualifiedCount,
          pending: Math.max(0, referrals.length - completedCount),
          completed: completedCount,
        },
        referrals,
      },
    });
  } catch (error) {
    logger.warn('referral_summary_failed', { uid: decoded.uid, error: error.message });
    res.status(400).json({ success: false, message: error.message });
  }
});

exports.evaluateCustomerReferralStageOne = onRequest({ cors: true, ...HALF_CPU_OPTIONS }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ success: false, message: 'Method not allowed' }); return; }
  const token = getBearerToken(req); const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) { res.status(401).json({ success: false, message: 'Unauthorized request.' }); return; }
  try {
    const result = await awardReferralStage({ db, admin, referredUserId: decoded.uid, stage: 1 });
    res.status(200).json({ success: true, evaluation: result });
  } catch (error) {
    logger.warn('referral_stage_one_evaluation_failed', { uid: decoded.uid, error: error.message });
    res.status(400).json({ success: false, message: error.message });
  }
});

exports.evaluateCustomerProfileRewards = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ success: false, message: 'Method not allowed' }); return; }
  const token = getBearerToken(req); const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) { res.status(401).json({ success: false, message: 'Unauthorized request.' }); return; }
  try {
    const profileCompletion = await evaluateCustomerProfileCompletionReward({ db, admin, userId: decoded.uid });
    const referralStageOne = await awardReferralStage({ db, admin, referredUserId: decoded.uid, stage: 1 });
    res.status(200).json({
      success: true,
      evaluation: {
        profileCompletion,
        referralStageOne,
      },
    });
  } catch (error) {
    logger.warn('customer_profile_reward_evaluation_failed', { uid: decoded.uid, error: error.message });
    res.status(400).json({ success: false, message: error.message });
  }
});

async function getVerifiedRequestUser(req) {
  const token = getBearerToken(req);
  const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) return null;
  const profile = (await db.collection('users').doc(decoded.uid).get()).data() || {};
  return { uid: decoded.uid, email: decoded.email || '', ...profile, isAdmin: isAdminToken(decoded), adminAuthorized: isAdminToken(decoded) };
}

exports.setTrustedAdminRole = onCall({ maxInstances: 2, ...HALF_CPU_OPTIONS, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  const actorUid = String(request.auth?.uid || '').trim();
  if (!actorUid) throw new HttpsError('unauthenticated', 'Admin sign-in is required.');
  if (!isAdminToken(request.auth?.token || {})) throw new HttpsError('permission-denied', 'Trusted administrator authorization is required.');
  const targetUid = String(request.data?.uid || '').trim();
  const enabled = request.data?.enabled === true;
  const operationId = String(request.data?.operationId || randomUUID()).trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(targetUid) || !/^[A-Za-z0-9_-]{8,128}$/.test(operationId)
    || typeof request.data?.enabled !== 'boolean') {
    throw new HttpsError('invalid-argument', 'A target user, operation ID, and enabled state are required.');
  }
  const auditRef = db.collection('adminAuditLogs').doc(stableEventId(`admin-role:${operationId}`));
  await auditRef.set({
    actorUid,
    targetUid,
    action: enabled ? 'trusted_admin_role_grant_requested' : 'trusted_admin_role_revoke_requested',
    operationId,
    status: 'processing',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  try {
    const target = await admin.auth().getUser(targetUid);
    const claims = applyTrustedAdminRole(target.customClaims || {}, enabled);
    await admin.auth().setCustomUserClaims(targetUid, claims);
    await auditRef.set({
      action: enabled ? 'trusted_admin_role_granted' : 'trusted_admin_role_revoked',
      status: 'completed',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { uid: targetUid, enabled, tokenRefreshRequired: true };
  } catch (error) {
    await auditRef.set({ status: 'failed', errorCode: String(error?.code || 'admin_claim_update_failed').slice(0, 100), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    if (error instanceof HttpsError) throw error;
    logger.error('trusted_admin_role_update_failed', { actorUid, targetUid, errorCode: String(error?.code || 'unknown').slice(0, 100) });
    throw new HttpsError('internal', 'The administrator role could not be updated.');
  }
});

exports.reserveServiceCredit = onRequest({ cors: true, ...HALF_CPU_OPTIONS }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  const user = await getVerifiedRequestUser(req); if (!user) return res.status(401).json({ success: false, message: 'Unauthorized request.' });
  try { const redemption = await reserveServiceCredit({ db, admin, userId: user.uid, requestId: String(req.body?.requestId || ''), requestedPoints: req.body?.points }); res.status(200).json({ success: true, redemption }); }
  catch (error) { logger.warn('service_credit_reservation_failed', { uid: user.uid, error: error.message }); res.status(400).json({ success: false, message: error.message }); }
});

exports.releaseServiceCredit = onRequest({ cors: true, ...HALF_CPU_OPTIONS }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  const user = await getVerifiedRequestUser(req); if (!user) return res.status(401).json({ success: false, message: 'Unauthorized request.' });
  const requestId = String(req.body?.requestId || ''); const request = (await db.collection('serviceRequests').doc(requestId).get()).data() || {};
  if (request.customerId !== user.uid) return res.status(403).json({ success: false, message: 'Not allowed.' });
  try { const redemption = await finalizeServiceCredit({ db, admin, requestId, paymentSucceeded: false, reason: 'customer_released' }); res.status(200).json({ success: true, redemption }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

exports.adminAdjustReward = onRequest({ cors: true, ...HALF_CPU_OPTIONS }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  const user = await getVerifiedRequestUser(req); if (!user?.adminAuthorized) return res.status(403).json({ success: false, message: 'Admin only.' });
  try { const result = await adminRewardAdjustment({ db, admin, adminUser: user, userId: String(req.body?.userId || ''), accountType: req.body?.accountType, direction: req.body?.direction, points: req.body?.points, reason: req.body?.reason, supportReference: req.body?.supportReference }); res.status(200).json({ success: true, result }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

function isRewardAdmin(user) {
  return Boolean(user?.adminAuthorized === true);
}

function validateRewardConfigPatch(configId, patch) {
  if (!['global', 'customer', 'helper', 'membership', 'mastery'].includes(configId) || !patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid reward configuration update.');
  const numbers = ['pointsPerRand', 'customerPointExpiryMonths', 'minimumCustomerRedemptionPoints', 'redemptionIncrementPoints', 'maximumServiceCreditPercentagePerBooking', 'maximumServiceCreditRandPerBooking'];
  for (const key of numbers) {
    if (patch[key] !== undefined && (!Number.isFinite(Number(patch[key])) || Number(patch[key]) < 0)) throw new Error(`Invalid ${key}.`);
  }
  if (patch.maximumServiceCreditPercentagePerBooking !== undefined && Number(patch.maximumServiceCreditPercentagePerBooking) > 100) throw new Error('Service-credit percentage must be between 0 and 100.');
  if (patch.pointsPerRand !== undefined && Number(patch.pointsPerRand) < 1) throw new Error('Points-per-Rand must be at least one.');
}

exports.adminUpdateRewardConfig = onRequest({ cors: true, ...HALF_CPU_OPTIONS }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  const user = await getVerifiedRequestUser(req); if (!isRewardAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only.' });
  try {
    const configId = String(req.body?.configId || ''); const patch = req.body?.patch; const reason = String(req.body?.reason || '').trim();
    validateRewardConfigPatch(configId, patch); if (!reason) throw new Error('A change reason is required.');
    const configRef = db.collection('rewardConfig').doc(configId); const historyRef = db.collection('rewardConfigHistory').doc();
    const result = await db.runTransaction(async (tx) => {
      const before = (await tx.get(configRef)).data() || {}; const version = Number(before.version || 0) + 1;
      tx.set(configRef, { ...patch, version, updatedBy: user.uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      tx.set(historyRef, { configType: configId, previousValues: before, newValues: patch, changedFields: Object.keys(patch), adminUid: user.uid, reason, version, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      tx.set(db.collection('adminAuditLogs').doc(historyRef.id), { actorUid: user.uid, action: 'reward_config_updated', targetType: 'reward_config', targetId: configId, reason, correlationId: historyRef.id, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      return { version, historyId: historyRef.id };
    });
    res.status(200).json({ success: true, result });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

exports.adminRewardOperations = onRequest({ cors: true, ...HALF_CPU_OPTIONS }, async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });
  const user = await getVerifiedRequestUser(req); if (!isRewardAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only.' });
  try {
    const [summary, configs, transactions] = await Promise.all([
      db.collection('rewardOperationalSummaries').doc('current').get(),
      db.collection('rewardConfig').get(),
      db.collectionGroup('transactions').orderBy('createdAt', 'desc').limit(50).get(),
    ]);
    res.status(200).json({ success: true, summary: summary.exists ? summary.data() : {}, config: Object.fromEntries(configs.docs.map((doc) => [doc.id, doc.data()])), transactions: transactions.docs.map((doc) => ({ id: doc.id, userId: doc.ref.parent.parent.id, ...doc.data() })) });
  } catch (error) { logger.error('admin_reward_operations_failed', { error: error.message }); res.status(500).json({ success: false, message: 'Unable to load reward operations.' }); }
});

exports.adminUpsertRewardCampaign = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  const user = await getVerifiedRequestUser(req); if (!isRewardAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only.' });
  try {
    const campaign = req.body?.campaign || {}; const id = String(req.body?.campaignId || '').trim() || db.collection('rewardCampaigns').doc().id;
    if (!String(campaign.name || '').trim() || !['draft', 'pending_approval', 'active', 'paused', 'ended'].includes(campaign.status)) throw new Error('Campaign name and valid status are required.');
    if (Number(campaign.maximumTotalPoints || 0) < 0 || Number(campaign.maximumAwardsPerUser || 0) < 0 || Number(campaign.maximumUsers || 0) < 0) throw new Error('Campaign caps cannot be negative.');
    if (campaign.status === 'active' && (!campaign.startAt || !campaign.endAt || Number(campaign.maximumTotalPoints || 0) < 1)) throw new Error('Active campaigns need dates and a finite point budget.');
    await db.collection('rewardCampaigns').doc(id).set({ ...campaign, campaignId: id, updatedBy: user.uid, updatedAt: admin.firestore.FieldValue.serverTimestamp(), createdBy: campaign.createdBy || user.uid, createdAt: campaign.createdAt || admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await db.collection('adminAuditLogs').doc(`campaign_${id}_${Date.now()}`).set({ actorUid: user.uid, action: 'campaign_upserted', targetType: 'reward_campaign', targetId: id, reason: String(req.body?.reason || ''), createdAt: admin.firestore.FieldValue.serverTimestamp() });
    res.status(200).json({ success: true, campaignId: id });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

exports.requestHelperRewardBenefit = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  const user = await getVerifiedRequestUser(req); if (!user) return res.status(401).json({ success: false, message: 'Unauthorized request.' });
  try { const redemption = await requestHelperBenefit({ db, admin, helperId: user.uid, benefitId: String(req.body?.benefitId || '') }); res.status(200).json({ success: true, redemption }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

exports.updatePaymentMethod = onRequest({ cors: true, ...HALF_CPU_OPTIONS }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ success: false, message: 'Method not allowed' }); return; }
  const token = getBearerToken(req); const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) { res.status(401).json({ success: false, message: 'Unauthorized request.' }); return; }

  const action = String(req.body?.action || '').trim().toLowerCase();
  const methodId = String(req.body?.methodId || '').trim();
  if (!['set_default', 'remove'].includes(action) || !methodId) {
    res.status(400).json({ success: false, message: 'Invalid payment-method request.' }); return;
  }

  const result = await updateSavedPaymentMethod({ db, admin, uid: decoded.uid, methodId, action });
  if (result.action === 'profile-not-found') return res.status(404).json({ success: false, message: 'User profile not found.' });
  if (result.action === 'method-not-found') return res.status(404).json({ success: false, message: 'Payment method not found.' });
  if (result.action !== 'updated') return res.status(400).json({ success: false, message: 'Invalid payment-method request.' });
  return res.status(200).json({ success: true, paymentMethods: result.paymentMethods });
});

function paymentFeatureUnavailable(res) {
  return res.status(503).json({ success: false, code: 'payments-disabled', message: 'The updated payment options are not enabled yet.' });
}

function getRequestPaymentReference(requestId, attemptId) {
  const digest = createHash('sha256').update(`${String(requestId || '')}:${String(attemptId || '')}`).digest('hex').slice(0, 32);
  return `uncedo-pay-${digest}`;
}

function isValidCustomerEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

async function getOptionalPaymentCaller(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  return admin.auth().verifyIdToken(token).catch(() => null);
}

function paymentSessionPublicPayload(resolved) {
  const request = resolved.request || {};
  const operation = resolved.paymentOperation || {};
  const methods = ['cash', 'paystack_checkout'];
  return {
    success: true,
    requestReference: String(request.publicRequestReference || request.requestReference || request.id || ''),
    service: String(request.subject || request.serviceName || 'Uncedo service'),
    amount: Number(resolved.amount || 0),
    currency: 'ZAR',
    paymentStatus: resolved.paymentStatus,
    availableMethods: resolved.paymentStatus === 'paid' ? [] : methods,
    paymentAttemptStatus: String(operation.status || ''),
    activeAttemptId: String(operation.activeAttemptId || ''),
    paymentMethod: String(operation.method || ''),
    receiptId: String(operation.receiptId || request.paymentReceiptId || ''),
  };
}

async function saveReusablePaystackAuthorization({ uid, transaction, consentAtMs }) {
  const authorization = transaction?.authorization || {};
  return storeReusablePaymentMethod({
    db,
    admin,
    uid,
    authorization,
    consentAtMs,
    consentPurpose: 'explicit_future_card_consent',
  });
}

async function issuePaidRequestPostEffects({ requestId, paymentResult }) {
  if (paymentResult?.action !== 'settled') return;
  const requestSnap = await db.collection('serviceRequests').doc(requestId).get();
  if (!requestSnap.exists) return;
  const request = { id: requestSnap.id, ...(requestSnap.data() || {}) };
  if (request.serviceCreditRedemptionId) {
    const operationSnap = await db.collection(FINANCIAL_OPERATIONS_COLLECTION).doc(serviceFinancialOperationId(requestId)).get().catch(() => null);
    const appliedPoints = Number(operationSnap?.data()?.settlementData?.serviceCreditPoints || request.pricingSnapshot?.serviceCreditPoints || 0);
    await finalizeServiceCredit({ db, admin, requestId, paymentSucceeded: true, appliedPoints, reason: 'final_cap' }).catch((error) => {
      logger.warn('service_credit_finalization_after_payment_failed', { requestId, error: error.message });
    });
  }
  const customerId = String(request.customerId || '');
  const helperId = String(request.helperAssignment?.helperId || '');
  const customerConfig = await getRewardConfig(db, 'customer').catch(() => ({}));
  const helperConfig = await getRewardConfig(db, 'helper').catch(() => ({}));
  const expandedServiceIds = serviceIdsFor(request);
  if (customerId) {
    await applyRewardTransaction({ db, admin, userId: customerId, accountType: ACCOUNT_TYPES.CUSTOMER, direction: REWARD_TRANSACTION_DIRECTIONS.CREDIT, points: Number(customerConfig.rewards?.completedPaidBooking || 50), reasonCode: REWARD_REASON_CODES.CUSTOMER_COMPLETED_PAID_BOOKING, reasonLabel: 'Completed paid booking', sourceType: 'service_request', sourceId: requestId, idempotencyKey: `customer:${customerId}:request:${requestId}:completed-paid`, requestId, categoryId: request.categoryId || '', serviceIds: expandedServiceIds, primaryServiceId: expandedServiceIds[0] || '', notifyUser: true }).catch(() => null);
    const firstReward = await applyRewardTransaction({ db, admin, userId: customerId, accountType: ACCOUNT_TYPES.CUSTOMER, direction: REWARD_TRANSACTION_DIRECTIONS.CREDIT, points: Number(customerConfig.rewards?.firstCompletedPaidBooking || 100), reasonCode: REWARD_REASON_CODES.CUSTOMER_FIRST_COMPLETED_PAID_BOOKING, reasonLabel: 'First completed paid booking', sourceType: 'service_request', sourceId: requestId, idempotencyKey: `customer:${customerId}:request:first-booking-bonus`, requestId, categoryId: request.categoryId || '', serviceIds: expandedServiceIds, primaryServiceId: expandedServiceIds[0] || '', notifyUser: true }).catch(() => null);
    await incrementCompletedPaid({ db, admin, userId: customerId, accountType: ACCOUNT_TYPES.CUSTOMER, requestId }).catch(() => null);
    if (firstReward) await awardReferralStage({ db, admin, referredUserId: customerId, stage: 2, requestId }).catch(() => null);
  }
  if (helperId) {
    await applyRewardTransaction({ db, admin, userId: helperId, accountType: ACCOUNT_TYPES.HELPER, direction: REWARD_TRANSACTION_DIRECTIONS.CREDIT, points: Number(helperConfig.rewards?.completedPaidJob || 50), reasonCode: REWARD_REASON_CODES.HELPER_COMPLETED_PAID_JOB, reasonLabel: 'Completed paid job', sourceType: 'service_request', sourceId: requestId, idempotencyKey: `helper:${helperId}:request:${requestId}:completed-paid`, requestId, relatedUserId: customerId, categoryId: request.categoryId || '', serviceIds: expandedServiceIds, primaryServiceId: expandedServiceIds[0] || '', notifyUser: true }).catch(() => null);
    await incrementCompletedPaid({ db, admin, userId: helperId, accountType: ACCOUNT_TYPES.HELPER, requestId, serviceIds: expandedServiceIds, categoryId: request.categoryId || '' }).catch(() => null);
  }
  await db.collection('customerServiceEvents').doc(`request_completed_${requestId}`).set({
    requestId,
    eventType: 'request_completed',
    metadata: { paymentStatus: 'paid', paymentMethod: paymentResult.method, totalAmount: Number(paymentResult.amount || 0), requestStatus: 'completed' },
    paymentUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true }).catch(() => null);
  await createUserNotificationOnce({ notificationId: `request_payment_${requestId}_${paymentResult.receiptId}_customer`, userId: customerId, title: 'Payment confirmed', message: `Payment received for request ${request.publicRequestReference || requestId}.`, type: 'payment_confirmed', requestId, targetPath: `/customer/requests/${requestId}`, metadata: { paymentStatus: 'paid', receiptId: paymentResult.receiptId } }).catch(() => null);
}

async function verifyAndSettleRequestPayment({ requestId, attemptId, reference, paystackSecretKey, helperId = '' }) {
  const paymentRef = db.collection(PAYMENT_OPERATIONS).doc(requestId);
  const attemptRef = paymentRef.collection('attempts').doc(attemptId);
  const [paymentSnap, attemptSnap] = await Promise.all([paymentRef.get(), attemptRef.get()]);
  if (!paymentSnap.exists || !attemptSnap.exists) return { action: 'not-found' };
  const payment = paymentSnap.data() || {};
  const attempt = attemptSnap.data() || {};
  if (payment.activeAttemptId !== attemptId || String(attempt.gatewayReference || '') !== String(reference || '')) return { action: 'reference-mismatch' };
  const verification = await verifyPaystackTransaction({ paystackSecretKey, reference, amountMinor: Number(attempt.amountMinor || 0), currency: 'ZAR' });
  if (verification.outcome === 'success' && attempt.saveCardConsent === true && attempt.saveCardOwnerUid
    && await isCustomerRequestPrincipalOwnedByUid(attempt.saveCardOwnerUid, attempt.customerId)) {
    const ownerUid = String(attempt.saveCardOwnerUid);
    const user = (await db.collection('users').doc(ownerUid).get()).data() || {};
    const userEmail = String(user.email || '').trim().toLowerCase();
    const transactionEmail = String(verification.transaction?.customer?.email || '').trim().toLowerCase();
    if (userEmail && transactionEmail && userEmail === transactionEmail) {
      await saveReusablePaystackAuthorization({ uid: ownerUid, transaction: verification.transaction, consentAtMs: Number(attempt.saveCardConsentAtMs || Date.now()) }).catch(() => null);
    }
  }
  const result = await settleRequestPayment({ db, admin, requestId, attemptId, outcome: verification.outcome, gatewayTransactionId: verification.transaction?.id ? String(verification.transaction.id) : '', gatewayReference: reference, providerStatus: verification.transaction?.status || verification.outcome, helperId, walletEnabled: helperWalletEnabled() });
  if (['settled', 'already-paid'].includes(result.action)) await issuePaidRequestPostEffects({ requestId, paymentResult: result });
  return { ...result, verification };
}

exports.createServicePaymentSession = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  if (!requestPaymentsEnabled()) return paymentFeatureUnavailable(res);
  const user = await getOptionalPaymentCaller(req);
  if (!user?.uid) return res.status(401).json({ success: false, message: 'Sign in to request a payment link.' });
  const requestId = String(req.body?.requestId || '').trim();
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(requestId)) return res.status(400).json({ success: false, message: 'A valid request reference is required.' });
  const requestSnap = await db.collection('serviceRequests').doc(requestId).get();
  if (!requestSnap.exists) return res.status(404).json({ success: false, message: 'Request not found.' });
  const request = requestSnap.data() || {};
  if (!(await isCustomerRequestPrincipalOwnedByUid(user.uid, request.customerId))) return res.status(403).json({ success: false, message: 'This request is not linked to your customer account.' });
  const session = await createServicePaymentSession({ db, requestId, customerId: request.customerId, principalId: user.uid, principalType: 'firebase_uid' });
  if (session.code !== 'created') {
    const status = session.code === 'already-paid' ? 409 : session.code === 'not-found' ? 404 : 409;
    return res.status(status).json({ success: false, code: session.code, message: session.code === 'already-paid' ? 'This request has already been paid.' : 'This request cannot accept payment right now.' });
  }
  const baseUrl = String(process.env.CUSTOMER_PAYMENT_URL || 'https://uncedo.bakayise.com/payment').trim().replace(/\/$/, '');
  res.set('Cache-Control', 'no-store, private');
  res.set('Referrer-Policy', 'no-referrer');
  return res.status(200).json({ success: true, url: `${baseUrl}?token=${encodeURIComponent(session.token)}`, expiresAtMs: session.expiresAtMs });
});

exports.getServicePaymentSession = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 15 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  const token = String(req.body?.token || '').trim();
  const result = await resolveServicePaymentSession({ db, token });
  if (result.code !== 'available') return res.status(result.code === 'expired' ? 410 : 404).json({ success: false, code: result.code, message: result.code === 'expired' ? 'This payment link has expired.' : 'This payment link is unavailable.' });
  const payload = paymentSessionPublicPayload(result);
  const caller = await getOptionalPaymentCaller(req);
  const verifiedOwner = Boolean(caller?.uid && await isCustomerRequestPrincipalOwnedByUid(caller.uid, result.session.customerId));
  payload.canSaveCard = verifiedOwner;
  payload.savedCards = [];
  if (verifiedOwner) {
    const paymentMethods = await getServerPaymentMethods({ db, admin, uid: caller.uid });
    payload.savedCards = paymentMethods
      .filter((card) => card?.reusable === true && String(card.paystackAuthorizationCode || '').trim())
      .map((card) => ({ id: String(card.id || ''), brand: String(card.brand || 'Card'), last4: String(card.last4 || '').slice(-4), isDefault: card.isDefault === true }))
      .filter((card) => card.id);
    if (result.paymentOperation?.status === 'awaiting_customer_confirmation'
      && result.paymentOperation?.method === 'saved_card'
      && result.paymentOperation?.activeAttemptId) {
      const attemptSnap = await result.paymentOperationRef.collection('attempts').doc(String(result.paymentOperation.activeAttemptId)).get();
      const attempt = attemptSnap.data() || {};
      const selectedCard = paymentMethods.find((card) => String(card.id || '') === String(attempt.selectedCardId || '') && card?.reusable === true);
      if (selectedCard) payload.pendingSavedCardPayment = {
        requestId: result.request.id,
        attemptId: String(result.paymentOperation.activeAttemptId),
        amount: Number(attempt.amount || result.amount),
        card: { id: String(selectedCard.id), brand: String(selectedCard.brand || 'Card'), last4: String(selectedCard.last4 || '').slice(-4) },
      };
    }
  }
  if (payload.paymentStatus === 'paid') {
    payload.receipt = safePaymentReceipt({ requestId: result.request.id, operation: result.paymentOperation, request: result.request });
    if (!payload.receipt && result.legacyOperation?.status === 'settled_success') {
      payload.receipt = {
        receiptId: String(result.legacyOperation.gatewayTransactionId || result.legacyOperation.operationId || ''),
        requestReference: String(result.request.publicRequestReference || result.request.requestReference || result.request.id || ''),
        service: String(result.request.subject || result.request.serviceName || 'Uncedo service'),
        amount: Number(result.legacyOperation.amount || result.request.totalAmount || 0), currency: 'ZAR', method: 'paystack',
        paidAtMs: Number(result.legacyOperation.settledAtMs || 0), status: 'paid',
      };
    }
  }
  else if (!['unpaid', 'payment_failed', 'wallet_debt_recorded', 'payment_cancelled', 'payment_expired', 'cash_selected', 'awaiting_cash_confirmation'].includes(payload.paymentStatus)) {
    payload.availableMethods = [];
    payload.message = 'A payment attempt is already in progress. Check its status again shortly.';
  }
  if (payload.paymentStatus === 'awaiting_cash_confirmation') payload.message = 'Waiting for the assigned helper to confirm cash payment.';
  res.set('Cache-Control', 'no-store, private');
  res.set('Referrer-Policy', 'no-referrer');
  return res.status(200).json(payload);
});

exports.revokeServicePaymentSession = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 15 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  const user = await getOptionalPaymentCaller(req);
  if (!user?.uid) return res.status(401).json({ success: false, message: 'Unauthorized.' });
  const token = String(req.body?.token || '').trim();
  const resolved = await resolveServicePaymentSession({ db, token });
  if (resolved.code !== 'available') return res.status(404).json({ success: false, code: resolved.code });
  if (!(await isCustomerRequestPrincipalOwnedByUid(user.uid, resolved.session.customerId))) return res.status(403).json({ success: false, message: 'Not allowed.' });
  const result = await revokeServicePaymentSession({ db, requestId: resolved.session.requestId, customerId: resolved.session.customerId, tokenHash: resolved.session.sessionId });
  return res.status(result.action === 'revoked' ? 200 : 409).json({ success: result.action === 'revoked' });
});

exports.startServicePaystackCheckout = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  if (!requestPaymentsEnabled()) return paymentFeatureUnavailable(res);
  let paystackSecretKey = '';
  try { paystackSecretKey = getPaymentsSecrets().PAYSTACK_SECRET_KEY; } catch { return res.status(503).json({ success: false, code: 'payments-unavailable', message: 'Card checkout is not configured yet.' }); }
  const token = String(req.body?.token || '').trim();
  const resolved = await resolveServicePaymentSession({ db, token });
  if (resolved.code !== 'available') return res.status(resolved.code === 'expired' ? 410 : 404).json({ success: false, code: resolved.code, message: 'This payment link is unavailable or expired.' });
  const caller = await getOptionalPaymentCaller(req);
  const isOwnerAuthenticated = Boolean(caller?.uid && await isCustomerRequestPrincipalOwnedByUid(caller.uid, resolved.session.customerId));
  const saveCardConsent = req.body?.saveCardConsent === true && isOwnerAuthenticated;
  const email = isOwnerAuthenticated
    ? isValidCustomerEmail(caller.email || (await db.collection('users').doc(caller.uid).get()).data()?.email) || isValidCustomerEmail(req.body?.email)
    : isValidCustomerEmail(req.body?.email || resolved.request.customerEmail);
  if (!email) return res.status(422).json({ success: false, code: 'email-required', message: 'Enter a valid email address to continue to Paystack.' });
  const idempotencyKey = String(req.body?.idempotencyKey || randomUUID());
  const begun = await beginServicePaymentAttempt({ db, admin, sessionRef: resolved.sessionRef, session: resolved.session, method: 'paystack_checkout', idempotencyKey, saveCardConsent, now: Date.now() });
  if (!['created', 'existing'].includes(begun.action)) return res.status(begun.action === 'already-paid' ? 409 : 409).json({ success: false, code: begun.action, message: begun.action === 'already-paid' ? 'This request has already been paid.' : 'Another payment attempt is active or this request is no longer payable.' });
  const attempt = begun.attempt || {};
  const attemptRef = begun.attemptRef;
  if (attempt.authorizationUrl) return res.status(200).json({ success: true, authorizationUrl: attempt.authorizationUrl, status: attempt.status });
  if (begun.action === 'existing' && attempt.gatewayReference) {
    const verified = await verifyAndSettleRequestPayment({ requestId: resolved.session.requestId, attemptId: attempt.attemptId, reference: attempt.gatewayReference, paystackSecretKey });
    return res.status(200).json({ success: true, status: verified.action === 'settled' ? 'paid' : verified.action === 'failed' ? 'payment_failed' : 'payment_reconciliation_required' });
  }
  const reference = getRequestPaymentReference(resolved.session.requestId, attempt.attemptId);
  const now = Date.now();
  await attemptRef.set({ gatewayReference: reference, email, saveCardConsent, saveCardConsentAtMs: saveCardConsent ? now : null, saveCardOwnerUid: saveCardConsent ? caller.uid : null, updatedAtMs: now }, { merge: true });
  await recordCheckoutInitialization({ db, admin, requestId: resolved.session.requestId, attemptId: attempt.attemptId, gatewayReference: reference, authorizationUrl: '' });
  try {
    const baseUrl = String(process.env.CUSTOMER_PAYMENT_URL || 'https://uncedo.bakayise.com/payment').trim().replace(/\/$/, '');
    // Keep the bearer payment token in same-origin sessionStorage; only the
    // non-authorizing Paystack reference is sent back in the browser URL.
    const callbackUrl = `${baseUrl}?reference=${encodeURIComponent(reference)}`;
    const payload = await callPaystackApi({
      paystackSecretKey,
      path: '/transaction/initialize',
      method: 'POST',
      body: {
        email,
        amount: Number(attempt.amountMinor),
        currency: 'ZAR',
        reference,
        callback_url: callbackUrl,
        channels: ['card'],
        metadata: { uncedo_request_id: resolved.session.requestId, uncedo_payment_attempt_id: attempt.attemptId, save_card_consent: saveCardConsent },
      },
    });
    const authorizationUrl = String(payload.data?.authorization_url || '');
    const checkoutHost = (() => { try { return new URL(authorizationUrl).hostname; } catch { return ''; } })();
    if (!authorizationUrl.startsWith('https://') || !['checkout.paystack.com', 'checkout.paystack.co'].includes(checkoutHost) || String(payload.data?.reference || '') !== reference) {
      return res.status(502).json({ success: false, code: 'checkout-response-invalid', message: 'Paystack did not return a valid secure checkout link.' });
    }
    const saved = await recordCheckoutInitialization({ db, admin, requestId: resolved.session.requestId, attemptId: attempt.attemptId, gatewayReference: reference, authorizationUrl });
    if (saved.action !== 'updated') return res.status(409).json({ success: false, code: saved.action });
    return res.status(200).json({ success: true, authorizationUrl, status: 'payment_processing' });
  } catch (error) {
    logger.warn('request_paystack_checkout_initialization_uncertain', { requestId: resolved.session.requestId, attemptId: attempt.attemptId, errorCode: String(error?.code || 'paystack_init_failed').slice(0, 80) });
    const result = await verifyAndSettleRequestPayment({ requestId: resolved.session.requestId, attemptId: attempt.attemptId, reference, paystackSecretKey });
    return res.status(200).json({ success: true, status: result.action === 'settled' ? 'paid' : result.action === 'failed' ? 'payment_failed' : 'payment_reconciliation_required' });
  }
});

exports.verifyServicePaystackCheckout = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  const token = String(req.body?.token || '').trim();
  const reference = String(req.body?.reference || '').trim();
  const resolved = await resolveServicePaymentSession({ db, token });
  if (resolved.code !== 'available') return res.status(resolved.code === 'expired' ? 410 : 404).json({ success: false, code: resolved.code, message: 'This payment link is unavailable or expired.' });
  const payment = resolved.paymentOperation || {};
  const attemptId = String(payment.activeAttemptId || '');
  if (!attemptId || String(payment.gatewayReference || '') !== reference) return res.status(409).json({ success: false, code: 'payment-reference-mismatch' });
  let secret;
  try { secret = getPaymentsSecrets().PAYSTACK_SECRET_KEY; } catch { return res.status(503).json({ success: false, code: 'payments-unavailable' }); }
  const result = await verifyAndSettleRequestPayment({ requestId: resolved.session.requestId, attemptId, reference, paystackSecretKey: secret });
  const status = result.action === 'settled' || result.action === 'already-paid' ? 'paid'
    : result.action === 'failed' ? 'payment_failed'
      : result.action === 'pending' ? 'payment_processing'
        : 'payment_reconciliation_required';
  const updated = await resolveServicePaymentSession({ db, token });
  return res.status(200).json({ success: true, status, receipt: status === 'paid' ? safePaymentReceipt({ requestId: updated.request.id, operation: updated.paymentOperation, request: updated.request }) : null });
});

exports.requestCashServicePayment = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  if (!requestPaymentsEnabled()) return paymentFeatureUnavailable(res);
  const caller = await getOptionalPaymentCaller(req);
  if (!caller?.uid) return res.status(401).json({ success: false, message: 'Sign in to choose cash payment.' });
  const requestId = String(req.body?.requestId || '').trim();
  const requestSnap = await db.collection('serviceRequests').doc(requestId).get();
  if (!requestSnap.exists) return res.status(404).json({ success: false, message: 'Request not found.' });
  const request = requestSnap.data() || {};
  if (!(await isCustomerRequestPrincipalOwnedByUid(caller.uid, request.customerId))) return res.status(403).json({ success: false, message: 'Not allowed.' });
  const session = await createServicePaymentSession({ db, requestId, customerId: request.customerId, principalId: caller.uid, principalType: 'firebase_uid' });
  if (session.code !== 'created') return res.status(409).json({ success: false, code: session.code });
  const resolved = await resolveServicePaymentSession({ db, token: session.token });
  const begun = await beginServicePaymentAttempt({ db, admin, sessionRef: resolved.sessionRef, session: resolved.session, method: 'cash', idempotencyKey: String(req.body?.idempotencyKey || randomUUID()) });
  if (!['created', 'existing'].includes(begun.action)) return res.status(409).json({ success: false, code: begun.action });
  return res.status(200).json({ success: true, requestId, amount: Number(begun.attempt.amount), status: begun.attempt.status, attemptId: begun.attempt.attemptId });
});

exports.selectCashPaymentFromSession = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 20 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  if (!requestPaymentsEnabled()) return paymentFeatureUnavailable(res);
  const token = String(req.body?.token || '').trim();
  const resolved = await resolveServicePaymentSession({ db, token });
  if (resolved.code !== 'available') return res.status(resolved.code === 'expired' ? 410 : 404).json({ success: false, code: resolved.code });
  const begun = await beginServicePaymentAttempt({ db, admin, sessionRef: resolved.sessionRef, session: resolved.session, method: 'cash', idempotencyKey: String(req.body?.idempotencyKey || randomUUID()) });
  if (!['created', 'existing'].includes(begun.action)) return res.status(409).json({ success: false, code: begun.action, message: 'Another payment is active or this request cannot be paid.' });
  return res.status(200).json({ success: true, requestId: resolved.session.requestId, amount: Number(begun.attempt.amount), status: begun.attempt.status, attemptId: begun.attempt.attemptId });
});

exports.cancelCashPaymentSelection = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 20 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  if (!requestPaymentsEnabled()) return paymentFeatureUnavailable(res);
  const caller = await getOptionalPaymentCaller(req);
  const token = String(req.body?.token || '').trim();
  const resolved = token ? await resolveServicePaymentSession({ db, token }) : null;
  let customerId = String(caller?.uid || '');
  let requestId = String(req.body?.requestId || '');
  if (resolved?.code === 'available') {
    requestId = resolved.session.requestId;
    customerId = resolved.session.customerId;
    if (caller?.uid && !(await isCustomerRequestPrincipalOwnedByUid(caller.uid, customerId))) return res.status(403).json({ success: false, message: 'Not allowed.' });
  } else if (token) return res.status(resolved?.code === 'expired' ? 410 : 404).json({ success: false, code: resolved?.code });
  else if (!caller?.uid) return res.status(401).json({ success: false, message: 'Unauthorized.' });
  const result = await cancelCashPaymentSelection({ db, admin, requestId, customerId, attemptId: String(req.body?.attemptId || '') });
  return res.status(result.action === 'cancelled' ? 200 : 409).json({ success: result.action === 'cancelled', code: result.action });
});

exports.reportCashServicePayment = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 15 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  if (!requestPaymentsEnabled()) return paymentFeatureUnavailable(res);
  const caller = await getOptionalPaymentCaller(req);
  let requestId = String(req.body?.requestId || '');
  let customerId = String(caller?.uid || '');
  if (req.body?.token) {
    const resolved = await resolveServicePaymentSession({ db, token: String(req.body.token) });
    if (resolved.code !== 'available') return res.status(410).json({ success: false, code: resolved.code });
    requestId = resolved.session.requestId;
    customerId = resolved.session.customerId;
    if (caller?.uid && !(await isCustomerRequestPrincipalOwnedByUid(caller.uid, customerId))) return res.status(403).json({ success: false, message: 'Not allowed.' });
  } else if (!caller?.uid) return res.status(401).json({ success: false, message: 'Unauthorized.' });
  const result = await reportCashPayment({ db, admin, requestId, customerId, attemptId: String(req.body?.attemptId || '') });
  if (result.action === 'reported') {
    const helperId = String(result.request?.helperAssignment?.helperId || '');
    await notifyCashPaymentToHelper({ requestId, attemptId: String(req.body?.attemptId || ''), helperId, amount: result.attempt?.amount }).catch(() => null);
  }
  return res.status(['reported', 'already-reported'].includes(result.action) ? 200 : 409).json({ success: ['reported', 'already-reported'].includes(result.action), code: result.action });
});

exports.respondToCashServicePayment = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  if (!requestPaymentsEnabled()) return paymentFeatureUnavailable(res);
  const caller = await getOptionalPaymentCaller(req);
  if (!caller?.uid) return res.status(401).json({ success: false, message: 'Unauthorized.' });
  const requestId = String(req.body?.requestId || '');
  const attemptId = String(req.body?.attemptId || '');
  const action = String(req.body?.action || '').toLowerCase();
  if (!['confirm', 'reject'].includes(action)) return res.status(400).json({ success: false, message: 'Choose confirm or reject.' });
  const result = action === 'reject'
    ? await rejectCashPayment({ db, admin, requestId, helperId: caller.uid, attemptId })
    : await settleRequestPayment({ db, admin, requestId, attemptId, outcome: 'success', helperId: caller.uid, providerStatus: 'helper_confirmed', walletEnabled: helperWalletEnabled() });
  if (result.action === 'settled') await issuePaidRequestPostEffects({ requestId, paymentResult: result });
  return res.status(result.action === 'settled' || result.action === 'rejected' ? 200 : 409).json({ success: result.action === 'settled' || result.action === 'rejected', code: result.action, receiptId: result.receiptId || null });
});

exports.getHelperCashPaymentConfirmations = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 20 }, async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  if (!requestPaymentsEnabled()) return paymentFeatureUnavailable(res);
  const caller = await getOptionalPaymentCaller(req);
  if (!caller?.uid) return res.status(401).json({ success: false, message: 'Unauthorized.' });
  const helper = (await db.collection('users').doc(caller.uid).get()).data() || {};
  const roles = [helper.role, helper.activeRole, ...(Array.isArray(helper.roles) ? helper.roles : [])].map((value) => String(value || '').toLowerCase());
  if (!roles.some((role) => ['helper', 'provider'].includes(role))) return res.status(403).json({ success: false, message: 'Helper role required.' });
  const requestSnapshots = await db.collection('serviceRequests').where('helperAssignment.helperId', '==', caller.uid).orderBy('createdAt', 'desc').limit(50).get();
  const pending = [];
  for (const requestDoc of requestSnapshots.docs) {
    if (String(requestDoc.data()?.status || '').toLowerCase() !== 'completed') continue;
    const paymentRef = db.collection(PAYMENT_OPERATIONS).doc(requestDoc.id);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) continue;
    const payment = paymentSnap.data() || {};
    if (payment.status !== 'awaiting_cash_confirmation' || !payment.activeAttemptId) continue;
    const attemptSnap = await paymentRef.collection('attempts').doc(String(payment.activeAttemptId)).get();
    const attempt = attemptSnap.data() || {};
    if (attempt.method !== 'cash' || attempt.status !== 'awaiting_cash_confirmation') continue;
    const request = requestDoc.data() || {};
    pending.push({
      requestId: requestDoc.id,
      requestReference: String(request.publicRequestReference || request.requestReference || requestDoc.id),
      service: String(request.subject || request.serviceName || 'Uncedo service'),
      amount: Number(attempt.amount || 0),
      currency: 'ZAR',
      attemptId: attempt.attemptId,
      customerReportedAtMs: Number(attempt.customerReportedAtMs || 0),
    });
    if (pending.length >= 20) break;
  }
  return res.status(200).json({ success: true, confirmations: pending });
});

async function authenticateHelperWalletCaller(req, res) {
  const token = getBearerToken(req);
  const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) {
    res.status(401).json({ success: false, message: 'Unauthorized request.' });
    return null;
  }
  const profile = (await db.collection('users').doc(decoded.uid).get()).data() || {};
  const roles = [profile.role, profile.activeRole, ...(Array.isArray(profile.roles) ? profile.roles : [])]
    .map((value) => String(value || '').toLowerCase());
  if (!roles.some((role) => ['helper', 'provider'].includes(role))) {
    res.status(403).json({ success: false, message: 'Helper role required.' });
    return null;
  }
  return decoded.uid;
}

exports.getHelperWallet = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 15 }, async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  const helperId = await authenticateHelperWalletCaller(req, res);
  if (!helperId) return;
  const walletRef = helperWalletReference(db, helperId);
  const walletSnapshot = await walletRef.get();
  const wallet = walletSnapshot.exists ? walletSnapshot.data() || {} : emptyHelperWallet(helperId);
  return res.status(200).json({
    success: true,
    wallet: normalizeWalletForClient(wallet),
    nextPayoutEstimateMinor: wallet.reconciliationBlocked === true
      ? 0
      : Math.max(0, Number(wallet.availableMinor || 0) - Number(wallet.outstandingCommissionMinor || 0)),
  });
});

exports.getHelperWalletTransactions = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 15 }, async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  const helperId = await authenticateHelperWalletCaller(req, res);
  if (!helperId) return;
  const requestedLimit = Number.parseInt(String(req.query?.limit || '20'), 10);
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 50)) : 20;
  const snapshot = await helperWalletReference(db, helperId).collection('transactions')
    .orderBy('createdAtMs', 'desc')
    .limit(limit)
    .get();
  const transactions = snapshot.docs.map((document) => {
    const entry = document.data() || {};
    return {
      id: document.id,
      entryType: String(entry.entryType || 'wallet_entry'),
      amountMinor: Math.max(0, Number(entry.amountMinor || 0)),
      availableDeltaMinor: Number(entry.availableDeltaMinor || 0),
      reservedDeltaMinor: Number(entry.reservedDeltaMinor || 0),
      outstandingCommissionDeltaMinor: Number(entry.outstandingCommissionDeltaMinor || 0),
      description: String(entry.description || ''),
      requestId: String(entry.requestId || ''),
      payoutId: String(entry.payoutId || ''),
      createdAtMs: Number(entry.createdAtMs || 0),
    };
  });
  return res.status(200).json({ success: true, transactions });
});

exports.prepareSavedCardServicePayment = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  if (!requestPaymentsEnabled()) return paymentFeatureUnavailable(res);
  const caller = await getOptionalPaymentCaller(req);
  if (!caller?.uid) return res.status(401).json({ success: false, message: 'Sign in before using a saved card.' });
  let requestId = String(req.body?.requestId || '');
  let requestSnap = requestId ? await db.collection('serviceRequests').doc(requestId).get() : null;
  let paymentSession = null;
  if (req.body?.token) {
    paymentSession = await resolveServicePaymentSession({ db, token: String(req.body.token) });
    if (paymentSession.code !== 'available') return res.status(404).json({ success: false, code: paymentSession.code });
    requestId = paymentSession.session.requestId;
    requestSnap = await db.collection('serviceRequests').doc(requestId).get();
  }
  if (!requestSnap?.exists) return res.status(404).json({ success: false, message: 'Request not found.' });
  const request = requestSnap.data() || {};
  if (!(await isCustomerRequestPrincipalOwnedByUid(caller.uid, request.customerId))) return res.status(403).json({ success: false, message: 'Saved cards require the verified request owner account.' });
  const card = await getServerPaymentMethod({ db, admin, uid: caller.uid, methodId: String(req.body?.paymentMethodId || '') });
  if (card?.reusable !== true || !String(card.paystackAuthorizationCode || '').trim()) return res.status(404).json({ success: false, code: 'saved-card-unavailable', message: 'That saved card is unavailable.' });
  if (!paymentSession) {
    const created = await createServicePaymentSession({ db, requestId, customerId: request.customerId, principalId: caller.uid, principalType: 'firebase_uid' });
    if (created.code !== 'created') return res.status(409).json({ success: false, code: created.code });
    paymentSession = await resolveServicePaymentSession({ db, token: created.token });
  }
  const resolved = paymentSession;
  const begun = await beginServicePaymentAttempt({ db, admin, sessionRef: resolved.sessionRef, session: resolved.session, method: 'saved_card', selectedCardId: card.id, idempotencyKey: String(req.body?.idempotencyKey || randomUUID()) });
  if (!['created', 'existing'].includes(begun.action)) return res.status(409).json({ success: false, code: begun.action });
  return res.status(200).json({ success: true, requestId, amount: Number(begun.attempt.amount), attemptId: begun.attempt.attemptId, status: begun.attempt.status, card: { id: card.id, brand: String(card.brand || 'Card'), last4: String(card.last4 || '').slice(-4) } });
});

exports.confirmSavedCardServicePayment = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  if (!requestPaymentsEnabled()) return paymentFeatureUnavailable(res);
  if (req.body?.confirmed !== true) return res.status(400).json({ success: false, code: 'explicit-confirmation-required', message: 'Confirm this saved-card payment before it can be charged.' });
  const caller = await getOptionalPaymentCaller(req);
  if (!caller?.uid) return res.status(401).json({ success: false, message: 'Sign in before authorising a saved-card charge.' });
  const requestId = String(req.body?.requestId || '');
  const attemptId = String(req.body?.attemptId || '');
  const paymentSnap = await db.collection(PAYMENT_OPERATIONS).doc(requestId).get();
  const attemptSnap = await db.collection(PAYMENT_OPERATIONS).doc(requestId).collection('attempts').doc(attemptId).get();
  if (!paymentSnap.exists || !attemptSnap.exists) return res.status(404).json({ success: false, message: 'Payment confirmation not found.' });
  const attempt = attemptSnap.data() || {};
  if (!(await isCustomerRequestPrincipalOwnedByUid(caller.uid, attempt.customerId))) return res.status(403).json({ success: false, message: 'Not allowed.' });
  const userSnap = await db.collection('users').doc(caller.uid).get();
  const card = await getServerPaymentMethod({ db, admin, uid: caller.uid, methodId: String(attempt.selectedCardId || '') });
  if (!card) return res.status(404).json({ success: false, code: 'saved-card-unavailable' });
  const paymentEmail = isValidCustomerEmail(userSnap.data()?.email || caller.email);
  if (!paymentEmail) return res.status(422).json({ success: false, code: 'email-required', message: 'Add a valid email address to your Uncedo account before using a saved card.' });
  let paystackSecretKey = '';
  try { paystackSecretKey = getPaymentsSecrets().PAYSTACK_SECRET_KEY; } catch { return res.status(503).json({ success: false, code: 'payments-unavailable' }); }
  const reference = String(attempt.gatewayReference || getRequestPaymentReference(requestId, attemptId));
  const claim = await claimSavedCardPayment({ db, admin, requestId, attemptId, gatewayReference: reference });
  if (!['charge', 'reconcile'].includes(claim.action)) return res.status(claim.action === 'already-paid' ? 200 : 409).json({ success: claim.action === 'already-paid', status: claim.action });
  const outcome = await executeServiceChargeAttempt({
    operation: { ...claim.attempt, requestId, operationId: `payment_${requestId}`, gatewayReference: reference },
    action: claim.action,
    email: paymentEmail,
    authorizationCode: card.paystackAuthorizationCode,
    paystack: {
      chargeAuthorization: (input) => chargeAuthorizationWithPaystack({ paystackSecretKey, ...input }),
      verifyTransaction: (input) => verifyPaystackTransaction({ paystackSecretKey, ...input }),
    },
  });
  const settled = await settleRequestPayment({ db, admin, requestId, attemptId, outcome: outcome.outcome, gatewayTransactionId: outcome.transaction?.id ? String(outcome.transaction.id) : '', gatewayReference: reference, providerStatus: outcome.transaction?.status || outcome.outcome, walletEnabled: helperWalletEnabled() });
  if (['settled', 'already-paid'].includes(settled.action)) await issuePaidRequestPostEffects({ requestId, paymentResult: settled });
  return res.status(200).json({ success: ['settled', 'already-paid'].includes(settled.action), status: settled.action === 'settled' || settled.action === 'already-paid' ? 'paid' : settled.action === 'failed' ? 'payment_failed' : 'payment_reconciliation_required', receiptId: settled.receiptId || null });
});

exports.cancelSavedCardPaymentConfirmation = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 20 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  if (!requestPaymentsEnabled()) return paymentFeatureUnavailable(res);
  const caller = await getOptionalPaymentCaller(req);
  if (!caller?.uid) return res.status(401).json({ success: false, message: 'Sign in before changing a saved-card payment selection.' });
  const requestId = String(req.body?.requestId || '');
  const requestSnap = requestId ? await db.collection('serviceRequests').doc(requestId).get() : null;
  if (!requestSnap?.exists || !(await isCustomerRequestPrincipalOwnedByUid(caller.uid, requestSnap.data()?.customerId))) return res.status(403).json({ success: false, message: 'Not allowed.' });
  const result = await cancelSavedCardPaymentConfirmation({ db, admin, requestId, customerId: requestSnap.data()?.customerId, attemptId: String(req.body?.attemptId || '') });
  return res.status(result.action === 'cancelled' ? 200 : 409).json({ success: result.action === 'cancelled', code: result.action });
});

exports.getServicePaymentReceipt = onRequest({ cors: true, maxInstances: 5, ...HALF_CPU_OPTIONS, timeoutSeconds: 15 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  const token = String(req.body?.token || '').trim();
  const requestId = String(req.body?.requestId || '').trim();
  const caller = await getOptionalPaymentCaller(req);
  let resolved = null;
  if (token) resolved = await resolveServicePaymentSession({ db, token });
  else if (caller?.uid && requestId) {
    const requestRef = db.collection('serviceRequests').doc(requestId);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists || !(await isCustomerRequestPrincipalOwnedByUid(caller.uid, requestSnap.data()?.customerId))) return res.status(403).json({ success: false, message: 'Not allowed.' });
    const [paymentSnap, legacySnap] = await Promise.all([db.collection(PAYMENT_OPERATIONS).doc(requestId).get(), db.collection(FINANCIAL_OPERATIONS).doc(serviceFinancialOperationId(requestId)).get()]);
    resolved = { code: 'available', request: { id: requestId, ...requestSnap.data() }, paymentOperation: paymentSnap.exists ? paymentSnap.data() : null, legacyOperation: legacySnap.exists ? legacySnap.data() : null };
  }
  if (!resolved || resolved.code !== 'available') return res.status(404).json({ success: false, message: 'Payment receipt not found.' });
  const requestIdResolved = String(resolved.request.id || resolved.session?.requestId || requestId);
  const receipt = safePaymentReceipt({ requestId: requestIdResolved, operation: resolved.paymentOperation, request: resolved.request });
  if (!receipt && resolved.legacyOperation?.paymentStatus === 'paid') {
    const legacy = resolved.legacyOperation;
    return res.status(200).json({ success: true, receipt: { receiptId: String(legacy.gatewayTransactionId || legacy.operationId || ''), requestReference: String(resolved.request.publicRequestReference || requestIdResolved), requestId: requestIdResolved, service: String(resolved.request.subject || 'Uncedo service'), amount: Number(legacy.amount || 0), currency: 'ZAR', method: 'paystack', paidAtMs: Number(legacy.settledAtMs || 0), gatewayReference: String(legacy.gatewayReference || ''), status: 'paid' } });
  }
  if (!receipt) return res.status(409).json({ success: false, message: 'A verified payment receipt is not available.' });
  res.set('Cache-Control', 'no-store, private');
  return res.status(200).json({ success: true, receipt });
});

exports.paystackServicePaymentWebhook = onRequest({ cors: false, maxInstances: 3, ...HALF_CPU_OPTIONS, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  let secret;
  try { secret = getPaymentsSecrets().PAYSTACK_SECRET_KEY; } catch { return res.status(503).send('Payment provider unavailable'); }
  const supplied = String(req.get('x-paystack-signature') || '').trim();
  const rawBody = req.rawBody;
  if (!Buffer.isBuffer(rawBody) || !/^[a-f0-9]{128}$/i.test(supplied)) return res.status(401).send('Invalid signature');
  const expected = createHmac('sha512', secret).update(rawBody).digest();
  const actual = Buffer.from(supplied, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(401).send('Invalid signature');
  const event = req.body && typeof req.body === 'object' ? req.body : {};
  if (String(event.event || '') !== 'charge.success') return res.status(200).send('Ignored');
  const reference = String(event.data?.reference || '').trim();
  if (!reference) return res.status(200).send('Ignored');
  const refSnap = await db.collection('paystackRequestPaymentReferences').doc(reference).get();
  if (!refSnap.exists) return res.status(200).send('Unlinked');
  const mapped = refSnap.data() || {};
  const eventId = createHash('sha256').update(`${String(event.event)}:${reference}:${String(event.data?.id || '')}`).digest('hex');
  const webhookRef = db.collection('paystackWebhookEvents').doc(eventId);
  const lease = await db.runTransaction(async (tx) => {
    const snap = await tx.get(webhookRef);
    const current = snap.data() || {};
    if (snap.exists && current.status === 'processed') return false;
    if (snap.exists && Number(current.leaseExpiresAtMs || 0) > Date.now()) return false;
    tx.set(webhookRef, { eventId, eventName: String(event.event), reference, status: 'processing', leaseExpiresAtMs: Date.now() + 60_000, updatedAtMs: Date.now() }, { merge: true });
    return true;
  });
  if (!lease) return res.status(200).send('Already processing');
  try {
    await verifyAndSettleRequestPayment({ requestId: String(mapped.requestId || ''), attemptId: String(mapped.attemptId || ''), reference, paystackSecretKey: secret });
    await webhookRef.set({ status: 'processed', processedAtMs: Date.now(), leaseExpiresAtMs: null }, { merge: true });
    return res.status(200).send('Accepted');
  } catch (error) {
    await webhookRef.set({ status: 'retryable', lastErrorCode: String(error?.code || 'verification_failed').slice(0, 80), leaseExpiresAtMs: 0 }, { merge: true });
    return res.status(500).send('Retry');
  }
});

exports.submitServiceRequestRating = onRequest({ cors: true, ...HALF_CPU_OPTIONS }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ success: false, message: 'Method not allowed' }); return; }
  const token = getBearerToken(req); const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) { res.status(401).json({ success: false, message: 'Unauthorized request.' }); return; }
  try {
    const result = await submitServiceRequestRating({ db, admin, requestId: String(req.body?.requestId || '').trim(), raterUserId: decoded.uid, score: req.body?.score, comment: req.body?.comment || '' });
    await recalculateMembership({ db, admin, userId: result.ratedUserId, accountType: result.direction === 'customer_to_helper' ? ACCOUNT_TYPES.HELPER : ACCOUNT_TYPES.CUSTOMER }).catch(() => null);
    if (result.direction === 'customer_to_helper') {
      for (const serviceId of result.expandedServiceIds || []) {
        await recalculateMastery({ db, admin, helperId: result.ratedUserId, serviceId }).catch(() => null);
      }
    }
    res.status(200).json({ success: true, rating: result });
  } catch (error) { logger.warn('rating_validation_failed', { uid: decoded.uid, error: error.message }); res.status(400).json({ success: false, message: error.message }); }
});

exports.expireRewardPoints = onSchedule('every 24 hours', async () => processExpiredCustomerPoints({ db, admin, limit: 200 }));

async function chargeAuthorizationWithPaystack({ paystackSecretKey, email, amount, authorizationCode, reference, requestId, operationId }) {
  if (!authorizationCode) {
    return { attempted: false, ok: false, reason: 'missing_authorization' };
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
      reference,
      metadata: {
        uncedo_request_id: String(requestId || ''),
        uncedo_financial_operation_id: String(operationId || ''),
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const chargePayload = await chargeResponse.json().catch(() => ({}));
  const chargeData = chargePayload?.data || {};
  const succeeded = chargeResponse.ok && chargePayload?.status === true && chargeData?.status === 'success';

  return {
    attempted: true,
    ok: succeeded,
    reason: succeeded ? null : (chargePayload?.message || 'gateway_declined'),
    transactionId: chargeData?.id ? String(chargeData.id) : null,
    reference: chargeData?.reference || reference,
    gatewayStatus: String(chargeData?.status || '').toLowerCase(),
  };
}

async function verifyPaystackTransaction({ paystackSecretKey, reference, amountMinor, currency = 'ZAR' }) {
  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${paystackSecretKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return { outcome: 'unknown', reason: `verify_http_${response.status}` };
    return classifyPaystackTransaction(payload, { reference, amountMinor, currency });
  } catch (error) {
    return { outcome: 'unknown', reason: String(error?.code || 'verify_request_failed').slice(0, 120) };
  }
}

async function verifyPaystackTransfer({ paystackSecretKey, reference, amountMinor, currency = 'ZAR' }) {
  try {
    const response = await fetch(`https://api.paystack.co/transfer/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${paystackSecretKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return { outcome: 'unknown', reason: `verify_http_${response.status}` };
    return classifyPaystackTransfer(payload, { reference, amountMinor, currency });
  } catch (error) {
    return { outcome: 'unknown', reason: String(error?.code || 'verify_request_failed').slice(0, 120) };
  }
}

async function enqueueFinancialReconciliation({ operationId, operationType, attemptNo = 1, delaySeconds = 30, payoutId = null }) {
  const checkNo = Math.max(1, Number(attemptNo) || 1);
  const taskId = `financial-reconcile_${createHash('sha256').update(`${operationId}:${checkNo}`).digest('hex').slice(0, 32)}`;
  try {
    await getFunctions().taskQueue('reconcileFinancialOperation').enqueue({
      operationId,
      operationType,
      checkNo,
      ...(payoutId ? { payoutId } : {}),
    }, {
      id: taskId,
      scheduleDelaySeconds: Math.max(1, Math.min(Number(delaySeconds) || 30, 3600)),
      dispatchDeadlineSeconds: 60,
    });
    return true;
  } catch (error) {
    if (String(error?.code || '').includes('task-already-exists')) return true;
    logger.error('financial_operation_reconciliation_task_enqueue_failed', {
      operationId,
      operationType,
      checkNo,
      errorCode: String(error?.code || 'task_enqueue_failed').slice(0, 120),
    });
    return false;
  }
}

async function callPaystackApi({ paystackSecretKey, path, method = 'GET', body = null }) {
  const response = await fetch(`https://api.paystack.co${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${paystackSecretKey}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
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
  if (!['personal', 'business'].includes(input.accountType)) {
    throw new Error('Choose a personal or business payout account.');
  }
  if (input.accountType === 'business' && input.documentType !== 'businessRegistrationNumber') {
    throw new Error('A business registration number is required for business payout accounts.');
  }
  if (input.accountType === 'personal' && !['identityNumber', 'passportNumber'].includes(input.documentType)) {
    throw new Error('Choose South African ID or Passport for personal payout verification.');
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
    recipientCode: recipient?.data?.recipient_code || '',
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

exports.getHelperPayoutBanks = onRequest({ cors: true, ...HALF_CPU_OPTIONS }, async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  const token = getBearerToken(req);
  const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) {
    res.status(401).json({ success: false, message: 'Unauthorized request.' });
    return;
  }

  try {
    const userSnap = await db.collection('users').doc(decoded.uid).get();
    if (!userSnap.exists || !isHelperUserRecord(userSnap.data() || {})) {
      res.status(403).json({ success: false, message: 'A helper account is required.' });
      return;
    }

    const paymentsSecrets = getPaymentsSecrets();
    const result = await callPaystackApi({
      paystackSecretKey: paymentsSecrets.PAYSTACK_SECRET_KEY,
      path: '/bank?currency=ZAR&enabled_for_verification=true&perPage=100',
    });
    const banks = (Array.isArray(result?.data) ? result.data : [])
      .filter((bank) => bank?.active !== false && bank?.code && bank?.name)
      .map((bank) => ({
        code: String(bank.code),
        name: String(bank.name),
        supportedTypes: Array.isArray(bank.supported_types) ? bank.supported_types : [],
      }))
      .sort((left, right) => left.name.localeCompare(right.name));

    res.status(200).json({ success: true, banks });
  } catch (error) {
    logger.warn('helper_payout_banks_failed', { uid: decoded.uid, error: error.message });
    res.status(400).json({ success: false, message: error.message || 'Unable to load supported banks.' });
  }
});

exports.verifyHelperPayout = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  const token = getBearerToken(req);
  const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) {
    res.status(401).json({ success: false, message: 'Unauthorized request.' });
    return;
  }

  const userRef = db.collection('users').doc(decoded.uid);
  try {
    const userSnap = await userRef.get();
    if (!userSnap.exists || !isHelperUserRecord(userSnap.data() || {})) {
      res.status(403).json({ success: false, message: 'A helper account is required.' });
      return;
    }

    const user = userSnap.data() || {};
    const payoutInput = normalizePayoutInput(req.body?.payout || req.body || {});
    assertValidPayoutInput(payoutInput);

    const paymentsSecrets = getPaymentsSecrets();
    const verifiedPayout = await verifyAndCreateTutorTransferRecipient({
      paystackSecretKey: paymentsSecrets.PAYSTACK_SECRET_KEY,
      payout: payoutInput,
      email: decoded.email || user.email || '',
      uid: decoded.uid,
    });
    const payout = {
      ...verifiedPayout,
      documentNumber: admin.firestore.FieldValue.delete(),
      documentNumberLast4: payoutInput.documentNumber.slice(-4),
    };

    await userRef.set({
      payout,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const responsePayout = {
      ...verifiedPayout,
      documentNumber: '',
      documentNumberLast4: payoutInput.documentNumber.slice(-4),
    };
    res.status(200).json({
      success: true,
      message: verifiedPayout.verificationMessage || 'Payout account verified.',
      payout: responsePayout,
    });
  } catch (error) {
    logger.warn('helper_payout_verification_failed', { uid: decoded.uid, error: error.message });
    res.status(400).json({
      success: false,
      message: error.message || 'Unable to verify this payout account.',
    });
  }
});

async function runServiceFinancialOperation({
  operationRef,
  requestRef,
  helperId,
  action,
  operation,
  paystackSecretKey,
  email,
  authorizationCode,
}) {
  let providerRecord = null;
  let outcome;
  if (action === 'charge' && Number(operation.amountMinor || 0) > 0) {
    await enqueueFinancialReconciliation({
      operationId: operation.operationId,
      operationType: operation.operationType,
      attemptNo: 1,
      delaySeconds: 30,
    });
  }
  outcome = await executeServiceChargeAttempt({
    operation,
    action,
    email,
    authorizationCode,
    paystack: {
      chargeAuthorization: (input) => chargeAuthorizationWithPaystack({ paystackSecretKey, ...input }),
      verifyTransaction: (input) => verifyPaystackTransaction({ paystackSecretKey, ...input }),
    },
  });
  if (outcome.requestErrorCode) {
    logger.warn('paystack_service_charge_response_uncertain', {
      operationId: operation.operationId,
      reference: operation.gatewayReference,
      errorCode: outcome.requestErrorCode,
    });
  }
  providerRecord = outcome.transaction || null;

  if (outcome.outcome !== 'no_charge') {
    await recordServiceGatewayObservation({ db, operationRef, outcome });
  }
  const settlement = await settleServiceFinancialOperation({
    db,
    admin,
    operationRef,
    requestRef,
    helperRef: helperId ? db.collection('users').doc(helperId) : null,
    helperDispatchRef: helperId ? db.collection('helperDispatchIndex').doc(helperId) : null,
    outcome: outcome.outcome,
    transactionId: providerRecord?.id ? String(providerRecord.id) : null,
  });
  await runServiceFinancialPostEffects(operationRef).catch((error) => logger.error('service_financial_post_effects_failed', {
    operationId: operation.operationId,
    error: error.message,
  }));
  if (settlement.applied && ['pending', 'unknown'].includes(outcome.outcome)) {
    await enqueueFinancialReconciliation({
      operationId: operation.operationId,
      operationType: operation.operationType,
      attemptNo: 1,
      delaySeconds: 30,
    });
  }
  return { outcome, settlement };
}

async function runServiceFinancialPostEffects(operationRef) {
  const operationSnap = await operationRef.get();
  if (!operationSnap.exists) return;
  const operation = operationSnap.data() || {};
  if (!operation.settlementApplied) return;
  const settlementData = operation.settlementData || {};
  const requestRef = db.collection('serviceRequests').doc(operation.requestId);
  const requestSnap = await requestRef.get();
  const request = requestSnap.exists ? requestSnap.data() || {} : {};
  const operationId = operation.operationId;
  const requestId = operation.requestId;
  const customerId = String(settlementData.customerId || request.customerId || '');
  const helperId = String(settlementData.helperId || request.helperAssignment?.helperId || '');
  const outcome = String(operation.finalOutcome || 'unknown');
  const paymentStatus = String(operation.paymentStatus || request.paymentStatus || 'payment_reconciliation_required');
  const endedAt = Number(settlementData.endedAt || operation.updatedAtMs || Date.now());
  const success = outcome === 'success' || (outcome === 'no_charge' && paymentStatus === 'paid');

  if (operation.operationType === 'completion') {
    const payoutBreakdown = settlementData.helperPayoutBreakdown || {};
    await admin.database().ref(`liveTracking/serviceRequests/${requestId}`).update({
      status: 'completed', closedReason: 'completed', closedAtMs: endedAt, updatedAtMs: endedAt,
    }).catch((error) => logger.warn('service_completion_tracking_close_failed', { requestId, error: error.message }));
    await db.collection('customerServiceEvents').doc(`request_completed_${requestId}`).set({
      customerId,
      eventType: 'request_completed',
      serviceId: request.serviceIds?.[0] || request.selectedPackageId || request.categoryId || '',
      categoryId: request.categoryId || '',
      serviceIds: Array.isArray(request.serviceIds) ? request.serviceIds : [],
      requestId,
      source: 'finalizeServiceRequestBilling',
      metadata: {
        helperId,
        paymentStatus,
        totalAmount: Number(settlementData.totalAmount || 0),
        waitingCost: Number(settlementData.waitingCost || 0),
        helperPayoutAmount: Number(payoutBreakdown.helperAmount || 0),
        platformAmount: Number(payoutBreakdown.platformAmount || 0),
        requestStatus: 'completed',
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtMs: endedAt,
      dayBucket: new Date(endedAt).toISOString().slice(0, 10),
    }, { merge: true }).catch((error) => logger.warn('service_completion_event_write_failed', { requestId, error: error.message }));

    if (settlementData.redemptionId
      && ['success', 'failed_confirmed', 'reversed', 'no_charge'].includes(outcome)
      && !(settlementData.deferredPaymentSelection === true && paymentStatus !== 'paid')) {
      await finalizeServiceCredit({
        db,
        admin,
        requestId,
        paymentSucceeded: success,
        appliedPoints: Number(settlementData.serviceCreditPoints || 0),
        reason: success ? 'final_cap' : 'payment_failed',
      }).catch((error) => logger.error('service_credit_finalization_failed', {
        requestId,
        redemptionId: settlementData.redemptionId,
        error: error.message,
      }));
    }

    if (success && customerId) {
      const customerConfig = await getRewardConfig(db, 'customer');
      const helperConfig = await getRewardConfig(db, 'helper');
      const updatedRequest = { id: requestId, ...request };
      const expandedServiceIds = serviceIdsFor(updatedRequest);
      await applyRewardTransaction({ db, admin, userId: customerId, accountType: ACCOUNT_TYPES.CUSTOMER, direction: REWARD_TRANSACTION_DIRECTIONS.CREDIT, points: Number(customerConfig.rewards?.completedPaidBooking || 50), reasonCode: REWARD_REASON_CODES.CUSTOMER_COMPLETED_PAID_BOOKING, reasonLabel: 'Completed paid booking', sourceType: 'service_request', sourceId: requestId, idempotencyKey: `customer:${customerId}:request:${requestId}:completed-paid`, requestId, categoryId: request.categoryId || '', serviceIds: expandedServiceIds, primaryServiceId: expandedServiceIds[0] || '', notifyUser: true }).catch((error) => logger.warn('customer_booking_reward_failed', { requestId, error: error.message }));
      const firstBookingRewardResult = await applyRewardTransaction({ db, admin, userId: customerId, accountType: ACCOUNT_TYPES.CUSTOMER, direction: REWARD_TRANSACTION_DIRECTIONS.CREDIT, points: Number(customerConfig.rewards?.firstCompletedPaidBooking || 100), reasonCode: REWARD_REASON_CODES.CUSTOMER_FIRST_COMPLETED_PAID_BOOKING, reasonLabel: 'First completed paid booking', sourceType: 'service_request', sourceId: requestId, idempotencyKey: `customer:${customerId}:request:first-booking-bonus`, requestId, categoryId: request.categoryId || '', serviceIds: expandedServiceIds, primaryServiceId: expandedServiceIds[0] || '', notifyUser: true }).catch((error) => { logger.info('first_booking_bonus_skipped_or_failed', { requestId, error: error.message }); return null; });
      await incrementCompletedPaid({ db, admin, userId: customerId, accountType: ACCOUNT_TYPES.CUSTOMER, requestId }).catch((error) => logger.warn('customer_membership_recalc_failed', { requestId, error: error.message }));
      if (helperId) {
        await applyRewardTransaction({ db, admin, userId: helperId, accountType: ACCOUNT_TYPES.HELPER, direction: REWARD_TRANSACTION_DIRECTIONS.CREDIT, points: Number(helperConfig.rewards?.completedPaidJob || 50), reasonCode: REWARD_REASON_CODES.HELPER_COMPLETED_PAID_JOB, reasonLabel: 'Completed paid job', sourceType: 'service_request', sourceId: requestId, idempotencyKey: `helper:${helperId}:request:${requestId}:completed-paid`, requestId, relatedUserId: customerId, categoryId: request.categoryId || '', serviceIds: expandedServiceIds, primaryServiceId: expandedServiceIds[0] || '', notifyUser: true }).catch((error) => logger.warn('helper_booking_reward_failed', { requestId, helperId, error: error.message }));
        await incrementCompletedPaid({ db, admin, userId: helperId, accountType: ACCOUNT_TYPES.HELPER, requestId, serviceIds: expandedServiceIds, categoryId: request.categoryId || '' }).catch((error) => logger.warn('helper_mastery_recalc_failed', { requestId, helperId, error: error.message }));
      }
      if (firstBookingRewardResult) {
        await awardReferralStage({ db, admin, referredUserId: customerId, stage: 2, requestId }).catch((error) => logger.warn('referral_stage_two_failed', { requestId, error: error.message }));
      }
    }

    await createUserNotificationOnce({
      notificationId: `financial_${operationId}_completion_${customerId}`,
      userId: customerId,
      title: 'Service completed',
      message: `Your service request for ${request.subject || 'help'} was marked as completed. Total: ${formatMoney(settlementData.totalAmount || 0)}.${paymentStatus === 'payment_reconciliation_required' ? ' The payment result is still being verified.' : ''}`,
      type: 'service_completed',
      requestId,
      targetPath: `/customer/requests/${requestId}`,
      metadata: { paymentStatus, totalAmount: Number(settlementData.totalAmount || 0) },
    }).catch((error) => logger.warn('service_completion_customer_notification_failed', { requestId, error: error.message }));
    if (helperId) {
      await createUserNotificationOnce({
        notificationId: `financial_${operationId}_completion_${helperId}`,
        userId: helperId,
        title: 'Job completed',
        message: `Your job for ${request.customerName || 'Customer'} was marked as completed. Helper earnings recorded: ${formatMoney(payoutBreakdown.helperAmount || 0)}.`,
        type: 'job_completed',
        requestId,
        targetPath: `/provider/jobs/${requestId}`,
      }).catch((error) => logger.warn('service_completion_helper_notification_failed', { requestId, error: error.message }));
    }
  } else if (operation.operationType === 'customer_cancellation') {
    const cancellation = settlementData.cancellation || {};
    await admin.database().ref(`liveTracking/serviceRequests/${requestId}`).update({
      status: 'canceled',
      closedReason: cancellation.liveTrackingClosedReason || 'customer_canceled',
      closedAtMs: endedAt,
      updatedAtMs: endedAt,
    }).catch(() => null);
    await db.collection('customerServiceEvents').doc(`request_canceled_${requestId}`).set({
      customerId,
      eventType: 'request_canceled',
      serviceId: request.serviceIds?.[0] || request.selectedPackageId || request.categoryId || '',
      categoryId: request.categoryId || '',
      serviceIds: Array.isArray(request.serviceIds) ? request.serviceIds : [],
      requestId,
      source: 'billCustomerServiceCancellation',
      metadata: {
        helperId,
        paymentStatus,
        cancellationAmount: Number(cancellation.cancellationAmount || 0),
        cancellationBillingRule: cancellation.cancellationBillingRule || 'pre_assignment',
        cancellationDistanceKm: Number(cancellation.cancellationDistanceKm || 0),
        helperPayoutAmount: Number(cancellation.helperPayoutBreakdown?.helperAmount || 0),
        platformAmount: Number(cancellation.helperPayoutBreakdown?.platformAmount || 0),
        requestStatus: 'canceled',
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtMs: endedAt,
      dayBucket: new Date(endedAt).toISOString().slice(0, 10),
    }, { merge: true }).catch((error) => logger.warn('service_cancellation_event_write_failed', { requestId, error: error.message }));
    await createUserNotificationOnce({
      notificationId: `financial_${operationId}_cancellation_${customerId}`,
      userId: customerId,
      title: 'Service canceled',
      message: Number(cancellation.cancellationAmount || 0) > 0
        ? `Your service request was canceled. Cancellation fee: ${formatMoney(cancellation.cancellationAmount)}.${paymentStatus === 'payment_reconciliation_required' ? ' The payment result is still being verified.' : ''}`
        : `Your service request was canceled.${paymentStatus === 'payment_reconciliation_required' ? ' The payment result is still being verified.' : ''}`,
      type: 'service_canceled',
      requestId,
      targetPath: `/customer/requests/${requestId}`,
      metadata: { paymentStatus, cancellationAmount: Number(cancellation.cancellationAmount || 0) },
    }).catch((error) => logger.warn('service_cancellation_customer_notification_failed', { requestId, error: error.message }));
    if (helperId) {
      await createUserNotificationOnce({
        notificationId: `financial_${operationId}_cancellation_${helperId}`,
        userId: helperId,
        title: 'Job canceled',
        message: `${request.customerName || 'The customer'} canceled this job. Helper earnings recorded: ${formatMoney(cancellation.helperPayoutBreakdown?.helperAmount || 0)}.`,
        type: 'job_canceled',
        requestId,
        targetPath: `/provider/jobs/${requestId}`,
      }).catch((error) => logger.warn('service_cancellation_helper_notification_failed', { requestId, error: error.message }));
    }
  }

  if (operation.finalOutcome === 'success' && operation.previousFinalOutcome && operation.previousFinalOutcome !== 'success') {
    await createUserNotificationOnce({
      notificationId: `financial_${operationId}_reconciled_success_${customerId}`,
      userId: customerId,
      title: 'Payment confirmed',
      message: 'The payment for your service request has now been confirmed.',
      type: 'payment_confirmed',
      requestId,
      targetPath: `/customer/requests/${requestId}`,
      metadata: { paymentStatus: 'paid' },
    }).catch(() => null);
  }
}

async function isCustomerRequestPrincipalOwnedByUid(uid, customerId) {
  const normalizedUid = String(uid || '').trim();
  const normalizedCustomerId = String(customerId || '').trim();
  if (!normalizedUid || !normalizedCustomerId) return false;
  if (normalizedUid === normalizedCustomerId) return true;
  const ownerSnap = await db.collection('whatsappGuestOwnership').doc(normalizedCustomerId).get().catch(() => null);
  return Boolean(ownerSnap?.exists && String(ownerSnap.data()?.uid || '') === normalizedUid);
}

exports.finalizeServiceRequestBilling = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  const token = getBearerToken(req);
  const decoded = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) return res.status(401).json({ success: false, message: 'Unauthorized request.' });
  const requestId = String(req.body?.requestId || '').trim();
  if (!requestId) return res.status(400).json({ success: false, message: 'Missing requestId.' });

  const requestRef = db.collection('serviceRequests').doc(requestId);
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists) return res.status(404).json({ success: false, message: 'Service request not found.' });
  const request = requestSnap.data() || {};
  const helperId = String(request.helperAssignment?.helperId || '').trim();
  if (decoded.uid !== helperId && !(await isCustomerRequestPrincipalOwnedByUid(decoded.uid, request.customerId))) {
    return res.status(403).json({ success: false, message: 'Not allowed to finalize billing for this request.' });
  }
  const operationId = serviceFinancialOperationId(requestId);
  const operationRef = db.collection(FINANCIAL_OPERATIONS_COLLECTION).doc(operationId);
  const existingOperation = await operationRef.get();
  const deferCompletionPayment = shouldDeferCompletionPayment(request, existingOperation.exists ? existingOperation.data() : null);
  if (['completed', 'canceled', 'cancelled'].includes(String(request.status || '').toLowerCase())
    && existingOperation.exists
    && existingOperation.data()?.operationType !== 'completion') {
    return res.status(200).json({ success: true, request: { id: requestId, ...request }, charge: { ok: request.paymentStatus === 'paid', reason: null } });
  }
  if (['completed', 'canceled', 'cancelled'].includes(String(request.status || '').toLowerCase()) && !existingOperation.exists) {
    return res.status(200).json({ success: true, request: { id: requestId, ...request }, charge: { ok: true, reason: null } });
  }

  let settlementData = null;
  let cashChargeAmount = 0;
  let selectedCard = null;
  let customerData = {};
  if (!existingOperation.exists) {
    const endedAt = Date.now();
    const arrivedAtMs = timestampToMillis(request.arrivedAt || request.helperAssignment?.arrivedAt);
    const workStartedAtMs = timestampToMillis(request.workStartedAt || request.helperAssignment?.workStartedAt);
    let waitingMinutes = 0;
    let waitingCost = 0;
    if (arrivedAtMs && workStartedAtMs && workStartedAtMs > arrivedAtMs) {
      waitingMinutes = Number(((workStartedAtMs - arrivedAtMs) / 60000).toFixed(2));
      if (waitingMinutes > 2) waitingCost = Math.round(waitingMinutes - 2) * 1.00;
    }
    const quoteTotal = toRand(request.pricingSnapshot?.total ?? request.pricingSnapshot?.totalAmount ?? request.pricingSnapshot?.finalAmount ?? request.pricingSnapshot?.finalPrice ?? 0);
    const subtotal = getServiceQuoteSubtotal(request);
    const travelFee = getServiceTravelFee(request);
    const bookingFee = getServiceBookingFee(request);
    const helperPayoutBreakdown = getServiceHelperPayoutBreakdown(request, { closureType: 'completed', waitingCost, travelFeeAmount: travelFee, bookingFeeAmount: bookingFee });
    const totalAmount = helperPayoutBreakdown.customerChargeAmount || toRand(quoteTotal + waitingCost + bookingFee);
    const redemptionId = String(request.serviceCreditRedemptionId || '').trim();
    let serviceCreditAmount = 0;
    let serviceCreditPoints = 0;
    if (redemptionId) {
      const redemptionSnap = await db.collection('serviceCreditRedemptions').doc(redemptionId).get();
      const redemption = redemptionSnap.data() || {};
      if (!redemptionSnap.exists || redemption.userId !== request.customerId || redemption.requestId !== requestId || redemption.status !== 'reserved') {
        return res.status(409).json({ success: false, message: 'The service-credit reservation is no longer valid.' });
      }
      const globalRewardConfig = await getRewardConfig(db, 'global');
      const pointsPerRand = Math.max(1, Number(globalRewardConfig.pointsPerRand || 10));
      const redemptionIncrement = Math.max(1, Number(globalRewardConfig.redemptionIncrementPoints || 10));
      const eligibleSubtotal = Math.max(0, Number(quoteTotal || 0));
      const percentageCap = eligibleSubtotal * (Number(globalRewardConfig.maximumServiceCreditPercentagePerBooking || 20) / 100);
      const randCap = Number(globalRewardConfig.maximumServiceCreditRandPerBooking || 0);
      const maxCreditRand = randCap > 0 ? Math.min(percentageCap, randCap) : percentageCap;
      const maximumPoints = Math.floor((maxCreditRand * pointsPerRand) / redemptionIncrement) * redemptionIncrement;
      serviceCreditPoints = Math.max(0, Math.min(Number(redemption.points || 0), maximumPoints));
      serviceCreditAmount = toRand(serviceCreditPoints / pointsPerRand);
    }
    cashChargeAmount = toRand(Math.max(0, totalAmount - serviceCreditAmount));
    if (!deferCompletionPayment) {
      const customerSnap = await db.collection('users').doc(request.customerId).get();
      customerData = customerSnap.data() || {};
      const paymentMethods = (await getServerPaymentMethods({ db, admin, uid: request.customerId }))
        .filter((method) => String(method.paystackAuthorizationCode || '').trim());
      const selectedCardId = request.selectedCardId || request.requestPayload?.selectedCardId || null;
      selectedCard = paymentMethods.find((card) => card.id === selectedCardId)
        || paymentMethods.find((card) => card.isDefault)
        || paymentMethods[0]
        || null;
    }
    settlementData = {
      customerId: String(request.customerId || ''),
      helperId,
      endedAt,
      noChargePaymentStatus: deferCompletionPayment && cashChargeAmount > 0 ? 'unpaid' : 'paid',
      ...(deferCompletionPayment ? { deferredPaymentSelection: true } : {}),
      totalAmount,
      waitingMinutes,
      waitingCost,
      serviceCreditAmount,
      serviceCreditPoints,
      redemptionId: redemptionId || null,
      selectedCardId: selectedCard?.id || null,
      chargedCardLast4: selectedCard?.last4 || null,
      helperPayoutBreakdown: { ...helperPayoutBreakdown, finalizedAt: new Date(endedAt).toISOString() },
      requestPatch: {
        status: 'completed',
        statusDetail: 'Service completed and billing finalized.',
        endedAt,
        waitingMinutes,
        waitingCost,
        totalAmount,
        pricingSnapshot: {
          ...(request.pricingSnapshot || {}),
          subtotal, travelFee, bookingFee,
          bookingFeeRate: SERVICE_BOOKING_FEE_RATE,
          bookingFeeCap: SERVICE_BOOKING_FEE_CAP,
          waitingMinutes, waitingCost, serviceCreditAmount, serviceCreditPoints,
          cashChargeAmount,
          finalAmount: totalAmount,
          finalizedAt: new Date(endedAt).toISOString(),
        },
        helperPayoutBreakdown: { ...helperPayoutBreakdown, finalizedAt: new Date(endedAt).toISOString() },
        ...(deferCompletionPayment ? {} : { chargedCardLast4: selectedCard?.last4 || null }),
      },
    };
  }

  if (existingOperation.exists && existingOperation.data()?.status === 'settled_failed' && req.body?.retryConfirmedFailure === true) {
    const customerSnap = await db.collection('users').doc(request.customerId).get();
    customerData = customerSnap.data() || {};
    const paymentMethods = (await getServerPaymentMethods({ db, admin, uid: request.customerId }))
      .filter((method) => String(method.paystackAuthorizationCode || '').trim());
    const selectedCardId = existingOperation.data()?.settlementData?.selectedCardId || null;
    selectedCard = paymentMethods.find((card) => card.id === selectedCardId) || null;
  }

  let paymentsSecrets = { PAYSTACK_SECRET_KEY: '' };
  const existingOperationData = existingOperation.exists ? existingOperation.data() || {} : null;
  const existingOperationStatus = String(existingOperationData?.status || '').toLowerCase();
  const needsPaystack = deferCompletionPayment ? false : existingOperation.exists
    ? (['processing', 'gateway_succeeded', 'gateway_failed_confirmed', 'gateway_reversed', 'reconciliation_required'].includes(existingOperationStatus)
      || (existingOperationStatus === 'settled_failed' && req.body?.retryConfirmedFailure === true))
    : cashChargeAmount > 0;
  if (needsPaystack && Number(existingOperationData?.amountMinor || Math.round(cashChargeAmount * 100)) > 0) {
    try {
      paymentsSecrets = getPaymentsSecrets();
    } catch (error) {
      logger.error('Payment configuration is unavailable during service request billing.', { requestId, error: error.message });
      return res.status(500).json({ success: false, message: 'Payment configuration is unavailable.' });
    }
  }

  try {
    const claim = await claimServiceFinancialOperation({
      db,
      requestRef,
      requestId,
      operationType: 'completion',
      amount: existingOperation.exists ? Number(existingOperation.data()?.amount || 0) : cashChargeAmount,
      currency: 'ZAR',
      settlementData,
      allowRetry: req.body?.retryConfirmedFailure === true,
    });
    if (claim.action === 'conflict') return res.status(409).json({ success: false, message: 'A conflicting request financial operation already exists.' });
    if (claim.action === 'legacy_terminal') return res.status(200).json({ success: true, request: { id: requestId, ...claim.request }, charge: { ok: true, reason: null } });
    if (claim.action === 'missing_request') return res.status(404).json({ success: false, message: 'Service request not found.' });
    if (deferCompletionPayment && ['charge', 'reconcile'].includes(claim.action)) {
      const settlement = await settleServiceFinancialOperation({
        db,
        admin,
        operationRef: claim.operationRef,
        requestRef,
        helperRef: helperId ? db.collection('users').doc(helperId) : null,
        helperDispatchRef: helperId ? db.collection('helperDispatchIndex').doc(helperId) : null,
        outcome: 'no_charge',
      });
      if (!settlement.applied && !settlement.duplicate) return res.status(409).json({ success: false, message: 'The service was completed, but payment selection needs reconciliation.' });
      await runServiceFinancialPostEffects(claim.operationRef);
      const current = await requestRef.get();
      return res.status(200).json({
        success: true,
        request: { id: requestId, ...current.data() },
        charge: { ok: true, paymentRequired: String(current.data()?.paymentStatus || '').toLowerCase() !== 'paid', paymentStatus: current.data()?.paymentStatus || 'unpaid' },
      });
    }
    if (claim.action === 'confirmed_failure' || claim.action === 'settled') {
      await runServiceFinancialPostEffects(claim.operationRef);
      const current = await requestRef.get();
      const op = claim.operation || {};
      return res.status(200).json({ success: true, request: { id: requestId, ...current.data() }, charge: { ok: op.finalOutcome === 'success' || op.finalOutcome === 'no_charge', reason: op.reconciliationReason || null, pendingReconciliation: false } });
    }
    if (!['charge', 'reconcile'].includes(claim.action)) return res.status(409).json({ success: false, message: 'The request financial operation could not be claimed.' });

    const operation = claim.operation || {};
    const existingStatus = String(operation.status || '');
    if (claim.action === 'reconcile' && ['settled_failed', 'settled_success', 'settled_no_charge'].includes(existingStatus)) {
      await runServiceFinancialPostEffects(claim.operationRef);
      const current = await requestRef.get();
      return res.status(200).json({ success: true, request: { id: requestId, ...current.data() }, charge: { ok: operation.finalOutcome === 'success' || operation.finalOutcome === 'no_charge', reason: operation.reconciliationReason || null } });
    }
    const activeCustomer = customerData && Object.keys(customerData).length
      ? customerData
      : (await db.collection('users').doc(request.customerId).get()).data() || {};
    const { outcome, settlement } = await runServiceFinancialOperation({
      operationRef: claim.operationRef,
      requestRef,
      helperId: operation.operationType === 'completion' ? String(operation.settlementData?.helperId || helperId) : '',
      action: claim.action,
      operation,
      paystackSecretKey: paymentsSecrets.PAYSTACK_SECRET_KEY,
      email: activeCustomer.email || request.customerEmail || '',
      authorizationCode: selectedCard?.paystackAuthorizationCode || '',
    });
    const current = await requestRef.get();
    const updatedRequest = current.exists ? { id: current.id, ...current.data() } : null;
    return res.status(200).json({
      success: true,
      request: updatedRequest,
      charge: {
        ok: outcome.outcome === 'success' || outcome.outcome === 'no_charge',
        reason: outcome.reason || null,
        pendingReconciliation: ['pending', 'unknown'].includes(outcome.outcome),
      },
      settlement: settlement || null,
    });
  } catch (error) {
    logger.error('service_request_billing_operation_failed', { requestId, error: error.message });
    return res.status(500).json({ success: false, message: 'Unable to finalize billing right now. The payment operation is protected from duplicate charging and may require reconciliation.' });
  }
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

async function getCustomerCancellationTerms(requestRef, request) {
  const status = String(request?.status || '').trim().toLowerCase();
  if (isPreAssignmentServiceRequestStatus(status)) {
    return calculateCustomerCancellationTerms({ request });
  }
  if (!isPostAssignmentServiceRequestStatus(status)) {
    return calculateCustomerCancellationTerms({ request });
  }
  const [trackingSnap, liveTrackingSnap] = await Promise.all([
    requestRef.collection('tracking').doc('live').get().catch(() => null),
    admin.database().ref(`liveTracking/serviceRequests/${requestRef.id}`).get().catch(() => null),
  ]);
  const trackingData = trackingSnap?.exists ? trackingSnap.data() || {} : {};
  const liveTrackingData = liveTrackingSnap?.exists() ? liveTrackingSnap.val() || {} : {};
  const distanceTravelledMeters = Number(
    request?.travelTracking?.distanceTravelledMeters
    || trackingData?.distanceTravelledMeters
    || liveTrackingData?.distanceTravelledMeters
    || 0,
  );
  return calculateCustomerCancellationTerms({
    request,
    distanceTravelledMeters,
    bookingFee: getServiceBookingFee(request),
    travelFee: getServiceTravelFee(request),
    travelRatePerKm: SERVICE_TRAVEL_RATE_PER_KM,
    toMoney: toRand,
    payoutBreakdown: (options) => getServiceHelperPayoutBreakdown(request, { closureType: 'canceled', ...options }),
  });
}

async function getWhatsAppIdentityForCurrentSender(identityId, eventIdentity) {
  const safeIdentityId = String(identityId || '').trim();
  if (!safeIdentityId || !eventIdentity?.waId || !eventIdentity?.phoneNumberId) return null;
  const snapshot = await db.collection('whatsappIdentities').doc(safeIdentityId).get();
  if (!snapshot.exists) return null;
  const currentIdentity = snapshot.data() || {};
  if (String(currentIdentity.waId || '') !== String(eventIdentity.waId || '')
    || String(currentIdentity.phoneNumberId || '') !== String(eventIdentity.phoneNumberId || '')) return null;
  return currentIdentity;
}

async function getWhatsAppCustomerCancellationPreview({ identityId, identity, requestId }) {
  const currentIdentity = await getWhatsAppIdentityForCurrentSender(identityId, identity);
  if (!currentIdentity) return { code: 'identity-not-found' };
  const access = await getWhatsAppRequestForIdentity({ db, identity: currentIdentity, requestId });
  if (access.code !== 'found') return { code: access.code };
  const requestRef = db.collection('serviceRequests').doc(access.request.id);
  const terms = await getCustomerCancellationTerms(requestRef, access.request);
  return { ...terms, requestId: access.request.id };
}

async function handleCustomerServiceCancellation(req, res, internalPrincipal = null) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  const token = internalPrincipal ? '' : getBearerToken(req);
  const decoded = internalPrincipal?.uid
    ? internalPrincipal
    : token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded?.uid) return res.status(401).json({ success: false, message: 'Unauthorized request.' });
  const rawRequestId = String(req.body?.requestId || '').trim();
  const canceledReason = String(req.body?.reason || '').trim();
  if (!rawRequestId) return res.status(400).json({ success: false, message: 'Missing requestId.' });

  const resolvedRequest = await resolveServiceRequestSnapshot(rawRequestId);
  const { requestId, requestRef, requestSnap } = resolvedRequest;
  if (!requestRef || !requestSnap?.exists) return res.status(404).json({ success: false, message: 'Service request not found.' });
  const request = requestSnap.data() || {};
  if (!(await isCustomerRequestPrincipalOwnedByUid(decoded.uid, request.customerId))) return res.status(403).json({ success: false, message: 'Only the customer can cancel this request.' });

  const operationId = serviceFinancialOperationId(requestId);
  const operationRef = db.collection(FINANCIAL_OPERATIONS_COLLECTION).doc(operationId);
  const existingOperation = await operationRef.get();
  if (['completed', 'canceled', 'cancelled'].includes(String(request.status || '').toLowerCase())
    && existingOperation.exists
    && existingOperation.data()?.operationType !== 'customer_cancellation') {
    return res.status(200).json({ success: true, request: { id: requestId, ...request } });
  }
  if (['completed', 'canceled', 'cancelled'].includes(String(request.status || '').toLowerCase()) && !existingOperation.exists) {
    return res.status(200).json({ success: true, request: { id: requestId, ...request } });
  }

  let settlementData = null;
  let cancellationAmount = 0;
  let selectedCard = null;
  let customerData = {};
  if (!existingOperation.exists) {
    const helperId = String(request.helperAssignment?.helperId || '').trim();
    const status = String(request.status || '').toLowerCase();
    const endedAt = Date.now();
    const cancellationTerms = await getCustomerCancellationTerms(requestRef, request);
    if (cancellationTerms.code !== 'eligible') {
      return res.status(409).json({ success: false, code: cancellationTerms.code, message: 'This request cannot be canceled from its current state.' });
    }
    if (req.body?.expectedCancellation
      && !cancellationQuoteMatches(req.body.expectedCancellation, cancellationTerms)) {
      return res.status(409).json({
        success: false,
        code: 'cancellation-terms-changed',
        message: 'The request state or cancellation fee changed. Review the updated fee and confirm again.',
        cancellationPreview: {
          status: cancellationTerms.status,
          cancellationAmount: cancellationTerms.cancellationAmount,
          currency: 'ZAR',
          billingRule: cancellationTerms.billingRule,
        },
      });
    }
    if (isPreAssignmentServiceRequestStatus(status)) {
      const cancellation = {
        requestId,
        helperId: '',
        endedAt,
        cancellationAmount: 0,
        cancellationBillingRule: 'pre_assignment',
        cancellationDistanceKm: 0,
        helperPayoutBreakdown: { helperAmount: 0, platformAmount: 0, customerChargeAmount: 0 },
        chargedCardLast4: null,
        paymentTransactionId: null,
        walletBalance: null,
        walletCurrency: null,
        liveTrackingClosedReason: 'customer_canceled_pre_assignment',
      };
      settlementData = {
        customerId: String(request.customerId || ''),
        helperId: '',
        endedAt,
        noChargePaymentStatus: null,
        cancellation,
        requestPatch: {
          status: 'canceled',
          statusDetail: 'Customer canceled the service request before helper assignment.',
          canceledAt: endedAt,
          canceledBy: 'customer',
          canceledReason,
          helperAssignment: null,
          helperQueue: [],
          currentOfferHelperId: null,
          offerExpiresAt: null,
          offerToken: null,
          offerCycleExcludedHelperIds: [],
          declinedHelperIds: [],
          matchingStartedAtMs: null,
          paymentStatus: null,
          paymentTransactionId: null,
          cancellationFeeAmount: 0,
        },
      };
    } else {
      if (!isPostAssignmentServiceRequestStatus(status)) {
        return res.status(409).json({ success: false, message: 'This request cannot be canceled from its current state.' });
      }
      const bookingFee = getServiceBookingFee(request);
      const travelFee = getServiceTravelFee(request);
      cancellationAmount = Number(cancellationTerms.cancellationAmount || 0);
      const helperPayoutBreakdown = cancellationTerms.helperPayoutBreakdown;
      const bookingCharge = bookingFee;
      const customerSnap = await db.collection('users').doc(request.customerId).get();
      customerData = customerSnap.data() || {};
      const paymentMethods = (await getServerPaymentMethods({ db, admin, uid: request.customerId }))
        .filter((method) => String(method.paystackAuthorizationCode || '').trim());
      const selectedCardId = request.selectedCardId || request.requestPayload?.selectedCardId || null;
      selectedCard = paymentMethods.find((card) => card.id === selectedCardId)
        || paymentMethods.find((card) => card.isDefault)
        || paymentMethods[0]
        || null;
      const pricingSnapshot = {
        ...(request.pricingSnapshot || {}),
        subtotal: getServiceQuoteSubtotal(request),
        travelFee,
        bookingFee: bookingCharge,
        bookingFeeRate: SERVICE_BOOKING_FEE_RATE,
        bookingFeeCap: SERVICE_BOOKING_FEE_CAP,
        cancellationAmount,
        cancellationTravelCharge: Number(cancellationTerms.travelCharge || 0),
        cancellationDistanceKm: Number(cancellationTerms.cancellationDistanceKm || 0),
        cancellationBillingRule: cancellationTerms.billingRule,
        finalizedAt: new Date(endedAt).toISOString(),
      };
      const cancellation = {
        requestId,
        helperId,
        endedAt,
        cancellationAmount,
        cancellationBillingRule: cancellationTerms.billingRule,
        cancellationDistanceKm: Number(cancellationTerms.cancellationDistanceKm || 0),
        helperPayoutBreakdown,
        selectedCardId: selectedCard?.id || null,
        chargedCardLast4: selectedCard?.last4 || null,
        paymentTransactionId: null,
        walletBalance: null,
        walletCurrency: String(customerData.wallet?.currency || 'ZAR'),
        pricingSnapshot,
        liveTrackingClosedReason: 'customer_canceled',
      };
      settlementData = {
        customerId: String(request.customerId || ''),
        helperId,
        endedAt,
        noChargePaymentStatus: 'paid',
        cancellation,
        requestPatch: {
          status: 'canceled',
          statusDetail: cancellationAmount > 0
            ? `Customer canceled the service. Cancellation fee charged: R${cancellationAmount.toFixed(2)}.`
            : 'Customer canceled the service.',
          canceledAt: endedAt,
          canceledBy: 'customer',
          canceledReason,
          cancellationFeeAmount: cancellationAmount,
          chargedCardLast4: selectedCard?.last4 || null,
          pricingSnapshot,
          helperPayoutBreakdown: { ...helperPayoutBreakdown, finalizedAt: pricingSnapshot.finalizedAt },
        },
      };
    }
  }

  if (existingOperation.exists && existingOperation.data()?.status === 'settled_failed' && req.body?.retryConfirmedFailure === true) {
    const customerSnap = await db.collection('users').doc(request.customerId).get();
    customerData = customerSnap.data() || {};
    const paymentMethods = (await getServerPaymentMethods({ db, admin, uid: request.customerId }))
      .filter((method) => String(method.paystackAuthorizationCode || '').trim());
    const selectedCardId = existingOperation.data()?.settlementData?.cancellation?.selectedCardId || null;
    selectedCard = paymentMethods.find((card) => card.id === selectedCardId) || null;
  }

  let paymentsSecrets = { PAYSTACK_SECRET_KEY: '' };
  const existingOperationData = existingOperation.exists ? existingOperation.data() || {} : null;
  const existingOperationStatus = String(existingOperationData?.status || '').toLowerCase();
  const needsPaystack = existingOperation.exists
    ? (['processing', 'gateway_succeeded', 'gateway_failed_confirmed', 'gateway_reversed', 'reconciliation_required'].includes(existingOperationStatus)
      || (existingOperationStatus === 'settled_failed' && req.body?.retryConfirmedFailure === true))
    : cancellationAmount > 0;
  if (needsPaystack && Number(existingOperationData?.amountMinor || Math.round(cancellationAmount * 100)) > 0) {
    try {
      paymentsSecrets = getPaymentsSecrets();
    } catch (error) {
      logger.error('Payment configuration is unavailable during service request cancellation.', { requestId, error: error.message });
      return res.status(500).json({ success: false, message: 'Payment configuration is unavailable.' });
    }
  }

  try {
    const claim = await claimServiceFinancialOperation({
      db,
      requestRef,
      requestId,
      operationType: 'customer_cancellation',
      amount: existingOperation.exists ? Number(existingOperation.data()?.amount || 0) : cancellationAmount,
      currency: 'ZAR',
      settlementData,
      allowRetry: req.body?.retryConfirmedFailure === true,
      expectedRequestStatus: existingOperation.exists ? null : request.status,
      expectedHelperId: existingOperation.exists ? null : String(request.helperAssignment?.helperId || ''),
    });
    if (claim.action === 'conflict') return res.status(409).json({ success: false, message: 'A conflicting request financial operation already exists.' });
    if (claim.action === 'request_changed') return res.status(409).json({ success: false, code: 'request-state-changed', message: 'The request changed before cancellation could be committed. Please review its current state.' });
    if (claim.action === 'legacy_terminal') return res.status(200).json({ success: true, request: { id: requestId, ...claim.request } });
    if (claim.action === 'missing_request') return res.status(404).json({ success: false, message: 'Service request not found.' });
    if (claim.action === 'confirmed_failure' || claim.action === 'settled') {
      await runServiceFinancialPostEffects(claim.operationRef);
      const current = await requestRef.get();
      const op = claim.operation || {};
      return res.status(200).json({ success: true, request: { id: requestId, ...current.data() }, charge: { ok: op.finalOutcome === 'success' || op.finalOutcome === 'no_charge', reason: op.reconciliationReason || null }, cancellation: op.settlementData?.cancellation || null });
    }
    if (!['charge', 'reconcile'].includes(claim.action)) return res.status(409).json({ success: false, message: 'The request financial operation could not be claimed.' });
    const operation = claim.operation || {};
    const activeCustomer = customerData && Object.keys(customerData).length
      ? customerData
      : (await db.collection('users').doc(request.customerId).get()).data() || {};
    const { outcome, settlement } = await runServiceFinancialOperation({
      operationRef: claim.operationRef,
      requestRef,
      helperId: '',
      action: claim.action,
      operation,
      paystackSecretKey: paymentsSecrets.PAYSTACK_SECRET_KEY,
      email: activeCustomer.email || request.customerEmail || '',
      authorizationCode: selectedCard?.paystackAuthorizationCode || '',
    });
    const current = await requestRef.get();
    const updatedRequest = current.exists ? { id: current.id, ...current.data() } : null;
    const savedOperation = (await claim.operationRef.get()).data() || {};
    return res.status(200).json({
      success: true,
      request: updatedRequest,
      charge: {
        ok: outcome.outcome === 'success' || outcome.outcome === 'no_charge',
        reason: outcome.reason || null,
        pendingReconciliation: ['pending', 'unknown'].includes(outcome.outcome),
      },
      cancellation: savedOperation.settlementData?.cancellation || null,
      settlement: settlement || null,
    });
  } catch (error) {
    logger.error('service_request_cancellation_billing_failed', { requestId, error: error.message });
    return res.status(500).json({ success: false, message: 'Unable to cancel this request right now. The payment operation is protected from duplicate charging and may require reconciliation.' });
  }
}

exports.billCustomerServiceCancellation = onRequest({ cors: true }, async (req, res) => (
  handleCustomerServiceCancellation(req, res)
));

async function cancelCustomerServiceRequestFromWhatsApp({ identityId, identity, requestId, expectedCancellation, reason = 'Customer requested cancellation through WhatsApp.' } = {}) {
  if (!whatsappCancellationEnabled()) return { statusCode: 503, body: { success: false, code: 'whatsapp-cancellation-disabled' } };
  const currentIdentity = await getWhatsAppIdentityForCurrentSender(identityId, identity);
  if (!currentIdentity) return { statusCode: 403, body: { success: false, code: 'identity-not-authorized' } };
  const role = String(currentIdentity.role || (currentIdentity.guestPrincipalId ? 'customer' : '')).trim().toLowerCase();
  if (role !== 'customer') return { statusCode: 403, body: { success: false, code: 'customer-role-required' } };
  const principalUid = String(currentIdentity.linkedFirebaseUid || currentIdentity.guestPrincipalId || '').trim();
  if (!principalUid) return { statusCode: 403, body: { success: false, code: 'customer-identity-required' } };
  let statusCode = 200;
  let body = null;
  const response = {
    status(code) { statusCode = Number(code) || 500; return this; },
    json(payload) { body = payload; return this; },
  };
  await handleCustomerServiceCancellation({
    method: 'POST',
    headers: {},
    body: { requestId, reason, expectedCancellation },
  }, response, { uid: principalUid });
  return { statusCode, body: body || { success: false, code: 'empty-cancellation-response' } };
}

async function getWhatsAppPaymentContext({ identityId, identity, requestId } = {}) {
  if (!whatsappPaymentsEnabled()) return { code: 'disabled' };
  const currentIdentity = await getWhatsAppIdentityForCurrentSender(identityId, identity);
  if (!currentIdentity) return { code: 'identity-not-authorized' };
  const role = String(currentIdentity.role || (currentIdentity.guestPrincipalId ? 'customer' : '')).toLowerCase();
  if (role !== 'customer') return { code: 'customer-role-required' };
  const access = await getWhatsAppRequestForIdentity({ db, identity: currentIdentity, requestId });
  if (access.code !== 'found') return { code: access.code };
  const request = access.request;
  const [paymentSnap, legacySnap] = await Promise.all([
    db.collection(PAYMENT_OPERATIONS).doc(request.id).get(),
    db.collection(FINANCIAL_OPERATIONS_COLLECTION).doc(serviceFinancialOperationId(request.id)).get(),
  ]);
  const paymentOperation = paymentSnap.exists ? paymentSnap.data() || {} : null;
  const legacyOperation = legacySnap.exists ? legacySnap.data() || {} : null;
  const state = paymentStateForRequest(request, paymentOperation, legacyOperation);
  const amount = getFinalPayableAmount(request, legacyOperation);
  if (state === 'paid') return { code: 'already-paid', identity: currentIdentity, request, paymentOperation, legacyOperation };
  if (request.status !== 'completed' || amount === null) return { code: 'not-payable', identity: currentIdentity, request };
  if (['payment_processing', 'awaiting_cash_confirmation', 'awaiting_customer_confirmation', 'payment_reconciliation_required'].includes(state)) return { code: state, identity: currentIdentity, request, paymentOperation };
  let ownerUid = String(currentIdentity.linkedFirebaseUid || '');
  if (String(request.customerId || '').startsWith('guest_')) {
    const owner = await db.collection('whatsappGuestOwnership').doc(request.customerId).get().catch(() => null);
    if (owner?.exists) ownerUid = String(owner.data()?.uid || ownerUid);
  }
  const profileSnap = ownerUid ? await db.collection('users').doc(ownerUid).get().catch(() => null) : null;
  const linkedCards = currentIdentity.linkedFirebaseUid
    ? await getServerPaymentMethods({ db, admin, uid: currentIdentity.linkedFirebaseUid }).catch(() => [])
    : [];
  const cards = profileSnap?.exists
    ? linkedCards
      .filter((card) => card?.reusable === true && String(card.paystackAuthorizationCode || '').trim())
      .map((card) => ({ id: String(card.id || ''), brand: String(card.brand || 'Card').slice(0, 40), last4: String(card.last4 || '').slice(-4), isDefault: card.isDefault === true }))
      .filter((card) => card.id)
    : [];
  return { code: 'available', identity: currentIdentity, request, amount, ownerUid, cards, paymentOperation, legacyOperation };
}

async function createWhatsAppPaymentSession(context) {
  const identity = context.identity || {};
  const principalId = String(identity.linkedFirebaseUid || identity.guestPrincipalId || '').trim();
  return createServicePaymentSession({
    db,
    requestId: String(context.request.id),
    customerId: String(context.request.customerId),
    principalId,
    principalType: identity.linkedFirebaseUid ? 'firebase_uid' : 'whatsapp_guest',
  });
}

async function handleCashPaymentConfirmation({ requestId, attemptId, helperId, action }) {
  const result = action === 'reject'
    ? await rejectCashPayment({ db, admin, requestId, helperId, attemptId })
    : await settleRequestPayment({ db, admin, requestId, attemptId, outcome: 'success', helperId, providerStatus: 'helper_confirmed', walletEnabled: helperWalletEnabled() });
  if (result.action === 'settled' || result.action === 'already-paid') {
    await issuePaidRequestPostEffects({ requestId, paymentResult: result });
    return { ...result, action: result.action === 'already-paid' ? 'settled' : result.action };
  }
  if (result.action === 'rejected') {
    const requestSnap = await db.collection('serviceRequests').doc(requestId).get();
    const customerId = String(requestSnap.data()?.customerId || '');
    await createUserNotificationOnce({ notificationId: `cash_payment_${requestId}_${attemptId}_rejected`, userId: customerId, title: 'Payment not confirmed', message: 'Your helper could not confirm receiving this payment. The request remains unpaid.', type: 'payment_failed', requestId, targetPath: `/customer/requests/${requestId}`, metadata: { paymentStatus: requestSnap.data()?.paymentStatus || 'unpaid' } }).catch(() => null);
  }
  return result;
}

async function notifyCashPaymentToHelper({ requestId, attemptId, helperId, amount }) {
  if (!helperId) return;
  await createUserNotificationOnce({
    notificationId: `cash_payment_${requestId}_${attemptId}_helper`,
    userId: helperId,
    title: 'Confirm customer payment',
    message: `A customer reports paying R${Number(amount || 0).toFixed(2)} directly for request ${requestId}. Confirm only if you received it.`,
    type: 'cash_payment_confirmation',
    requestId,
    targetPath: '/provider/cash-payments',
    metadata: { requestId, attemptId, amount: Number(amount || 0), currency: 'ZAR' },
  }).catch(() => null);
  if (!whatsappPaymentsEnabled()) return;
  const identities = await db.collection('whatsappIdentities').where('linkedFirebaseUid', '==', helperId).limit(5).get().catch(() => null);
  for (const identityDoc of identities?.docs || []) {
    const identity = identityDoc.data() || {};
    if (String(identity.role || '').toLowerCase() !== 'helper'
      || !(Number(identity.whatsappNotificationsConsentAtMs || 0) > 0 || identity.whatsappNotificationsEnabled === true)) continue;
    const actionRecords = ['confirm', 'reject'].map((action) => ({
      action,
      actionId: stableEventId(`cash-payment-action:${requestId}:${attemptId}:${helperId}:${action}`),
    }));
    await Promise.all(actionRecords.map(({ action, actionId }) => db.collection('whatsappPaymentActions').doc(actionId).set({ actionId, action, requestId, attemptId, helperId, status: 'pending', expiresAtMs: Date.now() + 24 * 60 * 60 * 1000, createdAtMs: Date.now() }, { merge: true })));
    const identityRef = identityDoc.ref;
    const conversationRef = db.collection('whatsappConversations').doc(identityDoc.id);
    const conversation = (await conversationRef.get().catch(() => null))?.data() || {};
    const lastInboundAtMs = Number(conversation.lastInboundMessageAtMs || 0);
    const body = `A customer reports paying R${Number(amount || 0).toFixed(2)} for request ${requestId}. Confirm receipt only if you received this payment.`;
    try {
      const configured = getWhatsAppSecrets();
      if (String(identity.phoneNumberId || '') !== configured.phoneNumberId) continue;
      const client = createMetaWhatsAppClient({ accessToken: configured.accessToken, phoneNumberId: configured.phoneNumberId, graphApiVersion: configured.graphApiVersion, approvedTemplateNames: configured.approvedTemplateNames, requestTimeoutMs: process.env.WHATSAPP_META_SEND_TIMEOUT_MS, isRecipientAllowed: (recipient) => isWhatsAppRecipientAllowed(recipient, process.env) });
      if (isWithinCustomerServiceWindow(lastInboundAtMs)) {
        await persistWhatsAppAssistantReply({
          sourceEventId: stableEventId(`cash-payment-notification:${requestId}:${attemptId}:${identityDoc.id}`),
          identityId: identityDoc.id,
          identity,
          conversationRef,
          text: body,
          requireCurrentInbound: false,
          interactive: {
            type: 'button',
            body: { text: body },
            action: { buttons: actionRecords.map(({ action, actionId }) => ({ type: 'reply', reply: { id: `wa_cash_${action}_${actionId}`, title: action === 'confirm' ? 'Received' : 'Not received' } })) },
          },
        });
      } else {
        const templateName = String(process.env.WHATSAPP_CASH_CONFIRMATION_TEMPLATE_NAME || '').trim();
        const languageCode = String(process.env.WHATSAPP_CASH_CONFIRMATION_TEMPLATE_LANGUAGE || '').trim();
        if (templateName && languageCode && configured.approvedTemplateNames.includes(templateName)) {
          const notificationId = stableEventId(`cash-payment-template:${requestId}:${attemptId}:${identityDoc.id}`);
          const outboundRef = db.collection('whatsappMessages').doc(notificationId);
          const claimed = await db.runTransaction(async (transaction) => {
            const [existing, currentIdentity] = await Promise.all([transaction.get(outboundRef), transaction.get(identityRef)]);
            if (existing.exists || !currentIdentity.exists) return false;
            const current = currentIdentity.data() || {};
            if (String(current.linkedFirebaseUid || '') !== helperId
              || String(current.role || '').toLowerCase() !== 'helper'
              || !(Number(current.whatsappNotificationsConsentAtMs || 0) > 0 || current.whatsappNotificationsEnabled === true)
              || String(current.phoneNumberId || '') !== configured.phoneNumberId) return false;
            transaction.create(outboundRef, {
              eventId: notificationId, identityId: identityDoc.id, requestId, attemptId,
              phoneNumberId: configured.phoneNumberId, to: String(current.waId || ''),
              direction: 'outbound', type: 'template', templateName,
              text: body, status: 'sending', createdAtMs: Date.now(),
              retentionExpiresAtMs: Date.now() + whatsappRetentionDays('WHATSAPP_MESSAGE_RETENTION_DAYS', 180) * 24 * 60 * 60 * 1000,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return true;
          });
          if (!claimed) continue;
          try {
            const delivery = await client.sendTemplate({
              to: identity.waId,
              name: templateName,
              languageCode,
              components: buildCashConfirmationTemplateComponents({
                requestReference: requestId,
                amountText: `R${Number(amount || 0).toFixed(2)}`,
              }),
            });
            await outboundRef.set({ status: 'sent', metaMessageId: delivery.messageId || null, sentAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            await reconcileWhatsAppDeliveryStatuses({ metaMessageId: delivery.messageId, recipientId: identity.waId, messageRef: outboundRef });
          } catch (error) {
            const deliveryStatus = classifyMetaDeliveryError(error);
            await outboundRef.set({ status: deliveryStatus, deliveryStatus, errorCode: String(error?.code || 'meta_delivery_unknown').slice(0, 100), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            throw error;
          }
        }
      }
    } catch (error) {
      logger.warn('cash_payment_whatsapp_helper_notification_failed', { requestId, helperId, errorCode: String(error?.code || 'message_failed').slice(0, 80) });
    }
  }
}

async function syncBackendHelperWeeklyPayoutRecords() {
  const startWindow = Date.now() - (PAYOUT_LOOKBACK_WEEKS * 7 * 24 * 60 * 60 * 1000);
  const currentWeekStart = getWeekRange(new Date()).weekStart.getTime();
  const [completedSnap, canceledSnap] = await Promise.all([
    db.collection('serviceRequests').where('status', '==', 'completed').limit(1000).get(),
    db.collection('serviceRequests').where('status', '==', 'canceled').limit(1000).get(),
  ]);

  const grouped = new Map();
  for (const requestDoc of [...completedSnap.docs, ...canceledSnap.docs]) {
    const request = { id: requestDoc.id, ...(requestDoc.data() || {}) };
    const helperId = String(request?.helperAssignment?.helperId || '').trim();
    if (!helperId) continue;
    // New explicit-payment requests earn wallet funds only after settlement.
    // Direct-to-helper cash is already paid to the helper and is never payable again.
    if (Number(request.helperWalletAccountingVersion) === 1 && !isWalletEarningEligible(request)) continue;
    if (String(request.cashPayment?.status || '').toLowerCase() === 'helper_confirmed') continue;

    const settledAtMs = timestampToMillis(
      request.endedAt
      || request.completedAt
      || request.canceledAt
      || request.updatedAt,
    );
    if (!settledAtMs || settledAtMs < startWindow || settledAtMs >= currentWeekStart) continue;

    const payoutBreakdown = computeStoredHelperPayoutBreakdown(request);
    if (!payoutBreakdown) continue;

    const settledDate = new Date(settledAtMs);
    const weekKey = getWeekKey(settledDate);
    const { weekStart, weekEnd } = getWeekRange(settledDate);
    if (Number(request.helperWalletAccountingVersion) === 1) {
      const amountMinor = normalizeWalletMinor(Math.round(Number(payoutBreakdown.helperAmount || 0) * 100));
      if (amountMinor > 0) {
        const earning = await creditHelperWalletEarning({
          db,
          helperId,
          requestId: request.id,
          amountMinor,
          sourceWeekKey: weekKey,
        });
        if (earning.action === 'reconciliation-blocked') logger.error('helper_wallet_earning_blocked_for_reconciliation', { helperId, requestId: request.id });
      }
      continue;
    }
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
  }

  const upserted = [];
  for (const [docId, record] of grouped.entries()) {
    const payoutRef = db.collection(HELPER_PAYOUT_COLLECTION).doc(docId);
    const existingSnap = await payoutRef.get();
    const existing = existingSnap.exists ? (existingSnap.data() || {}) : {};
    if (existing.status === 'paid'
      && (!existing.transferReference || ['success', 'completed'].includes(String(existing.transferStatus || '').toLowerCase()))) {
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

async function syncHelperWalletPayoutCandidates(weekKey) {
  const walletCollection = db.collection(HELPER_WALLETS);
  const candidates = [];
  let page = walletCollection.orderBy(admin.firestore.FieldPath.documentId()).limit(200);
  let lastDocument = null;
  while (true) {
    const pageQuery = lastDocument ? page.startAfter(lastDocument) : page;
    const walletPage = await pageQuery.get();
    if (walletPage.empty) break;
    for (const walletDoc of walletPage.docs) {
      const helperId = walletDoc.id;
      const payoutId = `wallet_${weekKey}_${helperId}`;
      const payoutRef = db.collection(HELPER_PAYOUT_COLLECTION).doc(payoutId);
      const outcome = await db.runTransaction(async (transaction) => {
        const [walletSnapshot, payoutSnapshot] = await Promise.all([transaction.get(walletDoc.ref), transaction.get(payoutRef)]);
        const wallet = walletSnapshot.data() || {};
        const existing = payoutSnapshot.exists ? payoutSnapshot.data() || {} : null;
        if (wallet.reconciliationBlocked === true || Number(wallet.availableMinor || 0) <= 0) return { action: 'no-balance' };
        if (existing && ['paid', 'processing', 'pending_reconciliation', 'reconciliation_required', 'wallet_recovery'].includes(String(existing.status || '').toLowerCase())) {
          return { action: 'existing', record: { id: payoutId, ...existing } };
        }
        const amountMinor = Math.max(0, Number(wallet.availableMinor || 0));
        const record = {
          id: payoutId,
          helperId,
          helperName: '',
          helperEmail: '',
          weekKey,
          weekStart: getWeekRange(new Date()).weekStart.toISOString(),
          weekEnd: getWeekRange(new Date()).weekEnd.toISOString(),
          totalJobs: 0,
          completedJobs: 0,
          canceledJobs: 0,
          grossAmount: amountMinor / 100,
          helperAmount: amountMinor / 100,
          amountMinor,
          platformAmount: 0,
          requestIds: [],
          walletAccountingVersion: 1,
          payoutSource: 'helper_wallet',
          status: 'unpaid',
          transferAttempts: Number(existing?.transferAttempts || 0),
          createdAt: existing?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        transaction.set(payoutRef, record, { merge: true });
        return { action: 'created', record };
      });
      if (outcome.record) candidates.push(outcome.record);
    }
    lastDocument = walletPage.docs[walletPage.docs.length - 1];
    if (walletPage.size < 200) break;
  }
  return candidates;
}

function payoutNotificationId(payoutId, state) {
  return `payout_${createHash('sha256').update(`${payoutId}:${state}`).digest('hex').slice(0, 40)}`;
}

async function notifyPayoutOutcome(payout, state, reference = '', details = '') {
  const amount = Number(payout.helperAmount || 0);
  const shared = {
    userId: payout.helperId,
    requestId: null,
    targetPath: '/provider/earnings',
    metadata: { payoutId: payout.id, payoutStatus: state, amount, transferReference: reference || null },
  };
  if (state === 'paid') {
    return createUserNotificationOnce({
      notificationId: payoutNotificationId(payout.id, 'paid'),
      ...shared,
      title: 'Helper payout paid',
      message: `Your ${payout.weekKey || 'weekly'} payout was paid successfully. Amount: ${formatMoney(amount)}.`,
      type: 'helper_payout_paid',
    });
  }
  if (state === 'processing') {
    return createUserNotificationOnce({
      notificationId: payoutNotificationId(payout.id, `processing_${reference}`),
      ...shared,
      title: 'Helper payout processing',
      message: `Your ${payout.weekKey || 'weekly'} payout is being processed. Amount: ${formatMoney(amount)}.`,
      type: 'helper_payout_processing',
    });
  }
  if (state === 'reversed') {
    return createUserNotificationOnce({
      notificationId: payoutNotificationId(payout.id, `reversed_${reference}`),
      ...shared,
      title: 'Helper payout reversed',
      message: `Your ${payout.weekKey || 'weekly'} payout was reversed by the payment provider. ${details}`.trim(),
      type: 'helper_payout_reversed',
    });
  }
  return createUserNotificationOnce({
    notificationId: payoutNotificationId(payout.id, `failed_${reference || 'no_reference'}`),
    ...shared,
    title: 'Helper payout unsuccessful',
    message: details || `Your ${payout.weekKey || 'weekly'} payout could not be completed.`,
    type: 'helper_payout_failed',
  });
}

async function reconcilePayoutTransfer({ payout, payoutRef, attemptNo, reference, paystackSecretKey, checkNo = 1, fallbackTransfer = null, verification: preverified = null }) {
  const transferAttemptRef = payoutRef.collection('transferAttempts').doc(String(attemptNo).padStart(4, '0'));
  const referenceRef = db.collection(PAYSTACK_TRANSFER_REFERENCES_COLLECTION).doc(reference);
  const attemptSnap = await transferAttemptRef.get().catch(() => null);
  const attempt = attemptSnap?.exists ? attemptSnap.data() || {} : {};
  const amountMinor = Number(attempt.amountMinor ?? payout.transferAmountMinor ?? Math.round(Number(payout.helperAmount || 0) * 100));
  const currency = String(attempt.currency || payout.transferCurrency || 'ZAR');
  const verification = preverified || await verifyPaystackTransfer({
    paystackSecretKey,
    reference,
    amountMinor,
    currency,
  });
  const gatewayTransfer = verification.transfer || fallbackTransfer || null;
  const result = await recordPayoutObservation({
    db,
    admin,
    payoutRef,
    transferAttemptRef,
    referenceRef,
    reference,
    outcome: verification.outcome,
    transfer: gatewayTransfer,
  });
  if (result.updated && ['pending', 'unknown'].includes(verification.outcome)) {
    await enqueueFinancialReconciliation({
      operationId: String(payout.operationId || helperPayoutOperationId(payout.weekKey, payout.helperId)),
      operationType: 'helper_payout',
      attemptNo: checkNo,
      delaySeconds: Math.min(30 * (2 ** Math.max(0, checkNo - 1)), 1800),
      payoutId: payout.id,
    });
    await notifyPayoutOutcome(payout, 'processing', reference).catch(() => null);
  } else if (verification.outcome === 'success') {
    await notifyPayoutOutcome(payout, 'paid', reference).catch((error) => logger.warn('helper_payout_paid_notification_failed', { payoutId: payout.id, error: error.message }));
  } else if (verification.outcome === 'reversed') {
    await notifyPayoutOutcome(payout, 'reversed', reference, 'Please contact support if you need help.').catch(() => null);
  } else if (verification.outcome === 'failed_confirmed') {
    const message = payout.walletAccountingVersion === 1
      ? 'Paystack confirmed the transfer failed. The reserved funds are available in your Uncedo wallet for a later weekly payout.'
      : 'Paystack confirmed the transfer failed. It may be retried in a later payout run.';
    await notifyPayoutOutcome(payout, 'failed', reference, message).catch(() => null);
    if (payout.walletAccountingVersion === 1 && checkNo < 6) {
      const scheduleLateCheck = await db.runTransaction(async (transaction) => {
        const currentSnap = await transaction.get(payoutRef);
        if (!currentSnap.exists || currentSnap.data()?.walletLateSuccessCheckScheduledAtMs) return false;
        transaction.set(payoutRef, { walletLateSuccessCheckScheduledAtMs: Date.now(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return true;
      }).catch(() => false);
      if (scheduleLateCheck) {
        const enqueued = await enqueueFinancialReconciliation({
          operationId: String(payout.operationId || helperPayoutOperationId(`wallet:${payout.weekKey}`, payout.helperId)),
          operationType: 'helper_payout',
          attemptNo: 6,
          delaySeconds: 3600,
          payoutId: payout.id,
        });
        if (!enqueued) {
          await payoutRef.set({ walletLateSuccessCheckEnqueueFailedAtMs: Date.now() }, { merge: true }).catch(() => null);
        }
      }
    }
  }
  return { verification, result };
}

async function markZeroValuePayoutPaid(payout, payoutRef) {
  const changed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(payoutRef);
    if (!snapshot.exists) return false;
    const current = snapshot.data() || {};
    if (current.status === 'paid') return false;
    if (current.transferReference && ['processing', 'pending_reconciliation', 'reconciliation_required'].includes(String(current.status || '').toLowerCase())) return false;
    transaction.set(payoutRef, {
      status: 'paid',
      operationStatus: 'settled_success',
      transferStatus: 'not_required',
      paidAt: current.paidAt || admin.firestore.FieldValue.serverTimestamp(),
      paidBy: { system: 'automatic', reason: 'zero_amount' },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
  if (changed) await notifyPayoutOutcome(payout, 'paid').catch(() => null);
  return changed;
}

async function recordPayoutConfigurationFailure(payout, payoutRef, runKey) {
  const changed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(payoutRef);
    if (!snapshot.exists) return false;
    const current = snapshot.data() || {};
    if (current.lastProcessRunKey === runKey) return false;
    if (current.transferReference && ['processing', 'pending_reconciliation', 'reconciliation_required'].includes(String(current.status || '').toLowerCase())) return false;
    transaction.set(payoutRef, {
      status: 'unsuccessful',
      operationStatus: 'failed_confirmed',
      failureReason: 'Helper payout account is not verified.',
      transferAttempts: Number(current.transferAttempts || 0) + 1,
      lastProcessRunKey: runKey,
      lastTransferAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
  if (changed) await notifyPayoutOutcome(payout, 'failed', '', 'Your helper payout could not be processed because your payout account is not verified.').catch(() => null);
  return changed;
}

exports.processWeeklyHelperPayouts = onSchedule({
  schedule: '0 0 * * 1',
  timeZone: 'Africa/Johannesburg',
}, async () => {
  let paymentsSecrets;
  try {
    paymentsSecrets = getPaymentsSecrets();
  } catch (error) {
    logger.error('weekly_helper_payouts_missing_payment_config', { error: error.message });
    return;
  }

  const legacyPayouts = await syncBackendHelperWeeklyPayoutRecords();
  const walletPayouts = await syncHelperWalletPayoutCandidates(getWeekKey(new Date()));
  const syncedRecords = [...legacyPayouts, ...walletPayouts];
  const runKey = `weekly-${getWeekKey(new Date())}`;
  let paidCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let reconciliationCount = 0;

  for (const payout of syncedRecords) {
    const amount = Number(payout.helperAmount || 0);
    const payoutRef = db.collection(HELPER_PAYOUT_COLLECTION).doc(payout.id);
    if (amount <= 0) {
      if (await markZeroValuePayoutPaid(payout, payoutRef)) paidCount += 1;
      else skippedCount += 1;
      continue;
    }

    const helperSnap = await db.collection('users').doc(payout.helperId).get();
    const helperData = helperSnap.exists ? helperSnap.data() || {} : {};
    const payoutDetails = helperData.payout || {};
    const recipientCode = String(payoutDetails.recipientCode || '').trim();
    const verified = String(payoutDetails.verificationStatus || '').toLowerCase() === 'verified';
    const claim = await claimPayoutTransfer({
      db,
      admin,
      payoutRef,
      payoutId: payout.id,
      helperId: payout.helperId,
      weekKey: payout.weekKey,
      runKey,
      amount,
      currency: 'ZAR',
      recipientCode: verified ? recipientCode : '',
    });
    if (claim.action === 'paid' || claim.action === 'already_attempted_this_run') {
      skippedCount += 1;
      continue;
    }
    if (claim.action === 'missing_payout') {
      skippedCount += 1;
      continue;
    }
    if (claim.action === 'missing_recipient') {
      if (await recordPayoutConfigurationFailure(payout, payoutRef, runKey)) failedCount += 1;
      else skippedCount += 1;
      continue;
    }
    if (claim.action === 'reconcile') {
      reconciliationCount += 1;
      const attemptNo = Number(claim.payout.transferAttempts || 1);
      await reconcilePayoutTransfer({
        payout: { ...payout, ...claim.payout },
        payoutRef,
        attemptNo,
        reference: claim.reference,
        paystackSecretKey: paymentsSecrets.PAYSTACK_SECRET_KEY,
        checkNo: 1,
      });
      continue;
    }
    if (claim.action !== 'transfer') {
      skippedCount += 1;
      continue;
    }
    const transferAmount = Number(claim.attempt.amount || amount);

    await notifyPayoutOutcome({ ...payout, ...claim.attempt }, 'processing', claim.attempt.reference).catch(() => null);
    await enqueueFinancialReconciliation({
      operationId: claim.operationId,
      operationType: 'helper_payout',
      attemptNo: 1,
      delaySeconds: 30,
      payoutId: payout.id,
    });
    const paystackResult = await executePayoutTransferAttempt({
      claim,
      amount: transferAmount,
      recipientCode,
      reason: `Uncedo helper payout ${payout.weekKey}`,
      paystack: {
        initiateTransfer: (input) => initiatePaystackTransfer({ paystackSecretKey: paymentsSecrets.PAYSTACK_SECRET_KEY, ...input }),
        verifyTransfer: (input) => verifyPaystackTransfer({ paystackSecretKey: paymentsSecrets.PAYSTACK_SECRET_KEY, ...input }),
      },
    });
    if (paystackResult.transferRequestErrorCode) {
      logger.warn('paystack_payout_transfer_response_uncertain', {
        payoutId: payout.id,
        reference: claim.attempt.reference,
        errorCode: paystackResult.transferRequestErrorCode,
      });
    }
    const result = await reconcilePayoutTransfer({
      payout: { ...payout, ...claim.attempt, operationId: claim.operationId },
      payoutRef,
      attemptNo: claim.attempt.attemptNo,
      reference: claim.attempt.reference,
      paystackSecretKey: paymentsSecrets.PAYSTACK_SECRET_KEY,
      checkNo: 1,
      fallbackTransfer: paystackResult.transfer,
      verification: paystackResult.verification,
    });
    if (result.verification.outcome === 'success') paidCount += 1;
    else if (result.verification.outcome === 'failed_confirmed' || result.verification.outcome === 'reversed') failedCount += 1;
    else reconciliationCount += 1;
  }

  logger.info('weekly_helper_payouts_processed', {
    syncedCount: syncedRecords.length,
    paidCount,
    failedCount,
    skippedCount,
    reconciliationCount,
  });
});

exports.reconcileFinancialOperation = onTaskDispatched({
  retryConfig: { maxAttempts: 3, minBackoffSeconds: 30, maxBackoffSeconds: 300, maxDoublings: 3 },
  rateLimits: { maxConcurrentDispatches: 20, maxDispatchesPerSecond: 5 },
  ...HALF_CPU_OPTIONS,
}, async (request) => {
  const data = request.data || {};
  const operationId = String(data.operationId || '').trim();
  const operationType = String(data.operationType || '').trim();
  const checkNo = Math.max(1, Number(data.checkNo || 1));
  if (!operationId || !['completion', 'customer_cancellation', 'helper_payout'].includes(operationType)) {
    logger.warn('financial_reconciliation_task_invalid_payload', { hasOperationId: Boolean(operationId), operationType });
    return;
  }
  let paymentsSecrets;
  try {
    paymentsSecrets = getPaymentsSecrets();
  } catch (error) {
    logger.error('financial_reconciliation_missing_payment_config', { operationId, operationType, error: error.message });
    throw error;
  }

  if (operationType === 'helper_payout') {
    let payoutSnap = data.payoutId
      ? await db.collection(HELPER_PAYOUT_COLLECTION).doc(String(data.payoutId)).get()
      : null;
    if (!payoutSnap?.exists) {
      const query = await db.collection(HELPER_PAYOUT_COLLECTION).where('operationId', '==', operationId).limit(1).get();
      payoutSnap = query.docs[0] || null;
    }
    if (!payoutSnap?.exists) return;
    const payout = { id: payoutSnap.id, ...payoutSnap.data() };
    const reference = String(payout.transferReference || '').trim();
    const attemptNo = Number(payout.transferAttempts || 0);
    if (!reference || attemptNo < 1) return;
    const payoutRef = payoutSnap.ref;
    const result = await reconcilePayoutTransfer({
      payout,
      payoutRef,
      attemptNo,
      reference,
      paystackSecretKey: paymentsSecrets.PAYSTACK_SECRET_KEY,
      checkNo,
    });
    if (result.result.updated && ['pending', 'unknown'].includes(result.verification.outcome) && checkNo >= 6) {
      await payoutRef.set({
        reconciliationExhaustedAtMs: Date.now(),
        reconciliationReason: result.verification.reason || 'Paystack transfer outcome remains uncertain.',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      await createUserNotificationOnce({
        notificationId: payoutNotificationId(payout.id, `reconciliation_required_${reference}`),
        userId: payout.helperId,
        title: 'Helper payout needs review',
        message: 'The payment provider has not confirmed your payout yet. Uncedo will not submit a duplicate transfer while the original is unresolved.',
        type: 'helper_payout_reconciliation',
        targetPath: '/provider/earnings',
        metadata: { payoutId: payout.id, transferReference: reference, amount: Number(payout.helperAmount || 0) },
      }).catch(() => null);
    }
    return;
  }

  const operationRef = db.collection(FINANCIAL_OPERATIONS_COLLECTION).doc(operationId);
  const operationSnap = await operationRef.get();
  if (!operationSnap.exists) return;
  const operation = operationSnap.data() || {};
  if (operation.operationType !== operationType || !operation.requestId) return;
  const requestRef = db.collection('serviceRequests').doc(operation.requestId);
  if (['settled_success', 'settled_failed', 'settled_no_charge'].includes(String(operation.status || ''))) {
    await runServiceFinancialPostEffects(operationRef);
    return;
  }
  const amountMinor = Number(operation.amountMinor || 0);
  let outcome;
  let providerRecord = null;
  if (amountMinor === 0) {
    outcome = { outcome: 'no_charge' };
  } else {
    outcome = await verifyPaystackTransaction({
      paystackSecretKey: paymentsSecrets.PAYSTACK_SECRET_KEY,
      reference: String(operation.gatewayReference || ''),
      amountMinor,
      currency: operation.currency || 'ZAR',
    });
    providerRecord = outcome.transaction || null;
  }
  if (outcome.outcome !== 'no_charge') await recordServiceGatewayObservation({ db, operationRef, outcome });
  const settlement = await settleServiceFinancialOperation({
    db,
    admin,
    operationRef,
    requestRef,
    helperRef: operation.operationType === 'completion' && operation.settlementData?.helperId
      ? db.collection('users').doc(operation.settlementData.helperId)
      : null,
    helperDispatchRef: operation.operationType === 'completion' && operation.settlementData?.helperId
      ? db.collection('helperDispatchIndex').doc(operation.settlementData.helperId)
      : null,
    outcome: outcome.outcome,
    transactionId: providerRecord?.id ? String(providerRecord.id) : null,
  });
  await runServiceFinancialPostEffects(operationRef);
  if (settlement.applied && ['pending', 'unknown'].includes(outcome.outcome)) {
    if (checkNo < 6) {
      await enqueueFinancialReconciliation({
        operationId,
        operationType,
        attemptNo: checkNo + 1,
        delaySeconds: Math.min(30 * (2 ** checkNo), 1800),
      });
    } else {
      await operationRef.set({
        reconciliationExhaustedAtMs: Date.now(),
        reconciliationReason: outcome.reason || 'Paystack transaction outcome remains uncertain.',
        updatedAtMs: Date.now(),
      }, { merge: true });
      const customerId = String(operation.settlementData?.customerId || '');
      await createUserNotificationOnce({
        notificationId: `financial_${operationId}_reconciliation_required_${customerId}`,
        userId: customerId,
        title: 'Payment needs review',
        message: 'The payment provider has not confirmed the payment result. Uncedo will not submit another charge while the original is unresolved.',
        type: 'payment_reconciliation_required',
        requestId: operation.requestId,
        targetPath: `/customer/requests/${operation.requestId}`,
        metadata: { paymentStatus: 'payment_reconciliation_required', operationId },
      }).catch(() => null);
    }
  }
});

exports.sendEmailFromQueue = onDocumentCreated(
  {
    document: 'emailEvents/{eventId}',
    ...HALF_CPU_OPTIONS,
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


