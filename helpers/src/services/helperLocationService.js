import * as Location from 'expo-location';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
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

async function postHelperLiveLocation(location) {
  const { auth, db } = getFirebaseClients();
  const uid = String(auth.currentUser?.uid || '').trim();
  if (!uid) {
    throw new Error('You must be signed in before sharing helper location.');
  }

  const liveLocation = {
    ...location,
    updatedAtMs: Date.now(),
  };
  await setDoc(doc(db, 'users', uid), {
    liveLocation,
    locationSharingEnabled: true,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return liveLocation;
}

export async function requestHelperLocationPermission() {
  const permission = await Location.requestForegroundPermissionsAsync();
  return permission?.status === 'granted';
}

export async function syncHelperCurrentLocation() {
  const current = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const location = normalizeLocation(current?.coords || {});
  if (!location) {
    throw new Error('Unable to read the current helper location.');
  }

  await postHelperLiveLocation(location);
  return location;
}

export async function watchHelperLocation(onLocation, options = {}) {
  return Location.watchPositionAsync(
    {
      accuracy: options.accuracy ?? Location.Accuracy.Balanced,
      distanceInterval: options.distanceInterval ?? 25,
      timeInterval: options.timeInterval ?? 15000,
    },
    (position) => {
      const location = normalizeLocation(position?.coords || {});
      if (!location) return;
      onLocation?.(location);
    },
  );
}

export async function watchAndSyncHelperLocation(onLocation) {
  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 50,
      timeInterval: 30000,
    },
    async (position) => {
      const location = normalizeLocation(position?.coords || {});
      if (!location) return;
      onLocation?.(location);
      try {
        await postHelperLiveLocation(location);
      } catch (error) {
        console.warn('[helpers:location]', error?.message || 'Unable to sync helper location.');
      }
    },
  );
}
