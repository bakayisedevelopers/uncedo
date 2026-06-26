import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseClients } from '../firebase/config';
import {
  buildRouteSnapshot,
  fetchRouteData,
  getRerouteReason,
  normalizeCoordinate,
} from './routingService';
import {
  clearLiveTracking,
  updateLiveTracking,
} from './liveTrackingRealtimeService';
import { logError, logInfo } from './logger';

export const ACTIVE_JOB_LOCATION_TASK = 'uncedo-helper-active-job-location';

const ACTIVE_TRACKING_STORAGE_KEY = 'uncedo:helper:active-job-tracking';
const ACTIVE_JOB_STATUSES = new Set([
  'accepted',
  'driving',
  'en_route',
  'buying_resources',
  'arrived',
  'work_started',
]);
const ACTIVE_TRAVEL_STATUSES = new Set([
  'driving',
  'en_route',
  'buying_resources',
]);

function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function normalizeHelperLocation(location = null) {
  const coordinate = normalizeCoordinate(location);
  if (!coordinate) {
    return null;
  }

  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    heading: isFiniteNumber(location?.heading) ? Number(location.heading) : null,
    speed: isFiniteNumber(location?.speed) ? Number(location.speed) : null,
    accuracy: isFiniteNumber(location?.accuracy) ? Number(location.accuracy) : null,
    updatedAtMs: isFiniteNumber(location?.updatedAtMs) ? Number(location.updatedAtMs) : Date.now(),
  };
}

function normalizeDestination(destination = null) {
  const coordinate = normalizeCoordinate(destination);
  if (!coordinate) {
    return null;
  }

  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    address: String(destination?.address || '').trim(),
  };
}

function sanitizeRouteSnapshot(routeSnapshot = null) {
  if (!routeSnapshot) {
    return {
      routeCoordinates: [],
      routeSteps: [],
      encodedPolyline: '',
      overviewEncodedPolyline: '',
      distanceMeters: null,
      durationSeconds: null,
      routeProvider: '',
      lastRouteOrigin: null,
      lastDestination: null,
      lastSuccessfulRouteFetchAtMs: 0,
    };
  }

  return {
    routeCoordinates: Array.isArray(routeSnapshot.routeCoordinates) ? routeSnapshot.routeCoordinates : [],
    routeSteps: Array.isArray(routeSnapshot.routeSteps)
      ? routeSnapshot.routeSteps.map((step) => ({
          instruction: String(step?.instruction || '').trim(),
          maneuver: String(step?.maneuver || '').trim(),
          distanceMeters: isFiniteNumber(step?.distanceMeters) ? Number(step.distanceMeters) : null,
          durationSeconds: isFiniteNumber(step?.durationSeconds) ? Number(step.durationSeconds) : null,
          distanceText: String(step?.distanceText || '').trim(),
          durationText: String(step?.durationText || '').trim(),
          startIndex: isFiniteNumber(step?.startIndex) ? Number(step.startIndex) : 0,
          endIndex: isFiniteNumber(step?.endIndex) ? Number(step.endIndex) : 0,
          polyline: String(step?.polyline || '').trim(),
        }))
      : [],
    encodedPolyline: String(routeSnapshot.encodedPolyline || '').trim(),
    overviewEncodedPolyline: String(routeSnapshot.overviewEncodedPolyline || '').trim(),
    distanceMeters: isFiniteNumber(routeSnapshot.distanceMeters) ? Number(routeSnapshot.distanceMeters) : null,
    durationSeconds: isFiniteNumber(routeSnapshot.durationSeconds) ? Number(routeSnapshot.durationSeconds) : null,
    routeProvider: String(routeSnapshot.routeProvider || '').trim(),
    lastRouteOrigin: normalizeCoordinate(routeSnapshot.lastRouteOrigin),
    lastDestination: normalizeCoordinate(routeSnapshot.lastDestination),
    lastSuccessfulRouteFetchAtMs: isFiniteNumber(routeSnapshot.lastSuccessfulRouteFetchAtMs)
      ? Number(routeSnapshot.lastSuccessfulRouteFetchAtMs)
      : 0,
  };
}

