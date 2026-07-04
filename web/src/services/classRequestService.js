import { getFirebaseClients } from '../firebase/config';
import { MEETING_PROVIDERS } from '../constants/meetingProviders';
import {
  OFFER_TIMEOUT_MS,
  OFFER_TIMEOUT_SECONDS,
  REQUEST_STATUS,
  SESSION_STATUS,
  canTransitionRequest,
} from '../constants/lifecycle';
import { PLATFORM_FEE_RATE, TUTOR_PAYOUT_RATE, isTutorAgreementCurrent } from '../utils/onboarding';
import { normalizePricingSnapshot } from '../utils/pricing';
import { getWeekKey } from '../utils/payouts';
import { createNotification } from './notificationService';
import { getTutorCandidatesForRequest, getUserProfile } from './userService';
import { debugError, debugLog } from '../utils/devLogger';

const MOCK_REQUESTS_KEY = 'parakleo_mock_requests';
const MOCK_SESSIONS_KEY = 'parakleo_mock_sessions';
const MATCHING_TIMEOUT_MS = 3 * 60 * 1000;
const MATCHING_STATUS_DELAY_MS = 3000;
const NO_TUTOR_STATUS_DELAY_MS = 3000;
const DEFAULT_RATING_STATUS = {
  student: 'pending',
  tutor: 'pending',
};

let isUpdatingRequests = false;
let isUpdatingSessions = false;
const inFlightOfferResponses = new Map();

function getMockRequests() {
  return JSON.parse(localStorage.getItem(MOCK_REQUESTS_KEY) || '[]');
}

function setMockRequests(items) {
  if (isUpdatingRequests) return;
  isUpdatingRequests = true;
  localStorage.setItem(MOCK_REQUESTS_KEY, JSON.stringify(items));
  window.dispatchEvent(new StorageEvent('storage'));
  isUpdatingRequests = false;
}

function getMockSessions() {
  return JSON.parse(localStorage.getItem(MOCK_SESSIONS_KEY) || '[]');
}

function setMockSessions(items) {
  if (isUpdatingSessions) return;
  isUpdatingSessions = true;
  localStorage.setItem(MOCK_SESSIONS_KEY, JSON.stringify(items));
  window.dispatchEvent(new StorageEvent('storage'));
  isUpdatingSessions = false;
}

function withMockSnapshot(filterFn, callback) {
  const emit = () => callback(getMockRequests().filter(filterFn));
  emit();
  window.addEventListener('storage', emit);
  return () => window.removeEventListener('storage', emit);
}

function computeTutorQueue(tutors = []) {
  return tutors.map((tutor) => tutor.uid);
}

