import * as Location from 'expo-location';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
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
  const { auth, db } = getFirebaseClients();
  if (!auth.currentUser?.uid) {
    throw new Error('You must be signed in to view nearby customers.');
  }

  const origin = normalizeLocation({ latitude, longitude });
  if (!origin) {
    throw new Error('A valid helper location is required.');
  }

  const activeStatuses = ['matching', 'helper_found', 'accepted', 'driving', 'en_route', 'buying_resources', 'arrived', 'work_started', 'scheduled_pending'];
  const requestsSnapshot = await getDocs(
    query(collection(db, 'serviceRequests'), where('status', 'in', activeStatuses)),
  );
  const customerIds = [...new Set(
    requestsSnapshot.docs
      .map((item) => String(item.data()?.customerId || '').trim())
      .filter(Boolean),
  )];

  const customerSnapshots = await Promise.all(customerIds.map((customerId) => getDoc(doc(db, 'users', customerId)).catch(() => null)));

  const customers = customerSnapshots
    .filter((snapshot) => snapshot?.exists?.())
    .map((item) => ({ id: item.id, ...item.data() }))
    .map((customer) => {
      const location = normalizeLocation(customer?.lastKnownLocation || customer?.homeLocation || null);
      if (!location) return null;
      const distanceKm = computeDistanceKm(origin, location);
      return {
        id: customer.id,
        fullName: String(customer.fullName || customer.displayName || 'Customer').trim(),
        initials: getInitials(customer.fullName || customer.displayName || 'Customer'),
        customerType: String(customer?.customerProfile?.customerType || customer?.customerProfile?.accountType || '').trim(),
        distanceKm,
        lastKnownLocation: {
          latitude: location.latitude,
          longitude: location.longitude,
          updatedAtMs: Number(customer?.lastKnownLocation?.updatedAtMs || 0) || null,
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
    customers,
    radiusKm: Number(radiusKm || 50),
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
