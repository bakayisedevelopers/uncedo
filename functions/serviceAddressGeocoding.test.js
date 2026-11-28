'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  geocodeServiceAddressWithFallback,
  normalizeGeoCoordinates,
  parseStrictGeoCoordinate,
  stripLeadingStreetNumber,
} = require('./serviceAddressGeocoding');

test('parseStrictGeoCoordinate rejects null, empty strings, booleans, objects, and out-of-range values', () => {
  assert.equal(parseStrictGeoCoordinate(null, -90, 90), null);
  assert.equal(parseStrictGeoCoordinate(undefined, -90, 90), null);
  assert.equal(parseStrictGeoCoordinate('', -90, 90), null);
  assert.equal(parseStrictGeoCoordinate('   ', -90, 90), null);
  assert.equal(parseStrictGeoCoordinate(true, -90, 90), null);
  assert.equal(parseStrictGeoCoordinate(false, -90, 90), null);
  assert.equal(parseStrictGeoCoordinate({}, -90, 90), null);
  assert.equal(parseStrictGeoCoordinate(-91, -90, 90), null);
  assert.equal(parseStrictGeoCoordinate(181, -180, 180), null);
  assert.equal(parseStrictGeoCoordinate('-25.8735', -90, 90), -25.8735);
  assert.equal(parseStrictGeoCoordinate(0, -90, 90), 0);
});

test('normalizeGeoCoordinates rejects Null Island (0,0) and missing coordinates', () => {
  assert.equal(normalizeGeoCoordinates(null), null);
  assert.equal(normalizeGeoCoordinates({ latitude: null, longitude: null }), null);
  assert.equal(normalizeGeoCoordinates({ latitude: 0, longitude: 0 }), null);
  assert.equal(normalizeGeoCoordinates({ latitude: '0', longitude: '0' }), null);
  assert.deepEqual(
    normalizeGeoCoordinates({ latitude: '-25.8735744', longitude: '29.2284024' }),
    { latitude: -25.8735744, longitude: 29.2284024 },
  );
});

test('stripLeadingStreetNumber removes house numbers for street-level fallback search', () => {
  assert.equal(
    stripLeadingStreetNumber('17 Iris Street Witbank Mpumalanga 1035'),
    'Iris Street Witbank Mpumalanga 1035',
  );
  assert.equal(stripLeadingStreetNumber('Iris Street Witbank'), '');
});

test('geocodeServiceAddressWithFallback resolves address via Nominatim when Google key is absent', async () => {
  const seenUrls = [];
  const result = await geocodeServiceAddressWithFallback('17 Iris Street Witbank Mpumalanga 1035', {
    apiKey: '',
    fetchImpl: async (url) => {
      seenUrls.push(url);
      return {
        ok: true,
        async json() {
          return [{ lat: '-25.8735744', lon: '29.2284024' }];
        },
      };
    },
  });
  assert.deepEqual(result, {
    latitude: -25.8735744,
    longitude: 29.2284024,
    provider: 'nominatim',
  });
  assert.match(seenUrls[0], /nominatim\.openstreetmap\.org\/search/);
  assert.match(seenUrls[0], /countrycodes=za/);
});

test('geocodeServiceAddressWithFallback prefers Google when key is provided and falls back to stripped street on Nominatim miss', async () => {
  const seenUrls = [];
  const googleResult = await geocodeServiceAddressWithFallback('17 Iris Street Witbank', {
    apiKey: 'test-key',
    fetchImpl: async (url) => {
      seenUrls.push(url);
      return {
        ok: true,
        async json() {
          return { status: 'OK', results: [{ geometry: { location: { lat: -25.87, lng: 29.22 } } }] };
        },
      };
    },
  });
  assert.deepEqual(googleResult, { latitude: -25.87, longitude: 29.22, provider: 'google_geocoding' });
  assert.match(seenUrls[0], /maps\.googleapis\.com\/maps\/api\/geocode/);

  let callCount = 0;
  const relaxedResult = await geocodeServiceAddressWithFallback('17 Small Close Witbank 1035', {
    apiKey: '',
    fetchImpl: async () => {
      callCount += 1;
      return {
        ok: true,
        async json() {
          return callCount === 1 ? [] : [{ lat: '-25.88', lon: '29.23' }];
        },
      };
    },
  });
  assert.equal(callCount, 2);
  assert.deepEqual(relaxedResult, { latitude: -25.88, longitude: 29.23, provider: 'nominatim' });
});