function normalizeTimestamp(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getStatusDelayElapsed(request, delayMs) {
  if (!request) return true;
  const updatedAtMs = normalizeTimestamp(request.updatedAt);
  if (!updatedAtMs) return true;
  return Date.now() - updatedAtMs >= delayMs;
}

function hasCurrentTutorAgreement(tutor = {}) {
  return isTutorAgreementCurrent(tutor?.tutorAgreement || {});
}

function isRequestExpired(request) {
  const createdAtMs = normalizeTimestamp(request.createdAt);
  if (!createdAtMs) return false;
  return Date.now() - createdAtMs >= MATCHING_TIMEOUT_MS;
}

function updateRequestStatusSafe(request, nextStatus) {
  if (!canTransitionRequest(request.status, nextStatus)) {
    return request;
  }
  return {
    ...request,
    status: nextStatus,
  };
}

async function assignNextTutorOffer(requestId) {
  const clients = await getFirebaseClients();

  if (!clients) {
    const existing = getMockRequests().find((request) => request.id === requestId);
    if (!existing) return null;
    if (isRequestExpired(existing)) {
      const next = getMockRequests().map((request) =>
        request.id === requestId
          ? {
              ...updateRequestStatusSafe(request, REQUEST_STATUS.EXPIRED),
              currentOfferTutorId: null,
              offerExpiresAt: null,
              statusDetail: 'Request expired because no tutor accepted in time.',
              updatedAt: new Date().toISOString(),
            }
          : request,
      );
      setMockRequests(next);
      return null;
    }

    const queue = existing.tutorQueue || [];
    const nextTutorId = queue[0] || null;
    const isNoTutorReady = getStatusDelayElapsed(existing, MATCHING_STATUS_DELAY_MS);
    const isRetryReady = getStatusDelayElapsed(existing, NO_TUTOR_STATUS_DELAY_MS);

    if (!nextTutorId) {
      if (existing.status === REQUEST_STATUS.NO_TUTOR_AVAILABLE) {
        if (!isRetryReady) {
          return null;
        }

        const goMatching = getMockRequests().map((request) =>
          request.id === requestId
            ? {
                ...updateRequestStatusSafe(request, REQUEST_STATUS.MATCHING),
                tutorQueue: queue,
                currentOfferTutorId: null,
                offerExpiresAt: null,
                statusDetail: 'Retrying tutor matching.',
                updatedAt: new Date().toISOString(),
              }
            : request,
        );
        setMockRequests(goMatching);
        return null;
      }

      if (!isNoTutorReady) {
        return null;
      }

      const noTutor = getMockRequests().map((request) =>
        request.id === requestId
          ? {
              ...updateRequestStatusSafe(request, REQUEST_STATUS.NO_TUTOR_AVAILABLE),
              tutorQueue: queue,
              currentOfferTutorId: null,
              offerExpiresAt: null,
              statusDetail: 'No tutor accepted. Looking for another tutor.',
              updatedAt: new Date().toISOString(),
            }
          : request,
      );
      setMockRequests(noTutor);
      return null;
    }

    if (existing.status === REQUEST_STATUS.NO_TUTOR_AVAILABLE) {
      const promote = getMockRequests().map((request) =>
        request.id === requestId
          ? {
              ...updateRequestStatusSafe(request, REQUEST_STATUS.MATCHING),
              tutorQueue: queue,
              statusDetail: 'Tutor found; moving to matching.',
              updatedAt: new Date().toISOString(),
            }
          : request,
      );
      setMockRequests(promote);
    }

    const next = getMockRequests().map((request) =>
      request.id === requestId
        ? {
            ...updateRequestStatusSafe(request, REQUEST_STATUS.OFFERED),
            currentOfferTutorId: nextTutorId,
            tutorQueue: queue,
            offerExpiresAt: Date.now() + OFFER_TIMEOUT_MS,
            retryOfferGranted: false,
            statusDetail: 'Tutor notified. Waiting for acceptance.',
            updatedAt: new Date().toISOString(),
          }
        : request,
    );
    setMockRequests(next);
    return nextTutorId;
  }

  const { db, firestoreModule } = clients;
  const { doc, getDoc, updateDoc, serverTimestamp } = firestoreModule;
  const requestRef = doc(db, 'classRequests', requestId);
  const requestSnap = await getDoc(requestRef);

  if (!requestSnap.exists()) return null;

  const requestData = requestSnap.data();
  if (isRequestExpired(requestData)) {
    if (canTransitionRequest(requestData.status, REQUEST_STATUS.EXPIRED)) {
      await updateDoc(requestRef, {
        status: REQUEST_STATUS.EXPIRED,
        currentOfferTutorId: null,
        offerExpiresAt: null,
        updatedAt: serverTimestamp(),
      });
    }
    return null;
  }
  const queue = requestData.tutorQueue || [];
  const nextTutorId = queue[0] || null;
  const isNoTutorReady = getStatusDelayElapsed(requestData, MATCHING_STATUS_DELAY_MS);
  const isRetryReady = getStatusDelayElapsed(requestData, NO_TUTOR_STATUS_DELAY_MS);

  if (!nextTutorId) {
    if (requestData.status === REQUEST_STATUS.NO_TUTOR_AVAILABLE) {
      if (!isRetryReady) {
        return null;
      }

      if (canTransitionRequest(requestData.status, REQUEST_STATUS.MATCHING)) {
        await updateDoc(requestRef, {
          status: REQUEST_STATUS.MATCHING,
          tutorQueue: queue,
          currentOfferTutorId: null,
          offerExpiresAt: null,
          statusDetail: 'Retrying tutor matching.',
          updatedAt: serverTimestamp(),
        });
      }

      return null;
    }

    if (!isNoTutorReady) {
      if (canTransitionRequest(requestData.status, REQUEST_STATUS.MATCHING)) {
        await updateDoc(requestRef, {
          status: REQUEST_STATUS.MATCHING,
          tutorQueue: queue,
          currentOfferTutorId: null,
          offerExpiresAt: null,
          statusDetail: 'Matching tutors currently online.',
          updatedAt: serverTimestamp(),
        });
      }
      return null;
    }

    if (canTransitionRequest(requestData.status, REQUEST_STATUS.NO_TUTOR_AVAILABLE)) {
      await updateDoc(requestRef, {
        status: REQUEST_STATUS.NO_TUTOR_AVAILABLE,
        currentOfferTutorId: null,
        offerExpiresAt: null,
        statusDetail: 'No tutor available. Showing this for a short delay.',
        updatedAt: serverTimestamp(),
      });
    }

    await createNotification({
      userId: requestData.studentId,
      title: 'No tutor available',
      message: 'No tutor accepted in time. Please retry your request.',
      type: 'matching_update',
      requestId,
      targetPath: `/app/student/requests/${requestId}`,
    });

    return null;
  }

  if (requestData.status === REQUEST_STATUS.NO_TUTOR_AVAILABLE && canTransitionRequest(requestData.status, REQUEST_STATUS.MATCHING)) {
    await updateDoc(requestRef, {
      status: REQUEST_STATUS.MATCHING,
      tutorQueue: queue,
      statusDetail: 'Tutor found; moving to matching.',
      updatedAt: serverTimestamp(),
    });
    requestData.status = REQUEST_STATUS.MATCHING;
  }

  if (canTransitionRequest(requestData.status, REQUEST_STATUS.OFFERED)) {
    await updateDoc(requestRef, {
      status: REQUEST_STATUS.OFFERED,
      currentOfferTutorId: nextTutorId,
      offerExpiresAt: Date.now() + OFFER_TIMEOUT_MS,
      retryOfferGranted: false,
      statusDetail: 'Tutor notified. Waiting for acceptance.',
      updatedAt: serverTimestamp(),
    });
  }

  await createNotification({
    userId: nextTutorId,
    title: 'New live request',
    message: `New math request: ${requestData.topic}. Accept within ${OFFER_TIMEOUT_SECONDS} seconds.`,
    type: 'tutor_offer',
    requestId,
    targetPath: '/app/tutor',
  });

  return nextTutorId;
}

async function initializeTutorMatching(requestId, payload) {
  const candidates = await getTutorCandidatesForRequest({ subject: payload.subject || 'Mathematics' });
  const queue = computeTutorQueue(candidates);
  const clients = await getFirebaseClients();

  if (!clients) {
    const next = getMockRequests().map((request) =>
      request.id === requestId
        ? {
            ...updateRequestStatusSafe(request, REQUEST_STATUS.MATCHING),
            tutorQueue: queue,
            statusDetail: 'Matching tutors currently online.',
            updatedAt: new Date().toISOString(),
          }
        : request,
    );
    setMockRequests(next);
    await assignNextTutorOffer(requestId);
    return;
  }

  await createNotification({
    userId: payload.studentId,
    title: 'Finding a tutor',
    message: 'Your request is queued. Matching is managed by the backend.',
    type: 'matching_update',
    requestId,
    targetPath: `/app/student/requests/${requestId}`,
  });
}

export async function createClassRequest(payload) {
  debugLog('classRequestService', 'Creating class request.', {
    studentId: payload?.studentId,
    topic: payload?.topic,
    durationMinutes: payload?.durationMinutes || payload?.duration,
  });
  const clients = await getFirebaseClients();
  const requestBody = {
    ...payload,
    subject: payload.subject || 'Mathematics',
    durationMinutes: Number(payload.durationMinutes || 10),
    pricingSnapshot: payload.pricingSnapshot || null,
    pricingQuoteId: payload.pricingSnapshot?.quoteId || null,
    mode: 'online',
    meetingProviderPreference: payload.meetingProviderPreference || MEETING_PROVIDERS.ANY,
    status: REQUEST_STATUS.PENDING,
    tutorId: null,
    tutorName: null,
    tutorEmail: null,
    tutorQueue: [],
    currentOfferTutorId: null,
    offerExpiresAt: null,
    imageAttachment: payload.imageAttachment || '',
    attachment: payload.attachment || null,
    statusDetail: 'Request submitted. Initializing tutor matching.',
    ratings: {
      student: null,
      tutor: null,
    },
    ratingStatus: DEFAULT_RATING_STATUS,
  };

  if (!clients) {
    const nowIso = new Date().toISOString();
    const expirableStatuses = [REQUEST_STATUS.PENDING, REQUEST_STATUS.MATCHING, REQUEST_STATUS.OFFERED, REQUEST_STATUS.NO_TUTOR_AVAILABLE];
    const expired = getMockRequests().map((item) =>
      item.studentId === payload.studentId && expirableStatuses.includes(item.status)
        ? {
            ...updateRequestStatusSafe(item, REQUEST_STATUS.EXPIRED),
            currentOfferTutorId: null,
            offerExpiresAt: null,
            updatedAt: nowIso,
          }
        : item,
    );

    const request = {
      id: crypto.randomUUID(),
      ...requestBody,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setMockRequests([request, ...expired]);

    await createNotification({
      userId: payload.studentId,
      title: 'Class request submitted',
      message: `Your ${payload.topic || payload.subject} request is now matching tutors.`,
      type: 'class_request',
      requestId: request.id,
      targetPath: `/app/student/requests/${request.id}`,
    });

    await initializeTutorMatching(request.id, payload);
    return request.id;
  }

  const { db, firestoreModule } = clients;
  const { addDoc, collection, serverTimestamp, query, where, getDocs, updateDoc } = firestoreModule;

  const existingSnap = await getDocs(
    query(
      collection(db, 'classRequests'),
      where('studentId', '==', payload.studentId),
      where('status', 'in', [REQUEST_STATUS.PENDING, REQUEST_STATUS.MATCHING, REQUEST_STATUS.OFFERED, REQUEST_STATUS.NO_TUTOR_AVAILABLE]),
    ),
  );

  await Promise.all(existingSnap.docs.map((item) => updateDoc(item.ref, {
    status: REQUEST_STATUS.EXPIRED,
    statusDetail: 'Previous request auto-expired by new request.',
    currentOfferTutorId: null,
    offerExpiresAt: null,
    updatedAt: serverTimestamp(),
  })));

  const docRef = await addDoc(collection(db, 'classRequests'), {
    ...requestBody,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await createNotification({
    userId: payload.studentId,
    title: 'Class request submitted',
    message: `Your ${payload.topic || payload.subject} request is now matching tutors.`,
    type: 'class_request',
    requestId: docRef.id,
    targetPath: `/app/student/requests/${docRef.id}`,
  });

  debugLog('classRequestService', 'Class request created. Backend lifecycle trigger will process matching.', { requestId: docRef.id });
  return docRef.id;
}

export function subscribeToStudentRequests(studentId, callback) {
  let unsub = () => {};
  getFirebaseClients().then((clients) => {
    if (!clients) {
      unsub = withMockSnapshot((item) => item.studentId === studentId, callback);
      return;
    }

    const { db, firestoreModule } = clients;
    const { collection, onSnapshot, orderBy, query, where } = firestoreModule;

    const queryRef = query(
      collection(db, 'classRequests'),
      where('studentId', '==', studentId),
      orderBy('createdAt', 'desc'),
    );

    unsub = onSnapshot(queryRef, async (snapshot) => {
      callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
  });

  return () => {
    unsub();
  };
}

export function subscribeToRequestById(requestId, callback) {
  let unsub = () => {};

  getFirebaseClients().then((clients) => {
    if (!clients) {
      const emit = () => callback(getMockRequests().find((item) => item.id === requestId) || null);
      emit();
      window.addEventListener('storage', emit);
      unsub = () => window.removeEventListener('storage', emit);
      return;
    }

    const { db, firestoreModule } = clients;
    const { doc, onSnapshot } = firestoreModule;

    unsub = onSnapshot(doc(db, 'classRequests', requestId), (snapshot) => {
      callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    });
  });

  return () => {
    unsub();
  };
}

export function subscribeToTutorAvailableRequests(tutorId, callback) {
  let unsub = () => {};
  getFirebaseClients().then((clients) => {
    if (!clients) {
      const emit = () => {
        const current = getMockRequests();
        callback(
          current.filter(
            (request) => request.status === REQUEST_STATUS.OFFERED && request.currentOfferTutorId === tutorId,
          ),
        );
      };

      emit();
      window.addEventListener('storage', emit);
      unsub = () => {
        window.removeEventListener('storage', emit);
      };
      return;
    }

    const { db, firestoreModule } = clients;
    const { collection, onSnapshot, query, where } = firestoreModule;

    const queryRef = query(
      collection(db, 'classRequests'),
      where('status', '==', REQUEST_STATUS.OFFERED),
      where('currentOfferTutorId', '==', tutorId),
    );

    unsub = onSnapshot(queryRef, async (snapshot) => {
      callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
  });

  return () => {
    unsub();
  };
}

export function subscribeToTutorAcceptedRequests(tutorId, callback) {
  let unsub = () => {};

  getFirebaseClients().then((clients) => {
    if (!clients) {
      unsub = withMockSnapshot((item) => item.tutorId === tutorId, callback);
      return;
    }

    const { db, firestoreModule } = clients;
    const { collection, onSnapshot, orderBy, query, where } = firestoreModule;

    const queryRef = query(
      collection(db, 'classRequests'),
      where('tutorId', '==', tutorId),
      orderBy('updatedAt', 'desc'),
    );

    unsub = onSnapshot(queryRef, (snapshot) => {
      callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
  });

  return () => unsub();
}

export async function handleTutorOfferResponse({ requestId, tutorId, tutorName, tutorEmail, response }) {
  const inFlightKey = `${response}:${requestId}:${tutorId}`;
  if (inFlightOfferResponses.has(inFlightKey)) {
    return inFlightOfferResponses.get(inFlightKey);
  }

  const responsePromise = (async () => {
    const clients = await getFirebaseClients();
    const tutorProfile = response === 'accept' ? await getUserProfile(tutorId).catch(() => null) : null;

  if (!clients) {
    const existing = getMockRequests().find((item) => item.id === requestId);
    if (!existing) return;

    if (response === 'accept') {
      if (!hasCurrentTutorAgreement(tutorProfile || {})) {
        throw new Error('You must accept the current Tutor Agreement before accepting class requests.');
      }

      const existingSessionId = existing.sessionId || requestId;
      const existingSession = getMockSessions().find(
        (item) =>
          item.id === existingSessionId
          || (item.requestId === requestId && item.tutorId === tutorId),
      );

      if (
        existing.status === REQUEST_STATUS.ACCEPTED
        && existing.tutorId === tutorId
        && existingSession
      ) {
        debugLog('classRequestService', 'Mock accept reused existing session.', {
          requestId,
          tutorId,
          sessionId: existingSession.id,
        });
        return { sessionId: existingSession.id, reused: true };
      }

      if (existing.currentOfferTutorId !== tutorId) {
        throw new Error('This request is no longer assigned to you.');
      }

      if (normalizeTimestamp(existing.offerExpiresAt) <= Date.now()) {
        throw new Error('This offer has expired.');
      }

      if (!canTransitionRequest(existing.status, REQUEST_STATUS.ACCEPTED)) {
        throw new Error('This request cannot be accepted in its current state.');
      }

      const sessionId = existingSession?.id || existing.sessionId || requestId;

      const next = getMockRequests().map((item) =>
        item.id === requestId
          ? {
              ...updateRequestStatusSafe(item, REQUEST_STATUS.ACCEPTED),
              tutorId,
              tutorName: tutorName || existing.tutorName || 'Tutor',
              tutorEmail: tutorEmail || existing.tutorEmail || '',
              sessionId,
              currentOfferTutorId: null,
              offerExpiresAt: null,
              statusDetail: 'Tutor accepted. Session is ready to join.',
              updatedAt: new Date().toISOString(),
            }
          : item,
      );
      setMockRequests(next);

      if (!existingSession) {
        const session = {
          id: sessionId,
          requestId,
          studentId: existing.studentId,
          studentName: existing.studentName,
          studentEmail: existing.studentEmail,
          tutorId,
          tutorName: tutorName || existing.tutorName || 'Tutor',
          tutorEmail: tutorEmail || existing.tutorEmail || '',
          subject: 'Mathematics',
          topic: existing.topic,
          scheduledDate: existing.preferredDate,
          scheduledTime: existing.preferredTime,
          duration: existing.duration,
          durationMinutes: Number(existing.durationMinutes || 10),
          pricingSnapshot: existing.pricingSnapshot || null,
          pricingQuoteId: existing.pricingQuoteId || existing.pricingSnapshot?.quoteId || null,
          meetingProvider: MEETING_PROVIDERS.WEBRTC,
          sessionType: 'human',
          sessionProvider: 'webrtc_human',
          meetingLink: '',
          meetingId: '',
          meetingPassword: '',
          webrtc: {
            ready: true,
            status: 'tutor_waiting',
            tutorReadyAt: Date.now(),
            studentReadyAt: null,
            offer: null,
            answer: null,
            lastRestartAt: null,
          },
          whiteboardRoomId: existing.whiteboardRoomId || requestId,
          notes: '',
          requestAttachment: existing.attachment || null,
          attachments: Array.isArray(existing.attachments) ? existing.attachments : (existing.attachment ? [existing.attachment] : []),
          requestDescription: existing.description || '',
          boardPreparationSource: existing.boardPreparationSource || null,
          status: SESSION_STATUS.WAITING_STUDENT,
          joinGraceEndsAt: Date.now() + 2 * 60 * 1000,
          callStartedAt: null,
          studentJoinedAt: null,
          billingStartedAt: null,
          billedSeconds: 0,
          totalAmount: 0,
          payoutBreakdown: {
            platformFeeRate: PLATFORM_FEE_RATE,
            tutorRate: TUTOR_PAYOUT_RATE,
            tutorAmount: 0,
            platformAmount: 0,
          },
          ratings: {
            student: null,
            tutor: null,
          },
          ratingStatus: DEFAULT_RATING_STATUS,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        setMockSessions([
          session,
          ...getMockSessions().filter((item) => item.id !== sessionId),
        ]);
      }

      await createNotification({
        userId: existing.studentId,
        title: 'Tutor selected',
        message: `${tutorName || existing.tutorName || 'A tutor'} accepted your request.`,
        type: 'request_accepted',
        requestId,
        sessionId,
        targetPath: `/app/session/${sessionId}`,
      });

      return { sessionId, reused: Boolean(existingSession) };
    }

    if (existing.currentOfferTutorId !== tutorId) {
      throw new Error('This request is no longer assigned to you.');
    }

    const queue = (existing.tutorQueue || []).filter((id) => id !== tutorId);
    const nextStatus = queue.length ? REQUEST_STATUS.MATCHING : REQUEST_STATUS.NO_TUTOR_AVAILABLE;

    if (!canTransitionRequest(existing.status, nextStatus)) {
      throw new Error('This request cannot be declined in its current state.');
    }

    const updated = getMockRequests().map((item) =>
      item.id === requestId
        ? {
            ...updateRequestStatusSafe(item, nextStatus),
            tutorQueue: queue,
            currentOfferTutorId: null,
            offerExpiresAt: null,
            updatedAt: new Date().toISOString(),
          }
        : item,
    );

    setMockRequests(updated);
    await assignNextTutorOffer(requestId);
    return { sessionId: null, reused: false };
  }

  const { db, firestoreModule } = clients;
  const { doc, runTransaction, serverTimestamp } = firestoreModule;

  debugLog('classRequestService', 'Tutor offer transaction started.', {
    requestId,
    tutorId,
    response,
  });

  try {
    if (response === 'accept' && !hasCurrentTutorAgreement(tutorProfile || {})) {
      throw new Error('You must accept the current Tutor Agreement before accepting class requests.');
    }

    const transactionResult = await runTransaction(db, async (transaction) => {
      const requestRef = doc(db, 'classRequests', requestId);
      const requestSnap = await transaction.get(requestRef);

      if (!requestSnap.exists()) throw new Error('Request not found.');

      const requestData = requestSnap.data();
      const resolvedTutorName = tutorName || requestData.tutorName || 'Tutor';
      const resolvedTutorEmail = tutorEmail || requestData.tutorEmail || '';
      const sessionId = requestData.sessionId || requestId;
      const sessionRef = doc(db, 'sessions', sessionId);
      const sessionSnap = await transaction.get(sessionRef);

      debugLog('classRequestService', 'Tutor offer transaction request state.', {
        requestId,
        status: requestData.status || null,
        currentOfferTutorId: requestData.currentOfferTutorId || null,
        existingSessionId: requestData.sessionId || null,
      });

      if (response === 'accept') {
        const alreadyAcceptedBySameTutor =
          requestData.status === REQUEST_STATUS.ACCEPTED
          && requestData.tutorId === tutorId;

        if (alreadyAcceptedBySameTutor && sessionSnap.exists()) {
          debugLog('classRequestService', 'Tutor offer transaction reused existing accepted session.', {
            requestId,
            tutorId,
            sessionId,
          });
          return { sessionId, reused: true };
        }

        if (requestData.currentOfferTutorId !== tutorId && !alreadyAcceptedBySameTutor) {
          throw new Error('This request is no longer assigned to you.');
        }

        if (!alreadyAcceptedBySameTutor && normalizeTimestamp(requestData.offerExpiresAt) <= Date.now()) {
          throw new Error('This offer has expired.');
        }

        if (!alreadyAcceptedBySameTutor && !requestData.offerToken) {
          throw new Error('This offer is stale. Please wait for a fresh offer.');
        }

        if (!alreadyAcceptedBySameTutor && !canTransitionRequest(requestData.status, REQUEST_STATUS.ACCEPTED)) {
          throw new Error('This request cannot be accepted in its current state.');
        }

        transaction.update(requestRef, {
          tutorId,
          tutorName: resolvedTutorName,
          tutorEmail: resolvedTutorEmail,
          sessionId,
          status: REQUEST_STATUS.ACCEPTED,
          currentOfferTutorId: null,
          offerExpiresAt: null,
          acceptedOfferRevision: Number(requestData.offerRevision || 0) || 0,
          acceptedOfferToken: requestData.offerToken || null,
          offerToken: null,
          statusDetail: 'Tutor accepted. Session is ready to join.',
          updatedAt: serverTimestamp(),
        });

        const scheduledDate = requestData.preferredDate || requestData.scheduledDate || '';
        const scheduledTime = requestData.preferredTime || requestData.scheduledTime || '';

        if (!sessionSnap.exists()) {
          debugLog('classRequestService', 'Tutor offer transaction creating session.', {
            requestId,
            sessionId,
          });

          transaction.set(
            sessionRef,
            {
              requestId,
              studentId: requestData.studentId,
              studentName: requestData.studentName,
              studentEmail: requestData.studentEmail,
              tutorId,
              tutorName: resolvedTutorName,
              tutorEmail: resolvedTutorEmail,
              subject: 'Mathematics',
              topic: requestData.topic,
              scheduledDate,
              scheduledTime,
              duration: requestData.duration,
              durationMinutes: Number(requestData.durationMinutes || 10),
              pricingSnapshot: requestData.pricingSnapshot || null,
              pricingQuoteId: requestData.pricingQuoteId || requestData.pricingSnapshot?.quoteId || null,
              meetingProvider: MEETING_PROVIDERS.WEBRTC,
              sessionType: 'human',
              sessionProvider: 'webrtc_human',
              meetingLink: '',
              meetingId: '',
              meetingPassword: '',
              webrtc: {
                ready: true,
                status: 'tutor_waiting',
                tutorReadyAt: Date.now(),
                studentReadyAt: null,
                offer: null,
                answer: null,
                lastRestartAt: null,
              },
              whiteboardRoomId: requestData.whiteboardRoomId || requestId,
              notes: '',
              requestAttachment: requestData.attachment || null,
              attachments: Array.isArray(requestData.attachments) ? requestData.attachments : (requestData.attachment ? [requestData.attachment] : []),
              requestDescription: requestData.description || '',
              boardPreparationSource: requestData.boardPreparationSource || null,
              sessionType: 'human',
              sessionProvider: 'webrtc_human',
              status: SESSION_STATUS.WAITING_STUDENT,
              joinGraceEndsAt: Date.now() + 2 * 60 * 1000,
              callStartedAt: null,
              studentJoinedAt: null,
              billingStartedAt: null,
              billedSeconds: 0,
              totalAmount: 0,
              payoutBreakdown: {
                platformFeeRate: PLATFORM_FEE_RATE,
                tutorRate: TUTOR_PAYOUT_RATE,
                tutorAmount: 0,
                platformAmount: 0,
              },
              ratings: {
                student: null,
                tutor: null,
              },
              ratingStatus: DEFAULT_RATING_STATUS,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        } else {
          debugLog('classRequestService', 'Tutor offer transaction reused existing session document.', {
            requestId,
            sessionId,
          });

          transaction.set(
            sessionRef,
            {
              requestId,
              studentId: requestData.studentId,
              studentName: requestData.studentName,
              studentEmail: requestData.studentEmail,
              tutorId,
              tutorName: resolvedTutorName,
              tutorEmail: resolvedTutorEmail,
              topic: requestData.topic,
              scheduledDate,
              scheduledTime,
              duration: requestData.duration,
              durationMinutes: Number(requestData.durationMinutes || 10),
              pricingSnapshot: requestData.pricingSnapshot || null,
              pricingQuoteId: requestData.pricingQuoteId || requestData.pricingSnapshot?.quoteId || null,
              whiteboardRoomId: requestData.whiteboardRoomId || requestId,
              requestAttachment: requestData.attachment || null,
              attachments: Array.isArray(requestData.attachments) ? requestData.attachments : (requestData.attachment ? [requestData.attachment] : []),
              requestDescription: requestData.description || '',
              boardPreparationSource: requestData.boardPreparationSource || null,
              status: SESSION_STATUS.WAITING_STUDENT,
              joinGraceEndsAt: Date.now() + 2 * 60 * 1000,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }

        return { sessionId, reused: sessionSnap.exists() };
      }

      if (requestData.currentOfferTutorId !== tutorId) {
        throw new Error('This request is no longer assigned to you.');
      }

      const queue = (requestData.tutorQueue || []).filter((id) => id !== tutorId);
      const nextStatus = queue.length ? REQUEST_STATUS.MATCHING : REQUEST_STATUS.NO_TUTOR_AVAILABLE;

      if (!canTransitionRequest(requestData.status, nextStatus)) {
        throw new Error('This request cannot be declined in its current state.');
      }

      transaction.update(requestRef, {
        tutorQueue: queue,
        status: nextStatus,
        currentOfferTutorId: null,
        offerExpiresAt: null,
        statusDetail: 'Tutor declined. Matching another tutor.',
        updatedAt: serverTimestamp(),
      });

      return { sessionId: null, reused: false };
    });

    debugLog('classRequestService', 'Tutor offer transaction succeeded.', {
      requestId,
      tutorId,
      response,
      sessionId: transactionResult?.sessionId || null,
      reused: Boolean(transactionResult?.reused),
    });

    if (response === 'accept') {
      await Promise.all([
        createNotification({
          userId: tutorId,
          title: 'Call ready',
          message: 'You accepted the request. Start the call now.',
          type: 'request_accepted',
          requestId,
          sessionId: transactionResult?.sessionId || requestId,
          targetPath: `/app/session/${transactionResult?.sessionId || requestId}`,
        }),
      ]);

      return transactionResult;
    }

    await assignNextTutorOffer(requestId);
    return transactionResult;
  } catch (error) {
    debugError('classRequestService', 'Tutor offer transaction failed.', {
      requestId,
      tutorId,
      response,
      message: error.message,
    });
    throw new Error(error.message || 'Unable to process this request right now. Please retry.');
  }
  })();

  inFlightOfferResponses.set(inFlightKey, responsePromise);
  try {
    return await responsePromise;
  } finally {
    inFlightOfferResponses.delete(inFlightKey);
  }
}

export async function acceptClassRequest({ requestId, tutorId, tutorName, tutorEmail }) {
  debugLog('classRequestService', 'Accepting class request.', { requestId, tutorId });

  const result = await handleTutorOfferResponse({
    requestId,
    tutorId,
    tutorName,
    tutorEmail,
    response: 'accept',
  });

  debugLog('classRequestService', 'Class request accepted.', {
    requestId,
    tutorId,
    sessionId: result?.sessionId || null,
    reused: Boolean(result?.reused),
  });

  return result;
}

export async function declineClassRequest({ requestId, tutorId }) {
  debugLog('classRequestService', 'Declining class request.', { requestId, tutorId });
  const result = await handleTutorOfferResponse({ requestId, tutorId, response: 'decline' });
  debugLog('classRequestService', 'Class request declined.', { requestId, tutorId });
  return result;
}

export async function updateClassRequest(requestId, updates = {}) {
  if (!requestId) throw new Error('Request id is required.');

  const clients = await getFirebaseClients();

  if (!clients) {
    const existing = getMockRequests().find((item) => item.id === requestId);
    if (!existing) throw new Error('Class request not found.');
    if (updates.status && !canTransitionRequest(existing.status, updates.status)) {
      throw new Error(`Invalid request transition: ${existing.status} -> ${updates.status}`);
    }

    const next = getMockRequests().map((item) =>
      item.id === requestId
        ? {
            ...item,
            ...updates,
            updatedAt: new Date().toISOString(),
          }
        : item,
    );
    setMockRequests(next);
    return next.find((item) => item.id === requestId) || null;
  }

  const { db, firestoreModule } = clients;
  const { doc, getDoc, serverTimestamp, updateDoc } = firestoreModule;
  const requestRef = doc(db, 'classRequests', requestId);
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) throw new Error('Class request not found.');

  const existing = requestSnap.data() || {};
  if (updates.status && !canTransitionRequest(existing.status, updates.status)) {
    throw new Error(`Invalid request transition: ${existing.status} -> ${updates.status}`);
  }

  await updateDoc(requestRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });

  const refreshed = await getDoc(requestRef);
  return { id: refreshed.id, ...refreshed.data() };
}

export async function cancelClassRequest({ requestId, canceledBy, reason }) {
  debugLog('classRequestService', 'Canceling class request.', { requestId, canceledBy });
  const clients = await getFirebaseClients();
  const patch = {
    status: REQUEST_STATUS.CANCELED,
    statusDetail: 'Request canceled by student.',
    canceledReason: String(reason || '').trim(),
    canceledBy: canceledBy || 'student',
    canceledAt: Date.now(),
    currentOfferTutorId: null,
    offerExpiresAt: null,
  };

  if (!clients) {
    const next = getMockRequests().map((item) =>
      item.id === requestId ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item,
    );
    setMockRequests(next);
    const nextSessions = getMockSessions().map((item) => {
      if (item.requestId !== requestId) return item;
      if (![SESSION_STATUS.WAITING_STUDENT, SESSION_STATUS.IN_PROGRESS].includes(item.status)) return item;
      return {
        ...item,
        status: SESSION_STATUS.CANCELED,
        endedAt: Date.now(),
        canceledAt: Date.now(),
        canceledBy: canceledBy || 'student',
        canceledReason: String(reason || '').trim(),
        updatedAt: new Date().toISOString(),
      };
    });
    setMockSessions(nextSessions);
    return;
  }

  const { db, firestoreModule } = clients;
  const { collection, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } = firestoreModule;
  try {
    await updateDoc(doc(db, 'classRequests', requestId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
    const sessionsQuery = query(collection(db, 'sessions'), where('requestId', '==', requestId));
    const sessionsSnap = await getDocs(sessionsQuery);
    const sessionBatch = writeBatch(db);
    let updatesCount = 0;
    sessionsSnap.docs.forEach((sessionDoc) => {
      const sessionData = sessionDoc.data();
      if (![SESSION_STATUS.WAITING_STUDENT, SESSION_STATUS.IN_PROGRESS].includes(sessionData.status)) return;
      updatesCount += 1;
      sessionBatch.update(sessionDoc.ref, {
        status: SESSION_STATUS.CANCELED,
        endedAt: Date.now(),
        canceledAt: Date.now(),
        canceledBy: canceledBy || 'student',
        canceledReason: String(reason || '').trim(),
        updatedAt: serverTimestamp(),
      });
    });
    if (updatesCount) {
      await sessionBatch.commit();
    }
    debugLog('classRequestService', 'Class request canceled.', { requestId });
  } catch (error) {
    debugError('classRequestService', 'Failed to cancel class request.', { requestId, message: error.message });
    throw error;
  }
}

export async function settleSessionBilling(session) {
  const billedSeconds = Math.max(0, Math.floor((Date.now() - (session.billingStartedAt || Date.now())) / 1000));
  const billedMinutes = Number((billedSeconds / 60).toFixed(2));
  const pricingSnapshot = normalizePricingSnapshot(session.pricingSnapshot);
  const bookingFee = Number((
    session?.boardPreparationSource?.bookingFeePricing?.totalZar
    || session?.boardPreparationSource?.bookingFeePriceZar
    || pricingSnapshot.bookingFeeAmount
    || 0
  ).toFixed(2));
  const serviceAmount = Number((
    Number(pricingSnapshot.adjustedBaseAmount || pricingSnapshot.baseAmount || 0)
    + (billedMinutes * Number(pricingSnapshot.adjustedRatePerMinute || pricingSnapshot.ratePerMinute || 0))
  ).toFixed(2));
  const totalAmount = Number((serviceAmount + bookingFee).toFixed(2));
  const tutorAmount = Number((serviceAmount * TUTOR_PAYOUT_RATE).toFixed(2));
  const platformAmount = Number((bookingFee + (serviceAmount * PLATFORM_FEE_RATE)).toFixed(2));

  return {
    completedAt: Date.now(),
    payoutWeekKey: getWeekKey(Date.now()),
    billedSeconds,
    billedMinutes,
    totalAmount,
    pricingSnapshot: {
      ...pricingSnapshot,
      billedMinutes,
      finalAmount: totalAmount,
      finalPayablePrice: totalAmount,
      bookingFeeAmount: bookingFee,
      bookingFeeApplied: bookingFee > 0,
      bookingFeeOnly: false,
      billingRule: 'base_plus_elapsed_completed',
    },
    payoutBreakdown: {
      platformFeeRate: PLATFORM_FEE_RATE,
      tutorRate: TUTOR_PAYOUT_RATE,
      tutorAmount,
      platformAmount,
    },
    chargedCardLast4: session.selectedCardLast4 || null,
  };
}
