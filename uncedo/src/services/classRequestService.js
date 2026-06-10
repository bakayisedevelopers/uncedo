import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getFirebaseClients } from '../firebase/config';

const ACTIVE_CREATE_BLOCKING_STATUSES = ['pending', 'matching', 'offered', 'no_tutor_available'];

export async function createClassRequest(payload) {
  const { db } = getFirebaseClients();

  const requestBody = {
    ...payload,
    subject: payload.subject || 'Mathematics',
    durationMinutes: Number(payload.durationMinutes || 10),
    pricingSnapshot: payload.pricingSnapshot || null,
    pricingQuoteId: payload.pricingSnapshot?.quoteId || null,
    mode: 'online',
    meetingProviderPreference: payload.meetingProviderPreference || 'any',
    status: 'pending',
    tutorId: null,
    tutorName: null,
    tutorEmail: null,
    tutorQueue: [],
    currentOfferTutorId: null,
    offerExpiresAt: null,
    imageAttachment: payload.imageAttachment || '',
    attachment: payload.attachment || null,
    attachments: Array.isArray(payload.attachments)
      ? payload.attachments
      : (payload.attachment ? [payload.attachment] : []),
    statusDetail: 'Request submitted. Initializing tutor matching.',
    ratings: {
      student: null,
      tutor: null,
    },
    ratingStatus: {
      student: 'pending',
      tutor: 'pending',
    },
  };

  const existingSnap = await getDocs(
    query(
      collection(db, 'classRequests'),
      where('studentId', '==', payload.studentId),
      where('status', 'in', ACTIVE_CREATE_BLOCKING_STATUSES),
    ),
  );

  await Promise.all(existingSnap.docs.map((item) => updateDoc(item.ref, {
    status: 'expired',
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

  await Promise.all([
    addDoc(collection(db, 'notifications'), {
      userId: payload.studentId,
      title: 'Class request submitted',
      message: `Your ${payload.topic || payload.subject || 'class'} request is now matching tutors.`,
      type: 'class_request',
      requestId: docRef.id,
      targetPath: `/app/student/requests/${docRef.id}`,
      read: false,
      createdAt: serverTimestamp(),
    }),
  ]);

  return docRef.id;
}

export function subscribeToStudentRequests(studentId, callback, onError) {
  if (!studentId) {
    callback([]);
    return () => {};
  }

  const { db } = getFirebaseClients();
  const requestsQuery = query(
    collection(db, 'classRequests'),
    where('studentId', '==', studentId),
    orderBy('createdAt', 'desc'),
  );

  return onSnapshot(
    requestsQuery,
    (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError,
  );
}

export function subscribeToRequestById(requestId, callback, onError) {
  if (!requestId) {
    callback(null);
    return () => {};
  }

  const { db } = getFirebaseClients();
  return onSnapshot(
    doc(db, 'classRequests', requestId),
    (snapshot) => callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
    onError,
  );
}

export async function cancelClassRequest({ requestId, canceledBy, reason }) {
  const trimmedReason = String(reason || '').trim();
  const { db } = getFirebaseClients();
  const canceledAt = Date.now();
  const requestPatch = {
    status: 'canceled',
    statusDetail: 'Request canceled by student.',
    canceledAt,
    canceledBy: canceledBy || 'student',
    canceledReason: trimmedReason,
    currentOfferTutorId: null,
    offerExpiresAt: null,
    updatedAt: serverTimestamp(),
  };

  await updateDoc(doc(db, 'classRequests', requestId), requestPatch);

  const sessionsQuery = query(collection(db, 'sessions'), where('requestId', '==', requestId));
  const sessionsSnapshot = await getDocs(sessionsQuery);
  if (!sessionsSnapshot.docs.length) {
    return;
  }

  const batch = writeBatch(db);
  let updatesCount = 0;

  sessionsSnapshot.docs.forEach((sessionDoc) => {
    const session = sessionDoc.data() || {};
    if (!['waiting_student', 'in_progress', 'in_session'].includes(String(session.status || '').toLowerCase())) {
      return;
    }

    updatesCount += 1;
    batch.update(sessionDoc.ref, {
      status: 'canceled',
      endedAt: canceledAt,
      canceledAt,
      canceledBy: canceledBy || 'student',
      canceledReason: trimmedReason,
      updatedAt: serverTimestamp(),
    });
  });

  if (updatesCount) {
    await batch.commit();
  }
}
