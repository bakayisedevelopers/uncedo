'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildNearbyHelperMapResults, validOrigin } = require('./nearbyHelperMapService');

test('nearby helper projection returns only safe fields for available nearby helpers', () => {
  const results = buildNearbyHelperMapResults({ origin: { latitude: -26.2, longitude: 28.0 }, documents: [
    { id: 'helper-1', data: { available: true, online: true, activeRole: 'helper', publicName: 'A Helper', location: { latitude: -26.201, longitude: 28.001 }, publicProfilePhoto: 'https://example.test/photo' } },
    { id: 'helper-2', data: { available: false, online: true, activeRole: 'helper', location: { latitude: -26.2, longitude: 28.0 } } },
  ] });
  assert.equal(results.length, 1);
  assert.equal(results[0].fullName, 'A Helper');
  assert.equal(Object.hasOwn(results[0], 'payout'), false);
  assert.equal(Object.hasOwn(results[0], 'phoneNumber'), false);
});

test('nearby helper result count and geographic input are bounded', () => {
  assert.equal(buildNearbyHelperMapResults({ documents: [], origin: { latitude: 0, longitude: 0 }, limit: 1000 }).length, 0);
  assert.equal(validOrigin(92, 0), null);
  assert.deepEqual(validOrigin(-26.2, 28.0), { latitude: -26.2, longitude: 28 });
});
