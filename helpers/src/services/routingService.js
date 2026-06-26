import { GOOGLE_MAPS_API_KEY } from '../constants/runtimeConfig';
import { logInfo } from './logger';

const GOOGLE_DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';
const OSRM_DIRECTIONS_URL = 'https://router.project-osrm.org/route/v1/driving';
const ROUTE_REFRESH_MS = 30000;
const ROUTE_ORIGIN_MOVED_METERS = 50;
const ROUTE_OFF_PATH_METERS = 75;

export function normalizeCoordinate(coordinate = null) {
  const latitude = Number(coordinate?.latitude);
  const longitude = Number(coordinate?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

export function decodePolyline(encoded = '') {
  const points = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    latitude += (result & 1) ? ~(result >> 1) : (result >> 1);

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    longitude += (result & 1) ? ~(result >> 1) : (result >> 1);

    points.push({
      latitude: latitude / 1e5,
      longitude: longitude / 1e5,
    });
  }

  return points;
}

function encodeSignedValue(value) {
  let current = value < 0 ? ~(value << 1) : (value << 1);
  let output = '';

  while (current >= 0x20) {
    output += String.fromCharCode((0x20 | (current & 0x1f)) + 63);
    current >>= 5;
  }

  return output + String.fromCharCode(current + 63);
}

export function encodePolyline(coordinates = []) {
  let previousLatitude = 0;
  let previousLongitude = 0;

  return (Array.isArray(coordinates) ? coordinates : [])
    .map((coordinate) => normalizeCoordinate(coordinate))
    .filter(Boolean)
    .map((coordinate) => {
      const latitude = Math.round(coordinate.latitude * 1e5);
      const longitude = Math.round(coordinate.longitude * 1e5);
      const encoded = (
        encodeSignedValue(latitude - previousLatitude)
        + encodeSignedValue(longitude - previousLongitude)
      );

      previousLatitude = latitude;
      previousLongitude = longitude;
      return encoded;
    })
    .join('');
}

function appendCoordinateIfNeeded(target, coordinate) {
  const next = normalizeCoordinate(coordinate);
  if (!next) return;

  const last = target[target.length - 1];
  if (
    last
    && Math.abs(last.latitude - next.latitude) < 0.00001
    && Math.abs(last.longitude - next.longitude) < 0.00001
  ) {
    return;
  }

  target.push(next);
}

function stripHtml(value = '') {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractGoogleRouteCoordinates(route = null) {
  const detailedCoordinates = [];
  const steps = route?.legs?.flatMap((leg) => leg?.steps || []) || [];

  steps.forEach((step) => {
    decodePolyline(step?.polyline?.points || '').forEach((coordinate) => appendCoordinateIfNeeded(detailedCoordinates, coordinate));
  });

  if (detailedCoordinates.length > 1) {
    return detailedCoordinates;
  }

  return decodePolyline(route?.overview_polyline?.points || '');
}

function extractGoogleRouteSteps(route = null) {
  const steps = route?.legs?.flatMap((leg) => leg?.steps || []) || [];
  const routeSteps = [];
  const routeCoordinates = [];

  steps.forEach((step) => {
    const decodedCoordinates = decodePolyline(step?.polyline?.points || '');
    if (!decodedCoordinates.length) {
      return;
    }

    const startIndex = routeCoordinates.length;
    decodedCoordinates.forEach((coordinate) => appendCoordinateIfNeeded(routeCoordinates, coordinate));
    const endIndex = Math.max(startIndex, routeCoordinates.length - 1);

    routeSteps.push({
      instruction: stripHtml(step?.html_instructions || step?.instructions || step?.maneuver || ''),
      maneuver: String(step?.maneuver || '').trim(),
      distanceMeters: Number(step?.distance?.value || 0),
      durationSeconds: Number(step?.duration?.value || 0),
      distanceText: String(step?.distance?.text || '').trim(),
      durationText: String(step?.duration?.text || '').trim(),
      startIndex,
      endIndex,
      polyline: encodePolyline(decodedCoordinates),
    });
  });

  return {
    routeCoordinates,
    routeSteps,
  };
}

function parseGoogleRoute(route = null) {
  const routeSegments = extractGoogleRouteSteps(route);
  const routeCoordinates = routeSegments.routeCoordinates.length > 1
    ? routeSegments.routeCoordinates
    : extractGoogleRouteCoordinates(route);
  const legs = Array.isArray(route?.legs) ? route.legs : [];
  const distanceMeters = legs.reduce((sum, leg) => sum + Number(leg?.distance?.value || 0), 0);
  const durationSeconds = legs.reduce((sum, leg) => sum + Number(leg?.duration?.value || 0), 0);
  const overviewEncodedPolyline = String(route?.overview_polyline?.points || '').trim();
  const detailedEncodedPolyline = routeCoordinates.length > 1
    ? encodePolyline(routeCoordinates)
    : overviewEncodedPolyline;

  return {
    routeCoordinates,
    routeSteps: routeSegments.routeSteps,
    encodedPolyline: detailedEncodedPolyline,
    overviewEncodedPolyline,
    distanceMeters,
    durationSeconds,
  };
}

function parseOsrmRoute(route = null) {
  const encodedPolyline = String(route?.geometry || '').trim();
  return {
    routeCoordinates: decodePolyline(encodedPolyline),
    routeSteps: [],
    encodedPolyline,
    overviewEncodedPolyline: encodedPolyline,
    distanceMeters: Number(route?.distance || 0),
    durationSeconds: Number(route?.duration || 0),
  };
}

async function fetchGoogleRoute(origin, destination) {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('Google Maps API key is missing.');
  }

  // TODO: Move Directions API calls behind Firebase Functions to reduce client-side key exposure.

  const params = new URLSearchParams({
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    key: GOOGLE_MAPS_API_KEY,
  });

  const response = await fetch(`${GOOGLE_DIRECTIONS_URL}?${params.toString()}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.status !== 'OK') {
    throw new Error(payload?.error_message || payload?.status || 'Google directions failed.');
  }

  const parsed = parseGoogleRoute(payload?.routes?.[0] || null);
  if (parsed.routeCoordinates.length <= 1) {
    throw new Error('Google directions returned an empty route.');
  }

  logInfo('routing', 'Google route success', {
    coordinateCount: parsed.routeCoordinates.length,
    distanceMeters: parsed.distanceMeters,
    durationSeconds: parsed.durationSeconds,
  });

  return {
    ...parsed,
    routeProvider: 'google',
    error: '',
  };
}

async function fetchOsrmRoute(origin, destination) {
  const response = await fetch(
    `${OSRM_DIRECTIONS_URL}/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=polyline`,
  );
  const payload = await response.json().catch(() => ({}));
  const parsed = parseOsrmRoute(payload?.routes?.[0] || null);

  if (!response.ok || parsed.routeCoordinates.length <= 1) {
    throw new Error('OSRM directions failed.');
  }

  logInfo('routing', 'OSRM fallback success', {
    coordinateCount: parsed.routeCoordinates.length,
    distanceMeters: parsed.distanceMeters,
    durationSeconds: parsed.durationSeconds,
  });

  return {
    ...parsed,
    routeProvider: 'osrm',
    error: '',
  };
}

export async function fetchRouteData(originInput, destinationInput) {
  const origin = normalizeCoordinate(originInput);
  const destination = normalizeCoordinate(destinationInput);

  if (!origin || !destination) {
    return {
      routeCoordinates: [],
      routeSteps: [],
      encodedPolyline: '',
      distanceMeters: null,
      durationSeconds: null,
      routeProvider: '',
      error: 'Origin and destination are required.',
    };
  }

  try {
    return await fetchGoogleRoute(origin, destination);
  } catch (error) {
    logInfo('routing', 'Google route failure', {
      message: error?.message || 'Unknown Google route error',
    });
  }

  try {
    return await fetchOsrmRoute(origin, destination);
  } catch (error) {
    logInfo('routing', 'OSRM fallback failure', {
      message: error?.message || 'Unknown OSRM route error',
    });
    return {
      routeCoordinates: [],
      routeSteps: [],
      encodedPolyline: '',
      distanceMeters: null,
      durationSeconds: null,
      routeProvider: '',
      error: error?.message || 'Route unavailable.',
    };
  }
}

export function haversineDistanceMeters(fromInput, toInput) {
  const from = normalizeCoordinate(fromInput);
  const to = normalizeCoordinate(toInput);
  if (!from || !to) {
    return Number.POSITIVE_INFINITY;
  }

  const earthRadius = 6371e3;
  const phi1 = (from.latitude * Math.PI) / 180;
  const phi2 = (to.latitude * Math.PI) / 180;
  const deltaPhi = ((to.latitude - from.latitude) * Math.PI) / 180;
  const deltaLambda = ((to.longitude - from.longitude) * Math.PI) / 180;
  const a = (
    Math.sin(deltaPhi / 2) ** 2
    + Math.cos(phi1) * Math.cos(phi2) * (Math.sin(deltaLambda / 2) ** 2)
  );

  return earthRadius * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function toMeters(point, anchor) {
  const latMeters = (point.latitude - anchor.latitude) * 111320;
  const lngMeters = (point.longitude - anchor.longitude)
    * 111320
    * Math.cos((anchor.latitude * Math.PI) / 180);

  return { x: lngMeters, y: latMeters };
}

function distanceToSegmentMeters(point, segmentStart, segmentEnd) {
  const start = toMeters(segmentStart, point);
  const end = toMeters(segmentEnd, point);
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentLengthSquared = (segmentX ** 2) + (segmentY ** 2);

  if (!segmentLengthSquared) {
    return Math.sqrt((start.x ** 2) + (start.y ** 2));
  }

  const t = Math.max(0, Math.min(1, -((start.x * segmentX) + (start.y * segmentY)) / segmentLengthSquared));
  const projectionX = start.x + (segmentX * t);
  const projectionY = start.y + (segmentY * t);

  return Math.sqrt((projectionX ** 2) + (projectionY ** 2));
}

export function distanceFromPointToPolylineMeters(pointInput, coordinates = []) {
  const point = normalizeCoordinate(pointInput);
  if (!point || !Array.isArray(coordinates) || coordinates.length < 2) {
    return Number.POSITIVE_INFINITY;
  }

  let minDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < coordinates.length; index += 1) {
    const start = normalizeCoordinate(coordinates[index - 1]);
    const end = normalizeCoordinate(coordinates[index]);

    if (!start || !end) continue;
    minDistance = Math.min(minDistance, distanceToSegmentMeters(point, start, end));
  }

  return minDistance;
}

function hasDestinationChanged(destinationInput, lastDestinationInput) {
  const destination = normalizeCoordinate(destinationInput);
  const lastDestination = normalizeCoordinate(lastDestinationInput);

  if (!destination || !lastDestination) {
    return destination !== lastDestination;
  }

  return haversineDistanceMeters(destination, lastDestination) > 10;
}

export function getRerouteReason({
  currentLocation,
  destination,
  routeCoordinates = [],
  lastRouteOrigin = null,
  lastDestination = null,
  lastSuccessfulRouteFetchAtMs = 0,
  nowMs = Date.now(),
}) {
  const normalizedCurrent = normalizeCoordinate(currentLocation);
  const normalizedDestination = normalizeCoordinate(destination);

  if (!normalizedCurrent || !normalizedDestination) {
    return '';
  }

  if (!routeCoordinates.length) {
    return 'tracking_started';
  }

  if (hasDestinationChanged(normalizedDestination, lastDestination)) {
    return 'destination_changed';
  }

  if (normalizeCoordinate(lastRouteOrigin)
    && haversineDistanceMeters(normalizedCurrent, lastRouteOrigin) >= ROUTE_ORIGIN_MOVED_METERS) {
    return 'origin_shifted';
  }

  if (distanceFromPointToPolylineMeters(normalizedCurrent, routeCoordinates) > ROUTE_OFF_PATH_METERS) {
    return 'off_route';
  }

  if (!lastSuccessfulRouteFetchAtMs || (nowMs - lastSuccessfulRouteFetchAtMs) >= ROUTE_REFRESH_MS) {
    return 'refresh_interval';
  }

  return '';
}

export function buildRouteSnapshot(routeData, origin, destination) {
  return {
    routeCoordinates: Array.isArray(routeData?.routeCoordinates) ? routeData.routeCoordinates : [],
    routeSteps: Array.isArray(routeData?.routeSteps)
      ? routeData.routeSteps.map((step) => ({
          instruction: String(step?.instruction || '').trim(),
          maneuver: String(step?.maneuver || '').trim(),
          distanceMeters: Number.isFinite(Number(step?.distanceMeters)) ? Number(step.distanceMeters) : null,
          durationSeconds: Number.isFinite(Number(step?.durationSeconds)) ? Number(step.durationSeconds) : null,
          distanceText: String(step?.distanceText || '').trim(),
          durationText: String(step?.durationText || '').trim(),
          startIndex: Number.isFinite(Number(step?.startIndex)) ? Number(step.startIndex) : 0,
          endIndex: Number.isFinite(Number(step?.endIndex)) ? Number(step.endIndex) : 0,
          polyline: String(step?.polyline || '').trim(),
        }))
      : [],
    encodedPolyline: String(routeData?.encodedPolyline || '').trim(),
    overviewEncodedPolyline: String(routeData?.overviewEncodedPolyline || '').trim(),
    distanceMeters: Number.isFinite(Number(routeData?.distanceMeters)) ? Number(routeData.distanceMeters) : null,
    durationSeconds: Number.isFinite(Number(routeData?.durationSeconds)) ? Number(routeData.durationSeconds) : null,
    routeProvider: String(routeData?.routeProvider || '').trim(),
    lastRouteOrigin: normalizeCoordinate(origin),
    lastDestination: normalizeCoordinate(destination),
    lastSuccessfulRouteFetchAtMs: Date.now(),
  };
}
