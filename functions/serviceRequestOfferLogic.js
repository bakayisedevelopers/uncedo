'use strict';

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeRevision(value) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : 0;
}

function normalizeTimestamp(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isSameOffer(request, { helperId, offerToken, offerRevision }) {
  return String(request?.status || '').trim().toLowerCase() === 'helper_found'
    && normalizeString(request?.currentOfferHelperId) === normalizeString(helperId)
    && normalizeString(request?.offerToken) === normalizeString(offerToken)
    && normalizeRevision(request?.offerRevision) === normalizeRevision(offerRevision)
    && normalizeTimestamp(request?.offerExpiresAt) > 0;
}

function evaluateOfferResponse(request, input, now = Date.now()) {
  const action = normalizeString(input?.action).toLowerCase();
  if (!['accept', 'decline'].includes(action)) return { ok: false, code: 'invalid-action' };
  if (!normalizeString(input?.helperId) || !normalizeString(input?.offerToken) || !normalizeRevision(input?.offerRevision)) {
    return { ok: false, code: 'invalid-offer-reference' };
  }

  const previousResponse = request?.lastOfferResponse;
  if (
    previousResponse
    && normalizeString(previousResponse.helperId) === normalizeString(input.helperId)
    && normalizeString(previousResponse.offerToken) === normalizeString(input.offerToken)
    && normalizeRevision(previousResponse.offerRevision) === normalizeRevision(input.offerRevision)
    && normalizeString(previousResponse.action).toLowerCase() === action
  ) {
    return { ok: true, idempotent: true, action };
  }

  if (!isSameOffer(request, input)) return { ok: false, code: 'offer-no-longer-current' };
  if (normalizeTimestamp(request.offerExpiresAt) <= now) return { ok: false, code: 'offer-expired' };
  return { ok: true, idempotent: false, action };
}

function evaluateOfferExpiry(request, input, now = Date.now()) {
  if (!isSameOffer(request, input)) return { shouldExpire: false, code: 'offer-no-longer-current' };
  if (normalizeTimestamp(request.offerExpiresAt) > now) return { shouldExpire: false, code: 'offer-not-expired' };
  if (request?.helperAssignment?.helperId) return { shouldExpire: false, code: 'offer-already-assigned' };
  return { shouldExpire: true };
}

function normalizeHelperIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map(normalizeString)
      .filter(Boolean),
  )];
}

function buildDeclinedOfferLists(request, helperId) {
  const normalizedHelperId = normalizeString(helperId);
  return {
    helperQueue: (Array.isArray(request?.helperQueue) ? request.helperQueue : [])
      .map(normalizeString)
      .filter((value) => value && value !== normalizedHelperId),
    offerCycleExcludedHelperIds: normalizeHelperIdList([
      ...(Array.isArray(request?.offerCycleExcludedHelperIds) ? request.offerCycleExcludedHelperIds : []),
      normalizedHelperId,
    ]),
    declinedHelperIds: normalizeHelperIdList([
      ...(Array.isArray(request?.declinedHelperIds) ? request.declinedHelperIds : []),
      normalizedHelperId,
    ]),
  };
}

function buildExpiredOfferLists(request, helperId) {
  const normalizedHelperId = normalizeString(helperId);
  return {
    helperQueue: (Array.isArray(request?.helperQueue) ? request.helperQueue : [])
      .map(normalizeString)
      .filter((value) => value && value !== normalizedHelperId),
    busyHelperQueue: (Array.isArray(request?.busyHelperQueue) ? request.busyHelperQueue : [])
      .map(normalizeString)
      .filter((value) => value && value !== normalizedHelperId),
    offerCycleExcludedHelperIds: normalizeHelperIdList([
      ...(Array.isArray(request?.offerCycleExcludedHelperIds) ? request.offerCycleExcludedHelperIds : []),
      normalizedHelperId,
    ]),
  };
}

