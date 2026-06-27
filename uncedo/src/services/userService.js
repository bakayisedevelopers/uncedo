import { deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseClients } from '../firebase/config';

const DEFAULT_STUDENT_FREE_MINUTES = 30;

function buildReferralSlug() {
  return `clx-${Math.random().toString(36).slice(2, 22)}`;
}

export function buildDefaultStudentProfile({ uid, email, displayName }) {
  return {
    uid,
    email,
    fullName: displayName,
    displayName,
    role: 'student',
    activeRole: 'student',
    roles: ['student'],
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

export async function getUserProfile(uid) {
  const { db } = getFirebaseClients();
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? { uid: snapshot.id, ...snapshot.data() } : null;
}

export async function updateUserProfile(uid, updates) {
  const { db } = getFirebaseClients();
  const userRef = doc(db, 'users', uid);

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
  const existing = await getUserProfile(uid);
  if (!existing) return null;

  const currentStats = existing?.ratings?.[roleKey] || {};
  const totalLessons = Number(currentStats.totalLessons ?? currentStats.count ?? 0);
  const totalRatings = Number(currentStats.totalRatings ?? ((currentStats.average || 0) * totalLessons) ?? 0);
  const nextTotalLessons = totalLessons + 1;
  const nextTotalRatings = Number((totalRatings + Number(overallScore || 0)).toFixed(2));
  const nextAverage = Number((nextTotalRatings / nextTotalLessons).toFixed(2));

  return updateUserProfile(uid, {
    ratings: {
      ...(existing.ratings || {}),
      [roleKey]: {
        count: nextTotalLessons,
        totalLessons: nextTotalLessons,
        totalRatings: nextTotalRatings,
        average: nextAverage,
        updatedAt: Date.now(),
      },
    },
    ...(roleKey === 'asTutor'
      ? {
          tutorProfile: {
            ...(existing.tutorProfile || {}),
            overallRating: nextAverage,
          },
        }
      : {}),
  });
}

export async function upsertStudentProfile({ uid, email, displayName }) {
  const { db } = getFirebaseClients();
  const userRef = doc(db, 'users', uid);
  const existing = await getDoc(userRef);
  const base = existing.exists() ? existing.data() : buildDefaultStudentProfile({ uid, email, displayName });

  await setDoc(
    userRef,
    {
      ...base,
      uid,
      email,
      displayName: base.displayName || displayName,
      fullName: base.fullName || displayName,
      role: 'student',
      activeRole: 'student',
      roles: ['student'],
      updatedAt: serverTimestamp(),
      createdAt: existing.exists() ? base.createdAt : serverTimestamp(),
    },
    { merge: true },
  );

  return getUserProfile(uid);
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
