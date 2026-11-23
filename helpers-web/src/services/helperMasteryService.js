import { getFirebaseClients } from '../firebase/config';
import { mergeMasteryConfig } from '../utils/masteryModel';

export function subscribeToHelperServiceOptionMastery(helperId, onData, onError) {
  if (!helperId) {
    onData?.([]);
    return () => {};
  }
  const { db, firestoreModule } = getFirebaseClients();
  return firestoreModule.onSnapshot(
    firestoreModule.collection(db, 'helperMastery', helperId, 'serviceOptions'),
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      onData?.(items);
    },
    (error) => onError?.(error),
  );
}

export function subscribeToHelperServiceMastery(helperId, onData, onError) {
  if (!helperId) {
    onData?.([]);
    return () => {};
  }
  const { db, firestoreModule } = getFirebaseClients();
  return firestoreModule.onSnapshot(
    firestoreModule.collection(db, 'helperMastery', helperId, 'services'),
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      onData?.(items);
    },
    (error) => onError?.(error),
  );
}

export function subscribeToHelperOptionRatings(helperId, onData, onError) {
  if (!helperId) {
    onData?.([]);
    return () => {};
  }
  const { db, firestoreModule } = getFirebaseClients();
  return firestoreModule.onSnapshot(
    firestoreModule.collection(db, 'ratingAccounts', helperId, 'serviceOptions'),
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      onData?.(items);
    },
    (error) => onError?.(error),
  );
}

export function subscribeToHelperServiceRatings(helperId, onData, onError) {
  if (!helperId) {
    onData?.([]);
    return () => {};
  }
  const { db, firestoreModule } = getFirebaseClients();
  return firestoreModule.onSnapshot(
    firestoreModule.collection(db, 'ratingAccounts', helperId, 'services'),
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      onData?.(items);
    },
    (error) => onError?.(error),
  );
}

export function subscribeToRewardAccount(helperId, onData, onError) {
  if (!helperId) {
    onData?.(null);
    return () => {};
  }
  const { db, firestoreModule } = getFirebaseClients();
  return firestoreModule.onSnapshot(
    firestoreModule.doc(db, 'rewardAccounts', helperId),
    (docSnap) => {
      onData?.(docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null);
    },
    (error) => onError?.(error),
  );
}

export async function getMasteryConfig() {
  const { db, firestoreModule } = getFirebaseClients();
  const snap = await firestoreModule.getDoc(firestoreModule.doc(db, 'rewardConfig', 'mastery'));
  if (!snap.exists()) {
    return mergeMasteryConfig(null);
  }
  return mergeMasteryConfig(snap.data());
}

export function subscribeToMasteryConfig(onData, onError) {
  const { db, firestoreModule } = getFirebaseClients();
  return firestoreModule.onSnapshot(
    firestoreModule.doc(db, 'rewardConfig', 'mastery'),
    (snap) => {
      onData?.(mergeMasteryConfig(snap.exists() ? snap.data() : null));
    },
    (error) => {
      onError?.(error);
      onData?.(mergeMasteryConfig(null));
    },
  );
}

