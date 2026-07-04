import {
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

export function subscribeToNotifications(userId, callback, onError) {
  if (!userId) {
    callback([]);
    return () => {};
  }

  const { db } = getFirebaseClients();
  const notificationsQuery = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
  );

  return onSnapshot(
    notificationsQuery,
    (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError,
  );
}

export async function markNotificationsRead(notificationIds = []) {
  const nextIds = notificationIds.filter(Boolean);
  if (!nextIds.length) {
    return;
  }

  const { db } = getFirebaseClients();
  const batch = writeBatch(db);

  nextIds.forEach((notificationId) => {
    batch.update(doc(db, 'notifications', notificationId), {
      read: true,
      readAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

export async function markNotificationRead(notificationId) {
  if (!notificationId) {
    return;
  }

  const { db } = getFirebaseClients();
  await updateDoc(doc(db, 'notifications', notificationId), {
    read: true,
    readAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function markAllNotificationsRead(userId) {
  if (!userId) {
    return;
  }

  const { db } = getFirebaseClients();
  const snapshot = await getDocs(
    query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false),
    ),
  );

  const batch = writeBatch(db);
  snapshot.docs.forEach((notificationDoc) => {
    batch.update(notificationDoc.ref, {
      read: true,
      readAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}
