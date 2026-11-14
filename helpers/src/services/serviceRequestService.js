import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';
import { updateLiveTracking } from './liveTrackingRealtimeService';
import { logInfo } from './logger';
import {
  buildRouteSnapshot,
  fetchRouteData,
  normalizeCoordinate,
} from './routingService';

const ACTIVE_HELPER_REQUEST_STATUSES = [
  'accepted',
  'en_route',
  'driving',
  'buying_resources',
  'arrived',
  'work_started',
];
const HELPER_VISIBLE_REQUEST_STATUSES = [
  'accepted',
  'en_route',
  'driving',
  'buying_resources',
  'arrived',
  'work_started',
  'completed',
  'canceled',
  'expired',
  'matching',
  'helper_found',
  'no_helper_available',
  'scheduled_pending',
];

const REQUEST_CATEGORY_SERVICE_LABELS = {
  cleaning: ['Dishwashing', 'House cleaning', 'Room cleaning', 'Kitchen cleaning', 'Bathroom cleaning', 'Floor cleaning', 'Event cleanup', 'Laundry', 'Ironing', 'Folding', 'Stain treatment'],
  yard_maintenance: ['Grass cutting', 'Gardening', 'Landscaping', 'Tree trimming', 'Tree cutting', 'Hedge trimming', 'Weeding', 'Planting flowers', 'Planting trees', 'Yard tidy-up'],
  beauty: ['Hairstyles', 'Braiding', 'Makeup', 'Lashes', 'Nails', 'Manicure', 'Pedicure', 'Waxing prep'],
  barber: ['Haircut', 'Beard trim', 'Line-up', 'Shave', 'Hair dye'],
  care: ['Babysitting', 'Pet sitting', 'Pet feeding', 'House sitting', 'Elder companionship'],
  car_wash: ['Exterior wash', 'Interior cleaning', 'Seat cleaning', 'Full body wash', 'Engine cleaning', 'Full detailing'],
};

function normalizeTime(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapPricingTotal(pricingSnapshot = null) {
  return Number(
    pricingSnapshot?.total
    ?? pricingSnapshot?.totalAmount
    ?? pricingSnapshot?.finalPrice
    ?? pricingSnapshot?.finalAmount
    ?? pricingSnapshot?.basePrice
    ?? 0
  ) || 0;
}

function buildEmptyRouteSnapshot(origin = null, destination = null) {
  return {
    routeCoordinates: [],
    routeSteps: [],
    encodedPolyline: '',
    overviewEncodedPolyline: '',
    distanceMeters: null,
    durationSeconds: null,
    routeProvider: '',
    lastRouteOrigin: normalizeCoordinate(origin),
    lastDestination: normalizeCoordinate(destination),
    lastSuccessfulRouteFetchAtMs: 0,
  };
}

async function seedAcceptedLiveTracking({ requestId, request, helperId, helperSnapshot }) {
  const customerLocation = normalizeCoordinate(request?.location || request?.requestPayload?.location || null);
  const helperLocation = normalizeCoordinate(helperSnapshot?.liveLocation || null);
  const acceptedAtMs = Date.parse(request?.helperAssignment?.acceptedAt || '') || Date.now();
  const routeSnapshot = buildEmptyRouteSnapshot(helperLocation, customerLocation);

  await updateLiveTracking(requestId, {
    requestId,
    helperId,
    customerId: request?.customerId || '',
    helperLocation,
    customerLocation,
    destination: customerLocation,
    routeSnapshot,
    distanceTravelledMeters: 0,
    status: request?.status || 'accepted',
    acceptedAtMs,
    startedAtMs: acceptedAtMs,
    updatedAtMs: Date.now(),
  });

  if (!helperLocation || !customerLocation) {
    return;
  }

  try {
    const routeData = await fetchRouteData(helperLocation, customerLocation);
    if (!Array.isArray(routeData.routeCoordinates) || routeData.routeCoordinates.length <= 1) {
      return;
    }

    await updateLiveTracking(requestId, {
      requestId,
      helperId,
      customerId: request?.customerId || '',
      helperLocation,
      customerLocation,
      destination: customerLocation,
      routeSnapshot: buildRouteSnapshot(routeData, helperLocation, customerLocation),
      status: request?.status || 'accepted',
      updatedAtMs: Date.now(),
    });
  } catch {
    // The foreground tracking loop will retry routing as soon as the helper screen starts.
  }
}

export function getRequestedServiceLabels(categoryId = '', serviceIds = [], selectedOptionTitle = '') {
  const categoryLabels = REQUEST_CATEGORY_SERVICE_LABELS[categoryId] || [];
  if (!Array.isArray(serviceIds) || !serviceIds.length) {
    return categoryLabels.slice(0, 3);
  }

  const cleanOptionTitle = String(selectedOptionTitle || '').trim();
  const baseLabels = serviceIds
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => item.replace(/_/g, ' '))
    .map((item) => item.replace(/\b\w/g, (char) => char.toUpperCase()));

  if (cleanOptionTitle && baseLabels.length === 1) {
    return [`${baseLabels[0]} — ${cleanOptionTitle}`];
  }
  return baseLabels;
}

