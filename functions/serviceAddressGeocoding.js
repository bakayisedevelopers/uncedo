'use strict';

function parseStrictGeoCoordinate(value, min, max) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  if (typeof value === 'object') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) return null;
  return numeric;
}

function normalizeGeoCoordinates(value = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const latitude = parseStrictGeoCoordinate(value.latitude, -90, 90);
  const longitude = parseStrictGeoCoordinate(value.longitude, -180, 180);
  if (latitude === null || longitude === null) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

function resolveGoogleGeocodingApiKey(explicitKey = '') {
  return String(
    explicitKey
    || process.env.GOOGLE_MAPS_API_KEY
    || process.env.GOOGLE_GEOCODING_API_KEY
    || process.env.VITE_GOOGLE_MAPS_API_KEY
    || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
    || '',
  ).trim();
}

function stripLeadingStreetNumber(address = '') {
  const stripped = String(address || '')
    .trim()
    .replace(/^(?:unit|apt|flat|shop|stand|erf|lot|no\.?)?\s*\d+[a-z]?(?:\/\d+[a-z]?)?[\s,/-]+/i, '')
    .trim();
  return stripped.length >= 4 && stripped !== String(address || '').trim() ? stripped : '';
}

async function fetchJsonWithTimeout(fetchImpl, url, { headers = {}, timeoutMs = 4500 } = {}) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(url, {
      headers,
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!response?.ok) return null;
    return await response.json().catch(() => null);
  } catch (_error) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function geocodeWithGoogle(address, { fetchImpl, apiKey, timeoutMs }) {
  if (!apiKey) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=country:ZA&key=${encodeURIComponent(apiKey)}`;
  const payload = await fetchJsonWithTimeout(fetchImpl, url, { timeoutMs });
  if (payload?.status !== 'OK' || !Array.isArray(payload.results) || !payload.results.length) return null;
  const location = payload.results[0]?.geometry?.location || {};
  const coords = normalizeGeoCoordinates({ latitude: location.lat, longitude: location.lng });
  return coords ? { ...coords, provider: 'google_geocoding' } : null;
}

async function geocodeWithNominatim(query, { fetchImpl, timeoutMs }) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=za&q=${encodeURIComponent(query)}`;
  const payload = await fetchJsonWithTimeout(fetchImpl, url, {
    timeoutMs,
    headers: {
      'User-Agent': 'UncedoServiceGeocoder/1.0 (+https://bakayise-uncedo-latest.web.app)',
      'Accept-Language': 'en',
    },
  });
  const first = Array.isArray(payload) ? payload[0] : null;
  if (!first) return null;
  const coords = normalizeGeoCoordinates({ latitude: first.lat, longitude: first.lon });
  return coords ? { ...coords, provider: 'nominatim' } : null;
}

async function geocodeServiceAddressWithFallback(
  address = '',
  { fetchImpl = globalThis.fetch, apiKey = '', timeoutMs = 4500, logger = null } = {},
) {
  const normalizedAddress = String(address || '').trim().replace(/\s+/g, ' ').slice(0, 500);
  if (normalizedAddress.length < 4 || typeof fetchImpl !== 'function') return null;

  const resolvedGoogleKey = resolveGoogleGeocodingApiKey(apiKey);
  if (resolvedGoogleKey) {
    const googleCoords = await geocodeWithGoogle(normalizedAddress, {
      fetchImpl,
      apiKey: resolvedGoogleKey,
      timeoutMs,
    });
    if (googleCoords) return googleCoords;
  }

  const nominatimCoords = await geocodeWithNominatim(normalizedAddress, { fetchImpl, timeoutMs });
  if (nominatimCoords) return nominatimCoords;

  const fallbackQuery = stripLeadingStreetNumber(normalizedAddress);
  if (fallbackQuery) {
    const relaxedCoords = await geocodeWithNominatim(fallbackQuery, { fetchImpl, timeoutMs });
    if (relaxedCoords) return relaxedCoords;
  }

  logger?.warn?.('service_address_geocode_miss', {
    addressLength: normalizedAddress.length,
    hadGoogleKey: Boolean(resolvedGoogleKey),
  });
  return null;
}

module.exports = {
  geocodeServiceAddressWithFallback,
  normalizeGeoCoordinates,
  parseStrictGeoCoordinate,
  stripLeadingStreetNumber,
};
