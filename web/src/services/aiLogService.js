import { getFirebaseClients } from '../firebase/config';

export async function appendUserAiLog(uid, entry = {}) {
  if (!uid) return null;

  const clients = await getFirebaseClients();
  if (!clients?.db || !clients?.firestoreModule) return null;

  const { db, firestoreModule } = clients;
  const { addDoc, collection, serverTimestamp } = firestoreModule;

  return addDoc(collection(db, 'users', uid, 'aiLogs'), {
    source: entry.source || '',
    step: entry.step || '',
    status: entry.status || '',
    message: entry.message || '',
    prompt: entry.prompt || '',
    rawOutput: entry.rawOutput || '',
    error: entry.error || '',
    details: entry.details || {},
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
}

export function subscribeToUserAiLogs(uid, callback) {
  let unsubscribe = null;

  getFirebaseClients().then((clients) => {
    if (!uid || !clients) {
      callback([]);
      return;
    }

    const { db, firestoreModule } = clients;
    const { collection, onSnapshot, query } = firestoreModule;
    const logsQuery = query(collection(db, 'users', uid, 'aiLogs'));

    unsubscribe = onSnapshot(
      logsQuery,
      (snapshot) => callback(snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0))),
      () => callback([]),
    );
  });

  return () => unsubscribe?.();
}