export function mapServiceRequestToOffer(request) {
  if (!request?.id) return null;
  const timingPreference = String(request?.requestPayload?.timingPreference || 'now').trim().toLowerCase();
  const scheduledForText = String(request?.requestPayload?.scheduledForText || '').trim();
  const selectedOptionId = String(request?.selectedOptionId || request?.requestPayload?.selectedOptionId || '').trim();
  const selectedOptionTitle = String(request?.selectedOptionTitle || request?.requestPayload?.selectedOptionTitle || '').trim();

  return {
    id: request.id,
    requestId: request.id,
    customerId: request.customerId || '',
    title: request.topic || request.subject || 'Service request',
    description: request.description || request.serviceSummary || 'A customer is requesting help.',
    customerName: request.customerName || 'Customer',
    customerPhone: request.customerPhone || request.customerContactNumber || '',
    serviceId: request.categoryId || 'cleaning',
    categoryId: request.categoryId || '',
    serviceIds: Array.isArray(request.serviceIds) ? request.serviceIds : [],
    selectedOptionId,
    selectedOptionTitle,
    requestedServiceOfferings: getRequestedServiceLabels(request.categoryId, request.serviceIds, selectedOptionTitle),
    payoutEstimate: mapPricingTotal(request.pricingSnapshot),
    offerExpiresAt: Number(request.offerExpiresAt || 0),
    offerToken: String(request.offerToken || ''),
    offerRevision: Number(request.offerRevision || 0),
    area: request.requestPayload?.serviceAddress || request.serviceAddress || 'Location pending',
    status: request.status || 'helper_found',
    statusDetail: request.statusDetail || '',
    timingPreference,
    scheduledForText,
    isScheduled: timingPreference === 'later' || String(request.status || '').toLowerCase() === 'scheduled_pending',
    pricingSnapshot: request.pricingSnapshot || null,
    helperAssignment: request.helperAssignment || null,
    raw: request,
  };
}

