import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseReferralCodeFromUrl } from './rewardPresentation';

const PENDING_REFERRAL_CODE_KEY = 'uncedo.pendingReferralCode';
const PENDING_REFERRAL_STATUS_KEY = 'uncedo.pendingReferralStatus';
const TERMINAL_REFERRAL_ERRORS = [
  'self-referral',
  'already exists',
  'new account',
  'before activity begins',
  'not active',
  'already attributed',
  'already exists',
];

function normalizeCode(value = '') {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function getPendingReferralCode(storage = AsyncStorage) {
  const rawValue = await storage.getItem(PENDING_REFERRAL_CODE_KEY).catch(() => '');
  return normalizeCode(rawValue || '');
}

export async function setPendingReferralCode(code, storage = AsyncStorage) {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) {
    return '';
  }

  const existingCode = await getPendingReferralCode(storage);
  if (existingCode) {
    return existingCode;
  }

  await storage.setItem(PENDING_REFERRAL_CODE_KEY, normalizedCode);
  return normalizedCode;
}

export async function clearPendingReferralCode(storage = AsyncStorage) {
  await storage.multiRemove([PENDING_REFERRAL_CODE_KEY, PENDING_REFERRAL_STATUS_KEY]).catch(() => null);
}

export async function persistReferralCodeFromUrl(url, storage = AsyncStorage) {
  const parsedCode = parseReferralCodeFromUrl(url);
  if (!parsedCode) {
    return '';
  }

  return setPendingReferralCode(parsedCode, storage);
}

export async function getPendingReferralStatus(storage = AsyncStorage) {
  const rawValue = await storage.getItem(PENDING_REFERRAL_STATUS_KEY).catch(() => '');
  return rawValue ? JSON.parse(rawValue) : null;
}

export async function setPendingReferralStatus(payload, storage = AsyncStorage) {
  await storage.setItem(PENDING_REFERRAL_STATUS_KEY, JSON.stringify({
    ...payload,
    updatedAt: Date.now(),
  }));
}

export function isTerminalReferralError(error) {
  const message = String(error?.message || error || '').trim().toLowerCase();
  return TERMINAL_REFERRAL_ERRORS.some((fragment) => message.includes(fragment));
}