function normalizeExpiredPendingOffer(request = {}, now = Date.now()) {
  const status = normalizeString(request?.status).toLowerCase();
  const helperId = normalizeString(request?.currentOfferHelperId);
  const offerToken = normalizeString(request?.offerToken);
  const offerRevision = normalizeRevision(request?.offerRevision);
  const expiresAtMs = normalizeTimestamp(request?.offerExpiresAt);
  if (
    status !== 'helper_found'
    || !helperId
    || !expiresAtMs
    || expiresAtMs > now
    || request?.helperAssignment?.helperId
  ) {
    return { expired: false, helperId: '', request };
  }

  const lists = buildExpiredOfferLists(request, helperId);
  const previousResponse = request?.lastOfferResponse;
  const alreadyRecorded = Boolean(
    previousResponse
    && normalizeString(previousResponse.helperId) === helperId
    && normalizeString(previousResponse.offerToken) === offerToken
    && normalizeRevision(previousResponse.offerRevision) === offerRevision
    && normalizeString(previousResponse.action).toLowerCase() === 'expired',
  );
  const lastOfferResponse = alreadyRecorded
    ? previousResponse
    : {
      helperId,
      offerToken,
      offerRevision,
      action: 'expired',
      respondedAtMs: now,
    };

  return {
    expired: true,
    alreadyRecorded,
    helperId,
    offerToken,
    offerRevision,
    offeredAtMs: normalizeTimestamp(request?.lastOfferAt) || expiresAtMs,
    lastOfferResponse,
    request: {
      ...request,
      status: 'matching',
      helperQueue: lists.helperQueue,
      busyHelperQueue: lists.busyHelperQueue,
      offerCycleExcludedHelperIds: lists.offerCycleExcludedHelperIds,
      currentOfferHelperId: null,
      offerExpiresAt: null,
      offerToken: null,
      offerType: null,
      offerBusyActiveRequestId: null,
      lastOfferResponse,
    },
  };
}

function mergePreservedHelperQueue({
  preservedQueue = [],
  rebuiltQueue = [],
} = {}) {
  const rebuiltIdSet = new Set(normalizeHelperIdList(rebuiltQueue));
  const merged = [];
  const seen = new Set();

  const pushId = (value) => {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    merged.push(normalized);
  };

  (Array.isArray(preservedQueue) ? preservedQueue : [])
    .filter((value) => rebuiltIdSet.has(normalizeString(value)))
    .forEach(pushId);

  (Array.isArray(rebuiltQueue) ? rebuiltQueue : []).forEach(pushId);
  return merged;
}

