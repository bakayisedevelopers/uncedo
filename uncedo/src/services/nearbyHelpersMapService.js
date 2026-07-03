import * as Location from 'expo-location';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFirebaseClients } from '../firebase/config';

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

function formatAddressParts(address = {}) {
  const lineOne = [
    address.name,
    address.streetNumber,
    address.street,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();

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

export async function reverseGeocodeCustomerLocation(location = null) {
  const normalized = normalizeLocation(location);
  if (!normalized) {
    return '';
  }

  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: normalized.latitude,
      longitude: normalized.longitude,
    });
    const [firstResult] = Array.isArray(results) ? results : [];
    return formatAddressParts(firstResult || {});
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
  const { auth, db } = getFirebaseClients();
  if (!auth.currentUser?.uid) {
    throw new Error('You must be signed in to view nearby helpers.');
  }

  const origin = normalizeLocation({ latitude, longitude });
  if (!origin) {
    throw new Error('A valid customer location is required.');
  }

  const helpersSnapshot = await getDocs(
    query(
      collection(db, 'users'),
      where('activeRole', '==', 'helper'),
      where('onlineStatus', '==', 'online'),
    ),
  );

  const helpers = helpersSnapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .map((helper) => {
      const location = normalizeLocation(helper?.liveLocation || null);
      if (!location) return null;
      const distanceKm = computeDistanceKm(origin, location);
      const fullName = String(helper.fullName || helper.displayName || helper.firstName || 'Helper').trim();
      return {
        id: helper.id,
        fullName,
        initials: getInitials(fullName),
        profilePhoto: String(helper.profilePhoto || helper.selfieUrl || helper.photoURL || '').trim(),
        distanceKm,
        liveLocation: {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          updatedAtMs: Number(helper?.liveLocation?.updatedAtMs || 0) || null,
        },
      };
    })
    .filter((item) => item && Number.isFinite(item.distanceKm) && item.distanceKm <= radiusKm)
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, limit)
    .map((item) => ({
      ...item,
      distanceKm: Number(item.distanceKm.toFixed(2)),
    }));

  return {
    currentUser: {
      id: auth.currentUser.uid,
      latitude: origin.latitude,
      longitude: origin.longitude,
    },
    helpers,
    radiusKm: Number(radiusKm || 20),
  };
}

function toRadians(value) {
  return (Number(value || 0) * Math.PI) / 180;
}

function computeDistanceKm(origin, target) {
  if (!origin || !target) return Number.POSITIVE_INFINITY;
  const earthRadiusKm = 6371;
  const latDelta = toRadians(target.latitude - origin.latitude);
  const lonDelta = toRadians(target.longitude - origin.longitude);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(toRadians(origin.latitude))
    * Math.cos(toRadians(target.latitude))
    * Math.sin(lonDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function getInitials(value = '') {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
