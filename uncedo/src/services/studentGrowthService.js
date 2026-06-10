import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';

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

export async function syncStudentGrowth() {
  const { auth } = getFirebaseClients();
  const token = await auth.currentUser?.getIdToken();
  if (!token) return null;

  const response = await fetch(getFunctionEndpoint('syncStudentGrowth'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || 'Unable to sync student growth status right now.');
  }

  return payload?.profile || null;
}
