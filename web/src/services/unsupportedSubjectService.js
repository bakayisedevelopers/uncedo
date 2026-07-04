import { getFirebaseClients } from '../firebase/config';

function normalizeSubjectName(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildSubjectDemandId(subject = '') {
  const normalized = normalizeSubjectName(subject).toLowerCase();
  const slug = normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'unknown-subject';
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis : 0;
}

export async function recordUnsupportedSubjectRequest({
  subject,
  inputText = '',
  uid = '',
} = {}) {
  const normalizedSubject = normalizeSubjectName(subject);
  if (!normalizedSubject) return null;

  const clients = await getFirebaseClients();
  if (!clients?.db) return null;

  const { db, firestoreModule } = clients;
  const { doc, runTransaction, serverTimestamp } = firestoreModule;
  const demandRef = doc(db, 'unsupportedSubjectRequests', buildSubjectDemandId(normalizedSubject));
  const preview = normalizeSubjectName(inputText).slice(0, 500);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(demandRef);
    const existing = snapshot.exists() ? snapshot.data() : {};

    transaction.set(demandRef, {
      subject: existing.subject || normalizedSubject,
      normalizedSubject: normalizedSubject.toLowerCase(),
      count: Number(existing.count || 0) + 1,
      lastInputPreview: preview,
      lastRequestedBy: uid || null,
      lastRequestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdAt: existing.createdAt || serverTimestamp(),
    }, { merge: true });
  });

  return { subject: normalizedSubject };
}

export async function listUnsupportedSubjectRequests() {
  const clients = await getFirebaseClients();
  if (!clients?.db) return [];

  const { db, firestoreModule } = clients;
  const { collection, getDocs, orderBy, query } = firestoreModule;
  let snapshot;

  try {
    snapshot = await getDocs(query(
      collection(db, 'unsupportedSubjectRequests'),
      orderBy('count', 'desc'),
    ));
  } catch {
    snapshot = await getDocs(collection(db, 'unsupportedSubjectRequests'));
  }

  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => {
      const countDiff = Number(b.count || 0) - Number(a.count || 0);
      if (countDiff) return countDiff;
      return toMillis(b.lastRequestedAt) - toMillis(a.lastRequestedAt);
    });
}