export function mapServiceRequestToActiveJob(request) {
  if (!request?.id) return null;
  const selectedOptionId = String(request?.selectedOptionId || request?.requestPayload?.selectedOptionId || '').trim();
  const selectedOptionTitle = String(request?.selectedOptionTitle || request?.requestPayload?.selectedOptionTitle || '').trim();

  return {
    id: request.id,
    requestId: request.id,
    customerId: request.customerId || '',
    title: request.topic || request.subject || 'Service request',
    description: request.description || request.serviceSummary || '',
    customerName: request.customerName || 'Customer',
    customerPhone: request.customerPhone || request.customerContactNumber || '',
    customerPhoto: String(
      request.customerPhoto
      || request.customerProfilePhoto
      || request.requestPayload?.customerPhoto
      || '',
    ).trim(),
    serviceId: request.categoryId || 'cleaning',
    categoryId: request.categoryId || '',
    selectedOptionId,
    selectedOptionTitle,
    requestedServiceOfferings: getRequestedServiceLabels(request.categoryId, request.serviceIds, selectedOptionTitle),
    status: request.status || 'accepted',
    statusDetail: request.statusDetail || '',
    pricingSnapshot: request.pricingSnapshot || null,
    totalAmount: mapPricingTotal(request.pricingSnapshot),
    startedAt: request.helperAssignment?.acceptedAt || request.updatedAt || request.createdAt || null,
    address: request.requestPayload?.serviceAddress || request.serviceAddress || 'Location pending',
    location: request.location || request.requestPayload?.location || null,
    raw: request,
  };
}

export function mapServiceRequestToHistoryItem(request) {
  if (!request?.id) return null;
  const selectedOptionId = String(request?.selectedOptionId || request?.requestPayload?.selectedOptionId || '').trim();
  const selectedOptionTitle = String(request?.selectedOptionTitle || request?.requestPayload?.selectedOptionTitle || '').trim();

  return {
    id: request.id,
    requestId: request.id,
    title: request.topic || request.subject || 'Service request',
    description: request.description || request.serviceSummary || '',
    customerName: request.customerName || 'Customer',
    customerPhone: request.customerPhone || request.customerContactNumber || '',
    serviceId: request.categoryId || 'cleaning',
    categoryId: request.categoryId || '',
    serviceIds: Array.isArray(request.serviceIds) ? request.serviceIds : [],
    selectedOptionId,
    selectedOptionTitle,
    requestedServiceOfferings: getRequestedServiceLabels(request.categoryId, request.serviceIds, selectedOptionTitle),
    status: request.status || 'matching',
    statusDetail: request.statusDetail || '',
    totalAmount: mapPricingTotal(request.pricingSnapshot),
    startedAt: request.helperAssignment?.acceptedAt || request.updatedAt || request.createdAt || null,
    completedAt: request.completedAt || request.canceledAt || request.endedAt || request.updatedAt || request.createdAt || null,
    createdAt: request.createdAt || null,
    updatedAt: request.updatedAt || null,
    address: request.requestPayload?.serviceAddress || request.serviceAddress || 'Location pending',
    helperAssignment: request.helperAssignment || null,
    requestPayload: request.requestPayload || {},
    pricingSnapshot: request.pricingSnapshot || null,
    helperPayoutBreakdown: request.helperPayoutBreakdown || null,
    raw: request,
  };
}

export function subscribeToHelperAvailableServiceRequests(helperId, callback, onError) {
  if (!helperId) {
    callback([]);
    return () => {};
  }

  const { db } = getFirebaseClients();
  const requestsQuery = query(
    collection(db, 'serviceRequests'),
    where('currentOfferHelperId', '==', helperId),
  );

  return onSnapshot(
    requestsQuery,
    (snapshot) => {
      const now = Date.now();
      const rawItems = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      logInfo('service-request.offer-subscription-snapshot', 'Received helper offer snapshot.', {
        helperId,
        snapshotSize: rawItems.length,
        requestIds: rawItems.map((item) => item.id),
        statuses: rawItems.map((item) => String(item.status || '').toLowerCase()),
        currentOfferHelperIds: rawItems.map((item) => String(item.currentOfferHelperId || '').trim() || null),
      });
      const items = rawItems
        .filter((item) => {
          const isHelperFound = String(item.status || '').toLowerCase() === 'helper_found';
          if (!isHelperFound) {
            logInfo('service-request.offer-subscription-filter', 'Dropped helper offer because status is not helper_found.', {
              helperId,
              requestId: item.id,
              status: String(item.status || '').toLowerCase(),
            });
          }
          return isHelperFound;
        })
        .filter((item) => {
          const offerExpiresAt = normalizeTime(item.offerExpiresAt);
          const isActive = !offerExpiresAt || offerExpiresAt > now;
          if (!isActive) {
            logInfo('service-request.offer-subscription-filter', 'Dropped helper offer because it is already expired.', {
              helperId,
              requestId: item.id,
              offerExpiresAt,
              now,
            });
          }
          return isActive;
        })
        .sort((left, right) => normalizeTime(right.updatedAt) - normalizeTime(left.updatedAt));
      logInfo('service-request.offer-subscription-result', 'Mapped helper offer snapshot after filters.', {
        helperId,
        resultSize: items.length,
        requestIds: items.map((item) => item.id),
      });
      callback(items);
    },
    onError,
  );
}

