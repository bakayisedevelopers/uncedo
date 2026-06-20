import { deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseClients } from '../firebase/config';

function buildReferralSlug() {
  return `hlp-${Math.random().toString(36).slice(2, 12)}`;
}

export function buildDefaultHelperProfile({ uid, email, fullName }) {
  return {
    uid,
    email,
    fullName,
    displayName: fullName,
    role: 'helper',
    activeRole: 'helper',
    roles: ['helper'],
    firstName: '',
    lastName: '',
    providerType: '',
    businessName: '',
    phoneNumber: '',
    homeAddress: '',
    city: 'Johannesburg',
    rating: 0,
    profilePhoto: '',
    profilePhotoObjectPath: '',
    onlineStatus: 'offline',
    locationSharingEnabled: false,
    liveLocation: null,
    verificationStatus: 'pending',
    referralSlug: buildReferralSlug(),
    agreement: {
      acceptedVersion: '',
      requiredVersion: '1.0.1',
      acceptedAt: null,
    },
    payout: {
      bankName: '',
      accountHolder: '',
      accountNumber: '',
      recipientCode: '',
      verificationStatus: 'pending',
    },
    services: [],
    metrics: {
      acceptanceRate: 0,
      completionRate: 0,
      overallRating: 0,
      avgResponseMinutes: 0,
      cancellationRate: 0,
      recentAssignmentsCount: 0,
    },
  };
}

export async function getUserProfile(uid) {
  const { db } = getFirebaseClients();
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? { uid: snapshot.id, ...snapshot.data() } : null;
}

export async function updateHelperProfile(uid, updates) {
  const { db } = getFirebaseClients();
  const ref = doc(db, 'users', uid);

  await setDoc(
    ref,
    {
      ...updates,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return getUserProfile(uid);
}

export async function upsertHelperProfile({ uid, email, fullName }) {
  const { db } = getFirebaseClients();
  const ref = doc(db, 'users', uid);
  const existing = await getDoc(ref);
  const base = existing.exists() ? existing.data() : buildDefaultHelperProfile({ uid, email, fullName });

  await setDoc(
    ref,
    {
      ...base,
      uid,
      email,
      fullName: base.fullName || fullName,
      displayName: base.displayName || fullName,
      role: 'helper',
      activeRole: 'helper',
      roles: ['helper'],
      updatedAt: serverTimestamp(),
      createdAt: existing.exists() ? base.createdAt : serverTimestamp(),
    },
    { merge: true },
  );

  return getUserProfile(uid);
}

export async function deleteUserProfile(uid) {
  const { db } = getFirebaseClients();
  await deleteDoc(doc(db, 'users', uid));
}

export function subscribeToUserProfile(uid, callback, onError) {
  if (!uid) {
    callback(null);
    return () => {};
  }

  const { db } = getFirebaseClients();
  return onSnapshot(
    doc(db, 'users', uid),
    (snapshot) => callback(snapshot.exists() ? { uid: snapshot.id, ...snapshot.data() } : null),
    onError,
  );
}