function resolveNextServiceHelperSelection(
  request = {},
  candidateQueue = [],
  now = Date.now(),
  { reofferCooldownMs = 60_000 } = {},
) {
  const excludedHelperIds = normalizeHelperIdList(request.offerCycleExcludedHelperIds);
  const declinedHelperIdSet = new Set([
    ...normalizeHelperIdList(request.declinedHelperIds),
    ...normalizeHelperIdList(request.canceledByHelperIds),
  ]);
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

  const lastOfferAtMs = normalizeTimestamp(request.lastOfferAt);
  const cooldownElapsed = deferredQueue.length > 0
    && lastOfferAtMs > 0
    && (now - lastOfferAtMs) >= Math.max(0, Number(reofferCooldownMs) || 0);

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

const HELPER_REQUEST_TRANSITIONS = {
  accepted: new Set(['driving', 'en_route', 'buying_resources', 'arrived']),
  driving: new Set(['en_route', 'buying_resources', 'arrived']),
  en_route: new Set(['driving', 'buying_resources', 'arrived']),
  buying_resources: new Set(['driving', 'en_route', 'arrived']),
  arrived: new Set(['work_started']),
  work_started: new Set(['completed']),
};

const HELPER_CANCELABLE_STATUSES = new Set([
  'accepted',
  'driving',
  'en_route',
  'buying_resources',
  'arrived',
  'work_started',
  'helper_queued',
]);

function evaluateHelperRequestTransition(request, { helperId, nextStatus }) {
  const currentStatus = normalizeString(request?.status).toLowerCase();
  const normalizedNextStatus = normalizeString(nextStatus).toLowerCase();
  if (!normalizeString(helperId) || normalizeString(request?.helperAssignment?.helperId) !== normalizeString(helperId)) {
    return { ok: false, code: 'not-assigned-helper' };
  }
  if (!Object.hasOwn(HELPER_REQUEST_TRANSITIONS, currentStatus)) {
    return { ok: false, code: 'invalid-current-status' };
  }
  if (!HELPER_REQUEST_TRANSITIONS[currentStatus].has(normalizedNextStatus)) {
    return { ok: false, code: 'invalid-status-transition' };
  }
  return { ok: true, currentStatus, nextStatus: normalizedNextStatus };
}

function buildHelperCancelRematchTransition(
  request = {},
  {
    helperId = '',
    helperName = '',
    reason = '',
    nextPayoutBreakdown = undefined,
    now = Date.now(),
    noHelperWindowMs = 5 * 60 * 1000,
  } = {},
) {
  const normalizedHelperId = normalizeString(helperId);
  const currentStatus = normalizeString(request?.status).toLowerCase();
  const assignedHelperId = normalizeString(request?.helperAssignment?.helperId);
  if (!normalizedHelperId || assignedHelperId !== normalizedHelperId) {
    return { ok: false, code: 'not-assigned-helper' };
  }
  if (!HELPER_CANCELABLE_STATUSES.has(currentStatus)) {
    return { ok: false, code: 'request-not-cancelable' };
  }

  const resolvedHelperName = normalizeString(helperName)
    || normalizeString(request?.helperAssignment?.helperName)
    || 'Your helper';
  const cleanReason = normalizeString(reason).slice(0, 500);
  const lists = buildDeclinedOfferLists(request, normalizedHelperId);
  const busyHelperQueue = (Array.isArray(request?.busyHelperQueue) ? request.busyHelperQueue : [])
    .map(normalizeString)
    .filter((value) => value && value !== normalizedHelperId);
  const canceledByHelperIds = normalizeHelperIdList([
    ...(Array.isArray(request?.canceledByHelperIds) ? request.canceledByHelperIds : []),
    normalizedHelperId,
  ]);
  const existingHistory = Array.isArray(request?.helperCancellationHistory)
    ? request.helperCancellationHistory.filter((item) => item && typeof item === 'object')
    : [];
  const cancellationEntry = {
    helperId: normalizedHelperId,
    helperName: resolvedHelperName,
    reason: cleanReason,
    canceledFromStatus: currentStatus,
    canceledAtMs: now,
  };
  const helperCancellationHistory = [...existingHistory, cancellationEntry];
  const windowMs = Math.max(60_000, Number(noHelperWindowMs) || (5 * 60 * 1000));
  const preservedRevision = normalizeRevision(request?.offerRevision);

  return {
    ok: true,
    canceledFromStatus: currentStatus,
    canceledAtMs: now,
    cancelCount: helperCancellationHistory.length,
    helperId: normalizedHelperId,
    helperName: resolvedHelperName,
    reason: cleanReason,
    updates: {
      status: 'matching',
      statusDetail: `${resolvedHelperName} canceled. Finding another nearby helper for you.`,
      helperAssignment: null,
      currentOfferHelperId: null,
      offerExpiresAt: null,
      offerToken: null,
      offerType: null,
      offerBusyActiveRequestId: null,
      pendingBusyAssignment: null,
      helperQueue: lists.helperQueue,
      busyHelperQueue,
      offerCycleExcludedHelperIds: lists.offerCycleExcludedHelperIds,
      declinedHelperIds: lists.declinedHelperIds,
      canceledByHelperIds,
      helperCancellationHistory,
      offerRevision: preservedRevision,
      lastOfferResponse: {
        helperId: normalizedHelperId,
        offerToken: normalizeString(request?.lastOfferResponse?.offerToken),
        offerRevision: preservedRevision,
        action: 'canceled_after_accept',
        respondedAtMs: now,
      },
      arrivedAt: null,
      workStartedAt: null,
      arrivalVerification: null,
      canceledBy: null,
      canceledReason: null,
      canceledAt: null,
      canceledAtMs: null,
      canceledFromStatus: null,
      endedAt: null,
      financialOperationId: null,
      lastCanceledHelperId: normalizedHelperId,
      lastCanceledHelperName: resolvedHelperName,
      lastCanceledHelperReason: cleanReason,
      lastHelperCanceledAtMs: now,
      matchingStartedAtMs: now,
      noHelperWindowExpiresAtMs: now + windowMs,
      ...(nextPayoutBreakdown !== undefined ? { helperPayoutBreakdown: nextPayoutBreakdown } : {}),
    },
  };
}

module.exports = {
  HELPER_CANCELABLE_STATUSES,
  buildDeclinedOfferLists,
  buildExpiredOfferLists,
  buildHelperCancelRematchTransition,
  evaluateOfferExpiry,
  evaluateHelperRequestTransition,
  evaluateOfferResponse,
  mergePreservedHelperQueue,
  normalizeExpiredPendingOffer,
  normalizeHelperIdList,
  normalizeRevision,
  normalizeTimestamp,
  resolveNextServiceHelperSelection,
};
