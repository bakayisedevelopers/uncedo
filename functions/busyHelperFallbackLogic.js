'use strict';

const NO_HELPER_WINDOW_MS = 5 * 60 * 1000;
const BUSY_CONFIRMATION_TIMEOUT_MS = 3 * 60 * 1000;
const DEFAULT_SERVICE_DURATION_MINUTES = 40;

function normalizeIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
}

function normalizeMillisValue(value) {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getNoHelperWindowExpiresAtMs(request = {}) {
  const explicit = normalizeMillisValue(request.noHelperWindowExpiresAtMs);
  if (explicit > 0) return explicit;
  return 0;
}

function hasNoHelperWindowExpired(request = {}, now = Date.now()) {
  const expiresAtMs = getNoHelperWindowExpiresAtMs(request);
  return expiresAtMs > 0 && now >= expiresAtMs;
}

function formatJohannesburgClockTime(timestampMs = Date.now()) {
  try {
    return new Date(timestampMs).toLocaleTimeString('en-ZA', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Africa/Johannesburg',
    });
  } catch {
    const date = new Date(timestampMs + 2 * 60 * 60 * 1000);
    return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
  }
}

function estimateCurrentRequestRemainingMinutes({
  activeRequest = {},
  tracking = {},
  now = Date.now(),
} = {}) {
  const status = String(activeRequest?.status || '').trim().toLowerCase();
  const pricingDuration = Number(
    activeRequest?.pricingSnapshot?.estimatedDurationMinutes
      ?? activeRequest?.estimatedDurationMinutes
      ?? activeRequest?.serviceDurationMinutes
      ?? 0,
  );
  const expectedWorkMinutes = Number.isFinite(pricingDuration) && pricingDuration >= 15
    ? Math.min(240, Math.round(pricingDuration))
    : DEFAULT_SERVICE_DURATION_MINUTES;

  if (status === 'work_started') {
    const startedAtMs = normalizeMillisValue(
      activeRequest.workStartedAt || activeRequest.helperAssignment?.workStartedAt,
    );
    const elapsedMinutes = startedAtMs > 0 ? Math.max(0, (now - startedAtMs) / 60000) : 10;
    const remainingWork = Math.round(expectedWorkMinutes - elapsedMinutes);
    return Math.max(10, Math.min(180, remainingWork));
  }

  if (status === 'arrived') {
    return Math.max(15, Math.min(180, expectedWorkMinutes + 5));
  }

  // accepted, driving, en_route, buying_resources
  const trackedRemainingMinutes = Number(tracking?.travelProgress?.remainingMinutes ?? 0);
  const preArrivalTravelMinutes = Number.isFinite(trackedRemainingMinutes) && trackedRemainingMinutes > 0
    ? Math.ceil(trackedRemainingMinutes)
    : 12;
  return Math.max(20, Math.min(240, preArrivalTravelMinutes + expectedWorkMinutes + 5));
}

function buildBusyHelperEtaSummary({
  activeRequest = {},
  tracking = {},
  travelDurationSeconds = 900,
  now = Date.now(),
} = {}) {
  const finishCurrentMinutes = estimateCurrentRequestRemainingMinutes({ activeRequest, tracking, now });
  const travelMinutes = Math.max(5, Math.ceil(Math.max(60, Number(travelDurationSeconds || 900)) / 60));
  const totalArrivalMinutes = finishCurrentMinutes + travelMinutes;
  const finishEstimatedAtMs = now + finishCurrentMinutes * 60 * 1000;
  const arrivalEstimatedAtMs = now + totalArrivalMinutes * 60 * 1000;

  return {
    finishCurrentMinutes,
    travelMinutes,
    totalArrivalMinutes,
    finishEstimatedAtMs,
    arrivalEstimatedAtMs,
    finishClockTime: formatJohannesburgClockTime(finishEstimatedAtMs),
    arrivalClockTime: formatJohannesburgClockTime(arrivalEstimatedAtMs),
  };
}

