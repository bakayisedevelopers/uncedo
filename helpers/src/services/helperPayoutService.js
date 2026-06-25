import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseClients } from '../firebase/config';

function normalizeTime(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function subscribeToHelperWeeklyPayouts(helperId, callback, onError) {
  if (!helperId) {
    callback([]);
    return () => {};
  }

  const { db } = getFirebaseClients();
  const payoutsQuery = query(
    collection(db, 'helperWeeklyPayouts'),
    where('helperId', '==', helperId),
  );

  return onSnapshot(
    payoutsQuery,
    (snapshot) => {
      const items = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((left, right) => {
          const leftTime = normalizeTime(left.weekStart || left.updatedAt || left.createdAt);
          const rightTime = normalizeTime(right.weekStart || right.updatedAt || right.createdAt);
          return rightTime - leftTime;
        });
      callback(items);
    },
    onError,
  );
}
