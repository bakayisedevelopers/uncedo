import { deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseClients } from '../firebase/config';

const DEFAULT_STUDENT_FREE_MINUTES = 30;

function buildReferralSlug() {
  return `clx-${Math.random().toString(36).slice(2, 22)}`;
}

export function buildDefaultCustomerProfile({ uid, email, displayName }) {
  return {
    uid,
    email,
    fullName: displayName,
    displayName,
    role: 'customer',
    activeRole: 'customer',
    roles: ['customer'],
    profilePhoto: '',
    phoneNumber: '',
    subjects: [],
    studentProfile: {
      grade: null,
      curriculum: '',
      discoverySource: '',
    },
    customerProfile: {
      accountType: '',
      customerType: '',
      serviceAddress: '',
      discoverySource: '',
      preferredServiceCategories: [],
      businessName: '',
      businessEmail: '',
      businessCategory: '',
    },
    paymentMethods: [],
    wallet: {
      balance: 0,
      currency: 'ZAR',
      updatedAt: new Date().toISOString(),
    },
    freeMinutesRemaining: DEFAULT_STUDENT_FREE_MINUTES,
    referralSlug: buildReferralSlug(),
    referralRewardCount: 0,
    totalFreeMinutesEarned: DEFAULT_STUDENT_FREE_MINUTES,
    totalFreeMinutesUsed: 0,
    growth: {
      completionRequirements: {
        emailVerified: false,
        studentProfileComplete: false,
        phoneVerified: false,
      },
      accountCompletionRewardProcessed: false,
      lastGrowthSyncedAt: null,
    },
  };
}

export const buildDefaultStudentProfile = buildDefaultCustomerProfile;

export async function getUserProfile(uid) {
  const { db } = getFirebaseClients();
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? { uid: snapshot.id, ...snapshot.data() } : null;
}

export async function updateUserProfile(uid, updates) {
  const { db } = getFirebaseClients();
  const userRef = doc(db, 'users', uid);
  const allowedFields = new Set([
    'fullName', 'displayName', 'firstName', 'lastName', 'phoneNumber', 'providerType',
    'businessName', 'homeAddress', 'city', 'profilePhoto', 'profilePhotoObjectPath',
    'customerProfile', 'studentProfile', 'subjects',
  ]);
  const unsafeFields = Object.keys(updates || {}).filter((field) => !allowedFields.has(field));
  if (unsafeFields.length) throw new Error('This profile change must be completed through an authorized Uncedo workflow.');

  await setDoc(
    userRef,
    {
      ...updates,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return getUserProfile(uid);
}

export async function deleteUserProfile(uid) {
  const { db } = getFirebaseClients();
  await deleteDoc(doc(db, 'users', uid));
}

export async function updateUserRatingSummary(uid, roleKey, overallScore) {
  // Rating aggregates are computed by the trusted backend. Keep this adapter
  // for existing callers, but never let a client write authoritative ratings.
  void uid; void roleKey; void overallScore;
  return null;
}

export async function upsertCustomerProfile({ uid, email, displayName }) {
  const { db } = getFirebaseClients();
  const userRef = doc(db, 'users', uid);
  const existing = await getDoc(userRef);
  const base = existing.exists() ? existing.data() : buildDefaultCustomerProfile({ uid, email, displayName });
  const profile = {
    uid,
    email: email || '',
    displayName: base.displayName || displayName,
    fullName: base.fullName || displayName,
    role: 'customer',
    activeRole: 'customer',
    roles: ['customer'],
    profilePhoto: String(base.profilePhoto || ''),
    phoneNumber: String(base.phoneNumber || ''),
    subjects: Array.isArray(base.subjects) ? base.subjects : [],
    studentProfile: base.studentProfile || {},
    customerProfile: base.customerProfile || {},
    updatedAt: serverTimestamp(),
    ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
  };

  await setDoc(
    userRef,
    profile,
    { merge: true },
  );

  return getUserProfile(uid);
}

export const upsertStudentProfile = upsertCustomerProfile;

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
