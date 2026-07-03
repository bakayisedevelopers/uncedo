import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseClients } from '../firebase/config';
import { getStudentOnboardingStatus } from '../utils/onboarding';

function toPositiveNumber(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, numeric);
}

export function estimateFreeMinutePricing({ originalPrice, requestedDurationMinutes, freeMinutesRemaining }) {
  const safeOriginalPrice = toPositiveNumber(originalPrice, 0);
  const durationMinutes = Math.max(1, Math.floor(toPositiveNumber(requestedDurationMinutes, 1)));
  const availableFreeMinutes = toPositiveNumber(freeMinutesRemaining, 0);
  const freeMinutesApplied = Math.min(availableFreeMinutes, durationMinutes);
  const discountRatio = freeMinutesApplied > 0 ? (freeMinutesApplied / durationMinutes) : 0;
  const discountApplied = Number((safeOriginalPrice * discountRatio).toFixed(2));
  const finalPrice = Number(Math.max(0, safeOriginalPrice - discountApplied).toFixed(2));

  return {
    originalPrice: safeOriginalPrice,
    requestedDurationMinutes: durationMinutes,
    freeMinutesAvailable: availableFreeMinutes,
    freeMinutesApplied,
    discountApplied,
    finalPrice,
    discountSource: freeMinutesApplied > 0 ? 'free_minutes' : null,
  };
}

export async function syncCustomerGrowth() {
  const { auth, db } = getFirebaseClients();
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) return null;

  await currentUser.reload().catch(() => null);
  const userRef = doc(db, 'users', currentUser.uid);
  const userSnap = await getDoc(userRef);
  const userProfile = userSnap.exists() ? { uid: userSnap.id, ...userSnap.data() } : null;
  if (!userProfile) return null;

  const onboarding = getStudentOnboardingStatus(userProfile);
  const emailVerified = Boolean(auth.currentUser?.emailVerified);
  const referralSlug = String(userProfile.referralSlug || '').trim() || `clx-${currentUser.uid.slice(0, 12)}`;

  const growthPatch = {
    referralSlug,
    emailVerified,
    emailVerifiedAt: emailVerified ? (userProfile.emailVerifiedAt || serverTimestamp()) : null,
    growth: {
      ...(userProfile.growth || {}),
      completionRequirements: {
        ...((userProfile.growth || {}).completionRequirements || {}),
        emailVerified,
        studentProfileComplete: Boolean(onboarding.complete),
      },
      lastGrowthSyncedAt: new Date().toISOString(),
    },
    updatedAt: serverTimestamp(),
  };

  await setDoc(userRef, growthPatch, { merge: true });
  return {
    ...userProfile,
    ...growthPatch,
    growth: {
      ...(userProfile.growth || {}),
      ...(growthPatch.growth || {}),
    },
  };
}

export const syncStudentGrowth = syncCustomerGrowth;
