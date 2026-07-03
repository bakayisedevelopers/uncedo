import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';
import { updateUserRatingSummary } from './userService';

const FINALIZE_SESSION_BILLING_ENDPOINT = 'finalizeSessionBilling';
const DEFAULT_RATING_STATUS = {
  student: 'pending',
  tutor: 'pending',
};

const SESSION_STATUS = {
  WAITING_STUDENT: 'waiting_student',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELED: 'canceled',
  CANCELED_DURING: 'canceled_during',
};

function mergeRatingStatus(existing, role, nextValue) {
  return {
    ...DEFAULT_RATING_STATUS,
    ...(existing || {}),
    [role]: nextValue,
  };
}

function deriveRequestStatusFromSession(sessionStatus) {
  if ([SESSION_STATUS.WAITING_STUDENT, SESSION_STATUS.IN_PROGRESS].includes(sessionStatus)) {
    return 'in_session';
  }

  if (sessionStatus === SESSION_STATUS.COMPLETED) {
    return 'completed';
  }

  if (sessionStatus === SESSION_STATUS.CANCELED) {
    return 'canceled';
  }

  if (sessionStatus === SESSION_STATUS.CANCELED_DURING) {
    return 'canceled_during';
  }

  return null;
}

function getRequestStatusPatch(nextStatus, updates = {}) {
  const requestStatus = deriveRequestStatusFromSession(nextStatus);
  if (!requestStatus) {
    return null;
  }

  const patch = {
    status: requestStatus,
    updatedAt: serverTimestamp(),
  };

  if (nextStatus === SESSION_STATUS.IN_PROGRESS) {
    patch.startedAt = updates.studentJoinedAt || Date.now();
    patch.statusDetail = 'Student joined. Session is in progress.';
  }

  if (nextStatus === SESSION_STATUS.COMPLETED) {
    patch.endedAt = updates.endedAt || Date.now();
    patch.statusDetail = 'Session ended. Billing completed.';
  }

  if (nextStatus === SESSION_STATUS.CANCELED || nextStatus === SESSION_STATUS.CANCELED_DURING) {
    patch.endedAt = updates.endedAt || Date.now();
    patch.statusDetail = 'Session canceled.';
  }

  return patch;
}

export function subscribeToStudentSessions(studentId, callback, onError) {
  if (!studentId) {
    callback([]);
    return () => {};
  }

  const { db } = getFirebaseClients();
  const sessionsQuery = query(
    collection(db, 'sessions'),
    where('studentId', '==', studentId),
    orderBy('updatedAt', 'desc'),
  );

  return onSnapshot(
    sessionsQuery,
    (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError,
  );
}

export function subscribeToSessionById(sessionId, callback, onError) {
  if (!sessionId) {
    callback(null);
    return () => {};
  }

  const { db } = getFirebaseClients();
  return onSnapshot(
    doc(db, 'sessions', sessionId),
    (snapshot) => callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
    onError,
  );
}

export async function updateSession(sessionId, updates = {}) {
  const { db } = getFirebaseClients();
  const sessionRef = doc(db, 'sessions', sessionId);
  const sessionSnap = await getDoc(sessionRef);

  if (!sessionSnap.exists()) {
    throw new Error('Session not found.');
  }

  const existing = sessionSnap.data() || {};
  const effectiveRequestId = updates.requestId || existing.requestId || '';
  const batch = writeBatch(db);

  batch.update(sessionRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });

  if (updates.status && effectiveRequestId) {
    const requestPatch = getRequestStatusPatch(updates.status, updates);
    if (requestPatch) {
      batch.update(doc(db, 'classRequests', effectiveRequestId), requestPatch);
    }
  }

  await batch.commit();

  const nextSnap = await getDoc(sessionRef);
  return nextSnap.exists() ? { id: nextSnap.id, ...nextSnap.data() } : null;
}

export async function joinSessionAsStudent(session, selectedCardId = '', selectedCardLast4 = '') {
  if (!session?.id) {
    throw new Error('Session not found.');
  }

  return updateSession(session.id, {
    status: SESSION_STATUS.IN_PROGRESS,
    requestId: session.requestId || '',
    studentJoinedAt: Date.now(),
    selectedCardId: selectedCardId || session.selectedCardId || '',
    selectedCardLast4: selectedCardLast4 || session.selectedCardLast4 || '',
  });
}

export async function finalizeSessionClosure(session, options = {}) {
  const { auth } = getFirebaseClients();
  const idToken = await auth.currentUser?.getIdToken();

  if (!idToken) {
    throw new Error('You must be signed in to finalize this session.');
  }

  const response = await fetch(getFunctionEndpoint(FINALIZE_SESSION_BILLING_ENDPOINT), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId: session.id,
      closureType: options.closureType || SESSION_STATUS.COMPLETED,
      canceledBy: options.canceledBy || null,
      canceledReason: options.canceledReason || '',
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || 'Unable to finalize session billing.');
  }

  return payload?.session || null;
}

export async function endSession(session) {
  return finalizeSessionClosure(session, { closureType: SESSION_STATUS.COMPLETED });
}

export async function submitSessionRating(session, role, payload) {
  const { db } = getFirebaseClients();
  const submittedAt = Date.now();
  const ratingEntry = {
    overall: Number(payload?.overall || 0),
    comment: payload?.comment || '',
    submittedAt,
  };
  const ratingStatus = mergeRatingStatus(session?.ratingStatus, role, 'submitted');
  const batch = writeBatch(db);

  batch.update(doc(db, 'sessions', session.id), {
    ratings: {
      ...(session?.ratings || {}),
      [role]: ratingEntry,
    },
    ratingStatus,
    updatedAt: serverTimestamp(),
  });

  if (session?.requestId) {
    batch.update(doc(db, 'classRequests', session.requestId), {
      [`ratings.${role}`]: ratingEntry,
      [`ratingStatus.${role}`]: 'submitted',
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();

  if (role === 'student' && session?.tutorId) {
    await updateUserRatingSummary(session.tutorId, 'asTutor', ratingEntry.overall).catch(() => null);
  }

  if (role === 'tutor' && session?.studentId) {
    await updateUserRatingSummary(session.studentId, 'asStudent', ratingEntry.overall).catch(() => null);
  }
}