function buildSession(session = {}) {
  const status = normalizeStatus(session.status);
  return {
    requestId: String(session.requestId || '').trim(),
    helperId: String(session.helperId || '').trim(),
    customerId: String(session.customerId || '').trim(),
    status,
    destination: normalizeDestination(session.destination),
    routeSnapshot: sanitizeRouteSnapshot(session.routeSnapshot),
    lastHelperLocation: normalizeHelperLocation(session.lastHelperLocation),
    distanceTravelledMeters: isFiniteNumber(session.distanceTravelledMeters) ? Number(session.distanceTravelledMeters) : 0,
    updatedAtMs: isFiniteNumber(session.updatedAtMs) ? Number(session.updatedAtMs) : Date.now(),
  };
}

function shouldTrackStatus(status) {
  return ACTIVE_JOB_STATUSES.has(normalizeStatus(status));
}

function getDistanceInMeters(from = null, to = null) {
  const start = normalizeCoordinate(from);
  const end = normalizeCoordinate(to);
  if (!start || !end) return 0;

  const R = 6371e3;
  const phi1 = (start.latitude * Math.PI) / 180;
  const phi2 = (end.latitude * Math.PI) / 180;
  const deltaPhi = ((end.latitude - start.latitude) * Math.PI) / 180;
  const deltaLambda = ((end.longitude - start.longitude) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2)
    + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function computeTravelStepMeters(previousLocation, nextLocation, status) {
  if (!ACTIVE_TRAVEL_STATUSES.has(normalizeStatus(status))) {
    return 0;
  }

  const distanceMeters = getDistanceInMeters(previousLocation, nextLocation);
  if (!Number.isFinite(distanceMeters) || distanceMeters < 10 || distanceMeters > 5000) {
    return 0;
  }

  return distanceMeters;
}

async function readTrackingSession() {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_TRACKING_STORAGE_KEY);
    if (!raw) return null;
    return buildSession(JSON.parse(raw));
  } catch (error) {
    logError('active-tracking.read-session', error);
    return null;
  }
}

async function writeTrackingSession(session) {
  const nextSession = buildSession(session);
  await AsyncStorage.setItem(ACTIVE_TRACKING_STORAGE_KEY, JSON.stringify(nextSession));
  return nextSession;
}

async function clearTrackingSession() {
  await AsyncStorage.removeItem(ACTIVE_TRACKING_STORAGE_KEY);
}

function buildTrackingPayload(session, helperLocation, routeSnapshot) {
  const safeRouteSnapshot = sanitizeRouteSnapshot(routeSnapshot);

  return {
    helperId: session.helperId,
    customerId: session.customerId,
    requestId: session.requestId,
    helperLocation: helperLocation || null,
    destination: session.destination || null,
    routeSteps: Array.isArray(safeRouteSnapshot.routeSteps) ? safeRouteSnapshot.routeSteps : [],
    routePolylineEncoded: safeRouteSnapshot.encodedPolyline || '',
    routePolylineOverviewEncoded: safeRouteSnapshot.overviewEncodedPolyline || '',
    routeCoordinatesLastUpdatedAtMs: safeRouteSnapshot.lastSuccessfulRouteFetchAtMs || 0,
    distanceMeters: safeRouteSnapshot.distanceMeters,
    durationSeconds: safeRouteSnapshot.durationSeconds,
    routeProvider: safeRouteSnapshot.routeProvider || '',
    distanceTravelledMeters: isFiniteNumber(session.distanceTravelledMeters) ? Number(session.distanceTravelledMeters) : 0,
    status: session.status || '',
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
  };
}

async function writeTrackingDocuments(session, helperLocation, routeSnapshot, source = 'foreground') {
  if (!session?.requestId || !session?.helperId) {
    return;
  }

  const normalizedLocation = normalizeHelperLocation(helperLocation);
  const payload = buildTrackingPayload(session, normalizedLocation, routeSnapshot);

  await updateLiveTracking(session.requestId, {
    requestId: session.requestId,
    helperLocation: normalizedLocation,
    customerLocation: session.destination || null,
    routeSnapshot,
    distanceTravelledMeters: payload.distanceTravelledMeters,
    status: payload.status,
    updatedAtMs: payload.updatedAtMs,
  });

  logInfo('active-tracking.write', 'Location update written', {
    requestId: session.requestId,
    source,
    hasRoute: Boolean(payload.routePolylineEncoded),
    routeProvider: payload.routeProvider || '',
    updatedAtMs: payload.updatedAtMs,
  });
}