export function subscribeToHelperActiveServiceRequest(helperId, callback, onError) {
  if (!helperId) {
    callback(null);
    return () => {};
  }

  const { db } = getFirebaseClients();
  const requestsQuery = query(
    collection(db, 'serviceRequests'),
    where('helperAssignment.helperId', '==', helperId),
  );

  return onSnapshot(
    requestsQuery,
    (snapshot) => {
      const items = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => ACTIVE_HELPER_REQUEST_STATUSES.includes(String(item.status || '').toLowerCase()))
        .sort((left, right) => normalizeTime(right.updatedAt) - normalizeTime(left.updatedAt));
      callback(items[0] || null);
    },
    onError,
  );
}

export function subscribeToHelperServiceRequests(helperId, callback, onError) {
  if (!helperId) {
    callback([]);
    return () => {};
  }

  const { db } = getFirebaseClients();
  const requestsQuery = query(
    collection(db, 'serviceRequests'),
    where('helperAssignment.helperId', '==', helperId),
  );

  return onSnapshot(
    requestsQuery,
    (snapshot) => {
      const items = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => HELPER_VISIBLE_REQUEST_STATUSES.includes(String(item.status || '').toLowerCase()))
        .sort((left, right) => normalizeTime(right.updatedAt || right.createdAt) - normalizeTime(left.updatedAt || left.createdAt));
      callback(items);
    },
    onError,
  );
}

export async function acceptServiceRequestOffer({
  requestId,
  helperId,
  offerToken,
  offerRevision,
}) {
  if (!requestId || !helperId) {
    throw new Error('A request and helper session are required.');
  }

  const { auth, db } = getFirebaseClients();
  if (!auth.currentUser?.uid || auth.currentUser.uid !== helperId) {
    throw new Error('Your helper session has changed. Please sign in again.');
  }
  const requestRef = doc(db, 'serviceRequests', requestId);
  const helperRef = doc(db, 'users', helperId);
  const idToken = await auth.currentUser.getIdToken();
  const response = await fetch(getFunctionEndpoint('respondToServiceRequestOffer'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requestId, action: 'accept', offerToken, offerRevision }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || 'Unable to accept this helper offer right now.');
  }

  const [refreshed, helperSnapshot] = await Promise.all([
    getDoc(requestRef),
    getDoc(helperRef),
  ]);
  const acceptedRequest = refreshed.exists() ? { id: refreshed.id, ...refreshed.data() } : null;

  if (acceptedRequest) {
    await seedAcceptedLiveTracking({
      requestId,
      request: acceptedRequest,
      helperId,
      helperSnapshot: helperSnapshot.exists() ? helperSnapshot.data() || {} : {},
    }).catch(() => null);
  }

  return acceptedRequest;
}

export async function declineServiceRequestOffer({ requestId, helperId, offerToken, offerRevision }) {
  if (!requestId || !helperId) {
    throw new Error('A request and helper session are required.');
  }

  const { auth, db } = getFirebaseClients();
  if (!auth.currentUser?.uid || auth.currentUser.uid !== helperId) {
    throw new Error('Your helper session has changed. Please sign in again.');
  }
  const idToken = await auth.currentUser.getIdToken();
  const response = await fetch(getFunctionEndpoint('respondToServiceRequestOffer'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requestId, action: 'decline', offerToken, offerRevision }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || 'Unable to decline this helper offer right now.');
  }

  const refreshed = await getDoc(doc(db, 'serviceRequests', requestId));
  return refreshed.exists() ? { id: refreshed.id, ...refreshed.data() } : null;
}

