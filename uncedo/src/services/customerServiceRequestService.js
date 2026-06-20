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
import { getFirebaseClients } from '../firebase/config';

const ACTIVE_SERVICE_REQUEST_STATUSES = ['collecting_details', 'scheduled_pending', 'matching', 'helper_found', 'accepted', 'en_route', 'arrived', 'no_helper_available'];
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

export function deriveTimingDetails(structuredAnswers = {}) {
  const entries = Object.entries(structuredAnswers || {});
  const match = (patterns) => entries.find(([key]) => patterns.some((pattern) => String(key || '').toLowerCase().includes(pattern)));
  const timingEntry = match(['timing', 'when', 'appointment', 'schedule', 'service_time']);
  const scheduleEntry = match(['scheduled_for', 'requested_time', 'date_time', 'time_text', 'service_time']);
  const rawTiming = normalizeText(timingEntry?.[1]).toLowerCase();
  const scheduledForText = normalizeText(scheduleEntry?.[1] || timingEntry?.[1]);

  if (rawTiming.includes('later') || rawTiming.includes('tomorrow') || rawTiming.includes('schedule')) {
    return { timingPreference: 'later', scheduledForText };
  }

  if (rawTiming.includes('now') || rawTiming.includes('asap') || rawTiming.includes('immediately')) {
    return { timingPreference: 'now', scheduledForText };
  }

  return {
    timingPreference: scheduledForText ? 'later' : 'now',
    scheduledForText,
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

function buildServiceRequestTitle({ categoryId = '', serviceIds = [] } = {}) {
  const categoryLabel = getCustomerServiceCategoryById(categoryId)?.label || 'Service request';
  const serviceLabels = serviceIds
    .map((serviceId) => getCustomerServiceById(serviceId)?.label || '')
    .filter(Boolean);
  if (!serviceLabels.length) return categoryLabel;
  return `${categoryLabel}: ${serviceLabels.join(', ')}`;
}

export function buildServiceRequestSummary({ categoryId = '', serviceIds = [], structuredAnswers = {} } = {}) {
  const title = buildServiceRequestTitle({ categoryId, serviceIds });
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

export async function createCustomerServiceRequest({ user, location }) {
  if (!user?.uid) {
    throw new Error('You must be signed in to start a service request.');
  }

  const { db } = getFirebaseClients();
  const existingSnap = await getDocs(
    query(
      collection(db, 'serviceRequests'),
      where('customerId', '==', user.uid),
      where('status', 'in', ACTIVE_SERVICE_REQUEST_STATUSES),
    ),
  );

  await Promise.all(existingSnap.docs.map((item) => updateDoc(item.ref, {
    status: 'expired',
    statusDetail: 'Previous service request expired by a new request.',
    updatedAt: serverTimestamp(),
  })));

  const draft = createServiceRequestDraft({
    serviceAddress: String(user?.customerProfile?.serviceAddress || '').trim(),
    location: location || null,
  });

  const docRef = await addDoc(collection(db, 'serviceRequests'), {
    customerId: user.uid,
    customerName: user.fullName || user.displayName || 'Customer',
    customerEmail: user.email || '',
    customerPhone: user.phoneNumber || '',
    location: location || null,
    status: 'collecting_details',
    statusDetail: 'AI intake call started. Collecting service details.',
    requestType: 'customer_service',
    intakeMode: 'ai_voice_chat',
    requestPayload: draft,
    categoryId: '',
    serviceIds: [],
    subject: 'Service request',
    topic: 'Collecting details',
    description: '',
    serviceSummary: '',
    pricingSnapshot: null,
    aiUsageSnapshot: null,
    helperAssignment: null,
    helperQueue: [],
    currentOfferHelperId: null,
    offerExpiresAt: null,
    offerToken: null,
    offerRevision: 0,
    lastOfferAt: null,
    transcript: [],
    structuredAnswers: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function createCustomerServiceCall({ requestId, user }) {
  if (!requestId) {
    throw new Error('A service request is required before starting the AI call.');
  }
  if (!user?.uid) {
    throw new Error('You must be signed in to start the AI call.');
  }

  const { db } = getFirebaseClients();
  const docRef = await addDoc(collection(db, 'serviceCalls'), {
    requestId,
    customerId: user.uid,
    customerName: user.fullName || user.displayName || 'Customer',
    customerEmail: user.email || '',
    callType: 'customer_service_intake',
    status: 'dialing',
    aiLive: {
      agentType: 'customer_request',
      model: 'gemini-2.5-flash',
      status: 'dialing',
      wsConnected: false,
      audioInActive: false,
      audioOutActive: false,
      transcriptStatus: 'idle',
      usageSummary: null,
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, 'serviceRequests', requestId), {
    callId: docRef.id,
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function updateCustomerServiceRequest(requestId, updates = {}) {
  if (!requestId) {
    throw new Error('Service request id is required.');
  }

  const { db } = getFirebaseClients();
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
  structuredAnswers = {},
  aiUsageSnapshot = null,
  selectedPortfolioReferences = [],
  referenceAttachments = [],
  serviceOverrides = {},
}) {
  if (!requestId) {
    throw new Error('Service request id is required.');
  }

  const pricingSnapshot = buildServicePricingSnapshot({
    categoryId,
    serviceIds,
    structuredAnswers,
    serviceOverrides,
    aiUsageSnapshot,
  });
  const summary = buildServiceRequestSummary({ categoryId, serviceIds, structuredAnswers });
  const timingDetails = deriveTimingDetails(structuredAnswers);

  const { db } = getFirebaseClients();
  const requestRef = doc(db, 'serviceRequests', requestId);
  const existingSnap = await getDoc(requestRef);
  const existingRequest = existingSnap.exists() ? existingSnap.data() || {} : {};
  const existingPayload = existingRequest.requestPayload || {};
  const serviceAddress = existingPayload.serviceAddress || existingRequest.serviceAddress || '';
  const location = existingPayload.location || existingRequest.location || null;

  await updateDoc(requestRef, {
    categoryId,
    serviceIds,
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
    lastOfferAt: null,
    serviceAddress,
    location,
    requestPayload: {
      categoryId,
      serviceIds,
      summary,
      structuredAnswers,
      selectedPortfolioReferences,
      attachments: referenceAttachments,
      pricingSnapshot,
      aiUsageSnapshot,
      timingPreference: timingDetails.timingPreference,
      scheduledForText: timingDetails.scheduledForText,
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
  };
}

export async function finalizeCustomerServiceRequest({
  requestId,
  callId,
  categoryId,
  serviceIds,
  structuredAnswers = {},
  aiUsageSnapshot = null,
  selectedPortfolioReferences = [],
  referenceAttachments = [],
  serviceOverrides = {},
}) {
  const pricingSnapshot = buildServicePricingSnapshot({
    categoryId,
    serviceIds,
    structuredAnswers,
    serviceOverrides,
    aiUsageSnapshot,
  });
  const summary = buildServiceRequestSummary({ categoryId, serviceIds, structuredAnswers });
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

  const { db } = getFirebaseClients();
  const requestRef = doc(db, 'serviceRequests', requestId);
  const existingSnap = await getDoc(requestRef);
  const existingRequest = existingSnap.exists() ? existingSnap.data() || {} : {};
  const existingPayload = existingRequest.requestPayload || {};
  const serviceAddress = existingPayload.serviceAddress || existingRequest.serviceAddress || '';
  const location = existingPayload.location || existingRequest.location || null;

  await updateDoc(requestRef, {
    categoryId,
    serviceIds,
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
    lastOfferAt: null,
    offerRevision: 0,
    helperAssignment: null,
    serviceAddress,
    location,
    requestPayload: {
      categoryId,
      serviceIds,
      summary,
      structuredAnswers,
      selectedPortfolioReferences,
      attachments: referenceAttachments,
      pricingSnapshot,
      aiUsageSnapshot,
      timingPreference: timingDetails.timingPreference,
      scheduledForText: timingDetails.scheduledForText,
      location,
      serviceAddress,
    },
    updatedAt: serverTimestamp(),
  });

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

export async function cancelCustomerServiceCall(callId) {
  if (!callId) return;
  const { db } = getFirebaseClients();
  await updateDoc(doc(db, 'serviceCalls', callId), {
    status: 'ended',
    updatedAt: serverTimestamp(),
    aiLive: {
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

export function subscribeToServiceCallById(callId, callback, onError) {
  if (!callId) {
    callback(null);
    return () => {};
  }

  const { db } = getFirebaseClients();
  return onSnapshot(
    doc(db, 'serviceCalls', callId),
    (snapshot) => callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
    onError,
  );
}

export function subscribeToCustomerServiceRequests(customerId, callback, onError) {
  if (!customerId) {
    callback([]);
    return () => {};
  }

  const { db } = getFirebaseClients();
  const requestsQuery = query(collection(db, 'serviceRequests'), where('customerId', '==', customerId));
  return onSnapshot(
    requestsQuery,
    (snapshot) => {
      const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      items.sort((left, right) => normalizeTime(right.createdAt) - normalizeTime(left.createdAt));
      callback(items);
    },
    onError,
  );
}

export async function cancelServiceRequestByCustomer({ requestId, reason }) {
  if (!requestId) {
    throw new Error('A request ID is required to cancel.');
  }

  const { db } = getFirebaseClients();
  const requestRef = doc(db, 'serviceRequests', requestId);
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) return;
  const requestData = requestSnap.data();

  const updates = {
    status: 'canceled',
    statusDetail: 'Customer canceled the session.',
    canceledBy: 'customer',
    canceledReason: reason || '',
    updatedAt: serverTimestamp(),
  };

  const helperId = requestData?.helperAssignment?.helperId;
  if (helperId) {
    const helperRef = doc(db, 'users', helperId);
    await runTransaction(db, async (transaction) => {
      transaction.update(requestRef, updates);
      transaction.update(helperRef, {
        activeServiceRequestId: null,
        updatedAt: serverTimestamp(),
      });
    });
  } else {
    await updateDoc(requestRef, updates);
  }
}