async function fetchLatestRouteSnapshot(session, helperLocation, rerouteReason) {
  logInfo('active-tracking.reroute', 'Reroute triggered', {
    requestId: session.requestId,
    reason: rerouteReason,
  });

  const routeData = await fetchRouteData(helperLocation, session.destination);
  if (!routeData.routeCoordinates.length) {
    logInfo('active-tracking.route', 'Route unavailable state', {
      requestId: session.requestId,
      reason: routeData.error || 'Route unavailable',
    });
    return {
      routeCoordinates: [],
      routeSteps: [],
      encodedPolyline: '',
      overviewEncodedPolyline: '',
      distanceMeters: null,
      durationSeconds: null,
      routeProvider: '',
      lastRouteOrigin: normalizeCoordinate(helperLocation),
      lastDestination: normalizeCoordinate(session.destination),
      lastSuccessfulRouteFetchAtMs: 0,
    };
  }

  logInfo('active-tracking.route', 'Decoded route coordinates', {
    requestId: session.requestId,
    coordinateCount: routeData.routeCoordinates.length,
    distanceMeters: routeData.distanceMeters,
    durationSeconds: routeData.durationSeconds,
    routeProvider: routeData.routeProvider,
  });

  return buildRouteSnapshot(routeData, helperLocation, session.destination);
}

async function processTrackingLocationUpdate(locationInput, source = 'foreground') {
  const session = await readTrackingSession();
  if (!session || !shouldTrackStatus(session.status) || !session.destination) {
    return null;
  }

  const helperLocation = normalizeHelperLocation(locationInput);
  if (!helperLocation) {
    return null;
  }

  let routeSnapshot = sanitizeRouteSnapshot(session.routeSnapshot);
  const distanceTravelledMeters = Math.max(
    0,
    Number(session.distanceTravelledMeters || 0) + computeTravelStepMeters(session.lastHelperLocation, helperLocation, session.status),
  );
  const rerouteReason = getRerouteReason({
    currentLocation: helperLocation,
    destination: session.destination,
    routeCoordinates: routeSnapshot.routeCoordinates,
    lastRouteOrigin: routeSnapshot.lastRouteOrigin,
    lastDestination: routeSnapshot.lastDestination,
    lastSuccessfulRouteFetchAtMs: routeSnapshot.lastSuccessfulRouteFetchAtMs,
  });

  if (rerouteReason) {
    try {
      routeSnapshot = await fetchLatestRouteSnapshot(session, helperLocation, rerouteReason);
    } catch (error) {
      logError('active-tracking.route-fetch', error);
    }
  }

  const nextSession = await writeTrackingSession({
    ...session,
    routeSnapshot,
    lastHelperLocation: helperLocation,
    distanceTravelledMeters,
    updatedAtMs: Date.now(),
  });

  try {
    await writeTrackingDocuments(nextSession, helperLocation, routeSnapshot, source);
  } catch (error) {
    logError('active-tracking.write-documents', error);
  }

  return {
    session: nextSession,
    helperLocation,
    routeSnapshot,
  };
}

try {
  TaskManager.defineTask(ACTIVE_JOB_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      logError('active-tracking.task', error);
      return;
    }

    const locations = Array.isArray(data?.locations) ? data.locations : [];
    const latestLocation = locations[locations.length - 1];
    if (!latestLocation?.coords) {
      return;
    }

    await processTrackingLocationUpdate({
      ...latestLocation.coords,
      updatedAtMs: latestLocation.timestamp || Date.now(),
    }, 'background');
  });
} catch (error) {
  logInfo('active-tracking.task', 'Background task already defined', {
    message: error?.message || 'Task define skipped',
  });
}

export async function syncForegroundActiveTrackingUpdate({
  requestId,
  helperId,
  customerId,
  destination,
  status,
  helperLocation,
  routeSnapshot,
}) {
  const existingSession = await readTrackingSession();
  const nextSession = await writeTrackingSession({
    ...existingSession,
    requestId: requestId || existingSession?.requestId,
    helperId: helperId || existingSession?.helperId,
    customerId: customerId || existingSession?.customerId,
    destination: destination || existingSession?.destination,
    status: status || existingSession?.status,
    routeSnapshot: routeSnapshot || existingSession?.routeSnapshot,
    lastHelperLocation: helperLocation || existingSession?.lastHelperLocation,
    updatedAtMs: Date.now(),
  });

  await writeTrackingDocuments(nextSession, helperLocation || nextSession.lastHelperLocation, routeSnapshot || nextSession.routeSnapshot, 'foreground');
}

