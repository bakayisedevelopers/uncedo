import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';
import { getFirebaseClients, getFunctionEndpoint } from '../../firebase/config';
import { REWARD_CONFIG_DOCS } from '../../shared/rewards';
import { summarizeReferralList } from './rewardPresentation';

// ---------------------------------------------------------------------------
// Config cache — shared across the session, reset on auth change.
// ---------------------------------------------------------------------------
let configCache = null;
let configCacheTime = 0;
const CONFIG_TTL_MS = 5 * 60 * 1000; // 5 minutes

function invalidateConfigCache() {
  configCache = null;
  configCacheTime = 0;
}

// ---------------------------------------------------------------------------
// Reward account
// ---------------------------------------------------------------------------

export function subscribeToRewardAccount(userId, onData, onError) {
  if (!userId) {
    return () => {};
  }

  const { db } = getFirebaseClients();
  return onSnapshot(
    doc(db, 'rewardAccounts', userId),
    (snap) => {
      onData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    },
    (error) => {
      if (typeof onError === 'function') {
        onError(error);
      }
    },
  );
}

export async function getRewardAccount(userId) {
  const { db } = getFirebaseClients();
  const snap = await getDoc(doc(db, 'rewardAccounts', userId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ---------------------------------------------------------------------------
// Reward configuration
// ---------------------------------------------------------------------------

export async function getRewardConfigs({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && configCache && now - configCacheTime < CONFIG_TTL_MS) {
    return configCache;
  }

  const { db } = getFirebaseClients();
  const [globalSnap, customerSnap, referralSnap, membershipSnap] = await Promise.all([
    getDoc(doc(db, 'rewardConfig', REWARD_CONFIG_DOCS.GLOBAL)),
    getDoc(doc(db, 'rewardConfig', REWARD_CONFIG_DOCS.CUSTOMER)),
    getDoc(doc(db, 'rewardConfig', 'referrals')),
    getDoc(doc(db, 'rewardConfig', REWARD_CONFIG_DOCS.MEMBERSHIP)),
  ]);

  const result = {
    globalConfig: globalSnap.exists() ? { id: globalSnap.id, ...globalSnap.data() } : null,
    customerConfig: customerSnap.exists() ? { id: customerSnap.id, ...customerSnap.data() } : null,
    referralConfig: referralSnap.exists() ? { id: referralSnap.id, ...referralSnap.data() } : null,
    membershipConfig: membershipSnap.exists() ? { id: membershipSnap.id, ...membershipSnap.data() } : null,
  };

  configCache = result;
  configCacheTime = now;
  return result;
}

export async function getRewardConfig(section = 'global') {
  const { db } = getFirebaseClients();
  const snap = await getDoc(doc(db, 'rewardConfig', section));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export async function getRecentRewardTransactions(userId, limitCount = 5) {
  if (!userId) {
    return [];
  }

  const { db } = getFirebaseClients();
  const snap = await getDocs(
    query(
      collection(db, 'rewardAccounts', userId, 'transactions'),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    ),
  );

  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getRewardTransactionsPage(userId, { pageSize = 20, cursor = null } = {}) {
  if (!userId) {
    return { items: [], cursor: null, hasMore: false };
  }

  const { db } = getFirebaseClients();
  const constraints = [orderBy('createdAt', 'desc'), limit(pageSize + 1)];
  if (cursor) {
    constraints.push(startAfter(cursor));
  }

  const snap = await getDocs(
    query(collection(db, 'rewardAccounts', userId, 'transactions'), ...constraints),
  );

  const docs = snap.docs;
  const hasMore = docs.length > pageSize;
  const items = docs.slice(0, pageSize).map((item) => ({ id: item.id, ...item.data() }));
  const nextCursor = hasMore ? docs[pageSize - 1] : null;

  return { items, cursor: nextCursor, hasMore };
}

export async function getExpiringRewardTransactions(userId, { limitCount = 20, daysAhead = 30 } = {}) {
  if (!userId) {
    return [];
  }

  const { db } = getFirebaseClients();
  const cutoff = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

  const snap = await getDocs(
    query(
      collection(db, 'rewardAccounts', userId, 'transactions'),
      where('direction', '==', 'credit'),
      where('status', '==', 'applied'),
      orderBy('expiresAt', 'asc'),
      limit(limitCount),
    ),
  );

  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => {
      if (!item.expiresAt) {
        return false;
      }

      const expiresAtMs = typeof item.expiresAt?.toDate === 'function'
        ? item.expiresAt.toDate().getTime()
        : typeof item.expiresAt?.seconds === 'number'
          ? item.expiresAt.seconds * 1000
          : Number(item.expiresAt) || 0;

      return expiresAtMs > 0 && expiresAtMs <= cutoff.getTime();
    });
}

export async function getRewardTransactions(userId, pageSize = 25) {
  return getRecentRewardTransactions(userId, pageSize);
}

// ---------------------------------------------------------------------------
// Rating account
// ---------------------------------------------------------------------------

export function subscribeToRatingSummary(userId, onData, onError) {
  if (!userId) {
    return () => {};
  }

  const { db } = getFirebaseClients();
  return onSnapshot(
    doc(db, 'ratingAccounts', userId),
    (snap) => {
      onData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    },
    (error) => {
      if (typeof onError === 'function') {
        onError(error);
      }
    },
  );
}

export async function getRatingSummary(userId) {
  const { db } = getFirebaseClients();
  const snap = await getDoc(doc(db, 'ratingAccounts', userId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getServiceRatingSummaries(userId, { limitCount = 25, serviceIds = null } = {}) {
  if (!userId) {
    return [];
  }

  const { db } = getFirebaseClients();
  const servicesCol = collection(db, 'ratingAccounts', userId, 'services');
  const snap = await getDocs(query(servicesCol, limit(limitCount)));
  const items = snap.docs.map((item) => ({ id: item.id, serviceId: item.id, ...item.data() }));

  if (Array.isArray(serviceIds) && serviceIds.length) {
    return items.filter((item) => serviceIds.includes(item.serviceId || item.id));
  }

  return items;
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

export async function getMembershipSummary(userId) {
  const account = await getRewardAccount(userId);
  return account?.membership || null;
}

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

export async function getReferralCode(userId) {
  const { db } = getFirebaseClients();
  const userSnap = await getDoc(doc(db, 'users', userId));
  return userSnap.exists()
    ? userSnap.data()?.referralCode || userSnap.data()?.referralSlug || null
    : null;
}

export async function ensureMyReferralCode(accountType = 'customer') {
  const { auth } = getFirebaseClients();
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('You must be signed in.');
  }

  const res = await fetch(getFunctionEndpoint('ensureReferralCode'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountType }),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.success === false) {
    throw new Error(payload?.message || 'Unable to load referral code.');
  }

  return payload.code;
}

export async function captureReferralCode(referralCode, accountType = 'customer') {
  const { auth } = getFirebaseClients();
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('You must be signed in.');
  }

  const res = await fetch(getFunctionEndpoint('captureReferral'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ referralCode, accountType }),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.success === false) {
    throw new Error(payload?.message || 'Unable to apply referral code.');
  }

  return payload;
}

export async function getMyReferralRelationships(userId) {
  const { db } = getFirebaseClients();
  const [asReferred, referredByMe] = await Promise.all([
    getDoc(doc(db, 'referrals', userId)),
    getDocs(
      query(collection(db, 'referrals'), where('referrerUserId', '==', userId), limit(50)),
    ),
  ]);

  return {
    attributed: asReferred.exists() ? { id: asReferred.id, ...asReferred.data() } : null,
    referred: referredByMe.docs.map((item) => ({ id: item.id, ...item.data() })),
  };
}

export async function getMyReferralSummary() {
  const { auth } = getFirebaseClients();
  const uid = auth.currentUser?.uid;
  if (!uid) {
    return null;
  }

  const [relationships, configs] = await Promise.all([
    getMyReferralRelationships(uid),
    getRewardConfigs().catch(() => null),
  ]);

  const code = await getReferralCode(uid).catch(() => null);
  const referrals = relationships.referred || [];
  const totals = summarizeReferralList(referrals);

  const stageOnePoints = Number(
    configs?.referralConfig?.rewards?.referralStageOne
    || configs?.customerConfig?.rewards?.referralStageOne
    || 100,
  );
  const stageTwoPoints = Number(
    configs?.referralConfig?.rewards?.referralStageTwo
    || configs?.customerConfig?.rewards?.referralStageTwo
    || 150,
  );

  // Privacy: only expose masked milestone entries, no PII.
  const maskedReferrals = referrals.map((item) => ({
    referralId: item.id,
    stageOneAwardedAt: item.stageOneAwardedAt || item.stageOneQualifiedAt || null,
    stageTwoAwardedAt: item.stageTwoAwardedAt || item.stageTwoQualifiedAt || null,
    attributedAt: item.attributedAt || item.createdAt || null,
    displayLabel: 'Referred customer',
  }));

  return {
    code,
    totals,
    stageOnePoints,
    stageTwoPoints,
    referrals: maskedReferrals,
    attributed: relationships.attributed || null,
  };
}

export async function getReferralCaptureStatus() {
  const { auth } = getFirebaseClients();
  const uid = auth.currentUser?.uid;
  if (!uid) {
    return null;
  }

  const { db } = getFirebaseClients();
  const snap = await getDoc(doc(db, 'referrals', uid));
  if (!snap.exists()) {
    return null;
  }

  const data = snap.data();
  const stageOneAt = data.stageOneAwardedAt || data.stageOneQualifiedAt;
  const stageTwoAt = data.stageTwoAwardedAt || data.stageTwoQualifiedAt;

  if (stageTwoAt) {
    return { state: 'stage_two', message: 'Your referrer received Stage Two reward after your first paid booking.' };
  }

  if (stageOneAt) {
    return { state: 'stage_one', message: 'Your referrer received Stage One reward after profile and card completion.' };
  }

  if (data.referrerUserId) {
    return { state: 'pending', message: 'A referral has been attributed to your account. Complete your profile and verify a card to progress.' };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helper mastery (for completeness; helper screens not part of this phase)
// ---------------------------------------------------------------------------

export async function getHelperMasterySummary(helperId) {
  const { db } = getFirebaseClients();
  const snap = await getDocs(collection(db, 'helperMastery', helperId, 'services'));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

// ---------------------------------------------------------------------------
// Profile completion (triggers backend evaluation)
// ---------------------------------------------------------------------------

export async function triggerProfileCompletionEvaluation() {
  const { auth } = getFirebaseClients();
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    return null;
  }

  const res = await fetch(getFunctionEndpoint('evaluateCustomerProfileCompletion'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }).catch(() => null);

  if (!res?.ok) {
    return null;
  }

  return res.json().catch(() => null);
}

// Service credit is reserved by the backend against an existing booking. The
// client never changes points or computes the final payable amount itself.
async function serviceCreditRequest(functionName, body) {
  const { auth } = getFirebaseClients();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('You must be signed in.');
  const res = await fetch(getFunctionEndpoint(functionName), {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.success === false) throw new Error(payload?.message || 'Unable to update service credit.');
  return payload.redemption || payload;
}

export function reserveServiceCreditForBooking(requestId, points) {
  return serviceCreditRequest('reserveServiceCredit', { requestId, points: Number(points) });
}

export function releaseServiceCreditForBooking(requestId) {
  return serviceCreditRequest('releaseServiceCredit', { requestId });
}

// ---------------------------------------------------------------------------
// Cache invalidation helper
// ---------------------------------------------------------------------------

export { invalidateConfigCache };
