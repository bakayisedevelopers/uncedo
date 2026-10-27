'use strict';

const DEVICE_HELPER_LOCATION_MAX_AGE_MS = 15 * 60 * 1000;
const WHATSAPP_HELPER_LOCATION_MAX_AGE_MS = 60 * 60 * 1000;
const WHATSAPP_HELPER_ONLINE_LOCATION_TTL_MS = 10 * 60 * 1000;

function parseWhatsAppHelperAvailabilityCommand(value = '') {
  const text = String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  if (/^(?:online|go online|i want to go online|i am going online|start receiving offers|start accepting jobs)$/.test(text)) {
    return 'go_online';
  }
  if (/^(?:offline|go offline|i want to go offline|take me offline|stop receiving offers)$/.test(text)) {
    return 'go_offline';
  }
  return '';
}

function normalizeWhatsAppHelperLocation(location = {}, { capturedAtMs, receivedAtMs, sourceEventId = '' } = {}) {
  const rawLatitude = location?.latitude;
  const rawLongitude = location?.longitude;
  const asFiniteNumber = (value) => {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !value.trim()) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const latitude = asFiniteNumber(rawLatitude);
  const longitude = asFiniteNumber(rawLongitude);
  const captured = asFiniteNumber(capturedAtMs);
  const received = asFiniteNumber(receivedAtMs);
  if (latitude === null || longitude === null
    || latitude < -90 || latitude > 90
    || longitude < -180 || longitude > 180
    || captured === null || captured <= 0) return null;

  const rounded = (value) => Number(value.toFixed(6));
  return {
    latitude: rounded(latitude),
    longitude: rounded(longitude),
    accuracy: null,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    source: 'whatsapp',
    updatedAtMs: Math.round(captured),
    ...(received !== null && received > 0 ? { receivedAtMs: Math.round(received) } : {}),
    ...(String(sourceEventId || '').trim() ? { sourceEventId: String(sourceEventId).trim().slice(0, 200) } : {}),
  };
}

function helperLocationMaxAgeMs(location = {}) {
  return String(location?.source || '').trim().toLowerCase() === 'whatsapp'
    ? WHATSAPP_HELPER_LOCATION_MAX_AGE_MS
    : DEVICE_HELPER_LOCATION_MAX_AGE_MS;
}

function isHelperLocationFresh(location = {}, nowMs = Date.now()) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  const updatedAtMs = Number(location?.updatedAtMs);
  const now = Number(nowMs);
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    && Number.isFinite(updatedAtMs) && updatedAtMs > 0
    && Number.isFinite(now) && now >= updatedAtMs
    && now - updatedAtMs <= helperLocationMaxAgeMs(location);
}

function isIncomingWhatsAppLocationNewer(incoming = {}, current = {}) {
  const incomingCapture = Number(incoming.updatedAtMs || 0);
  const currentCapture = Number(current.updatedAtMs || 0);
  if (incomingCapture !== currentCapture) return incomingCapture > currentCapture;

  const incomingReceived = Number(incoming.receivedAtMs || 0);
  const currentReceived = Number(current.receivedAtMs || 0);
  if (incomingReceived !== currentReceived) return incomingReceived > currentReceived;

  const incomingEventId = String(incoming.sourceEventId || '');
  const currentEventId = String(current.sourceEventId || '');
  return !currentEventId || incomingEventId > currentEventId;
}

function isHelperProfileBlocked(profile = {}) {
  const truthy = (value) => value === true || String(value || '').trim().toLowerCase() === 'true';
  return truthy(profile.dispatchPaused ?? profile.isDispatchPaused)
    || truthy(profile.suspended ?? profile.isSuspended)
    || truthy(profile.blocked ?? profile.isBlocked);
}

function resolveWhatsAppHelperLocationMode({
  authorization = {},
  identityId = '',
  helperId = '',
  profile = {},
  pending = {},
  assignedActiveRequest = null,
  readinessReady = false,
  nowMs = Date.now(),
} = {}) {
  if (authorization.role !== 'helper' || authorization.uid !== helperId
    || authorization.verified !== true || authorization.linked !== true || !identityId) {
    return { code: 'helper-link-required' };
  }
  if (isHelperProfileBlocked(profile)) return { code: 'helper-unavailable' };

  const activeRequestId = String(profile.activeServiceRequestId || '').trim();
  if (activeRequestId) {
    if (assignedActiveRequest
      && String(assignedActiveRequest.id || '') === activeRequestId
      && String(assignedActiveRequest.helperId || '') === helperId
      && assignedActiveRequest.open === true) {
      return { code: 'active-request', requestId: activeRequestId };
    }
    return { code: 'active-request-unavailable', requestId: activeRequestId };
  }

  if (String(profile.onlineStatus || '').trim().toLowerCase() === 'online') {
    return readinessReady ? { code: 'refresh-online' } : { code: 'profile-not-ready' };
  }

  const pendingLive = String(pending.identityId || '') === identityId
    && String(pending.helperId || '') === helperId
    && String(pending.purpose || '') === 'go_online'
    && Number(pending.expiresAtMs || 0) > Number(nowMs);
  if (pendingLive) return readinessReady ? { code: 'activate-online' } : { code: 'profile-not-ready' };
  return { code: 'online-command-required' };
}

function buildHelperLocationMapUrl(location = {}) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return '';
  return `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

module.exports = {
  DEVICE_HELPER_LOCATION_MAX_AGE_MS,
  WHATSAPP_HELPER_LOCATION_MAX_AGE_MS,
  WHATSAPP_HELPER_ONLINE_LOCATION_TTL_MS,
  buildHelperLocationMapUrl,
  helperLocationMaxAgeMs,
  isIncomingWhatsAppLocationNewer,
  isHelperLocationFresh,
  isHelperProfileBlocked,
  normalizeWhatsAppHelperLocation,
  parseWhatsAppHelperAvailabilityCommand,
  resolveWhatsAppHelperLocationMode,
};
