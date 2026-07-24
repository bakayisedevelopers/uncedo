import { collection, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { getFirebaseClients } from '../firebase/config';

export function subscribeToNotifications(userId, onData, onError) {
  if (!userId) {
    onData?.([]);
    return () => {};
  }
  const { db } = getFirebaseClients();
  return onSnapshot(
    query(collection(db, 'notifications'), where('userId', '==', userId), orderBy('createdAt', 'desc')),
    (snapshot) => onData?.(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => onError?.(error),
  );
}

export async function markNotificationRead(notificationId) {
  if (!notificationId) return;
  const { db } = getFirebaseClients();
  await updateDoc(doc(db, 'notifications', notificationId), {
    read: true,
    readAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function markAllNotificationsRead(userId) {
  if (!userId) return;
  const { db } = getFirebaseClients();
  const snapshot = await getDocs(query(collection(db, 'notifications'), where('userId', '==', userId), where('read', '==', false)));
  if (snapshot.empty) return;
  const batch = writeBatch(db);
  snapshot.docs.forEach((item) => batch.update(item.ref, { read: true, readAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await batch.commit();
}