function buildBusyHelperCustomerConfirmationMessage({
  request = {},
  helperName = 'A helper',
  etaSummary = {},
} = {}) {
  const serviceName = String(request.serviceSummary || request.subject || 'your Uncedo service').trim();
  const refCode = String(request.publicRequestReference || request.requestReference || '').trim();
  const refPrefix = refCode ? `[*${refCode}*] ` : '';
  const safeHelperName = String(helperName || 'A helper').trim() || 'A helper';
  const finishMins = Math.max(1, Number(etaSummary.finishCurrentMinutes || 25));
  const arrivalMins = Math.max(finishMins + 1, Number(etaSummary.totalArrivalMinutes || 40));
  const finishClock = String(etaSummary.finishClockTime || '').trim();
  const arrivalClock = String(etaSummary.arrivalClockTime || '').trim();

  const text = [
    `${refPrefix}👷 *Helper Found (Finishing Another Job)*`,
    '',
    `*${safeHelperName}* accepted your *${serviceName}* request, but is currently finishing up another nearby job.`,
    `• Estimated time to finish current job: *~${finishMins} mins*${finishClock ? ` (around *${finishClock}*)` : ''}`,
    `• Estimated arrival at your location: *~${arrivalMins} mins*${arrivalClock ? ` (around *${arrivalClock}*)` : ''}`,
    '',
    'Would you like to wait for this helper, or should we continue searching for another helper?',
  ].join('\n');

  const interactiveBody = [
    `*${safeHelperName}* is finishing another job:`,
    `• Finishes current job: ~${finishMins} min${finishClock ? ` (${finishClock})` : ''}`,
    `• Estimated arrival: ~${arrivalMins} min${arrivalClock ? ` (${arrivalClock})` : ''}`,
    '',
    'Are you okay to wait or continue searching?',
  ].join('\n').slice(0, 1024);

  return { text, interactiveBody };
}

/**
 * Wraps the existing free-helper selection without changing its behavior when any
 * free helper can be offered right now. Only when freeSelection yields no
 * selectedHelperId does it fall back to busyCandidateQueue.
 */
function resolveHelperSelectionWithBusyFallback({
  request = {},
  freeSelection = {},
  busyCandidateQueue = [],
} = {}) {
  if (freeSelection && freeSelection.selectedHelperId) {
    return {
      ...freeSelection,
      offerType: 'standard',
      isBusyFallback: false,
    };
  }

  const declinedSet = new Set(normalizeIdList(request.declinedHelperIds));
  const excludedSet = new Set(normalizeIdList(request.offerCycleExcludedHelperIds));
  const rejectedBusySet = new Set(normalizeIdList(request.customerRejectedBusyHelperIds));

  const eligibleBusyQueue = normalizeIdList(busyCandidateQueue).filter(
    (helperId) => !declinedSet.has(helperId) && !excludedSet.has(helperId) && !rejectedBusySet.has(helperId),
  );

  if (eligibleBusyQueue.length > 0) {
    return {
      queue: Array.isArray(freeSelection?.queue) ? freeSelection.queue : [],
      busyQueue: eligibleBusyQueue,
      selectedHelperId: eligibleBusyQueue[0],
      excludedHelperIds: Array.isArray(freeSelection?.excludedHelperIds) ? freeSelection.excludedHelperIds : normalizeIdList(request.offerCycleExcludedHelperIds),
      resetExcludedHelperIds: false,
      reofferAfterCooldown: false,
      offerType: 'busy_helper_fallback',
      isBusyFallback: true,
    };
  }

  return {
    ...(freeSelection || {}),
    queue: Array.isArray(freeSelection?.queue) ? freeSelection.queue : [],
    busyQueue: [],
    selectedHelperId: '',
    offerType: 'standard',
    isBusyFallback: false,
  };
}

module.exports = {
  BUSY_CONFIRMATION_TIMEOUT_MS,
  DEFAULT_SERVICE_DURATION_MINUTES,
  NO_HELPER_WINDOW_MS,
  buildBusyHelperCustomerConfirmationMessage,
  buildBusyHelperEtaSummary,
  estimateCurrentRequestRemainingMinutes,
  formatJohannesburgClockTime,
  getNoHelperWindowExpiresAtMs,
  hasNoHelperWindowExpired,
  resolveHelperSelectionWithBusyFallback,
};
