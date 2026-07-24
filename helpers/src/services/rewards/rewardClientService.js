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
} from 'firebase/firestore';
import { getFirebaseClients, getFunctionEndpoint } from '../../firebase/config';
import { ACCOUNT_TYPES, REWARD_CONFIG_DOCS } from '../../shared/rewards';

const configCache = new Map();
const CONFIG_CACHE_MS = 5 * 60 * 1000;

function mapSnapshot(snapshot) {
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

function currentUserId() {
  const { auth } = getFirebaseClients();
  const userId = String(auth.currentUser?.uid || '').trim();
  if (!userId) throw new Error('You must be signed in to view rewards.');
  return userId;
}

async function postAuthenticated(functionName, body = {}) {
  const { auth } = getFirebaseClients();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('You must be signed in.');

  const response = await fetch(getFunctionEndpoint(functionName), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || `Unable to complete ${functionName}.`);
  }
  return payload;
}

export async function getRewardAccount(userId = currentUserId()) {
  const { db } = getFirebaseClients();
  return mapSnapshot(await getDoc(doc(db, 'rewardAccounts', userId)));
}

export async function getMyRewardAccount() {
  return getRewardAccount(currentUserId());
}

export function subscribeToRewardAccount(userId, onData, onError) {
  const { db } = getFirebaseClients();
  return onSnapshot(
    doc(db, 'rewardAccounts', userId),
    (snapshot) => onData?.(mapSnapshot(snapshot)),
    (error) => onError?.(error),
  );
}

export function subscribeToMyRewardAccount(onData, onError) {
  return subscribeToRewardAccount(currentUserId(), onData, onError);
}

export async function getRewardTransactionsPage({ userId = currentUserId(), pageSize = 20, cursor = null } = {}) {
  const { db } = getFirebaseClients();
  const normalizedPageSize = Math.max(1, Math.min(Number(pageSize) || 20, 50));
  const constraints = [orderBy('createdAt', 'desc'), limit(normalizedPageSize)];
  if (cursor) constraints.push(startAfter(cursor));
  const snapshot = await getDocs(query(collection(db, 'rewardAccounts', userId, 'transactions'), ...constraints));
  const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  return {
    items,
    cursor: snapshot.docs[snapshot.docs.length - 1] || null,
    hasMore: snapshot.docs.length === normalizedPageSize,
  };
}

export async function getRewardTransactions(userId = currentUserId(), pageSize = 25) {
  const result = await getRewardTransactionsPage({ userId, pageSize });
  return result.items;
}

export async function getRewardConfig(section = REWARD_CONFIG_DOCS.GLOBAL, { force = false } = {}) {
  const key = String(section || REWARD_CONFIG_DOCS.GLOBAL);
  const cached = configCache.get(key);
  if (!force && cached && Date.now() - cached.loadedAt < CONFIG_CACHE_MS) return cached.value;

  const { db } = getFirebaseClients();
  const value = mapSnapshot(await getDoc(doc(db, 'rewardConfig', key)));
  configCache.set(key, { value, loadedAt: Date.now() });
  return value;
}

export async function getRewardConfigs({ force = false } = {}) {
  const [globalConfig, helperConfig, membershipConfig, masteryConfig] = await Promise.all([
    getRewardConfig(REWARD_CONFIG_DOCS.GLOBAL, { force }),
    getRewardConfig(REWARD_CONFIG_DOCS.HELPER, { force }),
    getRewardConfig(REWARD_CONFIG_DOCS.MEMBERSHIP, { force }),
    getRewardConfig(REWARD_CONFIG_DOCS.MASTERY, { force }),
  ]);
  return { globalConfig, helperConfig, membershipConfig, masteryConfig };
}

export async function getRatingSummary(userId = currentUserId()) {
  const { db } = getFirebaseClients();
  return mapSnapshot(await getDoc(doc(db, 'ratingAccounts', userId)));
}

export async function getMyRatingSummary() {
  return getRatingSummary(currentUserId());
}

export function subscribeToRatingSummary(userId, onData, onError) {
  const { db } = getFirebaseClients();
  return onSnapshot(doc(db, 'ratingAccounts', userId), (snapshot) => onData?.(mapSnapshot(snapshot)), (error) => onError?.(error));
}

export async function getServiceRatingSummaries(userId = currentUserId()) {
  const { db } = getFirebaseClients();
  const snapshot = await getDocs(collection(db, 'ratingAccounts', userId, 'services'));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getServiceRatingSummary(userId = currentUserId(), serviceId) {
  if (!serviceId) return null;
  const { db } = getFirebaseClients();
  return mapSnapshot(await getDoc(doc(db, 'ratingAccounts', userId, 'services', serviceId)));
}

export async function getHelperMasterySummary(helperId = currentUserId()) {
  const { db } = getFirebaseClients();
  const snapshot = await getDocs(collection(db, 'helperMastery', helperId, 'services'));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getMyHelperMasterySummary() {
  return getHelperMasterySummary(currentUserId());
}

export function subscribeToHelperMastery(helperId, onData, onError) {
  const { db } = getFirebaseClients();
  return onSnapshot(
    collection(db, 'helperMastery', helperId, 'services'),
    (snapshot) => onData?.(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => onError?.(error),
  );
}

export async function getHelperMasteryRecord(helperId = currentUserId(), serviceId) {
  if (!serviceId) return null;
  const { db } = getFirebaseClients();
  return mapSnapshot(await getDoc(doc(db, 'helperMastery', helperId, 'services', serviceId)));
}

export async function ensureMyReferralCode(accountType = ACCOUNT_TYPES.HELPER) {
  const payload = await postAuthenticated('ensureReferralCode', { accountType });
  return payload.code;
}

export async function captureReferralCode(referralCode, accountType = ACCOUNT_TYPES.HELPER) {
  return postAuthenticated('captureReferral', { referralCode, accountType });
}

export async function getMyReferralSummary(accountType = ACCOUNT_TYPES.HELPER) {
  const payload = await postAuthenticated('getMyReferralSummary', { accountType });
  return payload.summary || null;
}

export async function refreshHelperRewardBundle({ userId = currentUserId(), forceConfig = false } = {}) {
  const [rewardAccount, ratingSummary, mastery, configs, referralSummary, recentTransactions] = await Promise.all([
    getRewardAccount(userId),
    getRatingSummary(userId),
    getHelperMasterySummary(userId),
    getRewardConfigs({ force: forceConfig }),
    getMyReferralSummary(ACCOUNT_TYPES.HELPER).catch(() => null),
    getRewardTransactions(userId, 5),
  ]);
  return {
    rewardAccount,
    ratingSummary,
    mastery,
    referralSummary,
    recentTransactions,
    ...configs,
  };
}

export async function refreshHelperRewards() {
  return refreshHelperRewardBundle({ forceConfig: false });
}
