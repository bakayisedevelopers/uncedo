import * as Location from 'expo-location';
import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';

const NEARBY_CUSTOMERS_MAP_ENDPOINT = getFunctionEndpoint('getNearbyActiveCustomersMapData');

function normalizeLocation(coords = {}) {
  const latitude = Number(coords.latitude);
  const longitude = Number(coords.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(Number(coords.accuracy)) ? Number(coords.accuracy) : null,
    altitude: Number.isFinite(Number(coords.altitude)) ? Number(coords.altitude) : null,
    altitudeAccuracy: Number.isFinite(Number(coords.altitudeAccuracy)) ? Number(coords.altitudeAccuracy) : null,
    heading: Number.isFinite(Number(coords.heading)) ? Number(coords.heading) : null,
    speed: Number.isFinite(Number(coords.speed)) ? Number(coords.speed) : null,
  };
}

function formatAddress(parts = {}) {
  return [
    parts.name,
    parts.street,
    parts.district,
    parts.city,
    parts.region,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ');
}

export async function requestHelperMapLocationPermission() {
  const permission = await Location.requestForegroundPermissionsAsync();
  return permission?.status === 'granted';
}

export async function getCurrentHelperLocation() {
  const current = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return normalizeLocation(current?.coords || {});
}

export async function watchHelperLocation(onLocation) {
  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 50,
      timeInterval: 30000,
    },
    (position) => {
      const next = normalizeLocation(position?.coords || {});
      if (next) {
        onLocation(next);
      }
    },
  );
}

export async function reverseGeocodeLocation(location) {
  const normalized = normalizeLocation(location || {});
  if (!normalized) {
    return '';
  }

  try {
    const [result] = await Location.reverseGeocodeAsync(normalized);
    return formatAddress(result || '');
  } catch (error) {
    return '';
  }
}

export async function fetchNearbyActiveCustomersMapData({ latitude, longitude, radiusKm = 50, limit = 24 }) {
  const { auth } = getFirebaseClients();
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error('You must be signed in to view nearby customers.');
  }

  const response = await fetch(NEARBY_CUSTOMERS_MAP_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      latitude,
      longitude,
      radiusKm,
      limit,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || 'Unable to load nearby customers right now.');
  }

  return {
    currentUser: payload.currentUser || null,
    customers: Array.isArray(payload.customers) ? payload.customers : [],
    radiusKm: Number(payload.radiusKm || radiusKm),
  };
}
