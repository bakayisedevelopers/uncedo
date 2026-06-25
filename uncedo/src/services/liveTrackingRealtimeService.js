import { getFirebaseClients } from '../firebase/config';

const LIVE_TRACKING_ROOT = 'liveTracking/serviceRequests';

function normalizeCoordinate(coordinate = null) {
  const latitude = Number(coordinate?.latitude);
  const longitude = Number(coordinate?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(Number(coordinate?.accuracy)) ? Number(coordinate.accuracy) : null,
    altitude: Number.isFinite(Number(coordinate?.altitude)) ? Number(coordinate.altitude) : null,
    altitudeAccuracy: Number.isFinite(Number(coordinate?.altitudeAccuracy)) ? Number(coordinate.altitudeAccuracy) : null,
    heading: Number.isFinite(Number(coordinate?.heading)) ? Number(coordinate.heading) : null,
    speed: Number.isFinite(Number(coordinate?.speed)) ? Number(coordinate.speed) : null,
    updatedAtMs: Number.isFinite(Number(coordinate?.updatedAtMs)) ? Number(coordinate.updatedAtMs) : Date.now(),
  };
}

function normalizeRouteSnapshot(routeSnapshot = null) {
  if (!routeSnapshot || typeof routeSnapshot !== 'object') {
    return null;
  }

  return {
    routeCoordinates: Array.isArray(routeSnapshot.routeCoordinates) ? routeSnapshot.routeCoordinates : [],
    routeSteps: Array.isArray(routeSnapshot.routeSteps) ? routeSnapshot.routeSteps : [],
    encodedPolyline: String(routeSnapshot.encodedPolyline || '').trim(),
    overviewEncodedPolyline: String(routeSnapshot.overviewEncodedPolyline || '').trim(),
    distanceMeters: Number.isFinite(Number(routeSnapshot.distanceMeters)) ? Number(routeSnapshot.distanceMeters) : null,
    durationSeconds: Number.isFinite(Number(routeSnapshot.durationSeconds)) ? Number(routeSnapshot.durationSeconds) : null,
    routeProvider: String(routeSnapshot.routeProvider || '').trim(),
    lastRouteOrigin: normalizeCoordinate(routeSnapshot.lastRouteOrigin),
    lastDestination: normalizeCoordinate(routeSnapshot.lastDestination),
    lastSuccessfulRouteFetchAtMs: Number.isFinite(Number(routeSnapshot.lastSuccessfulRouteFetchAtMs))
      ? Number(routeSnapshot.lastSuccessfulRouteFetchAtMs)
      : 0,
  };
}

function normalizeLiveTrackingSnapshot(snapshot = {}) {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }

  const routeSnapshot = normalizeRouteSnapshot(snapshot.routeSnapshot);

  return {
    requestId: String(snapshot.requestId || '').trim(),
    helperLocation: normalizeCoordinate(snapshot.helperLocation),
    customerLocation: normalizeCoordinate(snapshot.customerLocation),
    routeSnapshot,
    routeSteps: Array.isArray(routeSnapshot?.routeSteps) ? routeSnapshot.routeSteps : [],
    routePolylineEncoded: String(routeSnapshot?.encodedPolyline || '').trim(),
    routePolylineOverviewEncoded: String(routeSnapshot?.overviewEncodedPolyline || '').trim(),
    routeCoordinatesLastUpdatedAtMs: Number.isFinite(Number(routeSnapshot?.lastSuccessfulRouteFetchAtMs))
      ? Number(routeSnapshot.lastSuccessfulRouteFetchAtMs)
      : 0,
    distanceMeters: Number.isFinite(Number(routeSnapshot?.distanceMeters)) ? Number(routeSnapshot.distanceMeters) : null,
    durationSeconds: Number.isFinite(Number(routeSnapshot?.durationSeconds)) ? Number(routeSnapshot.durationSeconds) : null,
    routeProvider: String(routeSnapshot?.routeProvider || '').trim(),
    distanceTravelledMeters: Number.isFinite(Number(snapshot.distanceTravelledMeters))
      ? Number(snapshot.distanceTravelledMeters)
      : 0,
    status: String(snapshot.status || '').trim(),
    updatedAtMs: Number.isFinite(Number(snapshot.updatedAtMs)) ? Number(snapshot.updatedAtMs) : 0,
  };
}

