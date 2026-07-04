import { getFirebaseClients } from '../firebase/config';
import { REQUEST_STATUS, SESSION_STATUS, PAYMENT_STATUS, canTransitionSession, deriveRequestStatusFromSession } from '../constants/lifecycle';
import { TUTOR_PAYOUT_RATE, PLATFORM_FEE_RATE } from '../utils/onboarding';
import { normalizePricingSnapshot } from '../utils/pricing';
import { getWeekKey } from '../utils/payouts';
import { createNotification } from './notificationService';
import { getUserProfile, updateUserRatingSummary } from './userService';
import { debugError, debugLog } from '../utils/devLogger';

const MOCK_SESSIONS_KEY = 'parakleo_mock_sessions';
const MOCK_REQUESTS_KEY = 'parakleo_mock_requests';
const FINALIZE_SESSION_BILLING_ENDPOINT = import.meta.env.VITE_FINALIZE_SESSION_BILLING_ENDPOINT || '/finalize-session-billing';
const DEFAULT_RATING_STATUS = {
  student: 'pending',
  tutor: 'pending',
};

function mergeRatingStatus(existing, role, nextValue) {
  return {
    ...DEFAULT_RATING_STATUS,
    ...(existing || {}),
    [role]: nextValue,
  };
}

function getMockSessions() {
  return JSON.parse(localStorage.getItem(MOCK_SESSIONS_KEY) || '[]');
}

function setMockSessions(items) {
  localStorage.setItem(MOCK_SESSIONS_KEY, JSON.stringify(items));
  window.dispatchEvent(new StorageEvent('storage'));
}

function getMockRequests() {
  return JSON.parse(localStorage.getItem(MOCK_REQUESTS_KEY) || '[]');
}

function setMockRequests(items) {
  localStorage.setItem(MOCK_REQUESTS_KEY, JSON.stringify(items));
  window.dispatchEvent(new StorageEvent('storage'));
}

function withMockSnapshot(filterFn, callback) {
  const emit = () => callback(getMockSessions().filter(filterFn));
  emit();
  window.addEventListener('storage', emit);
  return () => window.removeEventListener('storage', emit);
}

function syncMockRequestStatus(requestId, sessionStatus) {
  const nextRequestStatus = deriveRequestStatusFromSession(sessionStatus);
  if (!nextRequestStatus) return;

  const nextRequests = getMockRequests().map((request) =>
        request.id === requestId
          ? {
              ...request,
              status: nextRequestStatus,
              ...(sessionStatus === SESSION_STATUS.IN_PROGRESS
                ? { startedAt: Date.now(), statusDetail: 'Student joined. Session is in progress.' }
                : {}),
              ...(sessionStatus === SESSION_STATUS.COMPLETED
                ? { endedAt: Date.now(), statusDetail: 'Session ended. Billing completed.' }
                : {}),
              updatedAt: new Date().toISOString(),
            }
      : request,
  );

  setMockRequests(nextRequests);
}

