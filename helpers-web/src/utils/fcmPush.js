import { getToken, getMessaging, isSupported } from 'firebase/messaging';
import { getFirebaseClients } from '../firebase/config';

const REGISTERED_WEB_PUSH_STORAGE_KEY = 'uncedo_helper_web_push_token_v1';

export function getConfiguredVapidKey() {
  return String(import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim();
}

export async function isWebPushSupported() {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return false;
  }
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

async function computeTokenDocId(token = '') {
  const raw = String(token || '').trim();
  if (!raw) return '';
  if (typeof window !== 'undefined' && window.crypto?.subtle && typeof TextEncoder !== 'undefined') {
    try {
      const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      return Array.from(new Uint8Array(digest))
        .slice(0, 16)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Fallback to deterministic URL-safe hash below
    }
  }
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `tok_${(hash >>> 0).toString(16)}_${raw.length}`;
}

function readStoredWebPushRecord() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(REGISTERED_WEB_PUSH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredWebPushRecord(record) {
  if (typeof window === 'undefined') return;
  try {
    if (!record) {
      window.localStorage.removeItem(REGISTERED_WEB_PUSH_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(REGISTERED_WEB_PUSH_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Ignore storage quota errors
  }
}

async function getReadyServiceWorkerRegistration(timeoutMs = 2500) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing?.active) return existing;
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => window.setTimeout(() => resolve(existing || null), timeoutMs)),
    ]);
    return ready?.active ? ready : null;
  } catch {
    return null;
  }
}

export async function syncHelperWebPushToken(uid) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return { registered: false, reason: 'no-user' };
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return { registered: false, reason: 'permission-not-granted' };
  }

  const supported = await isWebPushSupported();
  if (!supported) {
    return { registered: false, reason: 'unsupported' };
  }

  const serviceWorkerRegistration = await getReadyServiceWorkerRegistration();
  if (!serviceWorkerRegistration) {
    return { registered: false, reason: 'no-service-worker' };
  }

  const { app, db, firestoreModule } = getFirebaseClients();
  const messaging = getMessaging(app);
  const vapidKey = getConfiguredVapidKey();
  const tokenOptions = vapidKey
    ? { vapidKey, serviceWorkerRegistration }
    : { serviceWorkerRegistration };

  const token = String((await getToken(messaging, tokenOptions)) || '').trim();
  if (!token) {
    return { registered: false, reason: 'empty-token' };
  }

  const tokenId = await computeTokenDocId(token);
  if (!tokenId) {
    return { registered: false, reason: 'invalid-token-id' };
  }

  const previous = readStoredWebPushRecord();
  if (previous && previous.uid && previous.uid !== cleanUid && previous.tokenId) {
    // Clean up previous account reference if this browser switched helper accounts
    await firestoreModule
      .deleteDoc(firestoreModule.doc(db, 'users', previous.uid, 'webPushTokens', previous.tokenId))
      .catch(() => null);
  }

  const tokenRef = firestoreModule.doc(db, 'users', cleanUid, 'webPushTokens', tokenId);
  await firestoreModule.setDoc(
    tokenRef,
    {
      token,
      platform: 'web',
      origin: window.location.origin,
      userAgent: String(navigator.userAgent || '').slice(0, 240),
      enabled: true,
      updatedAtMs: Date.now(),
      updatedAt: firestoreModule.serverTimestamp(),
    },
    { merge: true },
  );

  writeStoredWebPushRecord({
    uid: cleanUid,
    token,
    tokenId,
    updatedAtMs: Date.now(),
  });

  return { registered: true, tokenId };
}

export async function unregisterHelperWebPushToken(uid = '') {
  const stored = readStoredWebPushRecord();
  const cleanUid = String(uid || stored?.uid || '').trim();
  const tokenId = String(stored?.tokenId || '').trim();
  writeStoredWebPushRecord(null);

  if (!cleanUid || !tokenId) return false;
  try {
    const { db, firestoreModule } = getFirebaseClients();
    await firestoreModule.deleteDoc(firestoreModule.doc(db, 'users', cleanUid, 'webPushTokens', tokenId));
    return true;
  } catch {
    return false;
  }
}
