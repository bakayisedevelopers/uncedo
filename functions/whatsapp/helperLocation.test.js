'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEVICE_HELPER_LOCATION_MAX_AGE_MS,
  WHATSAPP_HELPER_LOCATION_MAX_AGE_MS,
  WHATSAPP_HELPER_ONLINE_LOCATION_TTL_MS,
  buildHelperLocationMapUrl,
  helperLocationMaxAgeMs,
  isIncomingWhatsAppLocationNewer,
  isHelperLocationFresh,
  normalizeWhatsAppHelperLocation,
  parseWhatsAppHelperAvailabilityCommand,
  resolveWhatsAppHelperLocationMode,
} = require('./helperLocation');

test('helper availability commands are deterministic and deliberately limited', () => {
  assert.equal(parseWhatsAppHelperAvailabilityCommand(' Go online '), 'go_online');
  assert.equal(parseWhatsAppHelperAvailabilityCommand('start accepting jobs'), 'go_online');
  assert.equal(parseWhatsAppHelperAvailabilityCommand('go offline'), 'go_offline');
  assert.equal(parseWhatsAppHelperAvailabilityCommand('I need a service'), '');
  assert.equal(parseWhatsAppHelperAvailabilityCommand('online please help me'), '');
});

test('WhatsApp location accepts bounded coordinates and stores no supplied place labels', () => {
  const location = normalizeWhatsAppHelperLocation({
    latitude: '-26.2041', longitude: '28.0473', name: 'Sensitive place', address: 'Private address',
  }, { capturedAtMs: 1_800_000_000_000, receivedAtMs: 1_800_000_001_000, sourceEventId: 'event-1' });
  assert.deepEqual(location, {
    latitude: -26.2041, longitude: 28.0473, accuracy: null, altitude: null,
    altitudeAccuracy: null, heading: null, speed: null, source: 'whatsapp',
    updatedAtMs: 1_800_000_000_000, receivedAtMs: 1_800_000_001_000, sourceEventId: 'event-1',
  });
  assert.equal(normalizeWhatsAppHelperLocation({ latitude: 91, longitude: 0 }, { capturedAtMs: 1 }), null);
  assert.equal(normalizeWhatsAppHelperLocation({ latitude: 0, longitude: -181 }, { capturedAtMs: 1 }), null);
  assert.equal(normalizeWhatsAppHelperLocation({ latitude: null, longitude: 0 }, { capturedAtMs: 1 }), null);
  assert.equal(normalizeWhatsAppHelperLocation({ latitude: '', longitude: 0 }, { capturedAtMs: 1 }), null);
  assert.equal(normalizeWhatsAppHelperLocation({ latitude: true, longitude: 0 }, { capturedAtMs: 1 }), null);
  assert.equal(normalizeWhatsAppHelperLocation({ latitude: 0, longitude: 0 }, { capturedAtMs: true }), null);
});

test('manual WhatsApp pins expire after one hour while app GPS keeps its existing 15-minute window', () => {
  const now = 1_800_000_000_000;
  const whatsappPin = { latitude: -26.2, longitude: 28.0, source: 'whatsapp', updatedAtMs: now - 59 * 60 * 1000 };
  const devicePin = { ...whatsappPin, source: 'device' };
  assert.equal(helperLocationMaxAgeMs(whatsappPin), WHATSAPP_HELPER_LOCATION_MAX_AGE_MS);
  assert.equal(helperLocationMaxAgeMs(devicePin), DEVICE_HELPER_LOCATION_MAX_AGE_MS);
  assert.equal(isHelperLocationFresh(whatsappPin, now), true);
  assert.equal(isHelperLocationFresh({ ...whatsappPin, updatedAtMs: now - WHATSAPP_HELPER_LOCATION_MAX_AGE_MS - 1 }, now), false);
  assert.equal(isHelperLocationFresh({ ...whatsappPin, updatedAtMs: now + 1 }, now), false);
  assert.equal(isHelperLocationFresh(devicePin, now), false);
  assert.equal(WHATSAPP_HELPER_ONLINE_LOCATION_TTL_MS, 10 * 60 * 1000);
});

