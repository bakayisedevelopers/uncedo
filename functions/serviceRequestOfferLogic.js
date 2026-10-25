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

function buildDeclinedOfferLists(request, helperId) {
  const normalizedHelperId = normalizeString(helperId);
  const unique = (values) => [...new Set((Array.isArray(values) ? values : [])
    .map(normalizeString)
    .filter(Boolean))];
  return {
    helperQueue: (Array.isArray(request?.helperQueue) ? request.helperQueue : [])
      .map(normalizeString)
      .filter((value) => value && value !== normalizedHelperId),
    offerCycleExcludedHelperIds: unique([
      ...(Array.isArray(request?.offerCycleExcludedHelperIds) ? request.offerCycleExcludedHelperIds : []),
      normalizedHelperId,
    ]),
    declinedHelperIds: unique([
      ...(Array.isArray(request?.declinedHelperIds) ? request.declinedHelperIds : []),
      normalizedHelperId,
    ]),
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

module.exports = {
  buildDeclinedOfferLists,
  evaluateOfferExpiry,
  evaluateHelperRequestTransition,
  evaluateOfferResponse,
  normalizeRevision,
  normalizeTimestamp,
};
