import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import * as Location from 'expo-location';
import { createServiceRequestDraft } from '../constants/requestPayload';
import { getCustomerServiceCategoryById, getCustomerServiceById } from '../constants/serviceCatalog';
import {
  beautyPricingEngine,
  barberPricingEngine,
  bodyCarePricingEngine,
  carWashPricingEngine,
  carePricingEngine,
  cleaningPricingEngine,
  yardMaintenancePricingEngine,
} from '../pricing';
import { uploadUserFile } from './storageService';
import { recordCustomerServiceEvent } from './customerRecommendationService';
import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';
import { USE_SERVER_PRICING, USE_SERVER_REQUEST_LIFECYCLE } from '../constants/runtimeConfig';

const ACTIVE_SERVICE_REQUEST_STATUSES = ['collecting_details', 'scheduled_pending', 'matching', 'helper_found', 'accepted', 'driving', 'en_route', 'buying_resources', 'arrived', 'work_started', 'no_helper_available'];
const CATEGORY_ENGINE_LOOKUP = {
  cleaning: cleaningPricingEngine,
  yard_maintenance: yardMaintenancePricingEngine,
  beauty: beautyPricingEngine,
  barber: barberPricingEngine,
  body_care: bodyCarePricingEngine,
  care: carePricingEngine,
  car_wash: carWashPricingEngine,
};

function normalizeText(value) {
  return String(value || '').trim();
}

