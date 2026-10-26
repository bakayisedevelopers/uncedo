import * as Location from 'expo-location';
import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';

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

function buildStreetLine(address = {}) {
  const streetAddress = [
    address.streetNumber,
    address.street,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  if (streetAddress) {
    return streetAddress;
  }

  return String(address.name || '').trim();
}

function formatAddressParts(address = {}, detailLevel = 'full') {
  const lineOne = buildStreetLine(address);

  if (detailLevel === 'street-city') {
    const city = String(address.city || '').trim();
    return [lineOne, city]
      .filter(Boolean)
      .join(', ')
      .trim();
  }

  const lineTwo = [
    address.district,
    address.city,
    address.subregion,
    address.region,
    address.postalCode,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ')
    .trim();

  const country = String(address.country || '').trim();

  return [lineOne, lineTwo, country]
    .filter(Boolean)
    .join('\n')
    .trim();
}

export async function reverseGeocodeCustomerLocation(location = null, options = {}) {
  const normalized = normalizeLocation(location);
  if (!normalized) {
    return '';
  }

  try {
    const detailLevel = String(options?.detailLevel || 'full').trim().toLowerCase();
    const results = await Location.reverseGeocodeAsync({
      latitude: normalized.latitude,
      longitude: normalized.longitude,
    });
    const [firstResult] = Array.isArray(results) ? results : [];
    return formatAddressParts(firstResult || {}, detailLevel);
  } catch (error) {
    return '';
  }
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
  if (!auth.currentUser?.uid) {
    throw new Error('You must be signed in to view nearby helpers.');
  }

  const origin = normalizeLocation({ latitude, longitude });
  if (!origin) {
    throw new Error('A valid customer location is required.');
  }

  const idToken = await auth.currentUser.getIdToken();
  const response = await fetch(getFunctionEndpoint('getCustomerNearbyHelpers'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: origin.latitude, longitude: origin.longitude, radiusKm, limit }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success !== true) throw new Error(payload?.message || 'Unable to load nearby helpers.');
  return payload;
}

function toRadians(value) {
  return (Number(value || 0) * Math.PI) / 180;
}
