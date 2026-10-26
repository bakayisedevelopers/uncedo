'use strict';

function normalizeCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= -180 && number <= 180 ? number : null;
}

function distanceKm(origin, target) {
  const lat1 = Number(origin?.latitude);
  const lon1 = Number(origin?.longitude);
  const lat2 = Number(target?.latitude);
  const lon2 = Number(target?.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const radians = (value) => (value * Math.PI) / 180;
  const latDelta = radians(lat2 - lat1);
  const lonDelta = radians(lon2 - lon1);
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(lonDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function initials(name) {
  return String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
}

function buildNearbyHelperMapResults({ documents = [], origin, radiusKm = 20, limit = 24 } = {}) {
  const maxRadius = Math.max(1, Math.min(50, Number(radiusKm) || 20));
  const maxResults = Math.max(1, Math.min(50, Math.floor(Number(limit) || 24)));
  return (Array.isArray(documents) ? documents : [])
    .map((document) => {
      const data = typeof document?.data === 'function' ? document.data() : (document?.data || {});
      const location = data.location || data.liveLocation || null;
      const distance = distanceKm(origin, location);
      const name = String(data.publicName || 'Helper').trim().slice(0, 120) || 'Helper';
      if (data.available !== true || data.online !== true || data.activeRole !== 'helper' || distance > maxRadius) return null;
      return {
        id: String(document.id || data.helperId || ''),
        fullName: name,
        initials: initials(name),
        profilePhoto: String(data.publicProfilePhoto || '').slice(0, 1000),
        distanceKm: Number(distance.toFixed(2)),
        liveLocation: {
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          accuracy: Number.isFinite(Number(location.accuracy)) ? Number(location.accuracy) : null,
          updatedAtMs: Number(data.lastLocationUpdatedAt || location.updatedAtMs || 0) || null,
        },
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, maxResults);
}

function validOrigin(latitude, longitude) {
  const lat = normalizeCoordinate(latitude);
  const lon = normalizeCoordinate(longitude);
  if (lat === null || lon === null || lat < -90 || lat > 90) return null;
  return { latitude: lat, longitude: lon };
}

module.exports = { buildNearbyHelperMapResults, distanceKm, validOrigin };
