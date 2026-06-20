import { getFirebaseClients } from '../firebase/config';
import { isTutorAgreementCurrent } from '../utils/onboarding';

const DEFAULT_STUDENT_FREE_MINUTES = 30;
const TUTOR_AGREEMENT_DEFAULT_VERSION = '1.0.1';
const MOCK_USER_KEY = 'parakleo_mock_user';

function buildReferralSlug() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `clx-${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  }

  return `clx-${Math.random().toString(36).slice(2, 22)}`;
}

function buildDefaultProfile({ uid, email, displayName, role, referralSlug, referredBy = null, pendingReferralSlug = null }) {
  const normalizedRole = role || 'student';
  const safeReferralSlug = String(referralSlug || buildReferralSlug()).trim().toLowerCase();
  const defaultSubjects = normalizedRole === 'student' ? [] : [];

  return {
    uid,
    email,
    fullName: displayName,
    displayName,
    role: normalizedRole,
    activeRole: normalizedRole,
    roles: normalizedRole === 'tutor' ? ['tutor'] : ['student'],
    profilePhoto: '',
    selfieUrl: '',
    selfieVerified: false,
    phoneNumber: '',
    subjects: defaultSubjects,
    activeSubjects: normalizedRole === 'tutor' ? [] : defaultSubjects,
    qualifiedSubjects: [],
    bio: '',
    availability: '',
    onlineStatus: 'offline',
    studentProfile: {
      grade: null,
      curriculum: '',
      discoverySource: '',
    },
    tutorProfile: {
      highestGradeResultUrl: '',
      mathScore: null,
      gradesToTutor: [],
      verificationStatus: 'pending',
      payout: {
        bankName: '',
        accountNumber: '',
        accountHolder: '',
      },
    },
    tutorAgreement: {
      documentId: 'tutor_agreement',
      title: 'Tutor Agreement',
      legalEntityName: 'Parakleo, operated by Jabu Msiza',
      requiredVersion: TUTOR_AGREEMENT_DEFAULT_VERSION,
      requiredVersionId: `tutor_agreement_${TUTOR_AGREEMENT_DEFAULT_VERSION}`,
      currentVersion: TUTOR_AGREEMENT_DEFAULT_VERSION,
      currentVersionId: `tutor_agreement_${TUTOR_AGREEMENT_DEFAULT_VERSION}`,
      currentVersionAccepted: false,
      acceptedVersion: '',
      acceptedAt: null,
      acceptanceId: '',
      latestAcceptedVersion: '',
      latestAcceptedAt: null,
      latestAcceptanceId: '',
      latestAcceptancePdfUrl: '',
      acceptedCurrentVersion: false,
    },
    paymentMethods: [],
    wallet: {
      balance: 0,
      currency: 'ZAR',
      updatedAt: new Date().toISOString(),
    },
    freeMinutesRemaining: normalizedRole === 'student' ? DEFAULT_STUDENT_FREE_MINUTES : 0,
    referralSlug: safeReferralSlug,
    referredBy,
    pendingReferralSlug: pendingReferralSlug || null,
    referralRewardCount: 0,
    totalFreeMinutesEarned: normalizedRole === 'student' ? DEFAULT_STUDENT_FREE_MINUTES : 0,
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

export async function upsertUserProfile({ uid, email, displayName, role, pendingReferralSlug = null }) {
  const clients = await getFirebaseClients();

  if (!clients) {
    return buildDefaultProfile({ uid, email, displayName, role, pendingReferralSlug });
  }

  const { db, firestoreModule } = clients;
  const { doc, getDoc, serverTimestamp, setDoc } = firestoreModule;
  const userRef = doc(db, 'users', uid);
  const existing = await getDoc(userRef);
  const existingData = existing.exists() ? existing.data() : {};
  const profileShape = buildDefaultProfile({
    uid,
    email,
    displayName,
    role,
    referralSlug: existingData.referralSlug || existingData.referralCode,
    referredBy: existingData.referredBy || null,
    pendingReferralSlug: pendingReferralSlug || existingData.pendingReferralSlug || null,
  });

  await setDoc(
    userRef,
    {
      ...profileShape,
      updatedAt: serverTimestamp(),
      createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
    },
    { merge: true },
  );

  const snap = await getDoc(userRef);
  return { uid, ...snap.data() };
}

export async function updateUserProfile(uid, updates) {
  const clients = await getFirebaseClients();

  if (!clients) {
    return { uid, ...updates };
  }

  const { db, firestoreModule } = clients;
  const { doc, getDoc, serverTimestamp, setDoc } = firestoreModule;
  const userRef = doc(db, 'users', uid);

  await setDoc(
    userRef,
    {
      ...updates,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const snap = await getDoc(userRef);
  return { uid, ...snap.data() };
}

export async function getUserProfile(uid) {
  const clients = await getFirebaseClients();

  if (!clients) {
    return null;
  }

  const { db, firestoreModule } = clients;
  const { doc, getDoc } = firestoreModule;
  const snap = await getDoc(doc(db, 'users', uid));

  if (!snap.exists()) {
    return null;
  }

  return { uid: snap.id, ...snap.data() };
}

export function subscribeToUserProfile(uid, callback) {
  let unsub = () => {};

  getFirebaseClients().then((clients) => {
    if (!uid) {
      callback(null);
      return;
    }

    if (!clients) {
      const emit = () => {
        const saved = localStorage.getItem(MOCK_USER_KEY);
        const parsed = saved ? JSON.parse(saved) : null;
        callback(parsed?.uid === uid ? parsed : null);
      };

      emit();
      window.addEventListener('storage', emit);
      unsub = () => window.removeEventListener('storage', emit);
      return;
    }

    const { db, firestoreModule } = clients;
    const { doc, onSnapshot } = firestoreModule;

    unsub = onSnapshot(doc(db, 'users', uid), (snapshot) => {
      callback(snapshot.exists() ? { uid: snapshot.id, ...snapshot.data() } : null);
    });
  });

  return () => unsub?.();
}


function resolveTutorScore(tutor = {}) {
  const rating = Number(tutor?.tutorProfile?.overallRating ?? tutor?.rating ?? 0) || 0;
  const recent24h = Number(
    tutor?.tutorProfile?.completedSessionsLast24Hours
      ?? tutor?.tutorProfile?.completedLast24h
      ?? tutor?.stats?.completedSessionsLast24Hours
      ?? 0,
  ) || 0;
  const totalSessions = Number(
    tutor?.tutorProfile?.completedSessionsTotal
      ?? tutor?.tutorProfile?.completedSessions
      ?? tutor?.stats?.completedSessionsTotal
      ?? 0,
  ) || 0;

  return {
    rating,
    recent24h,
    totalSessions,
    composite: (rating * 10000) + (recent24h * 100) + totalSessions,
  };
}

function hasCurrentTutorAgreement(tutor = {}) {
  return isTutorAgreementCurrent(tutor?.tutorAgreement || {});
}

export async function getTutorCandidatesForRequest({ subject }) {
  const clients = await getFirebaseClients();

  if (!clients) {
    return [];
  }

  const { db, firestoreModule } = clients;
  const { collection, getDocs, query, where } = firestoreModule;

  const q = query(
    collection(db, 'users'),
    where('activeRole', '==', 'tutor'),
    where('onlineStatus', '==', 'online'),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs
    .map((doc) => ({ uid: doc.id, ...doc.data() }))
    .filter((tutor) => {
      const tutorProfile = tutor.tutorProfile || {};
      const isVerified = tutorProfile.verificationStatus === 'verified';
      const normalizedSubjects = (Array.isArray(tutor.activeSubjects) ? tutor.activeSubjects : [])
        .map((item) => String(item || '').trim().toLowerCase());
      const requestSubject = String(subject || 'Mathematics').trim().toLowerCase();
      return isVerified && hasCurrentTutorAgreement(tutor) && normalizedSubjects.includes(requestSubject) && !tutor.activeSessionId;
    })
    .sort((a, b) => resolveTutorScore(b).composite - resolveTutorScore(a).composite);
}


export async function deleteUserProfile(uid) {
  const clients = await getFirebaseClients();

  if (!clients) {
    return;
  }

  const { db, firestoreModule } = clients;
  const { deleteDoc, doc } = firestoreModule;
  await deleteDoc(doc(db, 'users', uid));
}

export async function getTutorsForAdmin() {
  const clients = await getFirebaseClients();
  if (!clients) {
    return [];
  }

  const { db, firestoreModule } = clients;
  const { collection, getDocs, query, where } = firestoreModule;
  const q = query(collection(db, 'users'), where('activeRole', '==', 'tutor'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((item) => ({ uid: item.id, ...item.data() }));
}


export async function getStudentsForAdmin() {
  const clients = await getFirebaseClients();
  if (!clients) {
    return [];
  }

  const { db, firestoreModule } = clients;
  const { collection, getDocs, query, where } = firestoreModule;
  const q = query(collection(db, 'users'), where('activeRole', '==', 'student'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((item) => ({ uid: item.id, ...item.data() }));
}

export async function setTutorVerificationStatus(uid, verificationStatus) {
  const existing = await getUserProfile(uid);
  if (String(verificationStatus || '').toLowerCase() === 'verified' && !hasCurrentTutorAgreement(existing || {})) {
    throw new Error('Tutor must accept the current Tutor Agreement before being marked verified.');
  }
  return updateUserProfile(uid, {
    tutorProfile: {
      ...(existing?.tutorProfile || {}),
      verificationStatus,
    },
  });
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
