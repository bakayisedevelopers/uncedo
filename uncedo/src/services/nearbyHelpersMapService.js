import * as Location from 'expo-location';
import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';

const NEARBY_HELPERS_MAP_ENDPOINT = getFunctionEndpoint('getNearbyHelpersMapData');

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

export async function requestCustomerLocationPermission() {
  const permission = await Location.requestForegroundPermissionsAsync();
  return permission?.status === 'granted';
}

export async function getCurrentCustomerLocation() {
  const current = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return normalizeLocation(current?.coords || {});
}

export async function watchCustomerLocation(onLocation) {
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

export async function fetchNearbyHelpersMapData({ latitude, longitude, radiusKm = 20, limit = 24 }) {
  const { auth } = getFirebaseClients();
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error('You must be signed in to view nearby helpers.');
  }

  const response = await fetch(NEARBY_HELPERS_MAP_ENDPOINT, {
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
    throw new Error(payload?.message || 'Unable to load nearby helpers right now.');
  }

  return {
    currentUser: payload.currentUser || null,
    helpers: Array.isArray(payload.helpers) ? payload.helpers : [],
    radiusKm: Number(payload.radiusKm || radiusKm),
  };
}
