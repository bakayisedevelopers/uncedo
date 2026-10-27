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
      documentId: 'helper_agreement',
      title: 'Helper Agreement',
      legalEntityName: 'Parakleo, operated by Jabu Msiza',
      acceptedVersion: '',
      requiredVersion: '1.0.1',
      requiredVersionId: 'helper_agreement_1.0.1',
      currentVersion: '1.0.1',
      currentVersionId: 'helper_agreement_1.0.1',
      currentVersionAccepted: false,
      acceptedCurrentVersion: false,
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

function logUserProfileWrite(traceLabel, uid, updates = {}) {

  console.info('[helpers:user-write]', {
    traceLabel,
    uid,
    keys: Object.keys(updates || {}),
  });
}

export async function updateHelperProfile(uid, updates, traceLabel = 'helpers:updateHelperProfile') {
  const { db, functions, authProviders } = getFirebaseClients();
  const ref = doc(db, 'users', uid);
  logUserProfileWrite(traceLabel, uid, updates);
  const safeUpdates = { ...updates };
  if (Object.hasOwn(safeUpdates, 'phoneNumber')) {
    const saveNumber = authProviders.httpsCallable(functions, 'setWhatsAppContactNumber');
    await saveNumber({ role: 'helper', phoneNumber: safeUpdates.phoneNumber });
    delete safeUpdates.phoneNumber;
  }

  await setDoc(
    ref,
    {
      ...safeUpdates,
      role: 'helper',
      activeRole: 'helper',
      roles: ['helper'],
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return getUserProfile(uid);
}

export async function upsertHelperProfile({ uid, email, fullName, traceLabel = 'helpers:upsertHelperProfile' }) {
  const { db } = getFirebaseClients();
  const ref = doc(db, 'users', uid);
  const existing = await getDoc(ref);
  const base = existing.exists() ? existing.data() : buildDefaultHelperProfile({ uid, email, fullName });

  const safeProfile = {
    uid,
    email: email || '',
    fullName: base.fullName || fullName,
    displayName: base.displayName || fullName,
    role: 'helper',
    activeRole: 'helper',
    roles: ['helper'],
    firstName: String(base.firstName || ''),
    lastName: String(base.lastName || ''),
    providerType: String(base.providerType || ''),
    businessName: String(base.businessName || ''),
    phoneNumber: String(base.phoneNumber || ''),
    homeAddress: String(base.homeAddress || ''),
    city: String(base.city || 'Johannesburg'),
    profilePhoto: String(base.profilePhoto || ''),
    profilePhotoObjectPath: String(base.profilePhotoObjectPath || ''),
    onlineStatus: String(base.onlineStatus || 'offline'),
    locationSharingEnabled: base.locationSharingEnabled === true,
    updatedAt: serverTimestamp(),
    ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
  };

  logUserProfileWrite(traceLabel, uid, safeProfile);

  await setDoc(
    ref,
    safeProfile,
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