export function subscribeToStudentSessions(studentId, callback) {
  let unsub = () => {};

  getFirebaseClients().then((clients) => {
    if (!studentId) {
      callback([]);
      return;
    }

    if (!clients) {
      unsub = withMockSnapshot((item) => item.studentId === studentId, callback);
      return;
    }

    const { db, firestoreModule } = clients;
    const { collection, onSnapshot, orderBy, query, where } = firestoreModule;

    const queryRef = query(
      collection(db, 'sessions'),
      where('studentId', '==', studentId),
      orderBy('updatedAt', 'desc'),
    );

    unsub = onSnapshot(queryRef, (snapshot) => {
      callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
  });

  return () => unsub?.();
}

export function subscribeToTutorSessions(tutorId, callback) {
  let unsub = () => {};

  getFirebaseClients().then((clients) => {
    if (!tutorId) {
      callback([]);
      return;
    }

    if (!clients) {
      unsub = withMockSnapshot((item) => item.tutorId === tutorId, callback);
      return;
    }

    const { db, firestoreModule } = clients;
    const { collection, onSnapshot, orderBy, query, where } = firestoreModule;

    const queryRef = query(
      collection(db, 'sessions'),
      where('tutorId', '==', tutorId),
      orderBy('updatedAt', 'desc'),
    );

    unsub = onSnapshot(queryRef, (snapshot) => {
      callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
  });

  return () => unsub?.();
}

export async function updateSession(sessionId, updates) {
  const clients = await getFirebaseClients();

  if (!clients) {
    const existing = getMockSessions().find((item) => item.id === sessionId);
    if (!existing) throw new Error('Session not found.');

    if (updates.status && !canTransitionSession(existing.status, updates.status)) {
      throw new Error(`Invalid session transition: ${existing.status} -> ${updates.status}`);
    }

    const next = getMockSessions().map((item) =>
      item.id === sessionId
        ? {
            ...item,
            ...updates,
            updatedAt: new Date().toISOString(),
          }
        : item,
    );

    setMockSessions(next);

    if (updates.status && updates.requestId) {
      syncMockRequestStatus(updates.requestId, updates.status);
    }

    return next.find((item) => item.id === sessionId);
  }

  const { db, firestoreModule } = clients;
  const { doc, serverTimestamp, updateDoc, getDoc, writeBatch } = firestoreModule;

  const sessionRef = doc(db, 'sessions', sessionId);
  const sessionSnap = await getDoc(sessionRef);
  if (!sessionSnap.exists()) throw new Error('Session not found.');

  const existing = sessionSnap.data();
  if (updates.status && !canTransitionSession(existing.status, updates.status)) {
    throw new Error(`Invalid session transition: ${existing.status} -> ${updates.status}`);
  }

  const batch = writeBatch(db);

  batch.update(sessionRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });

  if (updates.status && updates.requestId) {
    const nextRequestStatus = deriveRequestStatusFromSession(updates.status);
    if (nextRequestStatus) {
      const requestRef = doc(db, 'classRequests', updates.requestId);
      const requestPatch = {
        status: nextRequestStatus,
        updatedAt: serverTimestamp(),
      };
      if (updates.status === SESSION_STATUS.IN_PROGRESS) {
        requestPatch.startedAt = updates.studentJoinedAt || Date.now();
        requestPatch.statusDetail = 'Student joined. Session is in progress.';
      }
      if (updates.status === SESSION_STATUS.COMPLETED) {
        requestPatch.endedAt = updates.endedAt || Date.now();
        requestPatch.statusDetail = 'Session ended. Billing completed.';
      }
      batch.update(requestRef, {
        ...requestPatch,
      });
    }
  }

  await batch.commit();

  const snap = await getDoc(sessionRef);
  return { id: snap.id, ...snap.data() };
}

export async function joinSessionAsStudent(session, selectedCardId, selectedCardLast4) {
  debugLog('sessionService', 'Student joining session.', { sessionId: session?.id, requestId: session?.requestId });
  return updateSession(session.id, {
    ...session,
    status: SESSION_STATUS.IN_PROGRESS,
    studentJoinedAt: Date.now(),
    selectedCardId,
    selectedCardLast4,
  });
}

export async function endSession(session) {
  return finalizeSessionClosure(session, { closureType: SESSION_STATUS.COMPLETED });
}

export async function finalizeSessionClosure(session, options = {}) {
  const closureType = options.closureType || SESSION_STATUS.COMPLETED;
  const isCancellation = closureType === SESSION_STATUS.CANCELED_DURING || closureType === SESSION_STATUS.CANCELED;
  debugLog('sessionService', 'Ending session and settling billing.', { sessionId: session?.id, requestId: session?.requestId });
  const clients = await getFirebaseClients();
  let updated;
  let isPaid = true;

  if (!clients) {
    const endedAt = Date.now();
    const accumulatedSeconds = Math.max(0, Number(session.billedSeconds || 0));
    const activeStartedAt = Number(session.billingStartedAt || 0);
    const activeSeconds = activeStartedAt
      ? Math.max(0, Math.floor((endedAt - activeStartedAt) / 1000))
      : 0;
    const billedSeconds = accumulatedSeconds + activeSeconds;
    const billedMinutes = Number((billedSeconds / 60).toFixed(2));
    const pricingSnapshot = normalizePricingSnapshot(session.pricingSnapshot);
    const selectedDurationMinutes = Number(session.durationMinutes || pricingSnapshot.durationMinutes || 0);
    const rawBookingFee = Number(
      session?.boardPreparationSource?.bookingFeePricing?.totalZar
      || session?.boardPreparationSource?.bookingFeePriceZar
      || pricingSnapshot.bookingFeeAmount
      || 0,
    );
    const bookingFee = Number((Number.isFinite(rawBookingFee) ? rawBookingFee : 0).toFixed(2));
    const earlyThreshold = 1;
    const baseOnlyThresholdMinutes = Number((selectedDurationMinutes * 0.2).toFixed(2));
    const baseAmount = Number(pricingSnapshot.adjustedBaseAmount || pricingSnapshot.baseAmount || 0);
    const ratePerMinute = Number(pricingSnapshot.adjustedRatePerMinute || pricingSnapshot.ratePerMinute || 0);
    const isEarlyCancellation = isCancellation && billedMinutes <= earlyThreshold;
    const isBaseOnlyCancellation = isCancellation && billedMinutes > earlyThreshold && billedMinutes < baseOnlyThresholdMinutes;
    const serviceAmount = Number((
      isEarlyCancellation
        ? 0
        : isBaseOnlyCancellation
          ? baseAmount
          : baseAmount + (billedMinutes * ratePerMinute)
    ).toFixed(2));
    const bookingFeeCharged = Number((
      isEarlyCancellation
        ? bookingFee
        : closureType === SESSION_STATUS.COMPLETED
          ? bookingFee
          : 0
    ).toFixed(2));
    const totalAmount = Number((serviceAmount + bookingFeeCharged).toFixed(2));
    const tutorPayoutBase = isEarlyCancellation ? 0 : serviceAmount;
    const tutorAmount = Number((tutorPayoutBase * TUTOR_PAYOUT_RATE).toFixed(2));
    const platformAmount = Number((bookingFeeCharged + (tutorPayoutBase * PLATFORM_FEE_RATE)).toFixed(2));

    updated = await updateSession(session.id, {
      ...session,
      status: closureType,
      completedAt: closureType === SESSION_STATUS.COMPLETED ? endedAt : null,
      payoutWeekKey: closureType === SESSION_STATUS.COMPLETED ? getWeekKey(endedAt) : null,
      endedAt,
      canceledAt: isCancellation ? endedAt : null,
      canceledBy: isCancellation ? (options.canceledBy || null) : null,
      canceledReason: isCancellation ? (options.canceledReason || '') : null,
      billedSeconds,
      billedMinutes,
      totalAmount,
      pricingSnapshot: {
        ...pricingSnapshot,
        billedMinutes,
        finalAmount: totalAmount,
        finalPayablePrice: totalAmount,
        closureType,
        earlyCancellation: isEarlyCancellation,
        earlyCancelThresholdMinutes: earlyThreshold,
        baseOnlyThresholdMinutes,
        bookingFeeAmount: bookingFeeCharged,
        bookingFeeApplied: isEarlyCancellation || closureType === SESSION_STATUS.COMPLETED,
        bookingFeeOnly: isEarlyCancellation,
        billingRule: isEarlyCancellation
          ? 'booking_fee_only'
          : isBaseOnlyCancellation
            ? 'base_only_cancellation'
            : isCancellation
              ? 'base_plus_elapsed_cancellation'
              : 'base_plus_elapsed_completed',
      },
      payoutBreakdown: {
        platformFeeRate: PLATFORM_FEE_RATE,
        tutorRate: TUTOR_PAYOUT_RATE,
        tutorAmount,
        platformAmount,
      },
      paymentStatus: PAYMENT_STATUS.PAID,
      paymentTransactionId: null,
      ...(String(session.sessionType || '').toLowerCase() === 'ai'
        ? {
            aiLive: {
              ...(session.aiLive || {}),
              status: 'ended',
              wsConnected: false,
              audioInActive: false,
              audioOutActive: false,
              endedAt,
            },
          }
        : {}),
    });
  } else {
    const idToken = await clients?.auth?.currentUser?.getIdToken?.();
    if (!idToken) {
      throw new Error('You must be signed in to end this session.');
    }

    const response = await fetch(FINALIZE_SESSION_BILLING_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        sessionId: session.id,
        closureType,
        canceledBy: options.canceledBy || null,
        canceledReason: options.canceledReason || '',
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.message || 'Unable to finalize session billing.');
    }

    updated = payload.session || session;
    isPaid = updated.paymentStatus !== PAYMENT_STATUS.WALLET_DEBT_RECORDED;
  }

  if (!clients) {
    isPaid = true;
  }

  await Promise.all([
    createNotification({
      userId: session.studentId,
      title: isPaid ? 'Session ended' : 'Payment declined - wallet updated',
      message: isPaid
        ? `${isCancellation ? 'Cancellation billing' : 'Billing'} complete: R${Number(updated.totalAmount || 0).toFixed(2)} (${Number(updated.billedSeconds || 0)}s).`
        : `Card declined. Wallet updated to cover R${Number(updated.totalAmount || 0).toFixed(2)} outstanding.`,
      type: 'session_billing',
      requestId: session.requestId,
      sessionId: session.id,
    }),
    createNotification({
      userId: session.tutorId,
      title: 'Session ended',
      message: `Tutor payout pending: R${Number(updated.payoutBreakdown?.tutorAmount || 0).toFixed(2)}.`,
      type: 'session_billing',
      requestId: session.requestId,
      sessionId: session.id,
    }),
  ]);

  debugLog('sessionService', 'Session ended and billing updates completed.', {
    sessionId: session?.id,
    totalAmount: Number(updated.totalAmount || 0),
    paymentStatus: updated.paymentStatus,
  });
  return updated;
}

export async function submitSessionRating(session, role, payload) {
  debugLog('sessionService', 'Submitting session rating.', { sessionId: session?.id, role, overall: payload?.overall });
  const submittedAt = Date.now();
  const ratingEntry = {
    overall: payload.overall,
    comment: payload.comment || '',
    submittedAt,
  };
  const ratings = {
    ...(session.ratings || {}),
    [role]: ratingEntry,
  };
  const ratingStatus = mergeRatingStatus(session.ratingStatus, role, 'submitted');

  const updatedSession = await updateSession(session.id, {
    ratings,
    ratingStatus,
  });

  const clients = await getFirebaseClients();
  if (!clients) {
    const nextRequests = getMockRequests().map((request) =>
      request.id === session.requestId
        ? {
            ...request,
            ratings: {
              ...(request.ratings || {}),
              [role]: ratingEntry,
            },
            ratingStatus: mergeRatingStatus(request.ratingStatus, role, 'submitted'),
            updatedAt: new Date().toISOString(),
          }
        : request,
    );
    setMockRequests(nextRequests);
  } else if (session.requestId) {
    const { db, firestoreModule } = clients;
    const { doc, serverTimestamp, updateDoc } = firestoreModule;
    await updateDoc(doc(db, 'classRequests', session.requestId), {
      [`ratings.${role}`]: ratingEntry,
      [`ratingStatus.${role}`]: 'submitted',
      updatedAt: serverTimestamp(),
    });
  }

  try {
    if (role === 'student') {
      await updateUserRatingSummary(session.tutorId, 'asTutor', payload.overall);
    } else {
      await updateUserRatingSummary(session.studentId, 'asStudent', payload.overall);
    }
  } catch (error) {
    debugError('sessionService', 'Failed to update user rating summary.', { message: error.message, sessionId: session?.id });
  }

  debugLog('sessionService', 'Session rating submitted successfully.', { sessionId: session?.id, role });
  return updatedSession;
}

export async function dismissSessionRating(session, role) {
  debugLog('sessionService', 'Dismissing session rating.', { sessionId: session?.id, role });
  const ratingStatus = mergeRatingStatus(session?.ratingStatus, role, 'dismissed');

  const updatedSession = await updateSession(session.id, {
    ratingStatus,
  });

  const clients = await getFirebaseClients();
  if (!clients) {
    const nextRequests = getMockRequests().map((request) =>
      request.id === session.requestId
        ? {
            ...request,
            ratingStatus: mergeRatingStatus(request.ratingStatus, role, 'dismissed'),
            updatedAt: new Date().toISOString(),
          }
        : request,
    );
    setMockRequests(nextRequests);
    return updatedSession;
  }

  if (session.requestId) {
    const { db, firestoreModule } = clients;
    const { doc, serverTimestamp, updateDoc } = firestoreModule;
    await updateDoc(doc(db, 'classRequests', session.requestId), {
      [`ratingStatus.${role}`]: 'dismissed',
      updatedAt: serverTimestamp(),
    });
  }

  return updatedSession;
}

export async function findSessionIdByRequestAndTutor({
  requestId,
  tutorId,
  maxAttempts = 8,
  delayMs = 350,
}) {
  if (!requestId || !tutorId) return null;

  const clients = await getFirebaseClients();
  if (!clients) {
    const request = getMockRequests().find((item) => item.id === requestId);
    if (request?.sessionId) return request.sessionId;

    const match = getMockSessions().find(
      (item) => item.requestId === requestId && item.tutorId === tutorId,
    );
    return match?.id || null;
  }

  const { db, firestoreModule } = clients;
  const { collection, doc, getDoc, getDocs, query, where } = firestoreModule;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const requestSnap = await getDoc(doc(db, 'classRequests', requestId));
    if (requestSnap.exists()) {
      const requestData = requestSnap.data() || {};
      if (
        requestData.sessionId
        && requestData.tutorId === tutorId
      ) {
        return requestData.sessionId;
      }
    }

    const snapshot = await getDocs(
      query(
        collection(db, 'sessions'),
        where('requestId', '==', requestId),
        where('tutorId', '==', tutorId),
      ),
    );

    if (snapshot.docs.length === 1) {
      return snapshot.docs[0].id;
    }

    if (snapshot.docs.length > 1) {
      const exactMatch = snapshot.docs.find((item) => item.id === requestId);
      if (exactMatch) {
        return exactMatch.id;
      }
      return snapshot.docs[0].id;
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return null;
}

export { REQUEST_STATUS };

export async function getPaymentExceptionsForAdmin() {
  const clients = await getFirebaseClients();
  if (!clients) {
    return getMockSessions().filter((session) => session.paymentStatus === PAYMENT_STATUS.WALLET_DEBT_RECORDED);
  }

  const { db, firestoreModule } = clients;
  const { collection, getDocs, query, where } = firestoreModule;
  const q = query(collection(db, 'sessions'), where('paymentStatus', '==', PAYMENT_STATUS.WALLET_DEBT_RECORDED));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function markPaymentExceptionReviewed(session) {
  return updateSession(session.id, {
    ...session,
    paymentExceptionReview: {
      reviewedAt: Date.now(),
      status: 'reviewed',
    },
  });
}