const writeQueues = new Map();
const closedTrackingPaths = new Set();

function sanitizePatch(patch = {}) {
  const nextPatch = {};

  if (patch.requestId !== undefined) nextPatch.requestId = String(patch.requestId || '').trim();
  if (patch.status !== undefined) nextPatch.status = String(patch.status || '').trim();
  if (patch.updatedAtMs !== undefined) {
    nextPatch.updatedAtMs = Number.isFinite(Number(patch.updatedAtMs)) ? Number(patch.updatedAtMs) : Date.now();
  }
  if (patch.distanceTravelledMeters !== undefined) {
    nextPatch.distanceTravelledMeters = Number.isFinite(Number(patch.distanceTravelledMeters))
      ? Number(patch.distanceTravelledMeters)
      : 0;
  }
  if (patch.helperLocation !== undefined) nextPatch.helperLocation = normalizeCoordinate(patch.helperLocation);
  if (patch.customerLocation !== undefined) nextPatch.customerLocation = normalizeCoordinate(patch.customerLocation);
  if (patch.routeSnapshot !== undefined) nextPatch.routeSnapshot = normalizeRouteSnapshot(patch.routeSnapshot);

  return nextPatch;
}

async function enqueueLatestWrite(path, writeFn, patch) {
  if (closedTrackingPaths.has(path)) {
    return null;
  }

  const existing = writeQueues.get(path) || { inFlight: false, pending: null, promise: null };
  existing.pending = {
    ...(existing.pending || {}),
    ...patch,
  };
  writeQueues.set(path, existing);

  if (existing.inFlight) {
    return existing.promise;
  }

  existing.inFlight = true;
  existing.promise = (async () => {
    while (existing.pending) {
      if (closedTrackingPaths.has(path)) {
        existing.pending = null;
        return;
      }

      const nextPatch = existing.pending;
      existing.pending = null;
      await writeFn(nextPatch);
    }
  })()
    .finally(() => {
      existing.inFlight = false;
      existing.promise = null;
      if (!existing.pending) {
        writeQueues.delete(path);
      }
    });

  return existing.promise;
}

export function getLiveTrackingPath(requestId = '') {
  return `${LIVE_TRACKING_ROOT}/${String(requestId || '').trim()}`;
}

export async function updateLiveTracking(requestId, patch = {}) {
  const requestKey = String(requestId || '').trim();
  if (!requestKey) return null;

  const nextPatch = sanitizePatch({
    ...patch,
    requestId: requestKey,
    updatedAtMs: Number.isFinite(Number(patch.updatedAtMs)) ? Number(patch.updatedAtMs) : Date.now(),
  });

  const { realtimeDb, realtimeDbModule } = getFirebaseClients();
  const path = getLiveTrackingPath(requestKey);
  const trackingRef = realtimeDbModule.ref(realtimeDb, path);

  await enqueueLatestWrite(path, async (queuedPatch) => {
    await realtimeDbModule.update(trackingRef, queuedPatch);
  }, nextPatch);

  return nextPatch;
}

export async function clearLiveTracking(requestId) {
  const requestKey = String(requestId || '').trim();
  if (!requestKey) return;

  const path = getLiveTrackingPath(requestKey);
  const existing = writeQueues.get(path);
  if (existing?.promise) {
    await existing.promise.catch(() => {});
  }

  closedTrackingPaths.add(path);

  const { realtimeDb, realtimeDbModule } = getFirebaseClients();
  await realtimeDbModule.remove(realtimeDbModule.ref(realtimeDb, path));
  writeQueues.delete(path);
}

export async function subscribeToLiveTracking(requestId, callback, onError) {
  const requestKey = String(requestId || '').trim();
  if (!requestKey) {
    callback(null);
    return () => {};
  }

  const { realtimeDb, realtimeDbModule } = getFirebaseClients();
  const trackingRef = realtimeDbModule.ref(realtimeDb, getLiveTrackingPath(requestKey));
  return realtimeDbModule.onValue(
    trackingRef,
    (snapshot) => {
      callback(snapshot.exists() ? normalizeLiveTrackingSnapshot(snapshot.val() || {}) : null);
    },
    onError,
  );
}

export function normalizeLiveTrackingData(value = null) {
  return normalizeLiveTrackingSnapshot(value);
}