test('location updates use webhook receipt order when Meta capture timestamps tie', () => {
  const sameCapture = { updatedAtMs: 1000 };
  assert.equal(isIncomingWhatsAppLocationNewer(
    { ...sameCapture, receivedAtMs: 20, sourceEventId: 'new' },
    { ...sameCapture, receivedAtMs: 10, sourceEventId: 'old' },
  ), true);
  assert.equal(isIncomingWhatsAppLocationNewer(
    { ...sameCapture, receivedAtMs: 10, sourceEventId: 'old' },
    { ...sameCapture, receivedAtMs: 20, sourceEventId: 'new' },
  ), false);
  assert.equal(isIncomingWhatsAppLocationNewer(
    { updatedAtMs: 1001 }, { updatedAtMs: 1000 },
  ), true);
});

test('only the verified linked helper can use a current pending go-online pin or refresh an online location', () => {
  const common = {
    authorization: { role: 'helper', uid: 'helper-1', verified: true, linked: true },
    identityId: 'identity-1', helperId: 'helper-1', readinessReady: true, nowMs: 1000,
  };
  assert.deepEqual(resolveWhatsAppHelperLocationMode({
    ...common, profile: { onlineStatus: 'offline' },
    pending: { identityId: 'identity-1', helperId: 'helper-1', purpose: 'go_online', expiresAtMs: 2000 },
  }), { code: 'activate-online' });
  assert.deepEqual(resolveWhatsAppHelperLocationMode({
    ...common, authorization: { ...common.authorization, linked: false }, profile: { onlineStatus: 'offline' },
  }), { code: 'helper-link-required' });
  assert.deepEqual(resolveWhatsAppHelperLocationMode({
    ...common, profile: { onlineStatus: 'offline' },
    pending: { identityId: 'identity-1', helperId: 'helper-1', purpose: 'go_online', expiresAtMs: 999 },
  }), { code: 'online-command-required' });
  assert.deepEqual(resolveWhatsAppHelperLocationMode({
    ...common, readinessReady: false, profile: { onlineStatus: 'offline' },
    pending: { identityId: 'identity-1', helperId: 'helper-1', purpose: 'go_online', expiresAtMs: 2000 },
  }), { code: 'profile-not-ready' });
  assert.deepEqual(resolveWhatsAppHelperLocationMode({
    ...common, profile: { onlineStatus: 'offline', suspended: true },
    pending: { identityId: 'identity-1', helperId: 'helper-1', purpose: 'go_online', expiresAtMs: 2000 },
  }), { code: 'helper-unavailable' });
  assert.deepEqual(resolveWhatsAppHelperLocationMode({
    ...common, profile: { onlineStatus: 'offline' },
    pending: { identityId: 'another-identity', helperId: 'helper-1', purpose: 'go_online', expiresAtMs: 2000 },
  }), { code: 'online-command-required' });
});

test('a WhatsApp pin refreshes an assigned active job but not a different helper job', () => {
  const common = {
    authorization: { role: 'helper', uid: 'helper-1', verified: true, linked: true },
    identityId: 'identity-1', helperId: 'helper-1', readinessReady: false, nowMs: 1000,
    profile: { onlineStatus: 'offline', activeServiceRequestId: 'request-1' },
  };
  assert.deepEqual(resolveWhatsAppHelperLocationMode({
    ...common, assignedActiveRequest: { id: 'request-1', helperId: 'helper-1', open: true },
  }), { code: 'active-request', requestId: 'request-1' });
  assert.deepEqual(resolveWhatsAppHelperLocationMode({
    ...common, assignedActiveRequest: { id: 'request-1', helperId: 'helper-2', open: true },
  }), { code: 'active-request-unavailable', requestId: 'request-1' });
});

test('helper map links contain only validated static coordinates', () => {
  assert.equal(buildHelperLocationMapUrl({ latitude: -26.2, longitude: 28.0 }), 'https://maps.google.com/?q=-26.200000,28.000000');
  assert.equal(buildHelperLocationMapUrl({ latitude: 91, longitude: 28 }), '');
});
