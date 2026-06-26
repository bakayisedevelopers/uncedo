import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';

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
    ?? pricingSnapshot?.finalPrice
    ?? pricingSnapshot?.finalAmount
    ?? pricingSnapshot?.basePrice
    ?? 0
  ) || 0;
}

export function getRequestedServiceLabels(categoryId = '', serviceIds = []) {
  const categoryLabels = REQUEST_CATEGORY_SERVICE_LABELS[categoryId] || [];
  if (!Array.isArray(serviceIds) || !serviceIds.length) {
    return categoryLabels.slice(0, 3);
  }

  return serviceIds
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => item.replace(/_/g, ' '))
    .map((item) => item.replace(/\b\w/g, (char) => char.toUpperCase()));
}

export function mapServiceRequestToOffer(request) {
  if (!request?.id) return null;
  const timingPreference = String(request?.requestPayload?.timingPreference || 'now').trim().toLowerCase();
  const scheduledForText = String(request?.requestPayload?.scheduledForText || '').trim();

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
    requestedSkills: getRequestedServiceLabels(request.categoryId, request.serviceIds),
    payoutEstimate: mapPricingTotal(request.pricingSnapshot),
    offerExpiresAt: Number(request.offerExpiresAt || 0),
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
    requestedSkills: getRequestedServiceLabels(request.categoryId, request.serviceIds),
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
    requestedSkills: getRequestedServiceLabels(request.categoryId, request.serviceIds),
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
    where('status', '==', 'helper_found'),
    where('currentOfferHelperId', '==', helperId),
  );

  return onSnapshot(
    requestsQuery,
    (snapshot) => {
      const items = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((left, right) => normalizeTime(right.updatedAt) - normalizeTime(left.updatedAt));
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
  helperName,
  helperEmail,
}) {
  if (!requestId || !helperId) {
    throw new Error('A request and helper session are required.');
  }

  const { db } = getFirebaseClients();
  const requestRef = doc(db, 'serviceRequests', requestId);
  const helperRef = doc(db, 'users', helperId);

  await runTransaction(db, async (transaction) => {
    const [requestSnap, helperSnap] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(helperRef),
    ]);

    if (!requestSnap.exists()) {
      throw new Error('Service request not found.');
    }

    const request = requestSnap.data() || {};
    const helper = helperSnap.exists() ? helperSnap.data() || {} : {};
    const now = Date.now();

    if (String(request.status || '').toLowerCase() !== 'helper_found') {
      throw new Error('This request is no longer waiting for a helper response.');
    }

    if (request.currentOfferHelperId !== helperId) {
      throw new Error('This request is no longer assigned to you.');
    }

    if (Number(request.offerExpiresAt || 0) <= now) {
      throw new Error('This helper offer has expired.');
    }

    const acceptedAt = new Date().toISOString();

    transaction.update(requestRef, {
      status: 'accepted',
      statusDetail: 'Helper accepted and is preparing to travel.',
      currentOfferHelperId: null,
      offerExpiresAt: null,
      offerToken: null,
      helperQueue: Array.isArray(request.helperQueue)
        ? request.helperQueue.filter((item) => item !== helperId)
        : [],
      helperAssignment: {
        helperId,
        helperName: helperName || helper.fullName || helper.displayName || 'Helper',
        helperEmail: helperEmail || helper.email || '',
        helperPhone: helper.phoneNumber || '',
        helperPhoto: String(helper.profilePhoto || helper.selfieUrl || helper.photoURL || '').trim(),
        acceptedAt,
        categoryId: request.categoryId || '',
        serviceIds: Array.isArray(request.serviceIds) ? request.serviceIds : [],
      },
      updatedAt: serverTimestamp(),
    });

    transaction.set(helperRef, {
      activeServiceRequestId: requestId,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });

  const refreshed = await getDoc(requestRef);
  return refreshed.exists() ? { id: refreshed.id, ...refreshed.data() } : null;
}

export async function declineServiceRequestOffer({ requestId, helperId }) {
  if (!requestId || !helperId) {
    throw new Error('A request and helper session are required.');
  }

  const { db } = getFirebaseClients();
  const requestRef = doc(db, 'serviceRequests', requestId);

  await runTransaction(db, async (transaction) => {
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists()) {
      throw new Error('Service request not found.');
    }

    const request = requestSnap.data() || {};
    if (String(request.status || '').toLowerCase() !== 'helper_found') {
      throw new Error('This request is no longer waiting for a helper response.');
    }

    if (request.currentOfferHelperId !== helperId) {
      throw new Error('This request is no longer assigned to you.');
    }

    const nextQueue = Array.isArray(request.helperQueue)
      ? request.helperQueue.filter((item) => item !== helperId)
      : [];

    transaction.update(requestRef, {
      status: 'matching',
      statusDetail: 'Helper declined. Matching the next helper.',
      helperQueue: nextQueue,
      currentOfferHelperId: null,
      offerExpiresAt: null,
      offerToken: null,
      updatedAt: serverTimestamp(),
    });
  });

  const refreshed = await getDoc(requestRef);
  return refreshed.exists() ? { id: refreshed.id, ...refreshed.data() } : null;
}

export async function updateHelperActiveRequestStatus({ requestId, helperId, status }) {
  if (!requestId || !helperId || !status) {
    throw new Error('A request, helper, and status are required.');
  }

  const normalizedStatus = String(status || '').toLowerCase();
  let statusDetail = '';
  switch (normalizedStatus) {
    case 'en_route':
      statusDetail = 'Helper is on the way.';
      break;
    case 'driving':
      statusDetail = 'Helper is driving to your location.';
      break;
    case 'buying_resources':
      statusDetail = 'Helper stopped to buy resources before arrival.';
      break;
    case 'arrived':
      statusDetail = 'Helper has arrived.';
      break;
    case 'work_started':
      statusDetail = 'The job is now in progress.';
      break;
    case 'completed':
      statusDetail = 'Service completed.';
      break;
    default:
      statusDetail = '';
  }

  const { db } = getFirebaseClients();
  const requestRef = doc(db, 'serviceRequests', requestId);
  const helperRef = doc(db, 'users', helperId);

  const updates = {
    status: normalizedStatus,
    statusDetail,
    updatedAt: serverTimestamp(),
  };

  if (normalizedStatus === 'arrived') {
    updates.arrivedAt = serverTimestamp();
  } else if (normalizedStatus === 'work_started') {
    updates.workStartedAt = serverTimestamp();
  }

  await updateDoc(requestRef, updates);

  if (normalizedStatus === 'completed') {
    await updateDoc(helperRef, {
      activeServiceRequestId: null,
      updatedAt: serverTimestamp(),
    });
  }
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

  const { db } = getFirebaseClients();
  const requestRef = doc(db, 'serviceRequests', requestId);
  const helperRef = doc(db, 'users', helperId);

  await runTransaction(db, async (transaction) => {
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists) return;

    transaction.update(requestRef, {
      status: 'canceled',
      statusDetail: 'Helper canceled the session.',
      canceledBy: 'helper',
      canceledReason: reason || '',
      canceledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    transaction.update(helperRef, {
      activeServiceRequestId: null,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function submitServiceRequestRating({ requestId, score, comment = '' }) {
  if (!requestId) {
    throw new Error('A request ID is required to submit a rating.');
  }

  const { auth } = getFirebaseClients();
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error('You must be signed in to submit a rating.');
  }

  const response = await fetch(getFunctionEndpoint('submitServiceRequestRating'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requestId,
      score,
      comment,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || 'Unable to submit this rating.');
  }

  return payload?.rating || null;
}
