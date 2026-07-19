import { getFirebaseClients } from '../firebase/config';
import {
  computeSessionAmounts,
  getSessionCompletedDate,
  getWeekKey,
  getWeekRange,
  groupSessionsByWeek,
} from '../utils/payouts';

const PAYOUT_COLLECTION = 'tutorWeeklyPayouts';

function buildPayoutDocId(weekKey, tutorId) {
  return `${weekKey}_${tutorId}`;
}

function toIsoString(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value?.toDate === 'function') {
    return value.toDate().toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizePayoutRecord(docLike) {
  return {
    id: docLike.id,
    ...docLike,
    weekStart: toIsoString(docLike.weekStart),
    weekEnd: toIsoString(docLike.weekEnd),
    paidAt: toIsoString(docLike.paidAt),
    createdAt: toIsoString(docLike.createdAt),
    updatedAt: toIsoString(docLike.updatedAt),
    status: docLike.status || 'unpaid',
    notes: docLike.notes || '',
    sessionIds: Array.isArray(docLike.sessionIds) ? docLike.sessionIds : [],
  };
}

export async function listTutorWeeklyPayouts(tutorId) {
  const clients = await getFirebaseClients();
  if (!clients || !tutorId) {
    return [];
  }

  const { db, firestoreModule } = clients;
  const { collection, getDocs, orderBy, query, where } = firestoreModule;

  const q = query(
    collection(db, PAYOUT_COLLECTION),
    where('tutorId', '==', tutorId),
    orderBy('weekStart', 'desc'),
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((item) => normalizePayoutRecord({ id: item.id, ...item.data() }));
}

export async function listAdminWeeklyPayouts() {
  const clients = await getFirebaseClients();
  if (!clients) {
    return [];
  }

  const { db, firestoreModule } = clients;
  const { collection, getDocs, orderBy, query } = firestoreModule;

  const q = query(collection(db, PAYOUT_COLLECTION), orderBy('weekStart', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((item) => normalizePayoutRecord({ id: item.id, ...item.data() }));
}

export async function upsertWeeklyPayoutRecord(record) {
  const clients = await getFirebaseClients();
  if (!clients || !record?.weekKey || !record?.tutorId) return null;

  const { db, firestoreModule } = clients;
  const { doc, getDoc, serverTimestamp, setDoc } = firestoreModule;

  const docId = buildPayoutDocId(record.weekKey, record.tutorId);
  const payoutRef = doc(db, PAYOUT_COLLECTION, docId);
  const existing = await getDoc(payoutRef);
  const existingData = existing.exists() ? existing.data() : null;

  const payload = {
    tutorId: record.tutorId,
    tutorName: record.tutorName || existingData?.tutorName || '',
    tutorEmail: record.tutorEmail || existingData?.tutorEmail || '',
    weekKey: record.weekKey,
    weekStart: record.weekStart,
    weekEnd: record.weekEnd,
    totalSessions: Number(record.totalSessions || 0),
    grossAmount: Number(record.grossAmount || 0),
    tutorAmount: Number(record.tutorAmount || 0),
    platformAmount: Number(record.platformAmount || 0),
    status: record.status || existingData?.status || 'unpaid',
    paidAt: record.paidAt ?? existingData?.paidAt ?? null,
    paidBy: record.paidBy ?? existingData?.paidBy ?? null,
    notes: record.notes ?? existingData?.notes ?? '',
    sessionIds: Array.isArray(record.sessionIds) ? record.sessionIds : existingData?.sessionIds || [],
    updatedAt: serverTimestamp(),
    createdAt: existingData?.createdAt || serverTimestamp(),
  };

  await setDoc(payoutRef, payload, { merge: true });
  const saved = await getDoc(payoutRef);

  return normalizePayoutRecord({ id: saved.id, ...saved.data() });
}

export async function updateWeeklyPayoutStatus({ weekKey, tutorId, status, notes, paidBy }) {
  const clients = await getFirebaseClients();
  if (!clients || !weekKey || !tutorId) return null;

  const { db, firestoreModule } = clients;
  const { doc, getDoc, serverTimestamp, setDoc } = firestoreModule;

  const payoutRef = doc(db, PAYOUT_COLLECTION, buildPayoutDocId(weekKey, tutorId));
  const existing = await getDoc(payoutRef);
  if (!existing.exists()) {
    throw new Error('Payout record not found.');
  }

  const normalizedStatus = String(status || 'unpaid').toLowerCase();
  const patch = {
    status: normalizedStatus,
    updatedAt: serverTimestamp(),
  };

  if (typeof notes === 'string') {
    patch.notes = notes;
  }

  if (normalizedStatus === 'paid') {
    patch.paidAt = serverTimestamp();
    patch.paidBy = paidBy || null;
  }

  if (normalizedStatus !== 'paid') {
    patch.paidAt = null;
    patch.paidBy = null;
  }

  await setDoc(payoutRef, patch, { merge: true });

  const saved = await getDoc(payoutRef);
  return normalizePayoutRecord({ id: saved.id, ...saved.data() });
}

export async function syncWeeklyPayoutRecordsFromSessions({ lookbackWeeks = 12 } = {}) {
  const clients = await getFirebaseClients();
  if (!clients) return [];

  const { db, firestoreModule } = clients;
  const { collection, getDocs, orderBy, query, where } = firestoreModule;

  const now = new Date();
  const startWindow = new Date(now.getTime() - (lookbackWeeks * 7 * 24 * 60 * 60 * 1000));

  // Composite index note:
  // sessions: status ASC + endedAt DESC (or completedAt DESC depending on field used).
  const q = query(
    collection(db, 'sessions'),
    where('status', '==', 'completed'),
    where('endedAt', '>=', startWindow.getTime()),
    orderBy('endedAt', 'desc'),
  );

  const snapshot = await getDocs(q);
  const sessions = snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => item.tutorId);

  const groupedByTutorWeek = new Map();

  sessions.forEach((session) => {
    const completedAt = getSessionCompletedDate(session);
    if (!completedAt) return;

    const weekKey = getWeekKey(completedAt);
    const { weekStart, weekEnd } = getWeekRange(completedAt);
    const groupId = `${weekKey}_${session.tutorId}`;
    const amounts = computeSessionAmounts(session);
    const existing = groupedByTutorWeek.get(groupId) || {
      tutorId: session.tutorId,
      tutorName: session.tutorName || '',
      tutorEmail: session.tutorEmail || '',
      weekKey,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      totalSessions: 0,
      grossAmount: 0,
      tutorAmount: 0,
      platformAmount: 0,
      sessionIds: [],
    };

    existing.totalSessions += 1;
    existing.grossAmount = Number((existing.grossAmount + amounts.totalAmount).toFixed(2));
    existing.tutorAmount = Number((existing.tutorAmount + amounts.tutorAmount).toFixed(2));
    existing.platformAmount = Number((existing.platformAmount + amounts.platformAmount).toFixed(2));
    existing.sessionIds.push(session.id);

    if (!existing.tutorName && session.tutorName) {
      existing.tutorName = session.tutorName;
    }
    if (!existing.tutorEmail && session.tutorEmail) {
      existing.tutorEmail = session.tutorEmail;
    }

    groupedByTutorWeek.set(groupId, existing);
  });

  const upserts = Array.from(groupedByTutorWeek.values()).map((record) => upsertWeeklyPayoutRecord(record));
  return Promise.all(upserts);
}

export async function getAdminPayoutWeekDetails({ weekKey, tutorId }) {
  const clients = await getFirebaseClients();
  if (!clients || !weekKey || !tutorId) return null;

  const { db, firestoreModule } = clients;
  const { collection, doc, getDoc, getDocs, query, where } = firestoreModule;

  const payoutSnap = await getDoc(doc(db, PAYOUT_COLLECTION, buildPayoutDocId(weekKey, tutorId)));
  if (!payoutSnap.exists()) return null;

  const payoutRecord = normalizePayoutRecord({ id: payoutSnap.id, ...payoutSnap.data() });

  const sessionsSnapshot = await getDocs(
    query(
      collection(db, 'sessions'),
      where('tutorId', '==', tutorId),
      where('status', '==', 'completed'),
      where('payoutWeekKey', '==', weekKey),
    ),
  ).catch(() => null);

  let sessions = [];
  if (sessionsSnapshot) {
    sessions = sessionsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  } else {
    const fallback = await getDocs(
      query(
        collection(db, 'sessions'),
        where('tutorId', '==', tutorId),
        where('status', '==', 'completed'),
      ),
    );
    sessions = fallback.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((session) => getWeekKey(getSessionCompletedDate(session)) === weekKey);
  }

  const grouped = groupSessionsByWeek(sessions);
  const matchingWeek = grouped.find((item) => item.weekKey === weekKey);

  return {
    payoutRecord,
    sessions: matchingWeek?.sessions || [],
  };
}