async function callHelperServiceRequestAction({ requestId, helperId, action, status = '', reason = '' }) {
  if (!requestId || !helperId) throw new Error('A request and helper session are required.');
  const { auth } = getFirebaseClients();
  if (!auth.currentUser?.uid || auth.currentUser.uid !== helperId) {
    throw new Error('Your helper session has changed. Please sign in again.');
  }
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(getFunctionEndpoint('updateHelperServiceRequest'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requestId, action, status, reason }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || 'Unable to update this service request right now.');
  }
  return payload.request || null;
}

export async function updateHelperActiveRequestStatus({ requestId, helperId, status }) {
  if (!requestId || !helperId || !status) {
    throw new Error('A request, helper, and status are required.');
  }
  return callHelperServiceRequestAction({
    requestId,
    helperId,
    action: 'transition',
    status: String(status || '').toLowerCase(),
  });
}

export async function finalizeServiceRequestBilling({ requestId }) {
  const { auth } = getFirebaseClients();
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error('You must be signed in to finalize billing.');
  }

  const endpoint = getFunctionEndpoint('finalizeServiceRequestBilling');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requestId }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || 'Unable to finalize service request billing.');
  }

  return payload;
}

export async function cancelServiceRequest({ requestId, helperId, reason }) {
  if (!requestId || !helperId) {
    throw new Error('A request and helper session are required to cancel.');
  }

  await callHelperServiceRequestAction({
    requestId,
    helperId,
    action: 'cancel',
    reason: String(reason || ''),
  });

  logInfo('service-request.cancel-helper-write', 'Clearing helper active request state after cancel', {
    helperId,
    requestId,
    traceLabel: 'helpers:serviceRequestService:cancelServiceRequest',
  });
}

export async function getPendingCashPaymentConfirmations() {
  const { auth } = getFirebaseClients();
  const currentUser = auth.currentUser;
  const token = await currentUser?.getIdToken();
  if (!token) throw new Error('Sign in to review payment confirmations.');
  const response = await fetch(getFunctionEndpoint('getHelperCashPaymentConfirmations'), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success !== true) throw new Error(payload?.message || 'Unable to load payment confirmations.');
  return Array.isArray(payload.confirmations) ? payload.confirmations : [];
}

export async function respondToCashPaymentConfirmation({ requestId, attemptId, action }) {
  const { auth } = getFirebaseClients();
  const currentUser = auth.currentUser;
  const token = await currentUser?.getIdToken();
  if (!token) throw new Error('Sign in before confirming a cash payment.');
  const response = await fetch(getFunctionEndpoint('respondToCashServicePayment'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, attemptId, action }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success !== true) throw new Error(payload?.message || 'This payment confirmation is no longer active.');
  return payload;
}

export async function submitServiceRequestRating({ requestId, score, comment = '' }) {
  if (!requestId) {
    throw new Error('A request ID is required to submit a rating.');
  }

  const { auth } = getFirebaseClients();
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('You must be signed in to submit a rating.');
  }

  const normalizedScore = Math.max(1, Math.min(5, Math.round(Number(score || 0))));
  if (!Number.isFinite(normalizedScore) || normalizedScore <= 0) {
    throw new Error('requestId and a rating score are required.');
  }

  const token = await currentUser.getIdToken();
  const response = await fetch(getFunctionEndpoint('submitServiceRequestRating'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requestId,
      score: normalizedScore,
      comment: String(comment || '').trim(),
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || 'Unable to submit the rating right now.');
  }

  return payload.rating || { requestId, score: normalizedScore, comment: String(comment || '').trim() };
}