function parseScheduledDateTime(value = '') {
  const parsed = Date.parse(String(value || '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

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
  };
}

async function geocodeAddressToCoordinate(address = '') {
  const normalizedAddress = normalizeText(address);
  if (!normalizedAddress) return null;

  try {
    const matches = await Location.geocodeAsync(normalizedAddress);
    const [firstMatch] = Array.isArray(matches) ? matches : [];
    return normalizeCoordinate(firstMatch);
  } catch (error) {
    return null;
  }
}

async function resolveRequestLocation({
  location = null,
  serviceAddress = '',
  serviceAddressTarget = '',
  homeLocation = null,
} = {}) {
  const providedLocation = normalizeCoordinate(location);
  if (providedLocation) {
    return providedLocation;
  }

  const target = normalizeText(serviceAddressTarget).toLowerCase();
  const normalizedHomeLocation = normalizeCoordinate(homeLocation);

  if (target === 'current_location') {
    return providedLocation;
  }

  const geocodedAddress = await geocodeAddressToCoordinate(serviceAddress);
  if (geocodedAddress) {
    return geocodedAddress;
  }

  return normalizedHomeLocation;
}

export function deriveTimingDetails(structuredAnswers = {}) {
  const entries = Object.entries(structuredAnswers || {});
  const match = (patterns) => entries.find(([key]) => patterns.some((pattern) => String(key || '').toLowerCase().includes(pattern)));
  const timingEntry = match(['timing', 'when', 'appointment', 'schedule', 'service_time']);
  const scheduleEntry = match(['scheduled_for', 'requested_time', 'date_time', 'time_text', 'service_time']);
  const rawTiming = normalizeText(timingEntry?.[1]).toLowerCase();
  const scheduledForText = normalizeText(scheduleEntry?.[1] || timingEntry?.[1]);

  if (rawTiming.includes('later') || rawTiming.includes('tomorrow') || rawTiming.includes('schedule')) {
    return {
      timingPreference: 'later',
      scheduledForText,
      scheduledForAtMs: parseScheduledDateTime(scheduledForText),
    };
  }

  if (rawTiming.includes('now') || rawTiming.includes('asap') || rawTiming.includes('immediately')) {
    return {
      timingPreference: 'now',
      scheduledForText,
      scheduledForAtMs: null,
    };
  }

  return {
    timingPreference: scheduledForText ? 'later' : 'now',
    scheduledForText,
    scheduledForAtMs: parseScheduledDateTime(scheduledForText),
  };
}

function normalizeTime(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildServiceRequestTitle({ categoryId = '', serviceIds = [], selectedPackageId = '' } = {}) {
  const selectedPackage = selectedPackageId ? getCustomerServiceById(selectedPackageId) : null;
  if (selectedPackage?.label) {
    return selectedPackage.label;
  }

  const categoryLabel = getCustomerServiceCategoryById(categoryId)?.label || 'Service request';
  const serviceLabels = serviceIds
    .map((serviceId) => getCustomerServiceById(serviceId)?.label || '')
    .filter(Boolean);
  if (!serviceLabels.length) return categoryLabel;
  return `${categoryLabel}: ${serviceLabels.join(', ')}`;
}

export function buildServiceRequestSummary({ categoryId = '', serviceIds = [], selectedPackageId = '', structuredAnswers = {} } = {}) {
  const title = buildServiceRequestTitle({ categoryId, serviceIds, selectedPackageId });
  const notableAnswers = Object.entries(structuredAnswers || {})
    .filter(([, value]) => String(value || '').trim())
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value).trim()}`);

  return notableAnswers.length ? `${title}. ${notableAnswers.join('. ')}` : title;
}

export function buildServicePricingSnapshot({
  categoryId = '',
  serviceIds = [],
  structuredAnswers = {},
  serviceOverrides = {},
  travelDistanceKm = null,
  aiUsageSnapshot = null,
} = {}) {
  const engine = CATEGORY_ENGINE_LOOKUP[categoryId];
  if (!engine || !serviceIds.length) return null;
  const result = engine({
    serviceIds,
    structuredAnswers,
    serviceOverrides,
    travelDistanceKm,
    aiUsageSnapshot,
  });
  return {
    ...result,
    quoteId: `service_quote_${Date.now()}`,
  };
}

export async function fetchServicePricingQuote({
  categoryId = '',
  serviceIds = [],
  selectedPackageId = '',
  structuredAnswers = {},
} = {}) {
  const { auth } = getFirebaseClients();
  if (!auth.currentUser?.uid) {
    throw new Error('You must be signed in to price this service.');
  }

  if (USE_SERVER_PRICING) {
    const idToken = await auth.currentUser.getIdToken();
    const response = await fetch(getFunctionEndpoint('getCustomerServicePricingQuote'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId, serviceIds, selectedPackageId, structuredAnswers }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success !== true || !payload.quote) {
      throw new Error(payload?.message || 'Unable to calculate the current service quote.');
    }
    return payload.quote;
  }

  return buildServicePricingSnapshot({
    categoryId,
    serviceIds,
    structuredAnswers,
  });
}

export async function createCustomerServiceRequest({ user, location, initialDraft = {} }) {
  if (!user?.uid) {
    throw new Error('You must be signed in to start a service request.');
  }

  const { db } = getFirebaseClients();
  const selectedPackageId = String(initialDraft.selectedPackageId || '').trim();
  const selectedPackage = selectedPackageId ? getCustomerServiceById(selectedPackageId) : null;
  const categoryId = String(initialDraft.categoryId || selectedPackage?.categoryId || '').trim();
  const serviceIds = (
    Array.isArray(initialDraft.serviceIds) && initialDraft.serviceIds.length
      ? initialDraft.serviceIds
      : (Array.isArray(selectedPackage?.includedServiceIds) ? selectedPackage.includedServiceIds : [])
  )
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const draft = createServiceRequestDraft({
    ...initialDraft,
    categoryId,
    serviceIds,
    serviceAddress: String(initialDraft.serviceAddress || user?.customerProfile?.serviceAddress || '').trim(),
    location: location || null,
  });
  const resolvedLocation = await resolveRequestLocation({
    location,
    serviceAddress: draft.serviceAddress || user?.customerProfile?.serviceAddress || '',
    serviceAddressTarget: draft.structuredAnswers?.service_address_target || initialDraft.serviceAddressTarget || '',
    homeLocation: user?.homeLocation || null,
  });
  const summary = buildServiceRequestSummary({
    categoryId,
    serviceIds,
    selectedPackageId,
    structuredAnswers: draft.structuredAnswers,
  });
  const categoryLabel = getCustomerServiceCategoryById(categoryId)?.label || 'Service request';
  const subject = selectedPackage?.label || categoryLabel;
  const topic = selectedPackage?.label
    || serviceIds.map((serviceId) => getCustomerServiceById(serviceId)?.label || '').filter(Boolean).join(', ')
    || categoryLabel;
  if (USE_SERVER_REQUEST_LIFECYCLE) {
    const { auth } = getFirebaseClients();
    const currentUser = auth.currentUser;
    if (!currentUser?.uid || currentUser.uid !== user.uid) {
      throw new Error('Your customer session has changed. Please sign in again.');
    }
    const requestId = doc(collection(db, 'serviceRequests')).id;
    const idToken = await currentUser.getIdToken();
    const response = await fetch(getFunctionEndpoint('createCustomerServiceRequest'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        categoryId,
        serviceIds,
        selectedPackageId,
        structuredAnswers: draft.structuredAnswers || {},
        serviceAddress: draft.serviceAddress || '',
        location: resolvedLocation,
        timingPreference: draft.timingPreference || 'now',
        scheduledForText: draft.scheduledForText || '',
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success !== true) {
      throw new Error(payload?.message || 'Unable to start this service request.');
    }
    return payload.requestId || requestId;
  }

  const existingSnap = await getDocs(
    query(
      collection(db, 'serviceRequests'),
      where('customerId', '==', user.uid),
      where('status', 'in', ACTIVE_SERVICE_REQUEST_STATUSES),
    ),
  );
  if (!existingSnap.empty) {
    throw new Error('You already have an active service request. Complete or cancel it before starting another.');
  }

  const docRef = await addDoc(collection(db, 'serviceRequests'), {
    customerId: user.uid,
    customerName: user.fullName || user.displayName || 'Customer',
    customerEmail: user.email || '',
    customerPhone: user.phoneNumber || '',
    location: resolvedLocation,
    status: 'collecting_details',
    statusDetail: 'Request intake started. Collecting service details.',
    requestType: 'customer_service',
    intakeMode: 'guided_chat',
    requestPayload: {
      ...draft,
      selectedPackageId,
      location: resolvedLocation,
      timingPreference: draft.timingPreference || 'now',
      scheduledForText: draft.scheduledForText || '',
      scheduledForAtMs: parseScheduledDateTime(draft.scheduledForText || ''),
    },
    categoryId,
    serviceIds,
    selectedPackageId,
    subject,
    topic,
    description: summary,
    serviceSummary: summary,
    pricingSnapshot: null,
    aiUsageSnapshot: null,
    helperAssignment: null,
    helperQueue: [],
    currentOfferHelperId: null,
    offerExpiresAt: null,
    offerToken: null,
    offerCycleExcludedHelperIds: [],
    declinedHelperIds: [],
    offerRevision: 0,
    lastOfferAt: null,
    transcript: [],
    structuredAnswers: draft.structuredAnswers || {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  recordCustomerServiceEvent({
    customerId: user.uid,
    eventType: 'request_started',
    serviceId: serviceIds[0] || selectedPackageId || categoryId,
    categoryId,
    serviceIds,
    source: 'customer_call',
    metadata: {
      requestId: docRef.id,
      subject,
      topic,
    },
  }).catch(() => {});

  return docRef.id;
}

export async function updateCustomerServiceRequest(requestId, updates = {}) {
  if (!requestId) {
    throw new Error('Service request id is required.');
  }

  const { db } = getFirebaseClients();
  if (USE_SERVER_REQUEST_LIFECYCLE) {
    const { auth } = getFirebaseClients();
    const currentUser = auth.currentUser;
    const idToken = await currentUser?.getIdToken();
    if (!idToken) throw new Error('You must be signed in to update this request.');
    const response = await fetch(getFunctionEndpoint('updateCustomerServiceRequestDraft'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, ...updates }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success !== true) throw new Error(payload?.message || 'Unable to update this service request.');
    return payload;
  }
  await updateDoc(doc(db, 'serviceRequests', requestId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function appendCustomerServiceTranscript(requestId, turn) {
  if (!requestId || !turn?.role || !turn?.text) return;

  const { db } = getFirebaseClients();
  await updateDoc(doc(db, 'serviceRequests', requestId), {
    transcript: arrayUnion({
      role: String(turn.role || ''),
      text: String(turn.text || ''),
      createdAt: Date.now(),
      questionId: turn.questionId || '',
      textMode: turn.textMode || 'readonly',
      isVoice: Boolean(turn.isVoice),
      source: String(turn.source || ''),
      attachment: turn.attachment || null,
      attachmentType: String(turn.attachmentType || ''),
      attachmentName: String(turn.attachmentName || ''),
    }),
    updatedAt: serverTimestamp(),
  });
}

export async function updateCustomerServiceTranscript(requestId, transcriptList) {
  if (!requestId || !Array.isArray(transcriptList)) return;

  const { db } = getFirebaseClients();
  await updateDoc(doc(db, 'serviceRequests', requestId), {
    transcript: transcriptList.map((turn) => ({
      role: String(turn.role || ''),
      text: String(turn.text || ''),
      createdAt: Number(turn.createdAt || Date.now()),
      questionId: turn.questionId || '',
      textMode: turn.textMode || 'readonly',
      isVoice: Boolean(turn.isVoice),
      source: String(turn.source || ''),
      attachment: turn.attachment || null,
      attachmentType: String(turn.attachmentType || ''),
      attachmentName: String(turn.attachmentName || ''),
    })),
    updatedAt: serverTimestamp(),
  });
}

export async function uploadCustomerServiceReference({ userId, requestId, attachment }) {
  const uploaded = await uploadUserFile({
    userId,
    attachment,
    pathPrefix: 'service-request-references',
    objectPath: `service-request-references/${userId}/${requestId}/${Date.now()}-${attachment?.name || 'reference'}`,
  });

  const { db } = getFirebaseClients();
  await updateDoc(doc(db, 'serviceRequests', requestId), {
    referenceAttachments: arrayUnion(uploaded),
    updatedAt: serverTimestamp(),
  });

  return uploaded;
}

export async function saveCustomerServiceQuotePreview({
  requestId,
  categoryId,
  serviceIds,
  selectedPackageId = '',
  structuredAnswers = {},
  aiUsageSnapshot = null,
  selectedPortfolioReferences = [],
  referenceAttachments = [],
  serviceOverrides = {},
}) {
  if (!requestId) {
    throw new Error('Service request id is required.');
  }

  if (USE_SERVER_REQUEST_LIFECYCLE) {
    const { auth, db } = getFirebaseClients();
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error('You must be signed in to request a service quote.');
    const response = await fetch(getFunctionEndpoint('quoteCustomerServiceRequest'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId, categoryId, serviceIds, selectedPackageId, structuredAnswers,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success !== true) {
      const error = new Error(payload?.message || 'Unable to calculate a service quote.');
      error.code = payload?.code || '';
      error.missingQuestionIds = payload?.missingQuestionIds || [];
      throw error;
    }
    const requestRef = doc(db, 'serviceRequests', requestId);
    await updateDoc(requestRef, {
      aiUsageSnapshot,
      selectedPortfolioReferences,
      referenceAttachments,
      updatedAt: serverTimestamp(),
    });
    return payload.quote;
  }

  const pricingSnapshot = await fetchServicePricingQuote({
    categoryId,
    serviceIds,
    selectedPackageId,
    structuredAnswers,
  });

  const { db } = getFirebaseClients();
  const requestRef = doc(db, 'serviceRequests', requestId);
  const existingSnap = await getDoc(requestRef);
  const existingRequest = existingSnap.exists() ? existingSnap.data() || {} : {};
  const existingPayload = existingRequest.requestPayload || {};
  const resolvedPackageId = String(selectedPackageId || existingRequest.selectedPackageId || existingPayload.selectedPackageId || '').trim();
  const summary = buildServiceRequestSummary({ categoryId, serviceIds, selectedPackageId: resolvedPackageId, structuredAnswers });
  const timingDetails = deriveTimingDetails(structuredAnswers);
  const serviceAddress = existingPayload.serviceAddress || existingRequest.serviceAddress || '';
  const location = await resolveRequestLocation({
    location: existingPayload.location || existingRequest.location || null,
    serviceAddress,
    serviceAddressTarget: structuredAnswers?.service_address_target || existingRequest.structuredAnswers?.service_address_target || '',
  });

  await updateDoc(requestRef, {
    categoryId,
    serviceIds,
    selectedPackageId: resolvedPackageId,
    serviceSummary: summary,
    structuredAnswers,
    selectedPortfolioReferences,
    referenceAttachments,
    pricingSnapshot,
    aiUsageSnapshot,
    status: 'collecting_details',
    statusDetail: 'Quote ready. Waiting for customer approval.',
    helperQueue: [],
    currentOfferHelperId: null,
    offerExpiresAt: null,
    offerToken: null,
    offerCycleExcludedHelperIds: [],
    declinedHelperIds: [],
    lastOfferAt: null,
    serviceAddress,
    location,
    requestPayload: {
      categoryId,
      serviceIds,
      selectedPackageId: resolvedPackageId,
      summary,
      structuredAnswers,
      selectedPortfolioReferences,
      attachments: referenceAttachments,
      pricingSnapshot,
      aiUsageSnapshot,
      timingPreference: timingDetails.timingPreference,
      scheduledForText: timingDetails.scheduledForText,
      scheduledForAtMs: timingDetails.scheduledForAtMs,
      location,
      serviceAddress,
    },
    updatedAt: serverTimestamp(),
  });

  return {
    pricingSnapshot,
    aiUsageSnapshot,
    summary,
    timingPreference: timingDetails.timingPreference,
    scheduledForText: timingDetails.scheduledForText,
    scheduledForAtMs: timingDetails.scheduledForAtMs,
  };
}

export async function finalizeCustomerServiceRequest({
  requestId,
  callId,
  categoryId,
  serviceIds,
  selectedPackageId = '',
  approvedQuote = null,
  structuredAnswers = {},
  aiUsageSnapshot = null,
  selectedPortfolioReferences = [],
  referenceAttachments = [],
  serviceOverrides = {},
}) {
  if (USE_SERVER_REQUEST_LIFECYCLE) {
    const { auth } = getFirebaseClients();
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken || !auth.currentUser?.uid) throw new Error('You must be signed in to submit this service request.');
    if (!approvedQuote) throw new Error('Review the current quote before submitting the request.');
    const response = await fetch(getFunctionEndpoint('confirmCustomerServiceRequest'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, callId, approvedQuote }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success !== true) {
      const error = new Error(payload?.message || 'Unable to submit this service request.');
      error.code = payload?.code || '';
      error.quote = payload?.quote || null;
      throw error;
    }
    return payload.pricingSnapshot || payload.request?.pricingSnapshot || null;
  }

  const pricingSnapshot = await fetchServicePricingQuote({
    categoryId,
    serviceIds,
    selectedPackageId,
    structuredAnswers,
  });
  const timingDetails = deriveTimingDetails(structuredAnswers);
  const categoryLabel = getCustomerServiceCategoryById(categoryId)?.label || 'Service request';
  const serviceLabels = serviceIds
    .map((serviceId) => getCustomerServiceById(serviceId)?.label || '')
    .filter(Boolean);
  const nextStatus = timingDetails.timingPreference === 'later' ? 'scheduled_pending' : 'matching';
  const nextStatusDetail = timingDetails.timingPreference === 'later' && timingDetails.scheduledForText
    ? `Scheduled for ${timingDetails.scheduledForText}. Matching will begin closer to that time.`
    : timingDetails.timingPreference === 'later'
      ? 'Scheduled for later. Matching will begin closer to the requested time.'
      : 'Searching for a helper.';
  const matchingStartedAtMs = timingDetails.timingPreference === 'later' ? null : Date.now();

  const { db } = getFirebaseClients();
  const requestRef = doc(db, 'serviceRequests', requestId);
  const existingSnap = await getDoc(requestRef);
  const existingRequest = existingSnap.exists() ? existingSnap.data() || {} : {};
  const existingPayload = existingRequest.requestPayload || {};
  const resolvedPackageId = String(selectedPackageId || existingRequest.selectedPackageId || existingPayload.selectedPackageId || '').trim();
  const summary = buildServiceRequestSummary({ categoryId, serviceIds, selectedPackageId: resolvedPackageId, structuredAnswers });
  const serviceAddress = existingPayload.serviceAddress || existingRequest.serviceAddress || '';
  const location = await resolveRequestLocation({
    location: existingPayload.location || existingRequest.location || null,
    serviceAddress,
    serviceAddressTarget: structuredAnswers?.service_address_target || existingRequest.structuredAnswers?.service_address_target || '',
  });

  await updateDoc(requestRef, {
    categoryId,
    serviceIds,
    selectedPackageId: resolvedPackageId,
    subject: categoryLabel,
    topic: serviceLabels.join(', ') || categoryLabel,
    description: summary,
    serviceSummary: summary,
    structuredAnswers,
    selectedPortfolioReferences,
    referenceAttachments,
    pricingSnapshot,
    aiUsageSnapshot,
    status: nextStatus,
    statusDetail: nextStatusDetail,
    helperQueue: [],
    currentOfferHelperId: null,
    offerExpiresAt: null,
    offerToken: null,
    offerCycleExcludedHelperIds: [],
    declinedHelperIds: [],
    lastOfferAt: null,
    offerRevision: 0,
    helperAssignment: null,
    matchingStartedAtMs,
    serviceAddress,
    location,
    requestPayload: {
      categoryId,
      serviceIds,
      selectedPackageId: resolvedPackageId,
      summary,
      structuredAnswers,
      selectedPortfolioReferences,
      attachments: referenceAttachments,
      pricingSnapshot,
      aiUsageSnapshot,
      timingPreference: timingDetails.timingPreference,
      scheduledForText: timingDetails.scheduledForText,
      scheduledForAtMs: timingDetails.scheduledForAtMs,
      location,
      serviceAddress,
    },
    updatedAt: serverTimestamp(),
  });

  const customerId = String(existingRequest.customerId || '').trim();
  if (customerId) {
    recordCustomerServiceEvent({
      customerId,
      eventType: 'request_submitted',
      serviceId: serviceIds[0] || resolvedPackageId || categoryId,
      categoryId,
      serviceIds,
      source: 'customer_call',
      metadata: {
        requestId,
        callId,
        timingPreference: timingDetails.timingPreference,
      },
    }).catch(() => {});
  }

  if (callId) {
    await updateDoc(doc(db, 'serviceCalls', callId), {
      status: 'completed',
      updatedAt: serverTimestamp(),
      aiLive: {
        agentType: 'customer_request',
        status: 'ended',
        wsConnected: false,
        audioInActive: false,
        audioOutActive: false,
        transcriptStatus: 'finalized',
        endedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    });
  }

  return pricingSnapshot;
}

export function subscribeToServiceRequestById(requestId, callback, onError) {
  if (!requestId) {
    callback(null);
    return () => {};
  }

  const { db } = getFirebaseClients();
  return onSnapshot(
    doc(db, 'serviceRequests', requestId),
    (snapshot) => callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
    onError,
  );
}

export function subscribeToCustomerServiceRequests(customerId, callback, onError, guestPrincipalIds = []) {
  if (!customerId) {
    callback([]);
    return () => {};
  }

  const { db } = getFirebaseClients();
  const principals = [...new Set([customerId, ...(Array.isArray(guestPrincipalIds) ? guestPrincipalIds : [])]
    .map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 10);
  const itemsById = new Map();
  const unsubs = principals.map((principalId) => onSnapshot(
    query(collection(db, 'serviceRequests'), where('customerId', '==', principalId)),
    (snapshot) => {
      for (const item of snapshot.docs) itemsById.set(item.id, { id: item.id, ...item.data() });
      const currentIds = new Set(snapshot.docs.map((item) => item.id));
      for (const [id, item] of itemsById) {
        if (item.customerId === principalId && !currentIds.has(id)) itemsById.delete(id);
      }
      const items = [...itemsById.values()];
      items.sort((left, right) => normalizeTime(right.createdAt) - normalizeTime(left.createdAt));
      callback(items);
    },
    onError,
  ));
  return () => unsubs.forEach((unsubscribe) => unsubscribe());
}

export async function cancelServiceRequestByCustomer({ requestId, reason }) {
  if (!requestId) {
    throw new Error('A request ID is required to cancel.');
  }

  const { auth, db } = getFirebaseClients();
  const currentUserId = String(auth.currentUser?.uid || '').trim();
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken || !currentUserId) {
    throw new Error('You must be signed in to cancel this request.');
  }

  const requestRef = doc(db, 'serviceRequests', requestId);
  const requestSnap = await getDoc(requestRef).catch(() => null);
  if (!requestSnap?.exists()) {
    throw new Error('Service request not found.');
  }

  const request = requestSnap.data() || {};
  const normalizedStatus = String(request.status || '').toLowerCase();
  if (['completed', 'canceled'].includes(normalizedStatus)) {
    return { id: requestSnap.id, ...request };
  }

  const canceledReason = String(reason || '').trim();
  const cancelableStatuses = [
    'collecting_details', 'scheduled_pending', 'matching', 'helper_found', 'no_helper_available',
    'accepted', 'driving', 'en_route', 'buying_resources', 'arrived', 'work_started',
  ];
  if (!cancelableStatuses.includes(normalizedStatus)) {
    throw new Error('This request cannot be canceled from its current state.');
  }

  const response = await fetch(getFunctionEndpoint('billCustomerServiceCancellation'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requestId,
      reason: canceledReason,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || 'Unable to cancel this request.');
  }
  const updatedSnap = await getDoc(requestRef);
  return updatedSnap.exists() ? { id: updatedSnap.id, ...updatedSnap.data() } : null;
}

export async function createServicePaymentLink(requestId) {
  const { auth } = getFirebaseClients();
  const currentUser = auth.currentUser;
  const idToken = await currentUser?.getIdToken();
  if (!idToken) throw new Error('Sign in before opening request payment options.');
  const response = await fetch(getFunctionEndpoint('createServicePaymentSession'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success !== true) throw new Error(payload?.message || 'Unable to open payment options.');
  return String(payload.url || '');
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
