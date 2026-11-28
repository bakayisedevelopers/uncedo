import { collection, onSnapshot, query } from 'firebase/firestore';
import { db, firebaseConfigured } from '../firebase/config';
import {
  LIKED_SERVICES_STORAGE_KEY,
  SERVICE_AI_CHATS_STORAGE_KEY,
  SERVICE_NOTES_STORAGE_KEY,
  WHATSAPP_BOOK_PHONE,
  buildAskAiRequestPayload,
  buildCatalogCategories,
  buildShareServiceUrl,
  buildWhatsAppOptionBookingUrl,
  buildWhatsAppQuestionUrl,
  extractPicturedServiceOptions,
  filterBrowseServiceOptions,
  formatOptionPriceLabel,
  shuffleServiceOptions,
} from './serviceCatalogModel';

export {
  WHATSAPP_BOOK_PHONE,
  buildAskAiRequestPayload,
  buildCatalogCategories,
  buildShareServiceUrl,
  buildWhatsAppOptionBookingUrl,
  buildWhatsAppQuestionUrl,
  extractPicturedServiceOptions,
  filterBrowseServiceOptions,
  formatOptionPriceLabel,
  shuffleServiceOptions,
};

const DEFAULT_FUNCTIONS_BASE = 'https://us-central1-bakayise-uncedo-latest.cloudfunctions.net';

function functionsBase() {
  const configured = String(import.meta.env?.VITE_API_BASE_URL || '').trim();
  return (!configured || configured.includes('PASTE_') ? DEFAULT_FUNCTIONS_BASE : configured).replace(/\/$/, '');
}

export function loadLikedServiceOptionIds() {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(LIKED_SERVICES_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveLikedServiceOptionIds(idSet) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      LIKED_SERVICES_STORAGE_KEY,
      JSON.stringify(Array.from(idSet || [])),
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function loadServiceOptionNotes() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SERVICE_NOTES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveServiceOptionNotes(notesMap) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      SERVICE_NOTES_STORAGE_KEY,
      JSON.stringify(notesMap || {}),
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function loadServiceAiChats() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SERVICE_AI_CHATS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveServiceAiChats(chatsMap) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      SERVICE_AI_CHATS_STORAGE_KEY,
      JSON.stringify(chatsMap || {}),
    );
  } catch {
    // Ignore storage quota errors
  }
}

export async function askServiceOptionAi({ item, message, history = [] } = {}) {
  const payload = buildAskAiRequestPayload({ item, message, history });
  if (!payload.message) {
    throw new Error('Please enter a question before sending.');
  }

  const url = `${functionsBase()}/askServiceCatalogAi`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.success === false || !data.reply) {
    const err = new Error(
      data?.message || 'Service assistant could not answer right now. Please try again.',
    );
    err.code = data?.code || `http-${response.status}`;
    throw err;
  }

  return data;
}

export function subscribeToPicturedServiceOptions(onData, onError) {
  if (!firebaseConfigured || !db) {
    onData([]);
    return () => {};
  }

  const catalogQuery = query(collection(db, 'serviceCatalog'));
  return onSnapshot(
    catalogQuery,
    (snapshot) => {
      const entries = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      onData(extractPicturedServiceOptions(entries));
    },
    (error) => {
      onError?.(error);
    },
  );
}