export async function syncActiveTrackingSession(patch = {}) {
  const existingSession = await readTrackingSession();
  const nextSession = await writeTrackingSession({
    ...existingSession,
    ...patch,
    updatedAtMs: Date.now(),
  });

  return nextSession;
}

export async function startActiveJobTracking({ requestId, helperId, customerId, destination, status }) {
  const session = await writeTrackingSession({
    requestId,
    helperId,
    customerId,
    destination,
    status,
  });

  const foregroundPermission = await Location.getForegroundPermissionsAsync();
  if (foregroundPermission.status !== 'granted') {
    const requestedForeground = await Location.requestForegroundPermissionsAsync();
    if (requestedForeground.status !== 'granted') {
      throw new Error('Foreground location permission is required for active job tracking.');
    }
  }

  const backgroundPermission = await Location.getBackgroundPermissionsAsync();
  if (backgroundPermission.status !== 'granted') {
    const requestedBackground = await Location.requestBackgroundPermissionsAsync();
    if (requestedBackground.status !== 'granted') {
      throw new Error('Background location permission is required for active job tracking.');
    }
  }

  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(ACTIVE_JOB_LOCATION_TASK).catch(() => false);
  if (!alreadyStarted) {
    await Location.startLocationUpdatesAsync(ACTIVE_JOB_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 25,
      timeInterval: 15000,
      deferredUpdatesInterval: 15000,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      activityType: Location.ActivityType?.AutomotiveNavigation,
      foregroundService: {
        notificationTitle: 'Uncedo Helper location sharing',
        notificationBody: 'Uncedo Helper is sharing location for an active job.',
        notificationColor: '#b746a2',
      },
    });
  }

  logInfo('active-tracking.start', 'Background tracking started', {
    requestId: session.requestId,
    status: session.status,
    alreadyStarted,
  });

  try {
    const { db } = getFirebaseClients();
    await setDoc(doc(db, 'users', helperId), {
      activeServiceRequestId: requestId,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    logError('active-tracking.start-user', error);
  }

  try {
    const currentPosition = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    await processTrackingLocationUpdate({
      ...currentPosition?.coords,
      updatedAtMs: currentPosition?.timestamp || Date.now(),
    }, 'startup');
  } catch (error) {
    logError('active-tracking.startup-location', error);
  }

  return session;
}

export async function stopActiveJobTracking({ finalStatus = '', keepLocationSharingEnabled = true } = {}) {
  const session = await readTrackingSession();

  if (session?.requestId && finalStatus) {
    try {
      await clearLiveTracking(session.requestId);
    } catch (error) {
      logError('active-tracking.stop-status', error);
    }
  }

  const started = await Location.hasStartedLocationUpdatesAsync(ACTIVE_JOB_LOCATION_TASK).catch(() => false);
  if (started) {
    await Location.stopLocationUpdatesAsync(ACTIVE_JOB_LOCATION_TASK);
  }

  if (session?.helperId) {
    try {
      const { db } = getFirebaseClients();
      await setDoc(doc(db, 'users', session.helperId), {
        locationSharingEnabled: keepLocationSharingEnabled,
        activeServiceRequestId: null,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      logError('active-tracking.stop-user', error);
    }
  }

  await clearTrackingSession();
  logInfo('active-tracking.stop', 'Background tracking stopped', {
    requestId: session?.requestId || '',
    finalStatus: normalizeStatus(finalStatus),
    started,
  });
}

export async function stopActiveJobTrackingForSignOut() {
  await stopActiveJobTracking({
    finalStatus: 'signed_out',
    keepLocationSharingEnabled: false,
  });
}

export function isTrackableActiveJobStatus(status) {
  return shouldTrackStatus(status);
}

export async function getStoredActiveTrackingSession() {
  return readTrackingSession();
}

export async function processForegroundActiveTrackingLocation(location) {
  return processTrackingLocationUpdate(location, 'foreground');
}
